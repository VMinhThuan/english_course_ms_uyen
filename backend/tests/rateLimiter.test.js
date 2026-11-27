import assert from 'node:assert/strict';
import express from 'express';
import test from 'node:test';
import {
  createRateLimiter,
  getRateLimitNamespace,
} from '../src/middlewares/rateLimit.js';

const createTestStore = () => {
  const entries = new Map();
  return {
    async increment(key, windowMs) {
      const now = Date.now();
      const current = entries.get(key);
      if (!current || current.resetAt <= now) {
        const next = { count: 1, resetAt: now + windowMs };
        entries.set(key, next);
        return next;
      }
      current.count += 1;
      return current;
    },
  };
};

const listen = (app) => new Promise((resolve) => {
  const server = app.listen(0, '127.0.0.1', () => resolve(server));
});

test('rate limiter returns 429 and ignores spoofed X-Forwarded-For', async () => {
  const app = express();
  app.use(createRateLimiter({ name: 'auth-test', limit: 2, windowMs: 60_000, identity: 'ip', store: createTestStore() }));
  app.get('/', (_req, res) => res.json({ ok: true }));
  const server = await listen(app);
  try {
    const url = `http://127.0.0.1:${server.address().port}/`;
    assert.equal((await fetch(url, { headers: { 'x-forwarded-for': '1.1.1.1' } })).status, 200);
    assert.equal((await fetch(url, { headers: { 'x-forwarded-for': '2.2.2.2' } })).status, 200);
    const limited = await fetch(url, { headers: { 'x-forwarded-for': '3.3.3.3' } });
    assert.equal(limited.status, 429);
    assert.match(limited.headers.get('retry-after'), /^[1-9]\d*$/);
    assert.equal((await limited.json()).code, 'RATE_LIMITED');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('authenticated limiter keys by user and allows independent users', async () => {
  const app = express();
  const store = createTestStore();
  app.use((req, _res, next) => { req.user = { _id: req.headers['x-test-user'] }; next(); });
  app.use(createRateLimiter({ name: 'heartbeat-test', limit: 2, windowMs: 60_000, identity: 'user', store }));
  app.get('/', (_req, res) => res.json({ ok: true }));
  const server = await listen(app);
  try {
    const url = `http://127.0.0.1:${server.address().port}/`;
    assert.equal((await fetch(url, { headers: { 'x-test-user': 'student-a' } })).status, 200);
    assert.equal((await fetch(url, { headers: { 'x-test-user': 'student-a' } })).status, 200);
    assert.equal((await fetch(url, { headers: { 'x-test-user': 'student-a' } })).status, 429);
    assert.equal((await fetch(url, { headers: { 'x-test-user': 'student-b' } })).status, 200);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('MongoDB rate-limit configuration does not require an external store', () => {
  assert.equal(getRateLimitNamespace({ APP_ENV: 'staging' }), 'staging');
  assert.equal(getRateLimitNamespace({ NODE_ENV: 'production' }), 'production');
});

test('rate-limit namespace sanitizes deployment-specific key spaces', () => {
  assert.equal(getRateLimitNamespace({ RATE_LIMIT_NAMESPACE: 'staging/eu-1' }), 'staging-eu-1');
});
