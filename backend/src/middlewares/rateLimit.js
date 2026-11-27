import RateLimitBucket from '../models/RateLimitBucket.js';

const normalizeNamespace = (value) => String(value || 'default')
  .toLowerCase()
  .replace(/[^a-z0-9_-]+/g, '-')
  .replace(/^-+|-+$/g, '') || 'default';

export const getRateLimitNamespace = (env = process.env) => normalizeNamespace(
  env.RATE_LIMIT_NAMESPACE || env.APP_ENV || env.NODE_ENV,
);

const requiredRateLimitIndexes = Object.freeze({
  uniqueKey: 'rate_limit_bucket_key_unique',
  ttlExpiry: 'rate_limit_bucket_expires_ttl',
});

const sameKey = (left, right) => JSON.stringify(left) === JSON.stringify(right);

export const getRateLimitIndexStatus = async ({ model = RateLimitBucket } = {}) => {
  let indexes;
  try {
    indexes = await model.collection.listIndexes().toArray();
  } catch (error) {
    if (error?.codeName === 'NamespaceNotFound' || error?.code === 26) {
      indexes = [];
    } else {
      throw error;
    }
  }

  const uniqueKey = indexes.find((index) => (
    sameKey(index.key, { key: 1 })
    && index.unique === true
  ));
  const ttlExpiry = indexes.find((index) => (
    sameKey(index.key, { expiresAt: 1 })
    && Number(index.expireAfterSeconds) === 0
  ));

  return {
    ready: Boolean(uniqueKey && ttlExpiry),
    collectionPresent: indexes.length > 0,
    uniqueKeyIndexPresent: Boolean(uniqueKey),
    ttlIndexPresent: Boolean(ttlExpiry),
    missingIndexes: [
      ...(uniqueKey ? [] : [requiredRateLimitIndexes.uniqueKey]),
      ...(ttlExpiry ? [] : [requiredRateLimitIndexes.ttlExpiry]),
    ],
  };
};

export const createRateLimitIndexesUnavailableError = (status) => {
  const error = new Error('Required MongoDB rate-limit indexes are not ready.');
  error.code = 'RATE_LIMIT_INDEXES_UNAVAILABLE';
  error.statusCode = 503;
  error.rateLimitIndexStatus = status;
  error.operatorAction = 'Run `npm --prefix backend run rate-limit:index` to check, then run the approved `--apply` migration before retrying.';
  return error;
};

export const assertRateLimitIndexesReady = async (options = {}) => {
  const status = await getRateLimitIndexStatus(options);
  if (!status.ready) throw createRateLimitIndexesUnavailableError(status);
  return status;
};

// A MongoDB bucket is one document per limiter identity and fixed window.
// The update pipeline resets expired buckets and increments live buckets in
// one atomic single-document operation. TTL deletion is only storage hygiene;
// correctness comes from the expiresAt comparison in the pipeline.
const buildBucketPipeline = ({ scope, now, resetAt }) => {
  const expired = {
    $or: [
      { $eq: [{ $type: '$expiresAt' }, 'missing'] },
      { $eq: [{ $type: '$expiresAt' }, 'null'] },
      { $lte: ['$expiresAt', now] },
    ],
  };

  return [{
    $set: {
      scope: { $literal: scope },
      count: {
        $cond: [
          expired,
          1,
          { $add: [{ $ifNull: ['$count', 0] }, 1] },
        ],
      },
      windowStart: {
        $cond: [expired, now, { $ifNull: ['$windowStart', now] }],
      },
      expiresAt: {
        $cond: [expired, resetAt, '$expiresAt'],
      },
    },
  }];
};

const isDuplicateKeyError = (error) => Number(error?.code) === 11000;

export class MongoRateLimitStore {
  constructor({ model = RateLimitBucket, namespace = getRateLimitNamespace() } = {}) {
    this.model = model;
    this.namespace = normalizeNamespace(namespace);
  }

  async increment(key, windowMs) {
    const now = new Date();
    const resetAt = new Date(now.getTime() + windowMs);
    const pipeline = buildBucketPipeline({
      scope: this.namespace,
      now,
      resetAt,
    });
    const identityKey = `rate-limit:${this.namespace}:${String(key).slice(0, 460)}`;

    // An upsert can encounter a unique-key race when two instances create the
    // same first bucket concurrently. Retry the same atomic pipeline against
    // the now-existing document; no read-modify-write window exists here.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const bucket = await this.model.findOneAndUpdate(
          { key: identityKey },
          pipeline,
          { upsert: true, new: true, returnDocument: 'after' },
        );
        return {
          count: bucket.count,
          resetAt: new Date(bucket.expiresAt).getTime(),
        };
      } catch (error) {
        if (!isDuplicateKeyError(error) || attempt === 1) throw error;
      }
    }

    throw new Error('Rate-limit bucket update did not complete.');
  }
}

