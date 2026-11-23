import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateStreakRuns,
  getDateKeyInTimezone,
  getFlameTier,
  shiftDateKey,
} from '../src/services/learningStreakService.js';

test('learning streak calendar uses account timezone, not browser timezone', () => {
  const instant = new Date('2026-11-23T02:30:00.000Z');
  assert.equal(getDateKeyInTimezone(instant, 'Asia/Ho_Chi_Minh'), '2026-11-23');
  assert.equal(getDateKeyInTimezone(instant, 'America/Los_Angeles'), '2026-11-22');
  assert.equal(shiftDateKey('2026-03-01', -1), '2026-02-28');
});

test('streak runs keep longest history and detect consecutive days', () => {
  const result = calculateStreakRuns(['2026-11-20', '2026-11-22', '2026-11-23', '2026-11-24']);
  assert.equal(result.latestRun, 3);
  assert.equal(result.longest, 3);
  assert.equal(result.lastCompletedDate, '2026-11-24');
});

test('flame tiers map to the seven product levels', () => {
  assert.deepEqual([0, 1, 3, 7, 14, 30, 60, 100].map(getFlameTier), [0, 1, 2, 3, 4, 5, 6, 7]);
});
