import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compareAndSwapAttemptAnswers,
  finalizeAttempt,
  resolveAttemptEngine,
  scoreStandardAttempt,
  scoreToeicAttempt,
} from '../src/utils/attemptLifecycle.js';

const standardQuestions = [
  { questionId: 'single', type: 'single_choice', correctAnswers: ['B'], score: 2 },
  { questionId: 'multi', type: 'multiple_choice', correctAnswers: ['A', 'C'], score: 3 },
  { questionId: 'typed', type: 'typed_answer', correctAnswers: ['Hello'], score: 1 },
  { questionId: 'blank', type: 'single_choice', correctAnswers: ['A'], score: 1 },
];

test('standard score preserves exact multiple-choice and normalized typed-answer scoring', () => {
  const result = scoreStandardAttempt(standardQuestions, {
    single: 'B',
    multi: ['A', 'C'],
    typed: ' hello ',
  }, { passScore: 70 });
  assert.deepEqual(result, {
    score: 6,
    maxScore: 7,
    scorePercentage: 86,
    passScore: 70,
    passed: true,
    correctCount: 3,
    incorrectCount: 0,
    unansweredCount: 1,
  });
});

test('TOEIC score preserves listening, reading, and part breakdown fields', () => {
  const result = scoreToeicAttempt([
    { questionId: 'l1', type: 'single_choice', correctAnswers: ['A'], options: [{ id: 'A', text: 'A' }], score: 1, toeicPart: 1 },
    { questionId: 'r1', type: 'multiple_choice', correctAnswers: ['B', 'C'], score: 1, toeicPart: 6 },
    { questionId: 'r2', type: 'single_choice', correctAnswers: ['D'], score: 1, toeicPart: 7 },
  ], { l1: ['A'], r1: ['B', 'C'] });
  assert.equal(result.score, 2);
  assert.equal(result.maxScore, 3);
  assert.equal(result.correctCount, 2);
  assert.equal(result.incorrectCount, 0);
  assert.equal(result.unansweredCount, 1);
  assert.deepEqual(result.toeicBreakdown.partBreakdown.part1, { correct: 1, total: 1 });
  assert.deepEqual(result.toeicBreakdown.partBreakdown.part6, { correct: 1, total: 1 });
  assert.deepEqual(result.toeicBreakdown.partBreakdown.part7, { correct: 0, total: 1 });
  assert.equal(result.toeicBreakdown.listeningTotal, 1);
  assert.equal(result.toeicBreakdown.readingTotal, 2);
});

test('legacy attempts resolve from assessment format and conflicting stored engine fails closed', () => {
  assert.equal(resolveAttemptEngine({}, { examFormat: 'toeic' }), 'toeic');
  assert.equal(resolveAttemptEngine({}, { examFormat: 'standard' }), 'standard');
  assert.equal(resolveAttemptEngine({}, {}), null);
  assert.equal(resolveAttemptEngine({ engine: 'standard' }, { examFormat: 'toeic' }), null);
});

test('expired finalization ignores late payload and atomically stores the persisted answer snapshot', async () => {
  const deadlineAt = new Date('2026-10-20T10:00:00.000Z');
  const original = {
    _id: 'attempt-1',
    engine: 'standard',
    status: 'in_progress',
    revision: 4,
    startedAt: new Date('2026-10-20T09:00:00.000Z'),
    deadlineAt,
    answers: { q1: 'A' },
    questionSnapshots: [{ questionId: 'q1', type: 'single_choice', correctAnswers: ['A'], score: 1 }],
  };
  let written;
  const Attempt = {
    async findOneAndUpdate(filter, update) {
      written = { filter, set: update.$set };
      return { ...original, ...update.$set };
    },
    async findById() { return null; },
  };
  const result = await finalizeAttempt({
    Attempt,
    attempt: original,
    assessment: { examFormat: 'standard', passScore: 60 },
    engine: 'standard',
    answers: { q1: 'WRONG_LATE_ANSWER' },
    revision: 3,
    now: new Date('2026-10-20T10:00:00.000Z'),
  });
  assert.equal(result.kind, 'finalized');
  assert.deepEqual(written.set.answers, { q1: 'A' });
  assert.equal(written.set.status, 'submitted');
  assert.equal(written.set.isExpired, true);
  assert.equal(written.set.submittedAt.toISOString(), deadlineAt.toISOString());
  assert.equal(written.set.score, 1);
  assert.equal(written.filter.deadlineAt.$lte.toISOString(), deadlineAt.toISOString());
});

