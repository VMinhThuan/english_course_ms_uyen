import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import express from 'express';
import cookieParser from 'cookie-parser';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import authRoutes from '../src/routes/authRoutes.js';
import learningSessionRoutes from '../src/routes/learningSessionRoutes.js';
import User from '../src/models/User.js';
import LearningSession from '../src/models/LearningSession.js';
import LearningSessionHeartbeat from '../src/models/LearningSessionHeartbeat.js';
import LearningProgress from '../src/models/LearningProgress.js';
import LearningActivity from '../src/models/LearningActivity.js';

const dbName = `single_active_session_replica_${randomUUID().replaceAll('-', '')}`;
const password = 'ReplicaSession!2026';
let replicaSet;
let servers = [];

const startApp = async () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1/learning/sessions', learningSessionRoutes);
  app.use((error, _req, res, _next) => res.status(error.statusCode || 500).json({ status: 'error', code: error.code, message: error.message }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  servers.push(server);
  return `http://127.0.0.1:${server.address().port}`;
};

const extractRefreshCookie = (headers) => {
  const values = typeof headers.getSetCookie === 'function'
    ? headers.getSetCookie()
    : String(headers.get('set-cookie') || '').split(/,(?=refreshToken=)/);
  const value = [...values].reverse().find((item) => /refreshToken=[^;]+/.test(item));
  return value?.match(/refreshToken=[^;]+/)?.[0] || '';
};

const request = async (baseUrl, path, { method = 'GET', token, cookie, body, headers = {} } = {}) => {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...headers,
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
  process.env.JWT_SECRET = `single-session-replica-access-${randomUUID()}`;
  process.env.JWT_REFRESH_SECRET = `single-session-replica-refresh-${randomUUID()}`;
  process.env.AUTH_SESSION_ENFORCEMENT_STUDENTS = 'true';
  process.env.AUTH_REFRESH_ROTATION = 'true';
  process.env.MONGOOSE_AUTO_INDEX = 'true';

  replicaSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, ip: '127.0.0.1', dbName },
  });
  await mongoose.connect(replicaSet.getUri(dbName), {
    serverSelectionTimeoutMS: 5000,
    autoIndex: true,
    autoCreate: false,
  });
  for (const model of [User, LearningSession, LearningSessionHeartbeat, LearningProgress, LearningActivity]) {
    await model.init();
  }
});

test.after(async () => {
  for (const server of servers) await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect().catch(() => {});
  await replicaSet?.stop().catch(() => {});
});

test('replica-set release verification covers topology, indexes, two instances, conflicts, and recovery', async () => {
  const topologyType = mongoose.connection.getClient().topology?.description?.type;
  assert.equal(topologyType, 'ReplicaSetWithPrimary');

  const indexes = await LearningSession.collection.listIndexes().toArray();
  const activeIndex = indexes.find((index) => index.name === 'learning_session_one_active_per_student');
  assert.equal(activeIndex?.unique, true);
  assert.deepEqual(activeIndex?.partialFilterExpression, { status: 'active' });

  const [instanceA, instanceB] = await Promise.all([startApp(), startApp()]);
  const user = await User.create({
    email: 'replica-session@test.local',
    password,
    fullName: 'Replica Session',
    role: 'student',
    status: 'active',
    isActive: true,
  });

  const first = await request(instanceA, '/api/v1/auth/login', {
    method: 'POST',
    body: { email: user.email, password },
  });
  const second = await request(instanceB, '/api/v1/auth/login', {
    method: 'POST',
    body: { email: user.email, password },
  });
  assert.equal(first.response.status, 200);
  assert.equal(second.response.status, 200);

  const oldAccess = await request(instanceA, '/api/v1/auth/me', { token: first.json.data.accessToken });
  const currentAccess = await request(instanceB, '/api/v1/auth/me', { token: second.json.data.accessToken });
  assert.equal(oldAccess.response.status, 401);
  assert.equal(oldAccess.json.code, 'SESSION_REPLACED');
  assert.equal(currentAccess.response.status, 200);

  const start = await request(instanceB, '/api/v1/learning/sessions/start', {
    method: 'POST',
    token: second.json.data.accessToken,
    body: { activityType: 'interactive', activityId: '/student/part-2-challenge' },
  });
  assert.equal(start.response.status, 201);
  const sessionId = start.json.data.sessionId;

  const oldLearning = await request(instanceA, '/api/v1/learning/sessions/start', {
    method: 'POST',
    token: first.json.data.accessToken,
    body: { activityType: 'interactive', activityId: '/student/part-2-challenge' },
  });
  assert.equal(oldLearning.response.status, 401);
  assert.equal(oldLearning.json.code, 'SESSION_REPLACED');

  const concurrentHeartbeats = await Promise.all([
    request(instanceA, '/api/v1/learning/sessions/heartbeat', {
      method: 'POST',
      token: second.json.data.accessToken,
      headers: { 'Idempotency-Key': `replica-hb-a-${randomUUID()}` },
      body: { sessionId, activeSeconds: 15 },
    }),
    request(instanceB, '/api/v1/learning/sessions/heartbeat', {
      method: 'POST',
      token: second.json.data.accessToken,
      headers: { 'Idempotency-Key': `replica-hb-b-${randomUUID()}` },
      body: { sessionId, activeSeconds: 15 },
    }),
  ]);
  assert.deepEqual(concurrentHeartbeats.map(({ response }) => response.status).sort(), [200, 200]);
  const storedSession = await LearningSession.findById(sessionId).lean();
  assert.ok(storedSession.accumulatedActiveSeconds <= 5);
  assert.equal(await LearningSession.countDocuments({ student: user._id, status: 'active' }), 1);
  const heartbeatCount = await LearningSessionHeartbeat.countDocuments({ session: sessionId });
  assert.ok(heartbeatCount >= 1 && heartbeatCount <= 2);

  await mongoose.disconnect();
  const unavailable = await request(instanceB, '/api/v1/auth/me', { token: second.json.data.accessToken });
  assert.equal(unavailable.response.status, 503);
  assert.equal(unavailable.json.code, 'AUTHENTICATION_UNAVAILABLE');
  await mongoose.connect(replicaSet.getUri(dbName), { serverSelectionTimeoutMS: 5000, autoIndex: true, autoCreate: false });
  const recovered = await request(instanceA, '/api/v1/auth/me', { token: second.json.data.accessToken });
  assert.equal(recovered.response.status, 200);
});