let sharedStore;
export const getRateLimitStore = () => {
  if (!sharedStore) sharedStore = new MongoRateLimitStore();
  return sharedStore;
};

export const resetRateLimitStoreForTests = () => {
  sharedStore = undefined;
};

const userIdentity = (req) => req.user?._id || req.user?.id || null;

// Express only derives req.ip from X-Forwarded-For when trust proxy is enabled.
// The app configures that explicitly with TRUST_PROXY_HOPS; without it, client
// supplied forwarding headers do not change the direct socket identity.
export const getRateLimitIdentity = (req, scope = 'ip') => {
  const userId = userIdentity(req);
  if (scope === 'user' && userId) return `user:${String(userId)}`;
  if (scope === 'user-or-ip' && userId) return `user:${String(userId)}`;
  return `ip:${req.ip || req.socket?.remoteAddress || req.connection?.remoteAddress || 'unknown'}`;
};

export const createRateLimiter = ({
  name,
  limit,
  windowMs,
  identity = 'user-or-ip',
  keySuffix,
  store,
  onStoreError,
} = {}) => {
  if (!name || !Number.isInteger(limit) || limit < 1 || !Number.isInteger(windowMs) || windowMs < 1000) {
    throw new Error('Invalid rate limiter configuration.');
  }

  return async (req, res, next) => {
    try {
      // Test doubles may be injected by unit tests. Every real Mongo-backed
      // limiter must prove the unique and TTL indexes exist before it can
      // mutate a bucket; otherwise a first-write race could create unsafe
      // duplicate identities across instances.
      const activeStore = store || getRateLimitStore();
      if (activeStore instanceof MongoRateLimitStore) {
        await assertRateLimitIndexesReady({ model: activeStore.model });
      }
      const baseKey = getRateLimitIdentity(req, identity);
      const suffix = typeof keySuffix === 'function' ? keySuffix(req) : keySuffix;
      const key = `${name}:${baseKey}${suffix ? `:${suffix}` : ''}`;
      const result = await activeStore.increment(key, windowMs);
      const remaining = Math.max(0, limit - result.count);
      const retryAfter = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000));
      res.set({
        'RateLimit-Limit': String(limit),
        'RateLimit-Remaining': String(remaining),
        'RateLimit-Reset': String(Math.ceil(result.resetAt / 1000)),
      });
      if (result.count > limit) {
        res.set('Retry-After', String(retryAfter));
        return res.status(429).json({
          status: 'error',
          code: 'RATE_LIMITED',
          message: 'Quá nhiều yêu cầu. Vui lòng thử lại sau.',
          retryAfter,
        });
      }
      return next();
    } catch (error) {
      if (onStoreError) return onStoreError(error, req, res, next);
      res.set('Retry-After', '5');
      return res.status(503).json({
        status: 'error',
        code: error?.code === 'RATE_LIMIT_INDEXES_UNAVAILABLE'
          ? error.code
          : 'RATE_LIMIT_STORE_UNAVAILABLE',
        message: error?.code === 'RATE_LIMIT_INDEXES_UNAVAILABLE'
          ? 'Rate limiting chưa sẵn sàng vì MongoDB indexes bắt buộc chưa tồn tại.'
          : 'Dịch vụ giới hạn truy cập hiện chưa sẵn sàng. Vui lòng thử lại sau.',
        ...(error?.code === 'RATE_LIMIT_INDEXES_UNAVAILABLE'
          ? {
            missingIndexes: error.rateLimitIndexStatus?.missingIndexes || [],
            operatorAction: error.operatorAction,
          }
          : {}),
      });
    }
  };
};

export const authRateLimiter = createRateLimiter({ name: 'auth', limit: 10, windowMs: 15 * 60 * 1000, identity: 'ip' });
export const registerRateLimiter = createRateLimiter({ name: 'auth-register', limit: 5, windowMs: 60 * 60 * 1000, identity: 'ip' });
export const refreshRateLimiter = createRateLimiter({ name: 'auth-refresh', limit: 30, windowMs: 15 * 60 * 1000, identity: 'ip' });
export const sessionRateLimiter = createRateLimiter({ name: 'learning-session', limit: 60, windowMs: 60 * 1000, identity: 'user-or-ip' });
export const heartbeatRateLimiter = createRateLimiter({ name: 'learning-heartbeat', limit: 120, windowMs: 60 * 1000, identity: 'user' });
export const streakRateLimiter = createRateLimiter({ name: 'learning-streak', limit: 60, windowMs: 60 * 1000, identity: 'user' });
export const adminLearningRateLimiter = createRateLimiter({ name: 'admin-learning', limit: 120, windowMs: 60 * 1000, identity: 'user' });