test('active finalization rejects a stale revision without writing', async () => {
  const attempt = {
    _id: 'attempt-2', engine: 'toeic', status: 'in_progress', revision: 8,
    startedAt: new Date('2026-10-20T09:00:00.000Z'),
    deadlineAt: new Date('2026-10-20T11:00:00.000Z'),
    answers: {}, questionSnapshots: [],
  };
  let writes = 0;
  const result = await finalizeAttempt({
    Attempt: { async findOneAndUpdate() { writes += 1; }, async findById() { return attempt; } },
    attempt,
    assessment: { examFormat: 'toeic' },
    engine: 'toeic',
    answers: {},
    revision: 7,
    now: new Date('2026-10-20T10:00:00.000Z'),
  });
  assert.equal(result.kind, 'revision_conflict');
  assert.equal(writes, 0);
});

test('five concurrent finalizers produce one terminal write and one stable result', async () => {
  const now = new Date('2026-10-20T10:00:00.000Z');
  const initial = {
    _id: 'attempt-race', engine: 'standard', status: 'in_progress', revision: 3,
    startedAt: new Date('2026-10-20T09:00:00.000Z'),
    deadlineAt: new Date('2026-10-20T11:00:00.000Z'), answers: {},
    questionSnapshots: [{ questionId: 'q1', type: 'single_choice', correctAnswers: ['A'], score: 1 }],
  };
  let current = { ...initial };
  let writes = 0;
  const Attempt = {
    async findOneAndUpdate(filter, update) {
      if (current.status !== filter.status || current.revision !== filter.revision || !(current.deadlineAt > filter.deadlineAt.$gt)) return null;
      writes += 1;
      current = { ...current, ...update.$set };
      return { ...current };
    },
    async findById() { return { ...current }; },
  };
  const results = await Promise.all(Array.from({ length: 5 }, () => finalizeAttempt({
    Attempt,
    attempt: { ...initial },
    assessment: { examFormat: 'standard', passScore: 0 },
    engine: 'standard',
    answers: { q1: 'A' },
    revision: 3,
    now,
  })));
  assert.equal(writes, 1);
  assert.equal(current.status, 'submitted');
  assert.equal(current.score, 1);
  assert.equal(results.filter((result) => result.kind === 'finalized').length, 1);
  assert.equal(results.filter((result) => result.kind === 'already_finalized').length, 4);
});

test('two tabs using the same revision cannot overwrite the first accepted autosave', async () => {
  const now = new Date('2026-10-20T10:00:00.000Z');
  const initial = {
    _id: 'attempt-tabs', engine: 'toeic', status: 'in_progress', revision: 7,
    deadlineAt: new Date('2026-10-20T11:00:00.000Z'), answers: {}, flaggedQuestionIds: [],
    questionSnapshots: [{ questionId: 'q1' }],
  };
  let current = { ...initial };
  let writes = 0;
  const Attempt = {
    async findOneAndUpdate(filter, update) {
      if (current.status !== filter.status || current.revision !== filter.revision || !(current.deadlineAt > filter.deadlineAt.$gt)) return null;
      writes += 1;
      current = { ...current, ...update.$set };
      return { ...current };
    },
    async findById() { return { ...current }; },
  };
  const first = await compareAndSwapAttemptAnswers({ Attempt, attempt: { ...initial }, engine: 'toeic', answers: { q1: ['A'] }, now });
  const staleTab = await compareAndSwapAttemptAnswers({ Attempt, attempt: { ...initial }, engine: 'toeic', answers: { q1: ['B'] }, now });
  assert.equal(first.kind, 'saved');
  assert.equal(staleTab.kind, 'stale');
  assert.equal(writes, 1);
  assert.deepEqual(current.answers, { q1: ['A'] });
  assert.equal(current.revision, 8);
});

test('legacy attempt without stored revision can be finalized through the revision-1 compatibility filter', async () => {
  const deadlineAt = new Date('2026-10-20T10:00:00.000Z');
  let current = {
    _id: 'attempt-legacy', engine: 'standard', status: 'in_progress',
    startedAt: new Date('2026-10-20T09:00:00.000Z'), deadlineAt, answers: {},
    questionSnapshots: [{ questionId: 'q1', type: 'single_choice', correctAnswers: ['A'], score: 1 }],
  };
  let queryUsed;
  const Attempt = {
    async findOneAndUpdate(filter, update) {
      queryUsed = filter;
      const revisionMatches = filter.$or?.some((clause) =>
        clause.revision === 1 ? current.revision === 1 : clause.revision?.$exists === false && !Object.hasOwn(current, 'revision')
      );
      if (current.status !== 'in_progress' || !revisionMatches || current.deadlineAt > filter.deadlineAt.$lte) return null;
      current = { ...current, ...update.$set };
      return { ...current };
    },
    async findById() { return { ...current }; },
  };
  const result = await finalizeAttempt({
    Attempt,
    attempt: { ...current, revision: 1 },
    assessment: { examFormat: 'standard', passScore: 0 },
    engine: 'standard',
    now: deadlineAt,
  });
  assert.equal(result.kind, 'finalized');
  assert.ok(queryUsed.$or.some((clause) => clause.revision?.$exists === false));
  assert.equal(current.revision, 2);
  assert.equal(current.status, 'submitted');
});
