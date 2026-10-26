import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import express from 'express';
import cookieParser from 'cookie-parser';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import jwt from 'jsonwebtoken';
import adminRoutes from '../src/routes/adminRoutes.js';
import authRoutes from '../src/routes/authRoutes.js';
import assessmentRoutes from '../src/routes/assessmentRoutes.js';
import attemptRoutes from '../src/routes/attemptRoutes.js';
import { studentToeicRoutes } from '../src/routes/toeicRoutes.js';
import User from '../src/models/User.js';
import Course from '../src/models/Course.js';
import Lesson from '../src/models/Lesson.js';
import Enrollment from '../src/models/Enrollment.js';
import LearningProgress from '../src/models/LearningProgress.js';
import Assessment from '../src/models/Assessment.js';
import Attempt from '../src/models/Attempt.js';
import Question from '../src/models/Question.js';
import Material from '../src/models/Material.js';

const dbName = `phase3_integration_${randomUUID().replaceAll('-', '')}`;
let mongoServer;
let setupError;
let httpServer;
let baseUrl;
let admin;
let teacher;
let student;
let otherStudent;
let thirdStudent;
let adminToken;
let teacherToken;
let studentToken;
let standardAssessment;
let toeicAssessment;

try {
  assert.equal(mongoose.connection.readyState, 0, 'test must start with a disconnected Mongoose connection');
  mongoServer = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1', dbName } });
  const isolatedUri = mongoServer.getUri(dbName);
  const parsedUri = new URL(isolatedUri);
  assert.equal(parsedUri.hostname, '127.0.0.1', 'test database must bind to loopback only');
  assert.ok(parsedUri.pathname.replaceAll('/', '') === dbName, 'test database must use its unique disposable name');
  await mongoose.connect(isolatedUri, { serverSelectionTimeoutMS: 5000, autoIndex: true });
  await Promise.all([
    User.init(), Course.init(), Lesson.init(), Enrollment.init(),
    LearningProgress.init(), Assessment.init(), Attempt.init(), Question.init(), Material.init(),
  ]);

  process.env.JWT_SECRET = `phase3-access-${randomUUID()}`;
  process.env.JWT_REFRESH_SECRET = `phase3-refresh-${randomUUID()}`;
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1/assessments', assessmentRoutes);
  app.use('/api/v1/attempts', attemptRoutes);
  app.use('/api/v1/toeic', studentToeicRoutes);
  app.use('/api/v1/admin', adminRoutes);
  app.use((error, _req, res, _next) => res.status(500).json({ status: 'error', message: 'Internal test error' }));
  httpServer = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    httpServer.once('listening', resolve);
    httpServer.once('error', reject);
  });
  baseUrl = `http://127.0.0.1:${httpServer.address().port}`;

  admin = await User.create({ email: 'phase3-admin@example.test', password: 'admin-password', fullName: 'Quản trị viên', role: 'admin', status: 'active', isActive: true });
  teacher = await User.create({ email: 'phase3-teacher@example.test', password: 'teacher-password', fullName: 'Giáo viên Phase 3', role: 'teacher', status: 'active', isActive: true });
  student = await User.create({ email: 'nguyen.an@example.test', password: 'student-password', fullName: 'Nguyễn Văn An', username: 'nguyenvanan', role: 'student', status: 'active', isActive: true });
  otherStudent = await User.create({ email: 'tran.binh@example.test', password: 'student-password', fullName: 'Trần Văn Bình', username: 'tranvanbinh', role: 'student', status: 'active', isActive: true });
  thirdStudent = await User.create({ email: 'le.chi@example.test', password: 'student-password', fullName: 'Lê Thị Chi', username: 'lethichi', role: 'student', status: 'active', isActive: true });
  adminToken = jwt.sign({ userId: admin._id }, process.env.JWT_SECRET, { expiresIn: '10m' });
  teacherToken = jwt.sign({ userId: teacher._id }, process.env.JWT_SECRET, { expiresIn: '10m' });
  studentToken = jwt.sign({ userId: student._id }, process.env.JWT_SECRET, { expiresIn: '10m' });

  standardAssessment = await Assessment.create({ title: 'Standard Mock Exam', type: 'exam', examFormat: 'standard', status: 'published', passScore: 70 });
  toeicAssessment = await Assessment.create({ title: 'TOEIC Practice', type: 'exercise', examFormat: 'toeic', toeicMode: 'practice', status: 'published' });
} catch (error) {
  setupError = error;
  if (httpServer?.listening) await new Promise((resolve) => httpServer.close(resolve));
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect().catch(() => {});
  if (mongoServer) await mongoServer.stop().catch(() => {});
}

const request = async (path, { method = 'GET', token, body } = {}) => {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { response, json: await response.json() };
};

