import { Redis } from '@upstash/redis';

const isSharedStoreRequired = (env) => {
  const appEnv = String(env.APP_ENV || '').toLowerCase();
  const nodeEnv = String(env.NODE_ENV || '').toLowerCase();
  return nodeEnv === 'production' || appEnv === 'production' || appEnv === 'staging';
};

const normalizeNamespace = (value) => String(value || 'default')
  .toLowerCase()
  .replace(/[^a-z0-9_-]+/g, '-')
  .replace(/^-+|-+$/g, '') || 'default';

export const getRateLimitNamespace = (env = process.env) => normalizeNamespace(
  env.RATE_LIMIT_NAMESPACE || env.APP_ENV || env.NODE_ENV,
);

const getRedisTimeoutMs = (env) => {
  const timeoutMs = Number(env.RATE_LIMIT_REDIS_TIMEOUT_MS || 1500);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100) throw new Error('RATE_LIMIT_REDIS_TIMEOUT_MS must be an integer of at least 100ms.');
  return timeoutMs;
};

export const assertRateLimitConfiguration = (env = process.env) => {
  const hasRedis = Boolean(env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN);
  if (isSharedStoreRequired(env) && !hasRedis) {
    throw new Error(
      'Shared rate-limit store is required for staging/production. Configure UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.',
    );
  }
  return { hasRedis, sharedStoreRequired: isSharedStoreRequired(env) };
};

class MemoryRateLimitStore {
  constructor(now = () => Date.now()) {
    this.now = now;
    this.entries = new Map();
  }

  async increment(key, windowMs) {
    const now = this.now();
    const current = this.entries.get(key);
    if (!current || current.resetAt <= now) {
      const next = { count: 1, resetAt: now + windowMs };
      this.entries.set(key, next);
      return next;
    }
    current.count += 1;
    return current;
  }
}

class UpstashRateLimitStore {
  constructor(env = process.env) {
    this.namespace = getRateLimitNamespace(env);
    this.timeoutMs = getRedisTimeoutMs(env);
    this.redis = new Redis({
      url: env.UPSTASH_REDIS_REST_URL,
      token: env.UPSTASH_REDIS_REST_TOKEN,
      retry: { retries: 0 },
      signal: () => AbortSignal.timeout(this.timeoutMs),
    });
  }

  async increment(key, windowMs) {
    const redisKey = `rate-limit:${this.namespace}:${key}`;
    const count = await this.redis.incr(redisKey);
    // A fixed-window counter is sufficient here and keeps the operation
    // atomic across serverless instances. Refreshing TTL on every request
    // would turn it into a sliding lock, so only the first request sets it.
    if (count === 1) await this.redis.expire(redisKey, Math.ceil(windowMs / 1000));
    const ttlSeconds = Math.max(1, Number(await this.redis.ttl(redisKey)) || Math.ceil(windowMs / 1000));
    return { count, resetAt: Date.now() + ttlSeconds * 1000 };
  }
}

let sharedStore;
export const getRateLimitStore = () => {
  if (!sharedStore) {
    const config = assertRateLimitConfiguration();
    sharedStore = config.hasRedis ? new UpstashRateLimitStore() : new MemoryRateLimitStore();
  }
  return sharedStore;
};

export const resetRateLimitStoreForTests = () => {
  sharedStore = undefined;
};

const userIdentity = (req) => req.user?._id || req.user?.id || null;

// Express only derives req.ip from X-Forwarded-For when trust proxy is enabled.
// The app configures that explicitly with TRUST_PROXY_HOPS; without it, req.ip
// remains the direct socket address and client-supplied forwarding headers are ignored.
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
      const baseKey = getRateLimitIdentity(req, identity);
      const suffix = typeof keySuffix === 'function' ? keySuffix(req) : keySuffix;
      const key = `${name}:${baseKey}${suffix ? `:${suffix}` : ''}`;
      const result = await (store || getRateLimitStore()).increment(key, windowMs);
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
        code: 'RATE_LIMIT_STORE_UNAVAILABLE',
        message: 'Dịch vụ giới hạn truy cập hiện chưa sẵn sàng. Vui lòng thử lại sau.',
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
