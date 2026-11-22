import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test, { after, before } from 'node:test';
import express from 'express';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import gamificationRoutes from '../src/routes/gamificationRoutes.js';
import adminRoutes from '../src/routes/adminRoutes.js';
import DailyVocabularyChallenge from '../src/models/DailyVocabularyChallenge.js';
import GamificationAchievement from '../src/models/GamificationAchievement.js';
import GamificationConfig from '../src/models/GamificationConfig.js';
import User from '../src/models/User.js';
import Vocabulary from '../src/models/Vocabulary.js';
import VocabularyQuestAttempt from '../src/models/VocabularyQuestAttempt.js';
import VocabularyQuestProgress from '../src/models/VocabularyQuestProgress.js';
import VocabularyStreak from '../src/models/VocabularyStreak.js';

const unique = randomUUID().replaceAll('-', '');
const dbName = `gamification_${unique}`;
let mongoServer;
let httpServer;
let baseUrl;
let student;
let secondStudent;
let teacher;
let studentToken;
let secondStudentToken;
let teacherToken;

const request = async (path, { token, method = 'GET', body, timezone = 'Asia/Ho_Chi_Minh' } = {}) => {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'content-type': 'application/json' } : {}),
      'x-timezone': timezone,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, payload: await response.json() };
};

const correctAnswers = (attempt) => attempt.questions.map((question) => ({ questionId: question.questionId, answer: question.answer }));

before(async () => {
  process.env.JWT_SECRET = `gamification-${unique}`;
  mongoServer = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1', dbName } });
  await mongoose.connect(mongoServer.getUri(dbName), { serverSelectionTimeoutMS: 5000, autoIndex: true });
  await Promise.all([
    User.init(), Vocabulary.init(), DailyVocabularyChallenge.init(), VocabularyStreak.init(),
    VocabularyQuestProgress.init(), VocabularyQuestAttempt.init(), GamificationAchievement.init(), GamificationConfig.init(),
  ]);

  [student, secondStudent, teacher] = await User.create([
    { email: `game-student-${unique}@test.local`, password: 'student-password', role: 'student', status: 'active' },
    { email: `game-student-two-${unique}@test.local`, password: 'student-password', role: 'student', status: 'active' },
    { email: `game-teacher-${unique}@test.local`, password: 'teacher-password', role: 'teacher', status: 'active' },
  ]);
  await Vocabulary.insertMany(Array.from({ length: 40 }, (_, index) => ({
    word: `audit-word-${unique}-${index}`,
    meaning: `Nghĩa kiểm thử ${index}`,
    exampleEnglish: `The audit word ${index} appears in a real sentence.`,
    topic: `TOEIC Level ${Math.floor(index / 10) + 1}`,
    status: 'published', order: index,
  })));
  studentToken = jwt.sign({ userId: student._id }, process.env.JWT_SECRET);
  secondStudentToken = jwt.sign({ userId: secondStudent._id }, process.env.JWT_SECRET);
  teacherToken = jwt.sign({ userId: teacher._id }, process.env.JWT_SECRET);

  const app = express();
  app.use(express.json());
  app.use('/api/v1/gamification', gamificationRoutes);
  app.use('/api/v1/admin', adminRoutes);
  app.use((error, _req, res, _next) => res.status(error.statusCode || 500).json({ status: 'error', code: error.code, message: error.message }));
  httpServer = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    httpServer.once('listening', resolve);
    httpServer.once('error', reject);
  });
  baseUrl = `http://127.0.0.1:${httpServer.address().port}`;
});

after(async () => {
  if (httpServer) await new Promise((resolve) => httpServer.close(resolve));
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  if (mongoServer) await mongoServer.stop();
});