test('Phase 3 isolated MongoDB/API integration', { skip: setupError ? `BLOCKED: disposable MongoDB could not start (${setupError.message})` : false }, async (t) => {
  const createdName = `Phase3 ${randomUUID().slice(0, 8)}`;
  const createdEmail = `phase3-${randomUUID().slice(0, 8)}@example.test`;
  const createdUsername = `phase3_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
  let createdStudent;

  await t.test('admin material list uses a valid MongoDB exclusion projection', async () => {
    const course = await Course.create({
      title: `Phase 3 material course ${randomUUID().slice(0, 8)}`,
      description: 'Material projection regression fixture',
      teacher: teacher._id,
      level: 'Beginner',
      englishType: 'TOEIC',
      isPublished: true,
    });
    const lesson = await Lesson.create({ title: 'Material projection lesson', course: course._id, status: 'published' });
    const material = await Material.create({
      title: 'Material projection fixture',
      lesson: lesson._id,
      course: course._id,
      fileUrl: 'https://example.test/material-projection.pdf',
      filePath: '',
      status: 'published',
    });

    const { response, json } = await request(`/api/v1/admin/materials?courseId=${course._id}`, { token: adminToken });

    assert.equal(response.status, 200);
    assert.equal(json.status, 'success');
    assert.equal(json.data.materials.length, 1);
    assert.equal(json.data.materials[0]._id, material._id.toString());
    assert.equal(json.data.materials[0].filePath, undefined);
    assert.equal(json.data.materials[0].__v, undefined);
  });

  await t.test('Phase 2 real Mongo routes: Standard/TOEIC submit, expiry, CAS, engine checks, limits, legacy, and history reads', async () => {
    const standardQuestion = await Question.create({
      questionText: 'Standard lifecycle question', type: 'single_choice',
      options: [{ id: 'A', text: 'Correct' }, { id: 'B', text: 'Late/wrong' }],
      correctAnswers: ['A'], score: 2, status: 'published',
    });
    const toeicQuestion = await Question.create({
      questionText: 'TOEIC lifecycle question', type: 'single_choice', toeicPart: 1,
      options: [{ id: 'A', text: 'Correct' }, { id: 'B', text: 'Late/wrong' }],
      correctAnswers: ['A'], score: 2, status: 'published',
    });
    const standardFixture = {
      questionId: 'std-q1', type: 'single_choice', questionText: 'Standard lifecycle question',
      options: [{ id: 'A', text: 'Correct' }, { id: 'B', text: 'Wrong' }], correctAnswers: ['A'], score: 2,
    };
    const toeicFixture = {
      questionId: 'toeic-q1', type: 'single_choice', questionText: 'TOEIC lifecycle question',
      options: [{ id: 'A', text: 'Correct' }, { id: 'B', text: 'Wrong' }], correctAnswers: ['A'], score: 2, toeicPart: 1,
    };
    const standardLifeAssessment = await Assessment.create({
      title: 'Phase 2 Standard lifecycle', type: 'exam', examFormat: 'standard', status: 'published',
      durationMinutes: 60, passScore: 50, questions: [{ question: standardQuestion._id, score: 2 }],
    });
    const toeicLifeAssessment = await Assessment.create({
      title: 'Phase 2 TOEIC lifecycle', type: 'exam', examFormat: 'toeic', status: 'published',
      durationMinutes: 60, questions: [{ question: toeicQuestion._id, score: 2 }],
    });
    const makeAttempt = (overrides = {}) => Attempt.create({
      student: student._id,
      assessment: standardLifeAssessment._id,
      assessmentType: 'exam',
      engine: 'standard',
      startedAt: new Date(Date.now() - 5 * 60 * 1000),
      deadlineAt: new Date(Date.now() + 55 * 60 * 1000),
      status: 'in_progress',
      revision: 1,
      questionSnapshots: [standardFixture],
      answers: {},
      ...overrides,
    });

    const standardManual = await makeAttempt();
    const standardSubmit = await request(`/api/v1/attempts/${standardManual._id}/submit`, {
      method: 'POST', token: studentToken, body: { answers: { 'std-q1': 'A' }, revision: 1 },
    });
    assert.equal(standardSubmit.response.status, 200);
    const standardAfter = await Attempt.findById(standardManual._id).lean();
    assert.equal(standardAfter.status, 'submitted');
    assert.equal(standardAfter.score, 2);
    assert.equal(standardAfter.maxScore, 2);
    assert.ok(standardAfter.submittedAt instanceof Date);
    const duplicateStandard = await request(`/api/v1/attempts/${standardManual._id}/submit`, {
      method: 'POST', token: studentToken, body: { answers: { 'std-q1': 'B' }, revision: 1 },
    });
    assert.equal(duplicateStandard.response.status, 200);
    assert.deepEqual((await Attempt.findById(standardManual._id).lean()).answers, { 'std-q1': 'A' });

    const toeicManual = await makeAttempt({
      assessment: toeicLifeAssessment._id, engine: 'toeic', questionSnapshots: [toeicFixture], answers: {},
    });
    const toeicSubmit = await request(`/api/v1/toeic/attempts/${toeicManual._id}/submit`, {
      method: 'POST', token: studentToken, body: { answers: { 'toeic-q1': ['A'] }, revision: 1 },
    });
    assert.equal(toeicSubmit.response.status, 200);
    const toeicAfter = await Attempt.findById(toeicManual._id).lean();
    assert.equal(toeicAfter.status, 'completed');
    assert.equal(toeicAfter.score, 2);
    assert.equal(toeicAfter.maxScore, 2);
    assert.ok(toeicAfter.toeicBreakdown);
    const duplicateToeic = await request(`/api/v1/toeic/attempts/${toeicManual._id}/submit`, {
      method: 'POST', token: studentToken, body: { answers: { 'toeic-q1': ['B'] }, revision: 1 },
    });
    assert.equal(duplicateToeic.response.status, 200);
    assert.deepEqual((await Attempt.findById(toeicManual._id).lean()).answers, { 'toeic-q1': ['A'] });

    const expiredStandard = await makeAttempt({
      startedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      deadlineAt: new Date(Date.now() - 60 * 1000),
      answers: { 'std-q1': 'A' },
    });
    const lateStandard = await request(`/api/v1/attempts/${expiredStandard._id}/submit`, {
      method: 'POST', token: studentToken, body: { answers: { 'std-q1': 'B' }, revision: 99 },
    });
    assert.equal(lateStandard.response.status, 200);
    const expiredStandardAfter = await Attempt.findById(expiredStandard._id).lean();
    assert.equal(expiredStandardAfter.status, 'submitted');
    assert.equal(expiredStandardAfter.isExpired, true);
    assert.equal(expiredStandardAfter.score, 2);
    assert.deepEqual(expiredStandardAfter.answers, { 'std-q1': 'A' });
    assert.equal(expiredStandardAfter.submittedAt.getTime(), expiredStandardAfter.deadlineAt.getTime());

    const expiredToeic = await makeAttempt({
      assessment: toeicLifeAssessment._id,
      engine: 'toeic',
      questionSnapshots: [toeicFixture],
      startedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      deadlineAt: new Date(Date.now() - 60 * 1000),
      answers: { 'toeic-q1': ['A'] },
    });
    const lateToeic = await request(`/api/v1/toeic/attempts/${expiredToeic._id}/submit`, {
      method: 'POST', token: studentToken, body: { answers: { 'toeic-q1': ['B'] }, revision: 99 },
    });
    assert.equal(lateToeic.response.status, 200);
    const expiredToeicAfter = await Attempt.findById(expiredToeic._id).lean();
    assert.equal(expiredToeicAfter.status, 'completed');
    assert.equal(expiredToeicAfter.isExpired, true);
    assert.equal(expiredToeicAfter.score, 2);
    assert.deepEqual(expiredToeicAfter.answers, { 'toeic-q1': ['A'] });

    const standardWrongRoute = await makeAttempt();
    const beforeStandardWrongRoute = await Attempt.findById(standardWrongRoute._id).lean();
    const wrongToeicRoute = await request(`/api/v1/toeic/attempts/${standardWrongRoute._id}/submit`, {
      method: 'POST', token: studentToken, body: { answers: { 'std-q1': 'A' }, revision: 1 },
    });
    assert.equal(wrongToeicRoute.response.status, 409);
    assert.equal(wrongToeicRoute.json.code, 'ATTEMPT_ENGINE_MISMATCH');
    const afterStandardWrongRoute = await Attempt.findById(standardWrongRoute._id).lean();
    assert.equal(afterStandardWrongRoute.status, beforeStandardWrongRoute.status);
    assert.deepEqual(afterStandardWrongRoute.answers, beforeStandardWrongRoute.answers);
    await request(`/api/v1/attempts/${standardWrongRoute._id}/submit`, {
      method: 'POST', token: studentToken, body: { answers: { 'std-q1': 'A' }, revision: 1 },
    });

    const toeicWrongRouteAttempt = await makeAttempt({ assessment: toeicLifeAssessment._id, engine: 'toeic', questionSnapshots: [toeicFixture] });
    const beforeToeicWrongRoute = await Attempt.findById(toeicWrongRouteAttempt._id).lean();
    const wrongStandardRoute = await request(`/api/v1/attempts/${toeicWrongRouteAttempt._id}/submit`, {
      method: 'POST', token: studentToken, body: { answers: { 'toeic-q1': ['A'] }, revision: 1 },
    });
    assert.equal(wrongStandardRoute.response.status, 409);
    assert.equal(wrongStandardRoute.json.code, 'ATTEMPT_ENGINE_MISMATCH');
    const afterToeicWrongRoute = await Attempt.findById(toeicWrongRouteAttempt._id).lean();
    assert.equal(afterToeicWrongRoute.status, beforeToeicWrongRoute.status);
    assert.deepEqual(afterToeicWrongRoute.answers, beforeToeicWrongRoute.answers);
    await request(`/api/v1/toeic/attempts/${toeicWrongRouteAttempt._id}/submit`, {
      method: 'POST', token: studentToken, body: { answers: { 'toeic-q1': ['A'] }, revision: 1 },
    });

    const autosaveAssessment = await Assessment.create({
      title: 'Phase 2 CAS assessment', type: 'exam', examFormat: 'standard', status: 'published',
      durationMinutes: 60, questions: [{ question: standardQuestion._id, score: 2 }],
    });
    const autosaveAttempt = await makeAttempt({ assessment: autosaveAssessment._id, revision: 4 });
    const saves = await Promise.all([
      request(`/api/v1/attempts/${autosaveAttempt._id}/answers`, { method: 'PATCH', token: studentToken, body: { answers: { 'std-q1': 'A' }, revision: 4 } }),
      request(`/api/v1/attempts/${autosaveAttempt._id}/answers`, { method: 'PATCH', token: studentToken, body: { answers: { 'std-q1': 'B' }, revision: 4 } }),
    ]);
    assert.deepEqual(saves.map((item) => item.response.status).sort(), [200, 409]);
    const afterConcurrentSave = await Attempt.findById(autosaveAttempt._id).lean();
    assert.equal(afterConcurrentSave.revision, 5);
    assert.ok(['A', 'B'].includes(afterConcurrentSave.answers['std-q1']));
    const missingRevision = await request(`/api/v1/attempts/${autosaveAttempt._id}/answers`, {
      method: 'PATCH', token: studentToken, body: { answers: { 'std-q1': 'A' } },
    });
    assert.equal(missingRevision.response.status, 428);
    assert.equal(missingRevision.json.code, 'REVISION_REQUIRED');
    assert.equal((await Attempt.findById(autosaveAttempt._id).lean()).revision, 5);

    const concurrentFinalization = await makeAttempt({
      startedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      deadlineAt: new Date(Date.now() - 60 * 1000),
      answers: { 'std-q1': 'A' },
    });
    const concurrentSubmits = await Promise.all(Array.from({ length: 5 }, () => request(`/api/v1/attempts/${concurrentFinalization._id}/submit`, {
      method: 'POST', token: studentToken, body: { answers: { 'std-q1': 'B' }, revision: 1 },
    })));
    assert.ok(concurrentSubmits.every((item) => item.response.status === 200));
    const concurrentFinal = await Attempt.findById(concurrentFinalization._id).lean();
    assert.equal(concurrentFinal.status, 'submitted');
    assert.equal(concurrentFinal.score, 2);
    assert.deepEqual(concurrentFinal.answers, { 'std-q1': 'A' });

    const legacyId = new mongoose.Types.ObjectId();
    await Attempt.collection.insertOne({
      _id: legacyId,
      student: student._id,
      assessment: standardLifeAssessment._id,
      assessmentType: 'exam',
      startedAt: new Date(Date.now() - 5 * 60 * 1000),
      deadlineAt: new Date(Date.now() + 55 * 60 * 1000),
      status: 'in_progress',
      questionSnapshots: [standardFixture],
      answers: {},
      score: 0,
      maxScore: 0,
      correctCount: 0,
      incorrectCount: 0,
      unansweredCount: 0,
      duration: 0,
      isExpired: false,
    });
    const legacySubmit = await request(`/api/v1/attempts/${legacyId}/submit`, {
      method: 'POST', token: studentToken, body: { answers: { 'std-q1': 'A' }, revision: 1 },
    });
    assert.equal(legacySubmit.response.status, 200);
    const legacyAfter = await Attempt.collection.findOne({ _id: legacyId });
    assert.equal(legacyAfter.status, 'submitted');
    assert.equal(legacyAfter.engine, 'standard');
    assert.equal(legacyAfter.score, 2);

    const limitedStandard = await Assessment.create({
      title: 'Phase 2 limited Standard', type: 'exam', examFormat: 'standard', status: 'published', attemptLimit: 1,
      durationMinutes: 60, questions: [{ question: standardQuestion._id, score: 2 }],
    });
    const limitedToeic = await Assessment.create({
      title: 'Phase 2 limited TOEIC', type: 'exam', examFormat: 'toeic', status: 'published', attemptLimit: 1,
      durationMinutes: 60, questions: [{ question: toeicQuestion._id, score: 2 }],
    });
    await Attempt.create([
      { student: student._id, assessment: limitedStandard._id, engine: 'standard', status: 'submitted', startedAt: new Date(Date.now() - 60000), deadlineAt: new Date(Date.now() - 30000), submittedAt: new Date(Date.now() - 30000), score: 0, maxScore: 2 },
      { student: student._id, assessment: limitedToeic._id, engine: 'toeic', status: 'completed', startedAt: new Date(Date.now() - 60000), deadlineAt: new Date(Date.now() - 30000), submittedAt: new Date(Date.now() - 30000), score: 0, maxScore: 2 },
    ]);
    for (const [route, assessmentId] of [
      ['/api/v1/assessments', limitedStandard._id],
      ['/api/v1/toeic/tests', limitedToeic._id],
    ]) {
      const deniedStart = await request(`${route}/${assessmentId}/start`, { method: 'POST', token: studentToken, body: {} });
      assert.equal(deniedStart.response.status, 403);
      assert.equal(deniedStart.json.code, 'ATTEMPT_LIMIT_REACHED');
    }
    const unlimitedStandard = await Assessment.create({
      title: 'Phase 2 unlimited Standard', type: 'exam', examFormat: 'standard', status: 'published', attemptLimit: 0,
      durationMinutes: 60, questions: [{ question: standardQuestion._id, score: 2 }],
    });
    const unlimitedToeic = await Assessment.create({
      title: 'Phase 2 unlimited TOEIC', type: 'exam', examFormat: 'toeic', status: 'published', attemptLimit: 0,
      durationMinutes: 60, questions: [{ question: toeicQuestion._id, score: 2 }],
    });
    await Attempt.create([
      { student: student._id, assessment: unlimitedStandard._id, engine: 'standard', status: 'submitted', startedAt: new Date(Date.now() - 60000), deadlineAt: new Date(Date.now() - 30000), submittedAt: new Date(Date.now() - 30000), score: 0, maxScore: 2 },
      { student: student._id, assessment: unlimitedToeic._id, engine: 'toeic', status: 'completed', startedAt: new Date(Date.now() - 60000), deadlineAt: new Date(Date.now() - 30000), submittedAt: new Date(Date.now() - 30000), score: 0, maxScore: 2 },
    ]);
    const unlimitedStandardStart = await request(`/api/v1/assessments/${unlimitedStandard._id}/start`, { method: 'POST', token: studentToken, body: {} });
    const unlimitedToeicStart = await request(`/api/v1/toeic/tests/${unlimitedToeic._id}/start`, { method: 'POST', token: studentToken, body: {} });
    assert.equal(unlimitedStandardStart.response.status, 201);
    assert.equal(unlimitedToeicStart.response.status, 201);

    const beforeHistoryRead = await Attempt.findById(standardManual._id).lean();
    const history = await request('/api/v1/attempts/history', { token: studentToken });
    assert.equal(history.response.status, 200);
    const afterHistoryRead = await Attempt.findById(standardManual._id).lean();
    assert.equal(afterHistoryRead.score, beforeHistoryRead.score);
    assert.equal(afterHistoryRead.submittedAt.getTime(), beforeHistoryRead.submittedAt.getTime());
    assert.equal(afterHistoryRead.updatedAt.getTime(), beforeHistoryRead.updatedAt.getTime());
  });

  await t.test('admin and teacher can create active students; account is safe and immediately login-ready', async () => {
    const created = await request('/api/v1/admin/students', {
      method: 'POST', token: adminToken,
      body: {
        fullName: createdName,
        email: createdEmail.toUpperCase(),
        username: createdUsername.toUpperCase(),
        password: 'initial-password',
        role: 'admin', status: 'suspended', isActive: false,
        approvedBy: new mongoose.Types.ObjectId().toString(),
      },
    });
    assert.equal(created.response.status, 201);
    createdStudent = created.json.data.student;
    assert.equal(createdStudent.role, 'student');
    assert.equal(createdStudent.status, 'active');
    assert.equal(createdStudent.isActive, true);
    assert.equal(createdStudent.email, createdEmail.toLowerCase());
    assert.equal(createdStudent.username, createdUsername.toLowerCase());
    assert.equal(Object.hasOwn(createdStudent, 'password'), false);
    assert.equal(JSON.stringify(created.json).includes('initial-password'), false);
    const stored = await User.findById(createdStudent._id).select('+password');
    assert.notEqual(stored.password, 'initial-password');
    assert.equal(await stored.comparePassword('initial-password'), true);

    const loginByEmail = await request('/api/v1/auth/login', { method: 'POST', body: { email: createdEmail, password: 'initial-password' } });
    assert.equal(loginByEmail.response.status, 200);
    assert.equal(loginByEmail.json.data.user.status, 'active');
    const loginByUsername = await request('/api/v1/auth/login', { method: 'POST', body: { email: createdUsername, password: 'initial-password' } });
    assert.equal(loginByUsername.response.status, 200);
    assert.equal(loginByUsername.json.data.user.role, 'student');

    const teacherCreated = await request('/api/v1/admin/students', {
      method: 'POST', token: teacherToken,
      body: { fullName: 'Học viên do giáo viên tạo', email: 'teacher-created@example.test', username: 'teachercreated', password: 'teacher-init' },
    });
    assert.equal(teacherCreated.response.status, 201);
    assert.equal(teacherCreated.json.data.student.role, 'student');
  });

  await t.test('validation, RBAC, duplicate races, and mass assignment are guarded', async () => {
    const userIndexes = await User.collection.indexes();
    const usernameIndex = userIndexes.find((index) => index.key?.username === 1);
    assert.equal(usernameIndex?.unique, true);
    assert.equal(usernameIndex?.sparse, true);
    const invalidRequests = [
      [{ fullName: ' ', email: 'valid@example.test', username: 'validname', password: '123456' }, 'fullName'],
      [{ fullName: 'Valid', email: 'invalid', username: 'validname', password: '123456' }, 'email'],
      [{ fullName: 'Valid', email: 'valid2@example.test', username: 'x', password: '123456' }, 'username'],
      [{ fullName: 'Valid', email: 'valid3@example.test', username: 'validname3', password: '123' }, 'password'],
    ];
    for (const [body, field] of invalidRequests) {
      const result = await request('/api/v1/admin/students', { method: 'POST', token: adminToken, body });
      assert.equal(result.response.status, 400);
      assert.ok(result.json.errors[field]);
    }
    const denied = await request('/api/v1/admin/students', {
      method: 'POST', token: studentToken,
      body: { fullName: 'Nope', email: 'nope@example.test', username: 'nopeuser', password: '123456' },
    });
    assert.equal(denied.response.status, 403);
    const idorDenied = await request(`/api/v1/admin/students/${student._id}`, { token: studentToken });
    assert.equal(idorDenied.response.status, 403);
    const unauthenticated = await request('/api/v1/admin/students', {
      method: 'POST', body: { fullName: 'Nope', email: 'nope2@example.test', username: 'nopeuser2', password: '123456' },
    });
    assert.equal(unauthenticated.response.status, 401);
    const suspendedStudent = await User.create({
      email: 'phase3-suspended@example.test', password: 'suspended-password', fullName: 'Học viên bị khóa',
      role: 'student', status: 'suspended', isActive: false,
    });
    const suspendedToken = jwt.sign({ userId: suspendedStudent._id }, process.env.JWT_SECRET, { expiresIn: '10m' });
    const suspendedDenied = await request(`/api/v1/admin/students/${student._id}`, { token: suspendedToken });
    assert.equal(suspendedDenied.response.status, 403);
    assert.equal(suspendedDenied.json.code, 'ACCOUNT_SUSPENDED');

    const statusRaceStudent = await User.create({
      email: 'phase3-status-race@example.test', password: 'status-race-password', fullName: 'Học viên đổi trạng thái',
      role: 'student', status: 'active', isActive: true,
    });
    const statusRaceToken = jwt.sign({ userId: statusRaceStudent._id }, process.env.JWT_SECRET, { expiresIn: '10m' });
    const [statusUpdate, detailDuringStatusChange] = await Promise.all([
      User.findByIdAndUpdate(statusRaceStudent._id, { status: 'suspended', isActive: false }, { new: true }),
      request(`/api/v1/admin/students/${statusRaceStudent._id}`, { token: statusRaceToken }),
    ]);
    assert.equal(statusUpdate.status, 'suspended');
    assert.ok([200, 403].includes(detailDuringStatusChange.response.status), 'the overlapping detail request may linearize before or after suspension');
    const detailAfterStatusChange = await request(`/api/v1/admin/students/${statusRaceStudent._id}`, { token: statusRaceToken });
    assert.equal(detailAfterStatusChange.response.status, 403);
    assert.equal(detailAfterStatusChange.json.code, 'ACCOUNT_SUSPENDED');

    const raceEmail = `race-${randomUUID().slice(0, 8)}@example.test`;
    const raceUsername = `race_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
    const raceBody = { fullName: 'Đua tạo tài khoản', email: raceEmail, username: raceUsername, password: '123456' };
    const race = await Promise.all([
      request('/api/v1/admin/students', { method: 'POST', token: adminToken, body: raceBody }),
      request('/api/v1/admin/students', { method: 'POST', token: adminToken, body: raceBody }),
    ]);
    assert.deepEqual(race.map((item) => item.response.status).sort(), [201, 409]);
    assert.equal(race.find((item) => item.response.status === 409).json.code, 'STUDENT_ALREADY_EXISTS');
    const emailDuplicate = await request('/api/v1/admin/students', { method: 'POST', token: adminToken, body: { ...raceBody, username: `${raceUsername}x` } });
    const usernameDuplicate = await request('/api/v1/admin/students', { method: 'POST', token: adminToken, body: { ...raceBody, email: `another-${raceEmail}` } });
    assert.equal(emailDuplicate.response.status, 409);
    assert.equal(usernameDuplicate.response.status, 409);
    assert.equal(usernameDuplicate.json.field, 'username');
  });

  await t.test('Vietnamese accent-insensitive student search is literal, paginated, and composes with filters', async () => {
    for (const term of ['Nguyễn Văn', 'nguyen van', '  NGUYEN   VAN  ']) {
      const result = await request(`/api/v1/admin/students?status=active&search=${encodeURIComponent(term)}&page=1&limit=10`, { token: adminToken });
      assert.equal(result.response.status, 200);
      assert.ok(result.json.data.students.some((item) => String(item._id) === String(student._id)));
    }
    const injection = await request(`/api/v1/admin/students?search=${encodeURIComponent('.*')}`, { token: adminToken });
    assert.equal(injection.response.status, 200);
    assert.equal(injection.json.data.pagination.total, 0);
    const invalidLimit = await request('/api/v1/admin/students?limit=101', { token: adminToken });
    assert.equal(invalidLimit.response.status, 400);
  });

  await t.test('student progress is enrollment-scoped and excludes hidden or unpublished lessons', async () => {
    const courseIndexes = await Course.collection.indexes();
    const lessonIndexes = await Lesson.collection.indexes();
    assert.ok(courseIndexes.some((index) => index.name === 'course_students_lookup'));
    assert.ok(lessonIndexes.some((index) => index.name === 'lesson_course_status_order'));
    const courseOne = await Course.create({
      title: 'Khóa học đã đăng ký', description: 'Phase 3 fixture', teacher: teacher._id,
      level: 'Beginner', englishType: 'TOEIC', isPublished: true, students: [student._id],
    });
    const courseTwo = await Course.create({
      title: 'Khóa học legacy', description: 'Legacy course.students fixture', teacher: teacher._id,
      level: 'Intermediate', englishType: 'TOEIC', isPublished: true, students: [student._id],
    });
    await Enrollment.create({ student: student._id, course: courseOne._id });
    const [lessonOne, lessonTwo, lessonDraft, lessonHidden, legacyLesson] = await Promise.all([
      Lesson.create({ title: 'Bài đã xong', course: courseOne._id, status: 'published', order: 1 }),
      Lesson.create({ title: 'Bài đang học', course: courseOne._id, status: 'published', order: 2 }),
      Lesson.create({ title: 'Bài nháp', course: courseOne._id, status: 'draft', order: 3 }),
      Lesson.create({ title: 'Bài ẩn', course: courseOne._id, status: 'hidden', order: 4 }),
      Lesson.create({ title: 'Bài legacy', course: courseTwo._id, status: 'published', order: 1 }),
    ]);
    await LearningProgress.create([
      { student: student._id, course: courseOne._id, lesson: lessonOne._id, status: 'completed', progress: 100, completedAt: new Date('2026-10-19T09:00:00Z'), lastAccessedAt: new Date('2026-10-19T09:00:00Z') },
      { student: student._id, course: courseOne._id, lesson: lessonTwo._id, status: 'in_progress', progress: 0, lastAccessedAt: new Date('2026-10-20T09:00:00Z') },
      { student: student._id, course: courseOne._id, lesson: lessonHidden._id, status: 'completed', progress: 100, lastAccessedAt: new Date('2026-10-20T10:00:00Z') },
      { student: student._id, course: courseTwo._id, lesson: legacyLesson._id, status: 'completed', progress: 100, lastAccessedAt: new Date('2026-10-18T09:00:00Z') },
    ]);
    const result = await request(`/api/v1/admin/students/${student._id}/progress?page=1&limit=2`, { token: adminToken });
    assert.equal(result.response.status, 200);
    assert.equal(result.json.data.totalCourses, 2);
    assert.equal(result.json.data.totalLessons, 3);
    assert.equal(result.json.data.completedLessons, 2);
    assert.equal(result.json.data.inProgressLessons, 1);
    assert.equal(result.json.data.notStartedLessons, 0);
    assert.equal(result.json.data.completionPercentage, 67);
    assert.equal(result.json.data.lessons.length, 2);
    assert.ok(result.json.data.lessons.every((lesson) => !['Bài nháp', 'Bài ẩn'].includes(lesson.title)));
    const scoped = await request(`/api/v1/admin/students/${student._id}/progress?courseId=${courseOne._id}`, { token: adminToken });
    assert.equal(scoped.json.data.totalLessons, 2);
    assert.equal(scoped.json.data.completedLessons, 1);
  });

  await t.test('report handles Standard, TOEIC, zero scores, legacy records, expired attempts, stable ranking, and pagination', async () => {
    const at = (value) => new Date(value);
    await Attempt.create([
      { student: student._id, assessment: standardAssessment._id, engine: 'standard', assessmentType: 'exam', status: 'submitted', score: 80, maxScore: 100, submittedAt: at('2026-10-20T08:10:00Z'), startedAt: at('2026-10-20T08:00:00Z'), deadlineAt: at('2026-10-20T09:00:00Z'), duration: 600, answers: { private: 'A' }, questionSnapshots: [{ questionId: 'private', type: 'single_choice', questionText: 'private', correctAnswers: ['A'] }] },
      { student: student._id, assessment: standardAssessment._id, engine: 'standard', assessmentType: 'exam', status: 'submitted', score: 80, maxScore: 100, submittedAt: at('2026-10-20T08:10:00Z'), startedAt: at('2026-10-20T07:55:00Z'), deadlineAt: at('2026-10-20T08:55:00Z'), duration: 600 },
      { student: student._id, assessment: standardAssessment._id, engine: 'standard', assessmentType: 'exam', status: 'submitted', score: 80, maxScore: 100, submittedAt: at('2026-10-20T08:15:00Z'), startedAt: at('2026-10-20T08:05:00Z'), deadlineAt: at('2026-10-20T09:05:00Z'), duration: 600 },
      { student: otherStudent._id, assessment: standardAssessment._id, engine: 'standard', assessmentType: 'exam', status: 'submitted', score: 0, maxScore: 100, submittedAt: at('2026-10-20T08:20:00Z'), startedAt: at('2026-10-20T08:10:00Z'), deadlineAt: at('2026-10-20T09:10:00Z'), duration: 600 },
      { student: student._id, assessment: standardAssessment._id, engine: 'standard', assessmentType: 'exam', status: 'in_progress', startedAt: new Date(Date.now() - 5 * 60 * 1000), deadlineAt: new Date(Date.now() + 60 * 60 * 1000), answers: { private: 'B' } },
      { student: otherStudent._id, assessment: standardAssessment._id, engine: 'standard', assessmentType: 'exam', status: 'in_progress', startedAt: new Date(Date.now() - 2 * 60 * 60 * 1000), deadlineAt: new Date(Date.now() - 60 * 60 * 1000), answers: { private: 'C' } },
      { student: student._id, assessment: standardAssessment._id, assessmentType: 'exam', status: 'submitted', score: 0, maxScore: 0, startedAt: at('2026-10-19T07:00:00Z'), deadlineAt: at('2026-10-19T08:00:00Z') },
      { student: thirdStudent._id, assessment: standardAssessment._id, engine: 'toeic', assessmentType: 'exam', status: 'completed', score: 10, maxScore: 10, submittedAt: at('2026-10-19T08:00:00Z'), startedAt: at('2026-10-19T07:00:00Z'), deadlineAt: at('2026-10-19T09:00:00Z') },
      { student: student._id, assessment: toeicAssessment._id, engine: 'toeic', assessmentType: 'exercise', status: 'completed', score: 0, maxScore: 200, submittedAt: at('2026-10-20T09:30:00Z'), startedAt: at('2026-10-20T08:00:00Z'), deadlineAt: at('2026-10-20T10:00:00Z'), duration: 3600, toeicBreakdown: { estimatedToeicScore: 240 } },
    ]);

    const noAssessment = await request('/api/v1/admin/results', { token: adminToken });
    assert.equal(noAssessment.response.status, 400);
    assert.equal(noAssessment.json.code, 'ASSESSMENT_REQUIRED');
    const unsafeSort = await request(`/api/v1/admin/results?assessmentId=${standardAssessment._id}&sort=score%3A-1`, { token: adminToken });
    assert.equal(unsafeSort.response.status, 400);
    const oversizedPage = await request(`/api/v1/admin/results?assessmentId=${standardAssessment._id}&limit=101`, { token: adminToken });
    assert.equal(oversizedPage.response.status, 400);
    const attemptIndexes = await Attempt.collection.indexes();
    assert.ok(attemptIndexes.some((index) => index.name === 'assessment_startedAt_report'));

    const report = await request(`/api/v1/admin/results?assessmentId=${standardAssessment._id}&page=1&limit=2`, { token: adminToken });
    assert.equal(report.response.status, 200);
    assert.equal(report.json.data.summary.attemptCount, 8);
    assert.equal(report.json.data.summary.scoredAttemptCount, 4);
    assert.equal(report.json.data.summary.distinctStudents, 3);
    assert.equal(report.json.data.summary.scoredDistinctStudents, 2);
    assert.equal(report.json.data.summary.highestScore, 80);
    assert.equal(report.json.data.summary.lowestScore, 0);
    assert.equal(report.json.data.summary.averageScore, 60);
    assert.equal(report.json.data.summary.inProgressCount, 1);
    assert.equal(report.json.data.summary.expiredPendingCount, 1);
    assert.equal(report.json.data.summary.unverifiedCount, 2);
    assert.equal(report.json.data.pagination.total, 4);
    assert.equal(report.json.data.pagination.pages, 2);
    assert.deepEqual(report.json.data.results.map((item) => item.score), [80, 80]);
    assert.ok(new Date(report.json.data.results[0].submittedAt) <= new Date(report.json.data.results[1].submittedAt));
    assert.ok(String(report.json.data.results[0]._id) < String(report.json.data.results[1]._id), 'equal score and completion time must use the attempt ID tie-break');
    assert.equal(JSON.stringify(report.json.data.results).includes('questionSnapshots'), false);
    assert.equal(JSON.stringify(report.json.data.results).includes('answers'), false);

    const legacyReportAlias = await request(`/api/v1/attempts/admin/results?assessment=${standardAssessment._id}&student=${student._id}&limit=1`, { token: teacherToken });
    assert.equal(legacyReportAlias.response.status, 200);
    assert.equal(legacyReportAlias.json.data.results.length, 1);
    assert.equal(legacyReportAlias.json.data.pagination.total, 3);

    const secondPage = await request(`/api/v1/admin/results?assessmentId=${standardAssessment._id}&page=2&limit=2`, { token: adminToken });
    assert.equal(secondPage.json.data.results.length, 2);
    assert.deepEqual(secondPage.json.data.results.map((item) => item.score), [80, 0]);
    assert.equal(secondPage.json.data.results[1].isScored, true);
    const filtered = await request(`/api/v1/admin/results?assessmentId=${standardAssessment._id}&studentId=${student._id}&type=exam&engine=standard&from=2026-10-20&to=2026-10-20`, { token: adminToken });
    assert.equal(filtered.response.status, 200);
    assert.equal(filtered.json.data.pagination.total, 3);
    assert.equal(filtered.json.data.summary.scoredAttemptCount, 3);
    const toeicReport = await request(`/api/v1/admin/results?assessmentId=${toeicAssessment._id}`, { token: adminToken });
    assert.equal(toeicReport.json.data.summary.scoredAttemptCount, 1);
    assert.equal(toeicReport.json.data.results[0].score, 0);
    assert.equal(toeicReport.json.data.results[0].toeicEstimatedScore, 240);
    const futureAttempt = await Attempt.findOne({ assessment: standardAssessment._id, status: 'in_progress', deadlineAt: { $gt: new Date() } });
    const expiredAttempt = await Attempt.findOne({ assessment: standardAssessment._id, status: 'in_progress', deadlineAt: { $lte: new Date() } });
    assert.ok(futureAttempt);
    assert.ok(expiredAttempt);
    assert.equal(futureAttempt.status, 'in_progress');
    assert.equal(expiredAttempt.status, 'in_progress', 'report GET must not finalize expired attempts');

    const studentHistory = await request(`/api/v1/admin/students/${student._id}/attempts?page=1&limit=20&state=ALL`, { token: adminToken });
    assert.equal(studentHistory.response.status, 200);
    assert.equal(studentHistory.json.data.summary.distinctStudents, 1);
    assert.ok(studentHistory.json.data.results.some((item) => item.logicalStatus === 'EXPIRED_PENDING_FINALIZATION') === false);
    assert.ok(studentHistory.json.data.results.some((item) => item.logicalStatus === 'COMPLETED_SCORED' && item.engine === 'toeic'));
    assert.equal(JSON.stringify(studentHistory.json.data.results).includes('questionSnapshots'), false);
    assert.equal(JSON.stringify(studentHistory.json.data.results).includes('answers'), false);

    const denied = await request(`/api/v1/admin/results?assessmentId=${standardAssessment._id}`, { token: studentToken });
    assert.equal(denied.response.status, 403);
    const teacherReport = await request(`/api/v1/admin/results?assessmentId=${standardAssessment._id}&limit=1`, { token: teacherToken });
    assert.equal(teacherReport.response.status, 200);
    assert.equal(teacherReport.json.data.results.length, 1);
  });

  await t.test('report reads stay read-only and coherent during submit/expiry races and pagination inserts', async () => {
    const otherStudentToken = jwt.sign({ userId: otherStudent._id }, process.env.JWT_SECRET, { expiresIn: '10m' });
    const thirdStudentToken = jwt.sign({ userId: thirdStudent._id }, process.env.JWT_SECRET, { expiresIn: '10m' });
    const raceQuestion = await Question.create({
      questionText: 'Concurrent reporting question', type: 'single_choice',
      options: [{ id: 'A', text: 'Correct' }, { id: 'B', text: 'Wrong' }],
      correctAnswers: ['A'], score: 2, status: 'published',
    });
    const raceAssessment = await Assessment.create({
      title: 'Concurrent report lifecycle', type: 'exam', examFormat: 'standard', status: 'published',
      durationMinutes: 60, questions: [{ question: raceQuestion._id, score: 2 }],
    });
    const reportPath = `/api/v1/admin/results?assessmentId=${raceAssessment._id}&state=ALL&limit=100`;
    const fixture = {
      questionId: 'concurrent-q1', type: 'single_choice', questionText: 'Concurrent reporting question',
      options: [{ id: 'A', text: 'Correct' }, { id: 'B', text: 'Wrong' }], correctAnswers: ['A'], score: 2,
    };
    const activeAttempt = await Attempt.create({
      student: otherStudent._id, assessment: raceAssessment._id, assessmentType: 'exam', engine: 'standard',
      startedAt: new Date(Date.now() - 5 * 60 * 1000), deadlineAt: new Date(Date.now() + 55 * 60 * 1000),
      status: 'in_progress', revision: 1, questionSnapshots: [fixture], answers: { 'concurrent-q1': 'A' },
    });
    const [activeReport, activeSubmit] = await Promise.all([
      request(reportPath, { token: adminToken }),
      request(`/api/v1/attempts/${activeAttempt._id}/submit`, {
        method: 'POST', token: otherStudentToken, body: { answers: { 'concurrent-q1': 'A' }, revision: 1 },
      }),
    ]);
    assert.equal(activeReport.response.status, 200);
    assert.equal(activeSubmit.response.status, 200);
    const activeRaceRow = activeReport.json.data.results.find((item) => String(item._id) === String(activeAttempt._id));
    assert.ok(activeRaceRow);
    assert.ok(['IN_PROGRESS', 'COMPLETED_SCORED'].includes(activeRaceRow.logicalStatus));
    const activeSummary = activeReport.json.data.summary;
    assert.equal(activeSummary.attemptCount, activeSummary.scoredAttemptCount + activeSummary.inProgressCount + activeSummary.expiredPendingCount + activeSummary.unverifiedCount);
    const completedActiveReport = await request(reportPath, { token: adminToken });
    const completedActiveRow = completedActiveReport.json.data.results.find((item) => String(item._id) === String(activeAttempt._id));
    assert.equal(completedActiveRow.logicalStatus, 'COMPLETED_SCORED');
    assert.equal(completedActiveRow.score, 2, 'reporting must show persisted answers rather than late submit answers');

    const expiredAttempt = await Attempt.create({
      student: thirdStudent._id, assessment: raceAssessment._id, assessmentType: 'exam', engine: 'standard',
      startedAt: new Date(Date.now() - 2 * 60 * 60 * 1000), deadlineAt: new Date(Date.now() - 60 * 1000),
      status: 'in_progress', revision: 1, questionSnapshots: [fixture], answers: { 'concurrent-q1': 'A' },
    });
    const [expiredReport, timeoutRecovery] = await Promise.all([
      request(reportPath, { token: adminToken }),
      request(`/api/v1/attempts/${expiredAttempt._id}/submit`, {
        method: 'POST', token: thirdStudentToken, body: { answers: { 'concurrent-q1': 'B' }, revision: 1 },
      }),
    ]);
    assert.equal(expiredReport.response.status, 200);
    assert.equal(timeoutRecovery.response.status, 200);
    const expiredRaceRow = expiredReport.json.data.results.find((item) => String(item._id) === String(expiredAttempt._id));
    assert.ok(expiredRaceRow);
    assert.ok(['EXPIRED_PENDING_FINALIZATION', 'COMPLETED_SCORED'].includes(expiredRaceRow.logicalStatus));
    const expiredSummary = expiredReport.json.data.summary;
    assert.equal(expiredSummary.attemptCount, expiredSummary.scoredAttemptCount + expiredSummary.inProgressCount + expiredSummary.expiredPendingCount + expiredSummary.unverifiedCount);
    const afterTimeoutReport = await request(reportPath, { token: adminToken });
    const finalizedExpiredRow = afterTimeoutReport.json.data.results.find((item) => String(item._id) === String(expiredAttempt._id));
    assert.equal(finalizedExpiredRow.logicalStatus, 'COMPLETED_SCORED');
    assert.equal(finalizedExpiredRow.score, 2);

    const concurrentReads = await Promise.all(Array.from({ length: 4 }, () => request(reportPath, { token: adminToken })));
    assert.ok(concurrentReads.every((item) => item.response.status === 200));
    assert.ok(concurrentReads.every((item) => item.json.data.summary.attemptCount === 2));

    const paginationAssessment = await Assessment.create({
      title: 'Pagination insert report', type: 'exam', examFormat: 'standard', status: 'published',
    });
    const insertedAt = (minute) => new Date(Date.UTC(2026, 9, 20, 8, minute));
    const seedRows = await Attempt.create([
      { student: student._id, assessment: paginationAssessment._id, engine: 'standard', status: 'submitted', score: 80, maxScore: 100, startedAt: insertedAt(1), deadlineAt: insertedAt(61), submittedAt: insertedAt(2) },
      { student: otherStudent._id, assessment: paginationAssessment._id, engine: 'standard', status: 'submitted', score: 70, maxScore: 100, startedAt: insertedAt(3), deadlineAt: insertedAt(61), submittedAt: insertedAt(4) },
      { student: thirdStudent._id, assessment: paginationAssessment._id, engine: 'standard', status: 'submitted', score: 60, maxScore: 100, startedAt: insertedAt(5), deadlineAt: insertedAt(61), submittedAt: insertedAt(6) },
    ]);
    const firstPageBeforeInsert = await request(`/api/v1/admin/results?assessmentId=${paginationAssessment._id}&page=1&limit=2`, { token: adminToken });
    assert.equal(firstPageBeforeInsert.json.data.pagination.total, 3);
    await Attempt.create({
      student: thirdStudent._id, assessment: paginationAssessment._id, engine: 'standard', status: 'submitted',
      score: 95, maxScore: 100, startedAt: insertedAt(7), deadlineAt: insertedAt(61), submittedAt: insertedAt(8),
    });
    const [firstPageAfterInsert, secondPageAfterInsert] = await Promise.all([
      request(`/api/v1/admin/results?assessmentId=${paginationAssessment._id}&page=1&limit=2`, { token: adminToken }),
      request(`/api/v1/admin/results?assessmentId=${paginationAssessment._id}&page=2&limit=2`, { token: adminToken }),
    ]);
    assert.equal(firstPageAfterInsert.json.data.pagination.total, 4);
    assert.equal(secondPageAfterInsert.json.data.pagination.total, 4);
    assert.deepEqual(firstPageAfterInsert.json.data.results.map((item) => item.score), [95, 80]);
    assert.deepEqual(secondPageAfterInsert.json.data.results.map((item) => item.score), [70, 60]);
    assert.equal(new Set([...firstPageAfterInsert.json.data.results, ...secondPageAfterInsert.json.data.results].map((item) => String(item._id))).size, 4);
    assert.equal(seedRows.length, 3);
  });
});

test('isolated MongoDB fixture server and test connection are closed', async () => {
  if (httpServer?.listening) await new Promise((resolve) => httpServer.close(resolve));
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  if (mongoServer) await mongoServer.stop();
  assert.equal(mongoose.connection.readyState, 0);
  assert.equal(httpServer?.listening || false, false);
});
