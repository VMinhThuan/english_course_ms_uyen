import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAttemptReportingStages,
  buildReportRowsFacet,
  interpretAttemptForReport,
} from '../src/utils/attemptReporting.js';

const now = new Date('2026-10-20T10:00:00.000Z');

test('report interpretation recognizes zero as a scored Standard result', () => {
  const result = interpretAttemptForReport({
    engine: 'standard', status: 'submitted', score: 0, maxScore: 100,
    submittedAt: new Date('2026-10-20T09:00:00.000Z'), duration: 1200,
  }, { examFormat: 'standard' }, now);
  assert.equal(result.logicalState, 'COMPLETED_SCORED');
  assert.equal(result.isScored, true);
  assert.equal(result.score, 0);
  assert.equal(result.maxScore, 100);
  assert.equal(result.percentage, 0);
});

test('report interpretation uses TOEIC completed terminal status and resolves a legacy engine', () => {
  const result = interpretAttemptForReport({
    status: 'completed', score: 55, maxScore: 200,
    submittedAt: new Date('2026-10-20T09:00:00.000Z'),
  }, { examFormat: 'toeic' }, now);
  assert.equal(result.engine, 'toeic');
  assert.equal(result.logicalState, 'COMPLETED_SCORED');
});

test('expired in-progress and unverified terminal attempts do not become score zero', () => {
  const expired = interpretAttemptForReport({ status: 'in_progress', deadlineAt: new Date('2026-10-20T09:00:00.000Z'), score: 0, maxScore: 0 }, { examFormat: 'standard' }, now);
  const unverified = interpretAttemptForReport({ engine: 'standard', status: 'submitted', score: 0, maxScore: 0 }, { examFormat: 'standard' }, now);
  const mismatch = interpretAttemptForReport({ engine: 'standard', status: 'completed', score: 10, maxScore: 10, submittedAt: now }, { examFormat: 'toeic' }, now);
  const markedExpired = interpretAttemptForReport({ status: 'in_progress', isExpired: true, deadlineAt: new Date('2026-10-21T10:00:00.000Z') }, { examFormat: 'standard' }, now);
  assert.equal(expired.logicalState, 'EXPIRED_PENDING_FINALIZATION');
  assert.equal(expired.score, null);
  assert.equal(unverified.logicalState, 'LEGACY_UNVERIFIED');
  assert.equal(unverified.score, null);
  assert.equal(mismatch.logicalState, 'LEGACY_UNVERIFIED');
  assert.equal(markedExpired.logicalState, 'EXPIRED_PENDING_FINALIZATION');
});

test('history/report builders use stable sort, bounded pages, and no answer fields in projection', () => {
  const stages = buildAttemptReportingStages({ studentId: 'student-id', assessmentId: 'assessment-id', now });
  const facet = buildReportRowsFacet({
    state: 'COMPLETED_SCORED', page: 2, limit: 20,
    sort: { score: -1, submittedAt: 1, _id: 1 },
  });
  assert.deepEqual(stages[0].$match, { student: 'student-id', assessment: 'assessment-id' });
  assert.deepEqual(facet.$facet.results.slice(0, 3), [
    { $match: { __logicalState: 'COMPLETED_SCORED' } },
    { $sort: { score: -1, submittedAt: 1, _id: 1 } },
    { $skip: 20 },
  ]);
  const projection = facet.$facet.results.at(-1).$project;
  assert.equal(Object.hasOwn(projection, 'answers'), false);
  assert.equal(Object.hasOwn(projection, 'questionSnapshots'), false);
});
