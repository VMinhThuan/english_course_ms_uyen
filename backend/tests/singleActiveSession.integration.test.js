import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import express from 'express';
import cookieParser from 'cookie-parser';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import authRoutes from '../src/routes/authRoutes.js';
import learningSessionRoutes from '../src/routes/learningSessionRoutes.js';
import { optionalAuth } from '../src/middlewares/auth.js';
import User from '../src/models/User.js';

const dbName = `single_active_session_${randomUUID().replaceAll('-', '')}`;
let mongoServer;
let server;
let baseUrl;

const extractRefreshCookie = (headers) => {
  const values = typeof headers.getSetCookie === 'function'
    ? headers.getSetCookie()
    : String(headers.get('set-cookie') || '').split(/,(?=refreshToken=)/);
  const value = [...values].reverse().find((item) => /refreshToken=[^;]+/.test(item));
  return value?.match(/refreshToken=[^;]+/)?.[0] || '';
};

const request = async (path, { method = 'GET', token, cookie, body } = {}) => {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { response, json: await response.json() };
};

test.before(async () => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = `single-session-access-${randomUUID()}`;
  process.env.JWT_REFRESH_SECRET = `single-session-refresh-${randomUUID()}`;
  process.env.AUTH_SESSION_ENFORCEMENT_STUDENTS = 'true';
  process.env.AUTH_REFRESH_ROTATION = 'true';
  mongoServer = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1', dbName } });
  await mongoose.connect(mongoServer.getUri(dbName), { serverSelectionTimeoutMS: 5000, autoIndex: true });
  await User.init();
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/v1/auth', authRoutes);
  app.get('/api/v1/auth/optional-check', optionalAuth, (req, res) => res.json({ status: 'success', authenticated: Boolean(req.user) }));
  app.use('/api/v1/learning/sessions', learningSessionRoutes);
  app.use((error, _req, res, _next) => res.status(error.statusCode || 500).json({ status: 'error', code: error.code, message: error.message }));
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  await User.create({ email: 'session@test.local', password: 'password123', fullName: 'Session Test', role: 'student', status: 'active', isActive: true });
  await User.create({ email: 'teacher-session@test.local', password: 'password123', fullName: 'Teacher Session', role: 'teacher', status: 'active', isActive: true });
  await User.create({ email: 'admin-session@test.local', password: 'password123', fullName: 'Admin Session', role: 'admin', status: 'active', isActive: true });
});

test.after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  if (mongoServer) await mongoServer.stop();
});

