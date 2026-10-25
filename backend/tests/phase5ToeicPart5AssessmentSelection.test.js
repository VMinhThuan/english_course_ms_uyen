import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import express from 'express';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { adminToeicRoutes, studentToeicRoutes } from '../src/routes/toeicRoutes.js';
import assessmentRoutes from '../src/routes/assessmentRoutes.js';
import { errorHandler } from '../src/middlewares/errorHandler.js';
import User from '../src/models/User.js';
import Question from '../src/models/Question.js';
import QuestionGroup from '../src/models/QuestionGroup.js';
import Assessment from '../src/models/Assessment.js';
import Attempt from '../src/models/Attempt.js';
import QuestionBankSelectionBatch from '../src/models/QuestionBankSelectionBatch.js';

const unique = randomUUID().replaceAll('-', '');
const databaseName = `phase5_toeic_part5_selection_${unique}`;
const originalJwtSecret = process.env.JWT_SECRET;
let mongoServer;
let setupError;
let httpServer;
let baseUrl;
let admin;
let teacher;
let student;
let adminToken;
let teacherToken;
let studentToken;

const options = () => [
  { id: 'A', text: 'Option A' },
  { id: 'B', text: 'Option B' },
  { id: 'C', text: 'Option C' },
  { id: 'D', text: 'Option D' },
];

const bankQuestion = (overrides = {}) => ({
  questionText: 'The director _____ the proposal every Friday.',
  type: 'single_choice',
  explanation: 'Use the present tense for a regular action.',
  options: options(),
  correctAnswers: ['B'],
  score: 1,
  status: 'published',
  toeicPart: 5,
  ...overrides,
});

