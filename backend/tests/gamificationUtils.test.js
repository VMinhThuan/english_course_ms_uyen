import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateStreak,
  classifyVocabularyLevel,
  dateKeyDistance,
  getDateKey,
  starsForAccuracy,
  streakBadgeCodes,
} from '../src/utils/gamificationUtils.js';

test('streak counts only consecutive calendar dates and resets after a missed day', () => {
  assert.deepEqual(calculateStreak(['2026-11-18', '2026-11-19', '2026-11-21'], '2026-11-21'), {
    currentStreak: 1,
    longestStreak: 2,
  });
  assert.equal(dateKeyDistance('2026-11-20', '2026-11-19'), 1);
});

test('same-day completion does not create a second streak day', () => {
  assert.deepEqual(calculateStreak(['2026-11-20'], '2026-11-20'), { currentStreak: 1, longestStreak: 1 });
  assert.deepEqual(calculateStreak([], '2026-11-20'), { currentStreak: 0, longestStreak: 0 });
});

test('date keys roll over at the configured local midnight, not UTC midnight', () => {
  assert.equal(getDateKey(new Date('2026-11-21T16:59:59.000Z'), 'Asia/Ho_Chi_Minh'), '2026-11-21');
  assert.equal(getDateKey(new Date('2026-11-21T17:00:00.000Z'), 'Asia/Ho_Chi_Minh'), '2026-11-22');
  assert.equal(getDateKey(new Date('2026-11-22T04:59:59.000Z'), 'America/New_York'), '2026-11-21');
  assert.equal(getDateKey(new Date('2026-11-22T05:00:00.000Z'), 'America/New_York'), '2026-11-22');
});

test('explicit TOEIC level metadata wins over deterministic catalog fallback', () => {
  assert.equal(classifyVocabularyLevel({ topic: 'TOEIC Level 1' }, 0, 100), 1);
  assert.equal(classifyVocabularyLevel({ topic: 'TOEIC Level 2' }, 0, 100), 2);
  assert.equal(classifyVocabularyLevel({ topic: 'TOEIC Level 3' }, 0, 100), 3);
  assert.equal(classifyVocabularyLevel({ topic: 'TOEIC Level 4' }, 0, 100), 4);
  assert.equal(classifyVocabularyLevel({ topic: '250-450' }, 0, 100), 2);
  assert.equal(classifyVocabularyLevel({ topic: 'General' }, 0, 40), 1);
  assert.equal(classifyVocabularyLevel({ topic: 'General' }, 39, 40), 4);
});

test('assessment stars require the documented accuracy thresholds', () => {
  assert.equal(starsForAccuracy(79), 0);
  assert.equal(starsForAccuracy(80), 1);
  assert.equal(starsForAccuracy(90), 2);
  assert.equal(starsForAccuracy(95), 3);
});

test('streak badge milestones unlock cumulatively at 7, 14 and 30 days', () => {
  assert.deepEqual(streakBadgeCodes(6), []);
  assert.deepEqual(streakBadgeCodes(7), ['STREAK_7']);
  assert.deepEqual(streakBadgeCodes(14), ['STREAK_7', 'STREAK_14']);
  assert.deepEqual(streakBadgeCodes(30), ['STREAK_7', 'STREAK_14', 'STREAK_30']);
});
