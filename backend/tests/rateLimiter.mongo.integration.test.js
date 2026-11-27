import assert from 'node:assert/strict';
import express from 'express';
import mongoose from 'mongoose';
import test, { after, before } from 'node:test';
import { performance } from 'node:perf_hooks';
import { MongoMemoryServer } from 'mongodb-memory-server';
import RateLimitBucket from '../src/models/RateLimitBucket.js';
import {
  createRateLimiter,
  getRateLimitStore,
  MongoRateLimitStore,
  resetRateLimitStoreForTests,
} from '../src/middlewares/rateLimit.js';

const dbName = `rate_limit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
let mongoServer;
let mongoUri;

const listen = (app) => new Promise((resolve, reject) => {
  const server = app.listen(0, '127.0.0.1', () => resolve(server));
  server.once('error', reject);
});

const percentile = (values, fraction) => {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];
};

before(async () => {
  mongoServer = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1', dbName } });
  mongoUri = mongoServer.getUri(dbName);
  await mongoose.connect(mongoUri, {
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 5000,
    autoCreate: false,
    autoIndex: false,
  });
  await RateLimitBucket.createCollection();
  await RateLimitBucket.collection.createIndex(
    { key: 1 },
    { unique: true, name: 'rate_limit_bucket_key_unique' },
  );
  await RateLimitBucket.collection.createIndex(
    { expiresAt: 1 },
    { expireAfterSeconds: 0, name: 'rate_limit_bucket_expires_ttl' },
  );
});

after(async () => {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect().catch(() => {});
  await mongoServer?.stop().catch(() => {});
});

test('MongoDB bucket preserves 429, Retry-After, expiry reset and delayed TTL cleanup', async () => {
  const store = new MongoRateLimitStore({ namespace: 'rate-test' });
  const app = express();
  app.use(createRateLimiter({ name: 'login', limit: 2, windowMs: 1000, identity: 'ip', store }));
  app.get('/', (_req, res) => res.json({ ok: true }));
  const server = await listen(app);

  try {
    const url = `http://127.0.0.1:${server.address().port}/`;
    assert.equal((await fetch(url)).status, 200);
    assert.equal((await fetch(url)).status, 200);
    const limited = await fetch(url);
    assert.equal(limited.status, 429);
    assert.match(limited.headers.get('retry-after'), /^[1-9]\d*$/);
    assert.equal((await limited.json()).code, 'RATE_LIMITED');

    const first = await store.increment('expiry-reset', 80);
    await new Promise((resolve) => setTimeout(resolve, 120));
    const retainedAfterExpiry = await RateLimitBucket.findOne({ key: 'rate-limit:rate-test:expiry-reset' }).lean();
    assert.ok(retainedAfterExpiry, 'TTL cleanup is delayed and must not control correctness');
    const reset = await store.increment('expiry-reset', 80);
    assert.equal(first.count, 1);
    assert.equal(reset.count, 1, 'expired bucket must reset atomically before TTL deletion');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('default limiter store uses the shared MongoDB connection', async () => {
  resetRateLimitStoreForTests();
  const first = await getRateLimitStore().increment('default-store', 60_000);
  const second = await getRateLimitStore().increment('default-store', 60_000);
  assert.equal(first.count, 1);
  assert.equal(second.count, 2);
});

test('concurrent stores share one atomic bucket and tolerate duplicate-key creation races', async () => {
  const stores = [
    new MongoRateLimitStore({ namespace: 'concurrency-a' }),
    new MongoRateLimitStore({ namespace: 'concurrency-a' }),
  ];
  const results = await Promise.all(Array.from({ length: 100 }, (_, index) => (
    stores[index % stores.length].increment('same-user', 60_000)
  )));
  assert.deepEqual(results.map((result) => result.count).sort((left, right) => left - right), Array.from({ length: 100 }, (_, index) => index + 1));
  const bucket = await RateLimitBucket.findOne({ key: 'rate-limit:concurrency-a:same-user' }).lean();
  assert.equal(bucket.count, 100);
  assert.equal(await RateLimitBucket.countDocuments({ key: 'rate-limit:concurrency-a:same-user' }), 1);
});

