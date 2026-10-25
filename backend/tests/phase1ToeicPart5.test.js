import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import express from 'express';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { MongoMemoryServer } from 'mongodb-memory-server';
import questionRoutes from '../src/routes/questionRoutes.js';
import assessmentRoutes from '../src/routes/assessmentRoutes.js';
import { errorHandler } from '../src/middlewares/errorHandler.js';
import User from '../src/models/User.js';
import Question from '../src/models/Question.js';
import Assessment from '../src/models/Assessment.js';
import Attempt from '../src/models/Attempt.js';

const unique = randomUUID().replaceAll('-', '');
const databaseName = `phase1_toeic_part5_${unique}`;
const originalJwtSecret = process.env.JWT_SECRET;
let mongoServer;
let setupError;
let httpServer;
let baseUrl;
let teacher;
let admin;
let student;
let teacherToken;
let adminToken;
let studentToken;

const part5Options = () => [
  { id: 'A', text: 'Option A' },
  { id: 'B', text: 'Option B' },
  { id: 'C', text: 'Option C' },
  { id: 'D', text: 'Option D' },
];

const part5Payload = (questionText = 'The manager _____ the report every Monday.') => ({
  questionText,
  type: 'single_choice',
  toeicPart: 5,
  options: part5Options(),
  correctAnswers: ['C'],
  explanation: 'Use the present tense for this habitual action.',
});

try {
  assert.equal(mongoose.connection.readyState, 0, 'tests must use an isolated MongoDB connection');
  mongoServer = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1', dbName: databaseName } });
  const isolatedUri = mongoServer.getUri(databaseName);
  assert.equal(new URL(isolatedUri).hostname, '127.0.0.1', 'test MongoDB must bind to loopback only');
  assert.equal(new URL(isolatedUri).pathname.replaceAll('/', ''), databaseName, 'test must use its unique disposable database');
  await mongoose.connect(isolatedUri, { serverSelectionTimeoutMS: 5000, autoIndex: true });
  await Promise.all([User.init(), Question.init(), Assessment.init(), Attempt.init()]);

  process.env.JWT_SECRET = `phase1-part5-${unique}`;
  teacher = await User.create({ email: `part5-teacher-${unique}@example.test`, password: 'teacher-password', role: 'teacher', status: 'active', isActive: true });
  admin = await User.create({ email: `part5-admin-${unique}@example.test`, password: 'admin-password', role: 'admin', status: 'active', isActive: true });
  student = await User.create({ email: `part5-student-${unique}@example.test`, password: 'student-password', role: 'student', status: 'active', isActive: true });
  teacherToken = jwt.sign({ userId: teacher._id }, process.env.JWT_SECRET, { expiresIn: '10m' });
  adminToken = jwt.sign({ userId: admin._id }, process.env.JWT_SECRET, { expiresIn: '10m' });
  studentToken = jwt.sign({ userId: student._id }, process.env.JWT_SECRET, { expiresIn: '10m' });

  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use('/api/v1/questions', questionRoutes);
  app.use('/api/v1/assessments', assessmentRoutes);
  app.use(errorHandler);
  httpServer = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    httpServer.once('listening', resolve);
    httpServer.once('error', reject);
  });
  baseUrl = `http://127.0.0.1:${httpServer.address().port}`;
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
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return { response, json: await response.json() };
};