test('last login wins, wrong password preserves session, and stale logout is harmless', async () => {
  const first = await request('/api/v1/auth/login', { method: 'POST', body: { email: 'session@test.local', password: 'password123' } });
  assert.equal(first.response.status, 200);
  const firstToken = first.json.data.accessToken;
  const firstCookie = extractRefreshCookie(first.response.headers);
  const storedFirstSession = await User.findOne({ email: 'session@test.local' }).select('+authSession').lean();
  assert.notEqual(storedFirstSession.authSession.refreshTokenHash, firstCookie.replace(/^refreshToken=/, ''));

  const firstLearningStart = await request('/api/v1/learning/sessions/start', {
    method: 'POST',
    token: firstToken,
    body: { activityType: 'interactive', activityId: '/student/part-2-challenge' },
  });
  assert.equal(firstLearningStart.response.status, 201);
  const firstLearningSessionId = firstLearningStart.json.data.sessionId;

  const wrongPassword = await request('/api/v1/auth/login', { method: 'POST', body: { email: 'session@test.local', password: 'wrong-password' } });
  assert.equal(wrongPassword.response.status, 401);

  const second = await request('/api/v1/auth/login', { method: 'POST', body: { email: 'session@test.local', password: 'password123' } });
  assert.equal(second.response.status, 200);
  const secondToken = second.json.data.accessToken;
  const secondCookie = extractRefreshCookie(second.response.headers);
  assert.notEqual(firstToken, secondToken);

  const oldDeviceLearningStart = await request('/api/v1/learning/sessions/start', {
    method: 'POST',
    token: firstToken,
    body: { activityType: 'interactive', activityId: '/student/part-2-challenge' },
  });
  assert.equal(oldDeviceLearningStart.response.status, 401);
  assert.equal(oldDeviceLearningStart.json.code, 'SESSION_REPLACED');

  const oldDeviceHeartbeat = await request('/api/v1/learning/sessions/heartbeat', {
    method: 'POST',
    token: firstToken,
    body: { sessionId: firstLearningSessionId, activeSeconds: 15, heartbeatId: randomUUID() },
  });
  assert.equal(oldDeviceHeartbeat.response.status, 401);
  assert.equal(oldDeviceHeartbeat.json.code, 'SESSION_REPLACED');

  const staleAccess = await request('/api/v1/auth/me', { token: firstToken });
  assert.equal(staleAccess.response.status, 401);
  assert.equal(staleAccess.json.code, 'SESSION_REPLACED');

  const staleOptionalAuth = await request('/api/v1/auth/optional-check', { token: firstToken });
  assert.equal(staleOptionalAuth.response.status, 401);
  assert.equal(staleOptionalAuth.json.code, 'SESSION_REPLACED');

  const currentAccess = await request('/api/v1/auth/me', { token: secondToken });
  assert.equal(currentAccess.response.status, 200);
  const currentOptionalAuth = await request('/api/v1/auth/optional-check', { token: secondToken });
  assert.equal(currentOptionalAuth.response.status, 200);

  const staleRefresh = await request('/api/v1/auth/refresh', { method: 'POST', cookie: firstCookie });
  assert.equal(staleRefresh.response.status, 401);
  assert.ok(['SESSION_REPLACED', 'REFRESH_REUSE'].includes(staleRefresh.json.code));

  const staleLogout = await request('/api/v1/auth/logout', { method: 'POST', token: firstToken, cookie: firstCookie });
  assert.equal(staleLogout.response.status, 200);
  const stillCurrent = await request('/api/v1/auth/me', { token: secondToken });
  assert.equal(stillCurrent.response.status, 200);

  const concurrentRefreshes = await Promise.all([
    request('/api/v1/auth/refresh', { method: 'POST', cookie: secondCookie }),
    request('/api/v1/auth/refresh', { method: 'POST', cookie: secondCookie }),
  ]);
  assert.deepEqual(concurrentRefreshes.map(({ response }) => response.status).sort(), [200, 200]);
  for (const refreshResult of concurrentRefreshes) {
    const accessAfterConcurrentRefresh = await request('/api/v1/auth/me', { token: refreshResult.json.data.accessToken });
    assert.equal(accessAfterConcurrentRefresh.response.status, 200);
  }
});

test('concurrent student login has one winner while admin and teacher remain unrestricted', async () => {
  const concurrentLogins = await Promise.all([
    request('/api/v1/auth/login', { method: 'POST', body: { email: 'session@test.local', password: 'password123' } }),
    request('/api/v1/auth/login', { method: 'POST', body: { email: 'session@test.local', password: 'password123' } }),
  ]);
  assert.deepEqual(concurrentLogins.map(({ response }) => response.status).sort(), [200, 200]);
  const concurrentAccessResults = await Promise.all(
    concurrentLogins.map(({ json }) => request('/api/v1/auth/me', { token: json.data.accessToken })),
  );
  assert.deepEqual(concurrentAccessResults.map(({ response }) => response.status).sort(), [200, 401]);
  assert.equal(concurrentAccessResults.find(({ response }) => response.status === 401).json.code, 'SESSION_REPLACED');

  for (const email of ['teacher-session@test.local', 'admin-session@test.local']) {
    const pair = await Promise.all([
      request('/api/v1/auth/login', { method: 'POST', body: { email, password: 'password123' } }),
      request('/api/v1/auth/login', { method: 'POST', body: { email, password: 'password123' } }),
    ]);
    assert.deepEqual(pair.map(({ response }) => response.status), [200, 200]);
    const accessChecks = await Promise.all(pair.map(({ json }) => request('/api/v1/auth/me', { token: json.data.accessToken })));
    assert.deepEqual(accessChecks.map(({ response }) => response.status), [200, 200]);
  }
});

test('authentication fails closed when MongoDB is unavailable', async () => {
  const login = await request('/api/v1/auth/login', { method: 'POST', body: { email: 'session@test.local', password: 'password123' } });
  assert.equal(login.response.status, 200);
  const token = login.json.data.accessToken;
  await mongoose.disconnect();
  const unavailable = await request('/api/v1/auth/me', { token });
  assert.equal(unavailable.response.status, 503);
  assert.equal(unavailable.json.code, 'AUTHENTICATION_UNAVAILABLE');
  await mongoose.connect(mongoServer.getUri(dbName), { serverSelectionTimeoutMS: 5000, autoIndex: true });
});