try {
  assert.equal(mongoose.connection.readyState, 0, 'tests require a separate disposable MongoDB database');
  mongoServer = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1', dbName: databaseName } });
  const isolatedUri = mongoServer.getUri(databaseName);
  assert.equal(new URL(isolatedUri).hostname, '127.0.0.1');
  assert.equal(new URL(isolatedUri).pathname.replaceAll('/', ''), databaseName);
  await mongoose.connect(isolatedUri, { serverSelectionTimeoutMS: 5000, autoIndex: true });
  await Promise.all([
    User.init(), Question.init(), QuestionGroup.init(), Assessment.init(), Attempt.init(), QuestionBankSelectionBatch.init(),
  ]);

  process.env.JWT_SECRET = `phase5-part5-selection-${unique}`;
  admin = await User.create({ email: `p5-admin-${unique}@example.test`, password: 'admin-password', role: 'admin', status: 'active', isActive: true });
  teacher = await User.create({ email: `p5-teacher-${unique}@example.test`, password: 'teacher-password', role: 'teacher', status: 'active', isActive: true });
  student = await User.create({ email: `p5-student-${unique}@example.test`, password: 'student-password', role: 'student', status: 'active', isActive: true });
  adminToken = jwt.sign({ userId: admin._id }, process.env.JWT_SECRET, { expiresIn: '10m' });
  teacherToken = jwt.sign({ userId: teacher._id }, process.env.JWT_SECRET, { expiresIn: '10m' });
  studentToken = jwt.sign({ userId: student._id }, process.env.JWT_SECRET, { expiresIn: '10m' });

  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use('/api/v1/admin', adminToeicRoutes);
  app.use('/api/v1/assessments', assessmentRoutes);
  app.use('/api/v1/toeic', studentToeicRoutes);
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

const request = async (path, { method = 'GET', token, body, idempotencyKey } = {}) => {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return { response, json: await response.json() };
};

const createAssessment = async ({ status = 'draft', withOtherPart = false } = {}) => {
  const part1 = await Question.create({
    questionText: 'Part 1 unaffected source', type: 'single_choice', options: [{ id: 'yes', text: 'Yes' }, { id: 'no', text: 'No' }],
    correctAnswers: ['yes'], status: 'published', toeicPart: 1, createdBy: admin._id,
  });
  const part1Group = await QuestionGroup.create({
    assessment: new mongoose.Types.ObjectId(), partNumber: 1, type: 'audio_image', title: 'Part 1 group', questionIds: [part1._id],
  });
  const groups = withOtherPart ? [part1Group._id] : [];
  const assessment = await Assessment.create({
    title: `Part 5 selection ${randomUUID()}`,
    type: 'exam', examFormat: 'toeic', status, durationMinutes: 30,
    questionGroups: groups,
    questions: withOtherPart ? [{ question: part1._id, score: 1 }] : [],
    createdBy: admin._id,
  });
  if (withOtherPart) {
    part1Group.assessment = assessment._id;
    await part1Group.save();
  } else {
    await QuestionGroup.findByIdAndDelete(part1Group._id);
  }
  return { assessment, part1, part1Group: withOtherPart ? part1Group : null };
};

const select = (assessmentId, questionIds, key = randomUUID(), groupId) => request(
  `/api/v1/admin/toeic-tests/${assessmentId}/question-bank/part5/selections`,
  { method: 'POST', token: adminToken, body: { questionIds, ...(groupId ? { groupId } : {}) }, idempotencyKey: key },
);

test('Phase 5 Part 5 bank selection integration on an isolated MongoDB database', {
  skip: setupError ? `BLOCKED: disposable MongoDB could not start (${setupError.message})` : false,
}, async (t) => {
  await t.test('Admin-only eligible list enforces content quality, search and pagination', async () => {
    const { assessment } = await createAssessment();
    const valid1 = await Question.create(bankQuestion({ questionText: 'Needle valid question one.' }));
    const valid2 = await Question.create(bankQuestion({ questionText: 'Needle valid question two.' }));
    assessment.questions.push({ question: valid1._id, score: 1 });
    await assessment.save();
    await Question.create([
      bankQuestion({ questionText: 'Legacy no answer', correctAnswers: [] }),
      bankQuestion({ questionText: 'Legacy no explanation', explanation: '  ' }),
      bankQuestion({ questionText: 'Legacy malformed options', options: options().slice(0, 3) }),
      bankQuestion({ questionText: 'Draft item', status: 'draft' }),
      bankQuestion({ questionText: 'Hidden item', status: 'hidden' }),
      bankQuestion({ questionText: 'Other Part', toeicPart: 6 }),
      bankQuestion({ questionText: 'Other type', type: 'multiple_choice' }),
    ]);

    const deniedTeacher = await request(`/api/v1/admin/toeic-tests/${assessment._id}/question-bank/part5`, { token: teacherToken });
    const deniedStudent = await request(`/api/v1/admin/toeic-tests/${assessment._id}/question-bank/part5`, { token: studentToken });
    assert.equal(deniedTeacher.response.status, 403);
    assert.equal(deniedStudent.response.status, 403);
    const deniedTeacherConfirm = await request(`/api/v1/admin/toeic-tests/${assessment._id}/question-bank/part5/selections`, {
      method: 'POST', token: teacherToken, body: { questionIds: [String(valid1._id)] }, idempotencyKey: `teacher-${unique}`,
    });
    const deniedStudentConfirm = await request(`/api/v1/admin/toeic-tests/${assessment._id}/question-bank/part5/selections`, {
      method: 'POST', token: studentToken, body: { questionIds: [String(valid1._id)] }, idempotencyKey: `student-${unique}`,
    });
    assert.equal(deniedTeacherConfirm.response.status, 403);
    assert.equal(deniedStudentConfirm.response.status, 403);

    const page1 = await request(`/api/v1/admin/toeic-tests/${assessment._id}/question-bank/part5?search=needle&page=1&limit=1`, { token: adminToken });
    const page2 = await request(`/api/v1/admin/toeic-tests/${assessment._id}/question-bank/part5?search=needle&page=2&limit=1`, { token: adminToken });
    const all = await request(`/api/v1/admin/toeic-tests/${assessment._id}/question-bank/part5?search=needle&page=1&limit=10`, { token: adminToken });
    assert.equal(page1.response.status, 200, page1.json.message);
    assert.equal(page1.json.data.pagination.total, 2);
    assert.equal(page1.json.data.questions.length, 1);
    assert.equal(page2.json.data.questions.length, 1);
    assert.notEqual(page1.json.data.questions[0]._id, page2.json.data.questions[0]._id);
    assert.ok([String(valid1._id), String(valid2._id)].includes(page1.json.data.questions[0]._id));
    assert.ok(page1.json.data.questions[0].correctAnswers.length === 1);
    assert.equal(all.json.data.questions.find((question) => question._id === String(valid1._id)).alreadyInAssessment, true);
    assert.equal(all.json.data.questions.find((question) => question._id === String(valid2._id)).alreadyInAssessment, false);
    const duplicateSource = await select(assessment._id, [String(valid1._id)], `direct-${unique}`);
    assert.equal(duplicateSource.response.status, 200);
    assert.equal(duplicateSource.json.data.results[0].status, 'ALREADY_IN_ASSESSMENT');
    assert.equal(await Question.countDocuments({ bankTargetAssessmentId: assessment._id }), 0);
  });

  await t.test('selection clones valid sources and keeps group, assessment and attempt snapshots independent', async () => {
    const { assessment, part1, part1Group } = await createAssessment({ withOtherPart: true });
    for (const partNumber of [2, 3, 4, 6, 7]) {
      assessment.questionGroups.push((await QuestionGroup.create({
        assessment: assessment._id,
        partNumber,
        type: partNumber === 7 ? 'multi_passage' : 'single',
        title: `Part ${partNumber} preserved`,
        questionIds: [],
      }))._id);
    }
    await assessment.save();
    const originalNonPart5GroupIds = assessment.questionGroups.map((groupId) => String(groupId));
    const sourceA = await Question.create(bankQuestion({ questionText: 'Copy source A.' }));
    const sourceB = await Question.create(bankQuestion({ questionText: 'Copy source B.', correctAnswers: ['D'] }));
    const sourceBefore = await Question.findById(sourceA._id).lean();
    const response = await select(assessment._id, [String(sourceA._id), String(sourceB._id)], `select-${unique}-first`);
    assert.equal(response.response.status, 200, response.json.message);
    assert.deepEqual(response.json.data.results.map((row) => row.status), ['ADDED', 'ADDED']);

    const updatedAssessment = await Assessment.findById(assessment._id).populate({ path: 'questionGroups', populate: { path: 'questionIds', model: 'Question' } });
    const part5Groups = updatedAssessment.questionGroups.filter((group) => group.partNumber === 5);
    assert.equal(part5Groups.length, 1);
    const part5Group = part5Groups[0];
    assert.equal(part5Group.questionIds.length, 2);
    assert.deepEqual(
      updatedAssessment.questionGroups.filter((group) => group.partNumber !== 5).map((group) => String(group._id)),
      originalNonPart5GroupIds,
      'existing Part 1-4 and 6-7 group IDs and order remain unchanged'
    );
    assert.equal(updatedAssessment.questions.length, 3);
    assert.ok(updatedAssessment.questions.every((item) => item.question));
    assert.equal(String(updatedAssessment.questionGroups.find((group) => group.partNumber === 1)._id), String(part1Group._id));
    assert.ok(updatedAssessment.questions.some((item) => String(item.question?._id || item.question) === String(part1._id)));

    const firstCloneId = response.json.data.results[0].questionId;
    const firstClone = await Question.findById(firstCloneId).select('+bankSourceQuestionId +bankTargetAssessmentId +bankSourceSelectionBatchId').lean();
    assert.notEqual(String(firstClone._id), String(sourceA._id));
    assert.equal(String(firstClone.bankSourceQuestionId), String(sourceA._id));
    assert.equal(String(firstClone.bankTargetAssessmentId), String(assessment._id));
    assert.equal(firstClone.status, 'published');
    assert.equal(String(firstClone.questionGroup), String(part5Group._id));
    assert.deepEqual(firstClone.options.map((option) => option.id), ['A', 'B', 'C', 'D']);
    assert.deepEqual((await Question.findById(sourceA._id).lean()).options, sourceBefore.options);
    assert.equal((await Question.findById(sourceA._id).lean()).questionGroup, undefined);
    assert.deepEqual(part5Group.questionIds.map((question) => Number(question.questionNumber)), [1, 2]);

    const { assessment: secondAssessment } = await createAssessment();
    const secondUse = await select(secondAssessment._id, [String(sourceA._id)], `second-assessment-${unique}`);
    assert.equal(secondUse.response.status, 200);
    const secondCloneId = secondUse.json.data.results[0].questionId;
    assert.notEqual(String(secondCloneId), String(firstClone._id));
    assert.equal(await Question.countDocuments({ bankSourceQuestionId: sourceA._id }), 2);
    assert.equal((await Question.findById(sourceA._id).lean()).questionGroup, undefined);

    const secondKeyDuplicate = await select(assessment._id, [String(sourceA._id)], `select-${unique}-second`);
    assert.equal(secondKeyDuplicate.response.status, 200);
    assert.equal(secondKeyDuplicate.json.data.results[0].status, 'ALREADY_IN_ASSESSMENT');
    assert.equal(await Question.countDocuments({ bankTargetAssessmentId: assessment._id }), 2);

    const key = `select-${unique}-retry`;
    const idempotent = await select(assessment._id, [String(sourceA._id)], key);
    const retry = await select(assessment._id, [String(sourceA._id)], key);
    assert.equal(idempotent.response.status, 200);
    assert.equal(retry.response.status, 200);
    assert.equal(retry.json.data.results[0].status, 'ALREADY_IN_ASSESSMENT');
    assert.equal(await Question.countDocuments({ bankTargetAssessmentId: assessment._id }), 2);

    const publish = await request(`/api/v1/admin/toeic-tests/${assessment._id}/publish`, { method: 'POST', token: adminToken, body: {} });
    assert.equal(publish.response.status, 200, publish.json.message);
    const start = await request(`/api/v1/toeic/tests/${assessment._id}/start`, { method: 'POST', token: studentToken, body: {} });
    assert.equal(start.response.status, 201, start.json.message);
    assert.equal(start.json.data.questions.length, 3);
    assert.equal(Object.hasOwn(start.json.data.questions.find((question) => question.questionId === String(firstClone._id)), 'correctAnswers'), false);
    assert.equal(Object.hasOwn(start.json.data.questions.find((question) => question.questionId === String(firstClone._id)), 'explanation'), false);

    const attempt = await Attempt.findById(start.json.data.attemptId);
    const historicalSnapshot = attempt.questionSnapshots.find((question) => question.questionId === String(firstClone._id));
    assert.deepEqual(historicalSnapshot.correctAnswers, ['B']);
    firstClone.questionText = 'Changed in an assessment copy.';
    firstClone.correctAnswers = ['A'];
    await Question.findByIdAndUpdate(firstClone._id, { questionText: firstClone.questionText, correctAnswers: firstClone.correctAnswers });
    const unchangedAttempt = await Attempt.findById(attempt._id).lean();
    const unchangedSnapshot = unchangedAttempt.questionSnapshots.find((question) => question.questionId === String(firstClone._id));
    assert.equal(unchangedSnapshot.questionText, 'Copy source A.');
    assert.deepEqual(unchangedSnapshot.correctAnswers, ['B']);
  });

  await t.test('confirm revalidates legacy invalid, non-published and other-Part questions row by row', async () => {
    const { assessment } = await createAssessment();
    const invalidAnswer = await Question.create(bankQuestion({ questionText: 'No answer at confirm.', correctAnswers: [] }));
    const invalidExplanation = await Question.create(bankQuestion({ questionText: 'No explanation at confirm.', explanation: '' }));
    const draft = await Question.create(bankQuestion({ questionText: 'Still a draft.', status: 'draft' }));
    const hidden = await Question.create(bankQuestion({ questionText: 'Hidden at confirm.', status: 'hidden' }));
    const otherPart = await Question.create(bankQuestion({ questionText: 'Wrong part at confirm.', toeicPart: 4 }));
    const valid = await Question.create(bankQuestion({ questionText: 'One valid row.' }));

    const response = await select(assessment._id, [
      String(invalidAnswer._id), String(invalidExplanation._id), String(draft._id), String(hidden._id), String(otherPart._id), String(valid._id),
    ], `confirm-${unique}`);
    assert.equal(response.response.status, 200, response.json.message);
    assert.deepEqual(response.json.data.results.map((row) => row.status), ['INVALID', 'INVALID', 'INVALID', 'INVALID', 'INVALID', 'ADDED']);
    assert.ok(response.json.data.results[0].issues.some((issue) => issue.code === 'INVALID_CORRECT_ANSWER'));
    assert.ok(response.json.data.results[1].issues.some((issue) => issue.code === 'MISSING_EXPLANATION'));
    assert.ok(response.json.data.results[2].issues.some((issue) => issue.code === 'QUESTION_NOT_PUBLISHED'));
    assert.ok(response.json.data.results[4].issues.some((issue) => issue.code === 'WRONG_TOEIC_PART'));
    assert.equal(await Question.countDocuments({ bankTargetAssessmentId: assessment._id }), 1);
  });

  await t.test('published assessments, invalid groups and mismatched idempotency replays fail without writes', async () => {
    const { assessment: published } = await createAssessment({ status: 'published' });
    const source = await Question.create(bankQuestion());
    const blocked = await select(published._id, [String(source._id)], `published-${unique}`);
    assert.equal(blocked.response.status, 409);
    assert.equal(blocked.json.code, 'ASSESSMENT_NOT_EDITABLE');
    assert.equal(await Question.countDocuments({ bankTargetAssessmentId: published._id }), 0);

    const { assessment } = await createAssessment();
    const wrongPartGroup = await QuestionGroup.create({ assessment: assessment._id, partNumber: 1, type: 'single' });
    const badGroup = await select(assessment._id, [String(source._id)], `wrong-group-${unique}`, String(wrongPartGroup._id));
    assert.equal(badGroup.response.status, 404);

    const key = `hash-${unique}`;
    const first = await select(assessment._id, [String(source._id)], key);
    const mismatch = await select(assessment._id, [String(source._id), String(new mongoose.Types.ObjectId())], key);
    assert.equal(first.response.status, 200);
    assert.equal(mismatch.response.status, 409);
    assert.equal(mismatch.json.code, 'IDEMPOTENCY_KEY_REUSED');
    assert.equal(await Question.countDocuments({ bankTargetAssessmentId: assessment._id }), 1);
  });

  await t.test('existing Builder writes and publish are blocked during the selection lock lease', async () => {
    const { assessment } = await createAssessment();
    assessment.bankSelectionLockToken = 'synthetic-lock';
    assessment.bankSelectionLockExpiresAt = new Date(Date.now() + 60_000);
    await assessment.save();

    const settingsUpdate = await request(`/api/v1/admin/toeic-tests/${assessment._id}`, {
      method: 'PUT', token: adminToken, body: { status: 'published' },
    });
    const groupUpdate = await request(`/api/v1/admin/toeic-tests/${assessment._id}/groups`, {
      method: 'POST', token: adminToken, body: { partNumber: 5, questions: [{ questionText: 'No concurrent write.' }] },
    });
    const publish = await request(`/api/v1/admin/toeic-tests/${assessment._id}/publish`, {
      method: 'POST', token: adminToken, body: {},
    });
    const genericUpdate = await request(`/api/v1/assessments/admin/${assessment._id}`, {
      method: 'PUT', token: adminToken, body: { status: 'published' },
    });
    const genericPublish = await request(`/api/v1/assessments/admin/${assessment._id}/status`, {
      method: 'PATCH', token: adminToken, body: { status: 'published' },
    });
    const genericDelete = await request(`/api/v1/assessments/admin/${assessment._id}`, {
      method: 'DELETE', token: adminToken,
    });
    assert.equal(settingsUpdate.response.status, 409);
    assert.equal(groupUpdate.response.status, 409);
    assert.equal(publish.response.status, 409);
    assert.equal(genericUpdate.response.status, 409);
    assert.equal(genericPublish.response.status, 409);
    assert.equal(genericDelete.response.status, 409);
    assert.equal(await QuestionGroup.countDocuments({ assessment: assessment._id, partNumber: 5 }), 0);
    assert.equal((await Assessment.findById(assessment._id).lean()).status, 'draft');
  });

  await t.test('concurrent confirms cannot create duplicate source copies or group references', async () => {
    const { assessment } = await createAssessment();
    const source = await Question.create(bankQuestion({ questionText: 'Concurrent single source.' }));
    const keyA = `concurrent-a-${unique}`;
    const keyB = `concurrent-b-${unique}`;
    const [first, second] = await Promise.all([
      select(assessment._id, [String(source._id)], keyA),
      select(assessment._id, [String(source._id)], keyB),
    ]);
    for (const response of [first, second]) {
      if (response.response.status === 409 && response.json.code === 'QUESTION_BANK_SELECTION_BUSY') {
        const retry = await select(assessment._id, [String(source._id)], response === first ? keyA : keyB);
        assert.equal(retry.response.status, 200, retry.json.message);
      } else {
        assert.equal(response.response.status, 200, response.json.message);
      }
    }
    const clones = await Question.find({ bankTargetAssessmentId: assessment._id }).select('+bankSourceQuestionId').lean();
    const currentAssessment = await Assessment.findById(assessment._id).lean();
    const groups = await QuestionGroup.find({ assessment: assessment._id, partNumber: 5 }).lean();
    assert.equal(clones.length, 1);
    assert.equal(currentAssessment.questions.length, 1);
    assert.equal(groups.length, 1);
    assert.equal(groups[0].questionIds.length, 1);
    assert.equal(String(groups[0].questionIds[0]), String(clones[0]._id));
    assert.equal(await QuestionBankSelectionBatch.countDocuments({ assessment: assessment._id }), 2);
  });

  await t.test('a retry with a new key recovers a clone left between group and assessment writes', async () => {
    const { assessment } = await createAssessment();
    const source = await Question.create(bankQuestion({ questionText: 'Recover this interrupted selection.' }));
    const oldBatch = await QuestionBankSelectionBatch.create({
      assessment: assessment._id,
      idempotencyKey: `interrupted-${unique}`,
      requestHash: 'synthetic-interrupted-request',
      requestedQuestionIds: [String(source._id)],
      createdBy: admin._id,
      status: 'processing',
    });
    const group = await QuestionGroup.create({
      assessment: assessment._id,
      partNumber: 5,
      type: 'single',
      title: 'Interrupted bank selection',
      questionIds: [],
      bankSelectionBatchId: oldBatch._id,
    });
    oldBatch.groupId = group._id;
    await oldBatch.save();
    assessment.questionGroups.push(group._id);
    await assessment.save();
    const orphanedClone = await Question.create({
      ...bankQuestion({ questionText: source.questionText, status: 'draft' }),
      questionGroup: group._id,
      questionNumber: 1,
      order: 1,
      createdBy: admin._id,
      bankSourceQuestionId: source._id,
      bankTargetAssessmentId: assessment._id,
      bankSourceSelectionBatchId: oldBatch._id,
    });
    group.questionIds.push(orphanedClone._id);
    await group.save();

    const recovered = await select(assessment._id, [String(source._id)], `recover-${unique}`);
    assert.equal(recovered.response.status, 200, recovered.json.message);
    assert.equal(recovered.json.data.results[0].status, 'RECOVERED');
    assert.equal(await Question.countDocuments({ bankTargetAssessmentId: assessment._id }), 1);
    const persistedAssessment = await Assessment.findById(assessment._id).lean();
    const persistedGroups = await QuestionGroup.find({ assessment: assessment._id, partNumber: 5 }).lean();
    const persistedClone = await Question.findById(orphanedClone._id).lean();
    assert.equal(persistedAssessment.questions.length, 1);
    assert.equal(persistedGroups.length, 1);
    assert.equal(persistedGroups[0].questionIds.length, 1);
    assert.equal(persistedClone.status, 'published');
  });
});

test.after(async () => {
  if (httpServer?.listening) await new Promise((resolve) => httpServer.close(resolve));
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect().catch(() => {});
  if (mongoServer) await mongoServer.stop().catch(() => {});
  if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = originalJwtSecret;
});