test('Phase 1 Part 5 Question Bank API on an isolated MongoDB database', {
  skip: setupError ? `BLOCKED: disposable MongoDB could not start (${setupError.message})` : false,
}, async (t) => {
  await t.test('role gates and valid Part 5 create/update CRUD', async () => {
    const anonymous = await request('/api/v1/questions');
    assert.equal(anonymous.response.status, 401);
    const studentDenied = await request('/api/v1/questions', { token: studentToken });
    assert.equal(studentDenied.response.status, 403);

    const created = await request('/api/v1/questions', {
      method: 'POST', token: teacherToken, body: part5Payload(),
    });
    assert.equal(created.response.status, 201, created.json.message);
    const question = created.json.data.question;
    assert.equal(question.type, 'single_choice');
    assert.equal(question.toeicPart, 5);
    assert.equal(question.options.length, 4);
    assert.deepEqual(question.options.map((option) => option.id).sort(), ['A', 'B', 'C', 'D']);
    assert.deepEqual(question.correctAnswers, ['C']);
    assert.ok(question.explanation.trim());
    assert.equal(question.status, 'draft');
    assert.equal(question.createdBy, String(teacher._id));

    const updated = await request(`/api/v1/questions/${question._id}`, {
      method: 'PUT', token: adminToken, body: { questionText: 'Updated Part 5 stem.' },
    });
    assert.equal(updated.response.status, 200, updated.json.message);
    assert.equal(updated.json.data.question.questionText, 'Updated Part 5 stem.');
    assert.equal(updated.json.data.question.toeicPart, 5);

    const invalidPartialUpdate = await request(`/api/v1/questions/${question._id}`, {
      method: 'PATCH', token: teacherToken, body: { options: part5Options().slice(0, 3) },
    });
    assert.equal(invalidPartialUpdate.response.status, 400);
    const unchanged = await Question.findById(question._id).lean();
    assert.equal(unchanged.options.length, 4, 'invalid Part 5 updates must not write');

    const readBack = await request(`/api/v1/questions/${question._id}`, { token: teacherToken });
    assert.equal(readBack.response.status, 200);
    assert.equal(readBack.json.data.question.toeicPart, 5);

    const deleted = await request(`/api/v1/questions/${question._id}`, { method: 'DELETE', token: teacherToken });
    assert.equal(deleted.response.status, 200, deleted.json.message);
    assert.equal(await Question.findById(question._id), null);
  });

  await t.test('Part 5 validation rejects invalid structure and answer keys', async () => {
    const invalidPayloads = [
      ['three options', { options: part5Options().slice(0, 3) }],
      ['option IDs outside A-D', { options: [{ id: 'A', text: 'A' }, { id: 'B', text: 'B' }, { id: 'C', text: 'C' }, { id: 'X', text: 'D' }] }],
      ['duplicate option IDs', { options: [{ id: 'A', text: 'A' }, { id: 'A', text: 'B' }, { id: 'C', text: 'C' }, { id: 'D', text: 'D' }] }],
      ['blank option text', { options: [{ id: 'A', text: 'A' }, { id: 'B', text: ' ' }, { id: 'C', text: 'C' }, { id: 'D', text: 'D' }] }],
      ['missing answer', { correctAnswers: [] }],
      ['answer not in options', { correctAnswers: ['X'] }],
      ['multiple correct answers', { correctAnswers: ['A', 'B'] }],
      ['missing explanation', { explanation: '' }],
      ['wrong question type', { type: 'multiple_choice' }],
      ['blank question text', { questionText: '  ' }],
    ];

    for (const [label, override] of invalidPayloads) {
      const result = await request('/api/v1/questions', {
        method: 'POST', token: teacherToken, body: { ...part5Payload(`Invalid ${label}`), ...override },
      });
      assert.equal(result.response.status, 400, `${label}: ${result.json.message}`);
    }
  });

  await t.test('Part filter composes with search, status, and pagination', async () => {
    await Question.create([
      { ...part5Payload('Needle Part 5 alpha'), status: 'draft', createdBy: teacher._id },
      { ...part5Payload('Needle Part 5 beta'), status: 'draft', createdBy: teacher._id },
      { ...part5Payload('Needle Part 1'), toeicPart: 1, status: 'draft', createdBy: teacher._id },
      { ...part5Payload('Needle Part 5 published'), status: 'published', createdBy: teacher._id },
    ]);

    const firstPage = await request('/api/v1/questions?toeicPart=5&search=needle&status=draft&page=1&limit=1', { token: teacherToken });
    const secondPage = await request('/api/v1/questions?toeicPart=5&search=needle&status=draft&page=2&limit=1', { token: teacherToken });
    assert.equal(firstPage.response.status, 200);
    assert.equal(firstPage.json.data.pagination.total, 2);
    assert.equal(firstPage.json.data.pagination.page, 1);
    assert.equal(firstPage.json.data.questions.length, 1);
    assert.equal(secondPage.json.data.pagination.total, 2);
    assert.equal(secondPage.json.data.pagination.page, 2);
    assert.equal(secondPage.json.data.questions.length, 1);
    assert.notEqual(firstPage.json.data.questions[0]._id, secondPage.json.data.questions[0]._id);
    assert.ok(firstPage.json.data.questions.every((question) => question.toeicPart === 5));
    assert.ok(secondPage.json.data.questions.every((question) => question.toeicPart === 5));

    const invalidPart = await request('/api/v1/questions?toeicPart=8', { token: teacherToken });
    assert.equal(invalidPart.response.status, 400);
  });

  await t.test('missing or non-5 Part retains generic Question behavior', async () => {
    const genericBody = {
      questionText: 'Generic two-option question',
      type: 'single_choice',
      options: [{ id: 'yes', text: 'Yes' }, { id: 'no', text: 'No' }],
      correctAnswers: ['yes'],
    };
    const missingPart = await request('/api/v1/questions', { method: 'POST', token: teacherToken, body: genericBody });
    assert.equal(missingPart.response.status, 201, missingPart.json.message);
    assert.equal(missingPart.json.data.question.toeicPart, undefined);

    const part1 = await request('/api/v1/questions', {
      method: 'POST', token: teacherToken, body: { ...genericBody, questionText: 'Existing Part 1 style', toeicPart: 1 },
    });
    assert.equal(part1.response.status, 201, part1.json.message);
    assert.equal(part1.json.data.question.toeicPart, 1);

    const genericUpdate = await request(`/api/v1/questions/${part1.json.data.question._id}`, {
      method: 'PATCH', token: teacherToken, body: { topic: 'Listening' },
    });
    assert.equal(genericUpdate.response.status, 200, genericUpdate.json.message);
    assert.equal(genericUpdate.json.data.question.toeicPart, 1);
  });

  await t.test('bank create does not rewrite Assessment references and student attempt DTO hides answer keys', async () => {
    const linkedQuestion = await Question.create({
      ...part5Payload('Published Part 5 assessment item'),
      status: 'published',
      createdBy: teacher._id,
    });
    const assessment = await Assessment.create({
      title: 'Existing Part 5 Assessment',
      type: 'exam',
      examFormat: 'standard',
      status: 'published',
      durationMinutes: 30,
      questions: [{ question: linkedQuestion._id, score: 1 }],
    });
    const originalQuestionId = String(assessment.questions[0].question);

    const bankCreate = await request('/api/v1/questions', {
      method: 'POST', token: adminToken, body: part5Payload('New independent bank item'),
    });
    assert.equal(bankCreate.response.status, 201, bankCreate.json.message);
    const assessmentAfterCreate = await Assessment.findById(assessment._id).lean();
    assert.equal(assessmentAfterCreate.questions.length, 1);
    assert.equal(String(assessmentAfterCreate.questions[0].question), originalQuestionId);

    const start = await request(`/api/v1/assessments/${assessment._id}/start`, {
      method: 'POST', token: studentToken, body: {},
    });
    assert.equal(start.response.status, 201, start.json.message);
    assert.equal(start.json.data.questions.length, 1);
    assert.equal(Object.hasOwn(start.json.data.questions[0], 'correctAnswers'), false);
    assert.equal(Object.hasOwn(start.json.data.questions[0], 'explanation'), false);

    const persistedAttempt = await Attempt.findById(start.json.data.attemptId).lean();
    assert.deepEqual(persistedAttempt.questionSnapshots[0].correctAnswers, ['C']);
  });
});

test.after(async () => {
  if (httpServer?.listening) await new Promise((resolve) => httpServer.close(resolve));
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect().catch(() => {});
  if (mongoServer) await mongoServer.stop().catch(() => {});
  if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = originalJwtSecret;
});