test('rate-limit store failure returns 503 and recovery works without bypassing the limiter', async () => {
  const store = new MongoRateLimitStore({ namespace: 'outage-test' });
  await mongoose.disconnect();

  const app = express();
  app.use(createRateLimiter({ name: 'heartbeat', limit: 120, windowMs: 60_000, store }));
  app.get('/', (_req, res) => res.json({ ok: true }));
  const server = await listen(app);
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/`);
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('retry-after'), '5');
    assert.equal((await response.json()).code, 'RATE_LIMIT_STORE_UNAVAILABLE');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }

  await mongoose.connect(mongoUri, {
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 5000,
    autoCreate: false,
    autoIndex: false,
  });
  const recovered = await store.increment('after-recovery', 60_000);
  assert.equal(recovered.count, 1);
});

test('disposable burst benchmark covers 10, 50, 100 and 500 concurrent requests', async () => {
  const store = new MongoRateLimitStore({ namespace: 'load-test' });
  const measurements = [];
  for (const requestCount of [10, 50, 100, 500]) {
    const durations = [];
    const startedAt = performance.now();
    await Promise.all(Array.from({ length: requestCount }, (_, index) => {
      const requestStartedAt = performance.now();
      return store.increment(`burst-${requestCount}-${index}`, 60_000).then(() => {
        durations.push(performance.now() - requestStartedAt);
      });
    }));
    const elapsedMs = performance.now() - startedAt;
    measurements.push({
      requests: requestCount,
      throughputRps: Math.round((requestCount / (elapsedMs / 1000)) * 100) / 100,
      p50Ms: Math.round(percentile(durations, 0.50) * 100) / 100,
      p95Ms: Math.round(percentile(durations, 0.95) * 100) / 100,
      p99Ms: Math.round(percentile(durations, 0.99) * 100) / 100,
      atomicBucketWrites: requestCount,
    });
  }
  const growth = await RateLimitBucket.countDocuments({ scope: 'load-test' });
  assert.equal(growth, 660);
  console.log(`# MongoDB rate-limit disposable load ${JSON.stringify({ measurements, collectionGrowth: growth, poolSize: mongoose.connection.getClient().options.maxPoolSize || 'driver-default' })}`);
});

test('rate-limit indexes include one unique identity index and one TTL cleanup index', async () => {
  const indexes = await RateLimitBucket.collection.listIndexes().toArray();
  const unique = indexes.find((index) => index.name === 'rate_limit_bucket_key_unique');
  const ttl = indexes.find((index) => index.name === 'rate_limit_bucket_expires_ttl');
  assert.equal(unique?.unique, true);
  assert.equal(ttl?.expireAfterSeconds, 0);
  assert.deepEqual(Object.keys(indexes.reduce((result, index) => ({ ...result, [index.name]: true }), {})).sort(), [
    '_id_',
    'rate_limit_bucket_expires_ttl',
    'rate_limit_bucket_key_unique',
  ]);
});

test('missing required indexes fails closed with migration guidance', async () => {
  await RateLimitBucket.collection.dropIndexes();
  const store = new MongoRateLimitStore({ namespace: 'missing-index-test' });
  const app = express();
  app.use(createRateLimiter({ name: 'missing-index', limit: 1, windowMs: 60_000, identity: 'ip', store }));
  app.get('/', (_req, res) => res.json({ ok: true }));
  const server = await listen(app);

  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/`);
    const body = await response.json();
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('retry-after'), '5');
    assert.equal(body.code, 'RATE_LIMIT_INDEXES_UNAVAILABLE');
    assert.deepEqual(body.missingIndexes.sort(), [
      'rate_limit_bucket_expires_ttl',
      'rate_limit_bucket_key_unique',
    ]);
    assert.match(body.operatorAction, /rate-limit:index/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await RateLimitBucket.collection.createIndex(
      { key: 1 },
      { unique: true, name: 'rate_limit_bucket_key_unique' },
    );
    await RateLimitBucket.collection.createIndex(
      { expiresAt: 1 },
      { expireAfterSeconds: 0, name: 'rate_limit_bucket_expires_ttl' },
    );
  }
});
