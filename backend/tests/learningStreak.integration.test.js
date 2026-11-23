import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import express from 'express';
import cookieParser from 'cookie-parser';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import jwt from 'jsonwebtoken';

import learningSessionRoutes from '../src/routes/learningSessionRoutes.js';
import learningStreakRoutes from '../src/routes/learningStreakRoutes.js';
import adminLearningRoutes from '../src/routes/adminLearningRoutes.js';
import User from '../src/models/User.js';
import Course from '../src/models/Course.js';
import Lesson from '../src/models/Lesson.js';
import Enrollment from '../src/models/Enrollment.js';
import LearningSession from '../src/models/LearningSession.js';
import LearningSessionHeartbeat from '../src/models/LearningSessionHeartbeat.js';
import DailyLearningProgress from '../src/models/DailyLearningProgress.js';
import LearningStreak from '../src/models/LearningStreak.js';
import LearningProgress from '../src/models/LearningProgress.js';
import LearningActivity from '../src/models/LearningActivity.js';
import { creditValidatedInterval, getDateKeyInTimezone, shiftDateKey, refreshLearningStreak } from '../src/services/learningStreakService.js';

const dbName = `learning_streak_${randomUUID().replaceAll('-', '')}`;
let mongoServer;
let server;
let baseUrl;
let student;
let secondStudent;
let admin;
let studentToken;
let secondStudentToken;
let adminToken;
let course;
let lesson;

const request = async (path, { method = 'GET', token, body, headers = {} } = {}) => {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  return { response, json };
};

const todayKey = () => getDateKeyInTimezone(new Date(), 'Asia/Ho_Chi_Minh');

const seedDaily = async (studentId, dateKey, seconds, completed = seconds >= 900) => DailyLearningProgress.create({
  _id: `${studentId}:${dateKey}`,
  student: studentId,
  localDate: dateKey,
  timezone: 'Asia/Ho_Chi_Minh',
  validStudySeconds: seconds,
  targetSeconds: 900,
  completed,
  completedAt: completed ? new Date() : null,
});

const creditToday = (seconds) => creditValidatedInterval({
  studentId: student._id,
  activityType: 'lesson',
  seconds,
  intervalStart: new Date(Date.now() - Math.max(1000, seconds * 1000)),
  intervalEnd: new Date(),
  timezone: 'Asia/Ho_Chi_Minh',
});