test('gamification production invariants hold across API, persistence, replay and concurrency', async (t) => {
  await t.test('admin can read and update per-game configuration while students cannot', async () => {
    assert.equal((await request('/api/v1/admin/gamification/config')).status, 401);
    assert.equal((await request('/api/v1/admin/gamification/config', { token: studentToken })).status, 403);
    const initial = await request('/api/v1/admin/gamification/config', { token: teacherToken });
    assert.equal(initial.status, 200, JSON.stringify(initial.payload));
    assert.equal(initial.payload.data.configs.find((config) => config.game === 'streak').dailyWordCount, 20);
    const updated = await request('/api/v1/admin/gamification/config/quest', { token: teacherToken, method: 'PATCH', body: { enabled: true, timeLimitSeconds: 180 } });
    assert.equal(updated.status, 200);
    assert.equal(updated.payload.data.config.timeLimitSeconds, 180);
    assert.equal((await GamificationConfig.findOne({ game: 'quest' })).timeLimitSeconds, 180);
  });

  await t.test('authorization rejects anonymous and non-student access', async () => {
    assert.equal((await request('/api/v1/gamification/overview')).status, 401);
    assert.equal((await request('/api/v1/gamification/overview', { token: teacherToken })).status, 403);
  });

  await t.test('daily challenge uses 20 real records and is idempotent', async () => {
    const starts = await Promise.all(Array.from({ length: 3 }, () => request('/api/v1/gamification/daily-challenge/start', { token: studentToken, method: 'POST', body: {} })));
    assert.ok(starts.every((result) => result.status === 200));
    const ids = new Set(starts.map((result) => result.payload.data.challenge.id));
    assert.equal(ids.size, 1);
    const challenge = starts[0].payload.data.challenge;
    assert.equal(challenge.questions.length, 20);
    assert.equal(new Set(challenge.questions.map((question) => question.vocabularyId)).size, 20);
    assert.ok(challenge.questions.every((question) => question.options.length >= 2));
    assert.ok(challenge.questions.every((question) => !Object.hasOwn(question, 'answer')));
  });

  await t.test('wrong answers do not count, correct replays do not double count, and all 20 complete the streak', async () => {
    const started = await request('/api/v1/gamification/daily-challenge/start', { token: studentToken, method: 'POST', body: {} });
    const challengeId = started.payload.data.challenge.id;
    const stored = await DailyVocabularyChallenge.findById(challengeId).select('+questions.answer');
    const first = stored.questions[0];
    const wrong = first.options.find((option) => option.id !== first.answer)?.id || 'not-the-answer';
    const wrongResult = await request(`/api/v1/gamification/daily-challenge/${challengeId}/answer`, { token: studentToken, method: 'POST', body: { questionId: first.questionId, answer: wrong } });
    assert.equal(wrongResult.payload.data.challenge.correctCount, 0);
    const correctBody = { questionId: first.questionId, answer: first.answer };
    const correctResult = await request(`/api/v1/gamification/daily-challenge/${challengeId}/answer`, { token: studentToken, method: 'POST', body: correctBody });
    assert.equal(correctResult.payload.data.challenge.correctCount, 1);
    const replay = await request(`/api/v1/gamification/daily-challenge/${challengeId}/answer`, { token: studentToken, method: 'POST', body: correctBody });
    assert.equal(replay.payload.data.challenge.correctCount, 1);
    for (const question of stored.questions.slice(1)) {
      await request(`/api/v1/gamification/daily-challenge/${challengeId}/answer`, { token: studentToken, method: 'POST', body: { questionId: question.questionId, answer: question.answer } });
    }
    const completed = await DailyVocabularyChallenge.findById(challengeId);
    assert.equal(completed.status, 'completed');
    assert.equal(completed.correctCount, 20);
    assert.equal((await VocabularyStreak.findOne({ student: student._id })).currentStreak, 1);
    const repeatStart = await request('/api/v1/gamification/daily-challenge/start', { token: studentToken, method: 'POST', body: {} });
    assert.equal(repeatStart.payload.data.challenge.id, challengeId);
  });

  await t.test('quest locks levels, persists answers for resume, enforces 80%, and contributes only unique overlap to today’s challenge', async () => {
    const daily = await request('/api/v1/gamification/daily-challenge/start', { token: secondStudentToken, method: 'POST', body: {} });
    const dailyId = daily.payload.data.challenge.id;
    const dailyStored = await DailyVocabularyChallenge.findById(dailyId).select('+questions.answer');
    const dailyVocabularyIds = new Set(dailyStored.questions.map((question) => String(question.vocabularyId)));
    assert.equal((await request('/api/v1/gamification/quest/levels/2/start', { token: secondStudentToken, method: 'POST', body: { stage: 1 } })).status, 403);

    const failedStart = await request('/api/v1/gamification/quest/levels/1/start', { token: secondStudentToken, method: 'POST', body: { stage: 1 } });
    const failedId = failedStart.payload.data.attempt.id;
    const failedStored = await VocabularyQuestAttempt.findById(failedId).select('+questions.answer');
    const failedCorrect = correctAnswers(failedStored);
    const failedAnswers = failedCorrect.map((answer, index) => ({ ...answer, answer: index < 7 ? answer.answer : '__wrong__' }));
    const failed = await request(`/api/v1/gamification/quest/attempts/${failedId}/submit`, { token: secondStudentToken, method: 'POST', body: { answers: failedAnswers } });
    assert.equal(failed.payload.data.attempt.accuracy, 70);
    assert.equal(failed.payload.data.attempt.passed, false);

    const retryStart = await request('/api/v1/gamification/quest/levels/1/start', { token: secondStudentToken, method: 'POST', body: { stage: 1 } });
    const retryStored = await VocabularyQuestAttempt.findById(retryStart.payload.data.attempt.id).select('+questions.answer');
    const retryAnswers = correctAnswers(retryStored).map((answer, index) => ({ ...answer, answer: index < 8 ? answer.answer : '__wrong__' }));
    const retry = await request(`/api/v1/gamification/quest/attempts/${retryStart.payload.data.attempt.id}/submit`, { token: secondStudentToken, method: 'POST', body: { answers: retryAnswers } });
    assert.equal(retry.status, 200, JSON.stringify(retry.payload));
    assert.equal(retry.payload.data.attempt.accuracy, 80);
    assert.equal(retry.payload.data.attempt.passed, true);
    const progress = await VocabularyQuestProgress.findOne({ student: secondStudent._id }).lean();
    assert.equal(progress.levels.find((item) => item.level === 2).unlocked, true);

    const correctIds = new Set([...failedCorrect.slice(0, 7), ...correctAnswers(retryStored).slice(0, 8)].map((answer) => String(retryStored.questions.find((question) => question.questionId === answer.questionId)?.vocabularyId || failedStored.questions.find((question) => question.questionId === answer.questionId)?.vocabularyId)));
    const expectedOverlap = [...correctIds].filter((id) => dailyVocabularyIds.has(id)).length;
    const dailyAfterQuest = await DailyVocabularyChallenge.findById(dailyId);
    assert.equal(dailyAfterQuest.correctCount, expectedOverlap);
    assert.equal(new Set(dailyAfterQuest.completedVocabularyIds.map(String)).size, dailyAfterQuest.correctCount);
  });

  await t.test('quest duplicate submissions are idempotent and answer progress survives overview refresh', async () => {
    const started = await request('/api/v1/gamification/quest/levels/2/start', { token: secondStudentToken, method: 'POST', body: { stage: 2 } });
    const attemptId = started.payload.data.attempt.id;
    const stored = await VocabularyQuestAttempt.findById(attemptId).select('+questions.answer');
    const saved = await request(`/api/v1/gamification/quest/attempts/${attemptId}/progress`, { token: secondStudentToken, method: 'POST', body: { questionId: stored.questions[0].questionId, answer: stored.questions[0].answer } });
    assert.equal(saved.status, 200);
    const overview = await request('/api/v1/gamification/overview', { token: secondStudentToken });
    assert.equal(overview.payload.data.quest.activeAttempt.savedAnswers[0].questionId, stored.questions[0].questionId);
    const answers = correctAnswers(stored);
    const outcomes = await Promise.all([
      request(`/api/v1/gamification/quest/attempts/${attemptId}/submit`, { token: secondStudentToken, method: 'POST', body: { answers } }),
      request(`/api/v1/gamification/quest/attempts/${attemptId}/submit`, { token: secondStudentToken, method: 'POST', body: { answers } }),
    ]);
    assert.ok(outcomes.every((outcome) => outcome.status === 200));
    assert.ok(outcomes.every((outcome) => outcome.payload.data.attempt.accuracy === 100));
    const persisted = await VocabularyQuestAttempt.findById(attemptId);
    assert.equal(persisted.status, 'submitted');
    assert.equal((await VocabularyQuestProgress.findOne({ student: secondStudent._id })).levels.find((item) => item.level === 2).attempts, 1);

    const parallelStarts = await Promise.all([
      request('/api/v1/gamification/quest/levels/1/start', { token: secondStudentToken, method: 'POST', body: { stage: 2 } }),
      request('/api/v1/gamification/quest/levels/2/start', { token: secondStudentToken, method: 'POST', body: { stage: 4 } }),
    ]);
    const parallelStored = await Promise.all(parallelStarts.map((started) => VocabularyQuestAttempt.findById(started.payload.data.attempt.id).select('+questions.answer')));
    const beforeParallel = await VocabularyQuestProgress.findOne({ student: secondStudent._id }).lean();
    await Promise.all(parallelStored.map((storedAttempt) => request(
      `/api/v1/gamification/quest/attempts/${storedAttempt._id}/submit`,
      { token: secondStudentToken, method: 'POST', body: { answers: correctAnswers(storedAttempt) } },
    )));
    const afterParallel = await VocabularyQuestProgress.findOne({ student: secondStudent._id }).lean();
    assert.equal(afterParallel.levels.find((item) => item.level === 1).attempts, beforeParallel.levels.find((item) => item.level === 1).attempts + 1);
    assert.equal(afterParallel.levels.find((item) => item.level === 2).attempts, beforeParallel.levels.find((item) => item.level === 2).attempts + 1);
  });

  await t.test('cross-user access and server-side timeout enforcement fail closed', async () => {
    const daily = await request('/api/v1/gamification/daily-challenge/start', { token: secondStudentToken, method: 'POST', body: {} });
    const dailyStored = await DailyVocabularyChallenge.findById(daily.payload.data.challenge.id).select('+questions.answer');
    const foreign = await request(`/api/v1/gamification/daily-challenge/${daily.payload.data.challenge.id}/answer`, { token: studentToken, method: 'POST', body: { questionId: dailyStored.questions[0].questionId, answer: dailyStored.questions[0].answer } });
    assert.equal(foreign.status, 404);

    const started = await request('/api/v1/gamification/quest/levels/2/start', { token: secondStudentToken, method: 'POST', body: { stage: 3 } });
    await VocabularyQuestAttempt.updateOne({ _id: started.payload.data.attempt.id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    const expired = await VocabularyQuestAttempt.findById(started.payload.data.attempt.id).select('+questions.answer');
    const result = await request(`/api/v1/gamification/quest/attempts/${started.payload.data.attempt.id}/submit`, { token: secondStudentToken, method: 'POST', body: { answers: correctAnswers(expired) } });
    assert.equal(result.status, 200);
    assert.equal(result.payload.data.attempt.timedOut, true);
    assert.equal(result.payload.data.attempt.passed, false);
  });
});