before(async () => {
  mongoServer = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1', dbName } });
  await mongoose.connect(mongoServer.getUri(dbName), { serverSelectionTimeoutMS: 5000, autoIndex: true });
  await Promise.all([
    User.init(), Course.init(), Lesson.init(), Enrollment.init(), LearningSession.init(),
    LearningSessionHeartbeat.init(), DailyLearningProgress.init(), LearningStreak.init(),
    LearningProgress.init(), LearningActivity.init(),
  ]);

  process.env.JWT_SECRET = `learning-streak-test-${randomUUID()}`;
  student = await User.create({ email: 'streak-a@test.local', password: 'password123', fullName: 'Streak A', role: 'student', status: 'active', isActive: true });
  secondStudent = await User.create({ email: 'streak-b@test.local', password: 'password123', fullName: 'Streak B', role: 'student', status: 'active', isActive: true });
  admin = await User.create({ email: 'streak-admin@test.local', password: 'password123', fullName: 'Streak Admin', role: 'admin', status: 'active', isActive: true });
  studentToken = jwt.sign({ userId: student._id }, process.env.JWT_SECRET, { expiresIn: '1h' });
  secondStudentToken = jwt.sign({ userId: secondStudent._id }, process.env.JWT_SECRET, { expiresIn: '1h' });
  adminToken = jwt.sign({ userId: admin._id }, process.env.JWT_SECRET, { expiresIn: '1h' });

  course = await Course.create({
    title: 'Streak test course', description: 'A course for streak integration tests', teacher: admin._id,
    level: 'Beginner', englishType: 'General', isPublished: true, students: [student._id, secondStudent._id],
  });
  lesson = await Lesson.create({ title: 'Streak lesson', course: course._id, status: 'published', order: 1 });
  await Enrollment.create([
    { student: student._id, course: course._id },
    { student: secondStudent._id, course: course._id },
  ]);

  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/v1/learning/sessions', learningSessionRoutes);
  app.use('/api/v1/learning/streak', learningStreakRoutes);
  app.use('/api/v1/admin/learning', adminLearningRoutes);
  app.use((error, _req, res, _next) => res.status(500).json({ status: 'error', message: error.message }));
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

beforeEach(async () => {
  await Promise.all([
    DailyLearningProgress.deleteMany({}), LearningStreak.deleteMany({}), LearningSession.deleteMany({}),
    LearningSessionHeartbeat.deleteMany({}), LearningProgress.deleteMany({}), LearningActivity.deleteMany({}),
  ]);
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  if (mongoServer) await mongoServer.stop();
});

test('daily aggregation: 5 + 7 + 3 minutes completes exactly one day', async () => {
  await creditToday(300);
  await creditToday(420);
  let row = await DailyLearningProgress.findById(`${student._id}:${todayKey()}`).lean();
  assert.equal(row.validStudySeconds, 720);
  assert.equal(row.completed, false);
  await creditToday(180);
  row = await DailyLearningProgress.findById(`${student._id}:${todayKey()}`).lean();
  assert.equal(row.validStudySeconds, 900);
  assert.equal(row.completed, true);
  assert.equal(await DailyLearningProgress.countDocuments({ student: student._id, completed: true }), 1);
});

test('899 seconds stays incomplete; 900 completes once; 1800 remains one completed day', async () => {
  await creditToday(899);
  let row = await DailyLearningProgress.findById(`${student._id}:${todayKey()}`).lean();
  assert.equal(row.completed, false);
  await creditToday(1);
  const firstCompletion = (await DailyLearningProgress.findById(`${student._id}:${todayKey()}`).lean()).completedAt;
  await creditToday(900);
  row = await DailyLearningProgress.findById(`${student._id}:${todayKey()}`).lean();
  assert.equal(row.validStudySeconds, 1800);
  assert.equal(row.completed, true);
  assert.equal(String(row.completedAt), String(firstCompletion));
  assert.equal((await refreshLearningStreak(student._id)).currentStreak, 1);
});

test('missed day breaks current streak but preserves longest; pending today is not reset early', async () => {
  const today = todayKey();
  await seedDaily(student._id, shiftDateKey(today, -1), 900);
  let streak = await refreshLearningStreak(student._id);
  assert.equal(streak.currentStreak, 1, 'yesterday remains pending/active');
  await seedDaily(student._id, shiftDateKey(today, -3), 900);
  await seedDaily(student._id, shiftDateKey(today, -2), 900);
  await DailyLearningProgress.updateOne({ _id: `${student._id}:${shiftDateKey(today, -1)}` }, { $set: { completed: false, completedAt: null, validStudySeconds: 0 } });
  streak = await refreshLearningStreak(student._id);
  assert.equal(streak.currentStreak, 0);
  assert.equal(streak.longestStreak, 2);
});

test('session heartbeat is ownership-bound, idempotent, and cannot inflate via rapid unique requests', async () => {
  const start = await request('/api/v1/learning/sessions/start', { method: 'POST', token: studentToken, body: { lessonId: lesson._id } });
  assert.equal(start.response.status, 201);
  const sessionId = start.json.data.sessionId;
  const first = await request('/api/v1/learning/sessions/heartbeat', { method: 'POST', token: studentToken, body: { sessionId, activeSeconds: 9999, heartbeatId: 'h-1' } });
  assert.equal(first.response.status, 200);
  const duplicate = await request('/api/v1/learning/sessions/heartbeat', { method: 'POST', token: studentToken, body: { sessionId, activeSeconds: 9999, heartbeatId: 'h-1' } });
  assert.equal(duplicate.response.status, 200);
  const afterDuplicate = await LearningSession.findById(sessionId).lean();
  for (let index = 0; index < 20; index += 1) {
    await request('/api/v1/learning/sessions/heartbeat', { method: 'POST', token: studentToken, body: { sessionId, activeSeconds: 9999, heartbeatId: `flood-${index}` } });
  }
  const afterFlood = await LearningSession.findById(sessionId).lean();
  assert.equal(afterFlood.accumulatedActiveSeconds, afterDuplicate.accumulatedActiveSeconds);
  const wrongOwner = await request('/api/v1/learning/sessions/heartbeat', { method: 'POST', token: secondStudentToken, body: { sessionId, activeSeconds: 20, heartbeatId: 'other-user' } });
  assert.equal(wrongOwner.response.status, 404);
});

test('generic activity sessions require an approved learning route', async () => {
  const invalid = await request('/api/v1/learning/sessions/start', {
    method: 'POST', token: studentToken,
    body: { activityType: 'assessment', activityId: '/student/toeic' },
  });
  assert.equal(invalid.response.status, 400);
  assert.equal(invalid.json.code, 'INVALID_ACTIVITY_PATH');
  const approved = await request('/api/v1/learning/sessions/start', {
    method: 'POST', token: studentToken,
    body: { activityType: 'assessment', activityId: '/student/toeic/attempt/abc' },
  });
  assert.equal(approved.response.status, 201);
  const session = await LearningSession.findById(approved.json.data.sessionId).lean();
  assert.equal(session.activityType, 'assessment');
});

test('starting a second tab invalidates the first active session', async () => {
  const first = await request('/api/v1/learning/sessions/start', { method: 'POST', token: studentToken, body: { lessonId: lesson._id } });
  const second = await request('/api/v1/learning/sessions/start', { method: 'POST', token: studentToken, body: { lessonId: lesson._id } });
  assert.equal(first.response.status, 201);
  assert.equal(second.response.status, 201);
  const oldHeartbeat = await request('/api/v1/learning/sessions/heartbeat', {
    method: 'POST', token: studentToken,
    body: { sessionId: first.json.data.sessionId, activeSeconds: 30, heartbeatId: 'old-tab' },
  });
  assert.equal(oldHeartbeat.response.status, 400);
  assert.equal(oldHeartbeat.json.code, 'SESSION_NOT_ACTIVE');
});

test('pause endpoint is ownership-bound and stops further heartbeat credit', async () => {
  const start = await request('/api/v1/learning/sessions/start', { method: 'POST', token: studentToken, body: { lessonId: lesson._id } });
  const sessionId = start.json.data.sessionId;
  const paused = await request('/api/v1/learning/sessions/pause', { method: 'POST', token: studentToken, body: { sessionId } });
  assert.equal(paused.response.status, 200);
  assert.equal(paused.json.data.status, 'paused');
  const heartbeat = await request('/api/v1/learning/sessions/heartbeat', { method: 'POST', token: studentToken, body: { sessionId, activeSeconds: 30, heartbeatId: 'paused-heartbeat' } });
  assert.equal(heartbeat.response.status, 400);
  assert.equal(heartbeat.json.code, 'SESSION_NOT_ACTIVE');
});

test('concurrent end requests claim one interval only', async () => {
  const start = await request('/api/v1/learning/sessions/start', { method: 'POST', token: studentToken, body: { lessonId: lesson._id } });
  const sessionId = start.json.data.sessionId;
  const results = await Promise.all([
    request('/api/v1/learning/sessions/end', { method: 'POST', token: studentToken, body: { sessionId, activeSeconds: 9999 } }),
    request('/api/v1/learning/sessions/end', { method: 'POST', token: studentToken, body: { sessionId, activeSeconds: 9999 } }),
  ]);
  assert.ok(results.every((result) => result.response.status === 200));
  const session = await LearningSession.findById(sessionId).lean();
  assert.ok(session.accumulatedActiveSeconds <= 5);
  const daily = await DailyLearningProgress.findOne({ student: student._id, localDate: todayKey() }).lean();
  assert.ok(!daily || daily.validStudySeconds <= 5);
});

test('student and admin read the same completed daily progress', async () => {
  await creditToday(900);
  const studentView = await request('/api/v1/learning/streak/overview', { token: studentToken });
  const adminView = await request(`/api/v1/admin/learning/students/${student._id}/streak`, { token: adminToken });
  assert.equal(studentView.response.status, 200);
  assert.equal(adminView.response.status, 200);
  assert.equal(studentView.json.data.today.validStudySeconds, 900);
  assert.equal(adminView.json.data.today.validStudySeconds, 900);
  assert.equal(studentView.json.data.streak.currentStreak, adminView.json.data.streak.currentStreak);
  const forbidden = await request(`/api/v1/admin/learning/students/${student._id}/streak`, { token: secondStudentToken });
  assert.equal(forbidden.response.status, 403);
});

test('student calendar exposes session count and activity details without marking missing history as missed', async () => {
  const today = todayKey();
  await DailyLearningProgress.create({
    _id: `${student._id}:${today}`,
    student: student._id,
    localDate: today,
    timezone: 'Asia/Ho_Chi_Minh',
    validStudySeconds: 900,
    targetSeconds: 900,
    completed: true,
    completedAt: new Date(),
    activitySeconds: { lesson: 600, vocabulary: 300 },
  });
  await LearningSession.create({
    student: student._id,
    activityType: 'lesson',
    startedAt: new Date(),
    lastHeartbeatAt: new Date(),
    endedAt: new Date(),
    accumulatedActiveSeconds: 900,
    status: 'completed',
  });

  const calendar = await request('/api/v1/learning/streak/calendar', { token: studentToken });
  assert.equal(calendar.response.status, 200);
  const todayRow = calendar.json.data.calendar.find((row) => row.dateKey === today);
  const noDataRow = calendar.json.data.calendar.find((row) => row.dateKey < today && row.status === 'no_data');
  assert.equal(todayRow.validStudySeconds, 900);
  assert.equal(todayRow.sessionCount, 1);
  assert.deepEqual(todayRow.activitySeconds, { lesson: 600, vocabulary: 300 });
  assert.equal(todayRow.status, 'completed');
  assert.equal(noDataRow.status, 'no_data');
});

test('admin streak sort, filter, and pagination use the same daily source', async () => {
  const today = todayKey();
  await seedDaily(student._id, today, 900, true);
  await seedDaily(secondStudent._id, today, 480, false);
  await LearningStreak.create([
    { student: student._id, currentStreak: 7, longestStreak: 9, lastCompletedDate: today, totalCompletedDays: 9, currentTier: 3 },
    { student: secondStudent._id, currentStreak: 2, longestStreak: 2, lastCompletedDate: today, totalCompletedDays: 2, currentTier: 1 },
  ]);
  const sorted = await request('/api/v1/admin/learning/students?sort=streak_desc&limit=1&page=1', { token: adminToken });
  assert.equal(sorted.response.status, 200);
  assert.equal(sorted.json.data.pagination.total, 2);
  assert.equal(String(sorted.json.data.students[0]._id), String(student._id));
  const filtered = await request('/api/v1/admin/learning/students?streakStatus=completed&limit=20&page=1', { token: adminToken });
  assert.equal(filtered.response.status, 200);
  assert.deepEqual(filtered.json.data.students.map((row) => String(row._id)), [String(student._id)]);
});

test('interval crossing local midnight is split into both calendar days', async () => {
  const today = todayKey();
  const start = new Date(`${today}T16:59:55.000Z`);
  const end = new Date(`${today}T17:00:05.000Z`);
  await creditValidatedInterval({ studentId: student._id, activityType: 'lesson', seconds: 20, intervalStart: start, intervalEnd: end, timezone: 'Asia/Ho_Chi_Minh' });
  const rows = await DailyLearningProgress.find({ student: student._id }).sort({ localDate: 1 }).lean();
  assert.equal(rows.length, 2);
  assert.equal(rows.reduce((sum, row) => sum + row.validStudySeconds, 0), 20);
  assert.ok(rows.every((row) => row.validStudySeconds > 0));
});

test('admin streak endpoints are protected from student access', async () => {
  const response = await request(`/api/v1/admin/learning/students/${student._id}/streak/activity?days=30`, { token: studentToken });
  assert.equal(response.response.status, 403);
});
