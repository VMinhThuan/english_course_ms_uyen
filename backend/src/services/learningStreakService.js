import DailyLearningProgress from '../models/DailyLearningProgress.js';
import LearningStreak from '../models/LearningStreak.js';
import StudentDailyStudy from '../models/StudentDailyStudy.js';

export const DAILY_TARGET_SECONDS = 15 * 60;
export const DEFAULT_TIMEZONE = 'Asia/Ho_Chi_Minh';
export const STREAK_MILESTONES = [3, 7, 14, 30, 60, 100];

const isValidTimezone = (timezone) => {
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format();
    return true;
  } catch {
    return false;
  }
};

export const getUserTimezone = (user) => (
  isValidTimezone(user?.timezone) ? user.timezone : DEFAULT_TIMEZONE
);

export const getDateKeyInTimezone = (date = new Date(), timezone = DEFAULT_TIMEZONE) => {
  const safeTimezone = isValidTimezone(timezone) ? timezone : DEFAULT_TIMEZONE;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: safeTimezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
};

export const shiftDateKey = (dateKey, offsetDays) => {
  const [year, month, day] = String(dateKey).split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + offsetDays)).toISOString().slice(0, 10);
};

const getTimezoneOffsetMs = (date, timezone) => {
  const part = new Intl.DateTimeFormat('en-US', { timeZone: timezone, timeZoneName: 'longOffset' })
    .formatToParts(date)
    .find(({ type }) => type === 'timeZoneName')?.value || 'GMT';
  if (part === 'GMT' || part === 'UTC') return 0;
  const match = part.match(/^GMT([+-])(\d{2}):?(\d{2})?$/);
  if (!match) return 0;
  const minutes = Number(match[2]) * 60 + Number(match[3] || 0);
  return (match[1] === '+' ? 1 : -1) * minutes * 60 * 1000;
};

const getUtcTimeForLocalMidnight = (dateKey, timezone) => {
  const [year, month, day] = dateKey.split('-').map(Number);
  let guess = Date.UTC(year, month - 1, day);
  // Two passes handle normal offsets and the DST offset at the target midnight.
  for (let pass = 0; pass < 2; pass += 1) {
    guess = Date.UTC(year, month - 1, day) - getTimezoneOffsetMs(new Date(guess), timezone);
  }
  return guess;
};

export const getFlameTier = (streak) => {
  if (streak >= 100) return 7;
  if (streak >= 60) return 6;
  if (streak >= 30) return 5;
  if (streak >= 14) return 4;
  if (streak >= 7) return 3;
  if (streak >= 3) return 2;
  if (streak >= 1) return 1;
  return 0;
};

export const getFlameTierName = (tier) => ({
  0: 'Chưa thắp lửa',
  1: 'Spark',
  2: 'Growing Flame',
  3: 'Burning Flame',
  4: 'Blazing Flame',
  5: 'Mystic Flame',
  6: 'Eternal Flame',
  7: 'Legendary Flame',
}[tier] || 'Spark');

const calculateRuns = (dateKeys) => {
  let longest = 0;
  let run = 0;
  let previous = null;
  for (const dateKey of dateKeys) {
    run = previous && shiftDateKey(previous, 1) === dateKey ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = dateKey;
  }
  return { longest, latestRun: run, lastCompletedDate: previous || null };
};

export const calculateStreakRuns = (dateKeys) => calculateRuns([...new Set(dateKeys)].sort());

export const refreshLearningStreak = async (studentId, timezone = DEFAULT_TIMEZONE) => {
  const completedRows = await DailyLearningProgress.find({ student: studentId, completed: true })
    .select('localDate completedAt')
    .sort({ localDate: 1 })
    .lean();
  const dateKeys = [...new Set(completedRows.map((row) => row.localDate))];
  const runs = calculateRuns(dateKeys);
  const now = new Date();
  const todayKey = getDateKeyInTimezone(now, timezone);
  const yesterdayKey = shiftDateKey(todayKey, -1);
  const currentStreak = runs.lastCompletedDate === todayKey || runs.lastCompletedDate === yesterdayKey
    ? runs.latestRun
    : 0;
  const previous = await LearningStreak.findOne({ student: studentId }).lean();
  const previousMilestones = new Map((previous?.milestones || []).map((item) => [item.days, item.unlockedAt]));
  const milestones = STREAK_MILESTONES
    .filter((days) => (previousMilestones.has(days) || currentStreak >= days))
    .map((days) => ({ days, unlockedAt: previousMilestones.get(days) || now }));
  const newlyUnlockedMilestones = STREAK_MILESTONES.filter(
    (days) => currentStreak >= days && !previousMilestones.has(days),
  );
  const streak = await LearningStreak.findOneAndUpdate(
    { student: studentId },
    {
      $set: {
        currentStreak,
        longestStreak: Math.max(previous?.longestStreak || 0, runs.longest),
        lastCompletedDate: runs.lastCompletedDate,
        totalCompletedDays: dateKeys.length,
        currentTier: getFlameTier(currentStreak),
        timezone,
        milestones,
      },
      $setOnInsert: { student: studentId },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();
  return {
    currentStreak,
    longestStreak: streak.longestStreak,
    lastCompletedDate: streak.lastCompletedDate,
    totalCompletedDays: streak.totalCompletedDays,
    currentTier: streak.currentTier,
    tierName: getFlameTierName(streak.currentTier),
    milestones: streak.milestones || [],
    newlyUnlockedMilestones,
  };
};

const incrementLegacyDailyStudy = async ({ studentId, dateKey, seconds, at }) => {
  if (!seconds) return;
  await StudentDailyStudy.updateOne(
    { _id: `${studentId}:${dateKey}` },
    {
      $inc: { activeSeconds: seconds },
      $set: { lastActiveAt: at },
      $setOnInsert: { student: studentId, dateKey },
    },
    { upsert: true },
  );
};

export const creditValidatedInterval = async ({
  studentId,
  activityType = 'lesson',
  seconds,
  intervalStart,
  intervalEnd,
  timezone = DEFAULT_TIMEZONE,
}) => {
  const totalSeconds = Math.max(0, Math.floor(Number(seconds) || 0));
  if (!totalSeconds) return { addedSeconds: 0, completedToday: false, streak: null };
  const startMs = new Date(intervalStart).getTime();
  const endMs = new Date(intervalEnd).getTime();
  const elapsedMs = Math.max(0, endMs - startMs);
  const effectiveStart = Number.isFinite(startMs) ? new Date(startMs) : new Date(endMs);
  const effectiveEnd = Number.isFinite(endMs) ? new Date(endMs) : new Date();
  const startKey = getDateKeyInTimezone(effectiveStart, timezone);
  const endKey = getDateKeyInTimezone(effectiveEnd, timezone);
  const buckets = startKey === endKey || elapsedMs <= 0
    ? [{ dateKey: endKey, seconds: totalSeconds }]
    : (() => {
      const boundary = new Date(getUtcTimeForLocalMidnight(endKey, timezone));
      // The ratio is based on the real UTC interval; dateKey conversion is what
      // makes this correct for DST-aware timezones as well as Ho Chi Minh.
      const before = Math.max(0, Math.round(totalSeconds * Math.min(1, Math.max(0, (boundary.getTime() - startMs) / elapsedMs))));
      return [
        ...(before ? [{ dateKey: startKey, seconds: before }] : []),
        ...(totalSeconds - before ? [{ dateKey: endKey, seconds: totalSeconds - before }] : []),
      ];
    })();

  let completedToday = false;
  let streak = null;
  for (const bucket of buckets) {
    const id = `${studentId}:${bucket.dateKey}`;
    await DailyLearningProgress.updateOne(
      { _id: id },
      {
        $inc: {
          validStudySeconds: bucket.seconds,
          [`activitySeconds.${activityType}`]: bucket.seconds,
        },
        $set: { timezone },
        $setOnInsert: {
          _id: id,
          student: studentId,
          localDate: bucket.dateKey,
          targetSeconds: DAILY_TARGET_SECONDS,
          completed: false,
        },
      },
      { upsert: true },
    );

    const daily = await DailyLearningProgress.findOneAndUpdate(
      { _id: id, completed: false, validStudySeconds: { $gte: DAILY_TARGET_SECONDS } },
      { $set: { completed: true, completedAt: new Date() } },
      { new: true },
    ).lean();
    if (daily) {
      completedToday = true;
      streak = await refreshLearningStreak(studentId, timezone);
    }
    await incrementLegacyDailyStudy({
      studentId,
      dateKey: bucket.dateKey,
      seconds: bucket.seconds,
      at: effectiveEnd,
    });
  }
  return { addedSeconds: totalSeconds, completedToday, streak };
};

export const getDailyProgress = async (studentId, dateKey, timezone = DEFAULT_TIMEZONE) => {
  const row = await DailyLearningProgress.findOne({ _id: `${studentId}:${dateKey}` }).lean();
  const validStudySeconds = row?.validStudySeconds || 0;
  return {
    dateKey,
    timezone,
    validStudySeconds,
    targetSeconds: DAILY_TARGET_SECONDS,
    remainingSeconds: Math.max(0, DAILY_TARGET_SECONDS - validStudySeconds),
    completed: Boolean(row?.completed || validStudySeconds >= DAILY_TARGET_SECONDS),
    completedAt: row?.completedAt || null,
    activitySeconds: row?.activitySeconds || {},
  };
};

export const getLearningStreakOverview = async (studentId, timezone = DEFAULT_TIMEZONE) => {
  const todayKey = getDateKeyInTimezone(new Date(), timezone);
  const dailyProgress = await getDailyProgress(studentId, todayKey, timezone);
  const streak = await refreshLearningStreak(studentId, timezone);
  const firstKey = shiftDateKey(todayKey, -34);
  const rows = await DailyLearningProgress.find({ student: studentId, localDate: { $gte: firstKey, $lte: todayKey } })
    .select('localDate validStudySeconds targetSeconds completed completedAt activitySeconds')
    .sort({ localDate: 1 })
    .lean();
  const rowMap = new Map(rows.map((row) => [row.localDate, row]));
  const calendar = Array.from({ length: 35 }, (_, index) => {
    const localDate = shiftDateKey(firstKey, index);
    const row = rowMap.get(localDate);
    return {
      dateKey: localDate,
      validStudySeconds: row?.validStudySeconds || 0,
      completed: Boolean(row?.completed),
      status: localDate > todayKey ? 'future' : row?.completed ? 'completed' : row ? 'incomplete' : 'no_data',
      completedAt: row?.completedAt || null,
    };
  });
  const totalStudy = await DailyLearningProgress.aggregate([
    { $match: { student: studentId } },
    { $group: { _id: null, totalValidStudySeconds: { $sum: '$validStudySeconds' } } },
  ]);
  const nextMilestone = STREAK_MILESTONES.find((days) => days > streak.currentStreak) || null;
  return {
    timezone,
    today: dailyProgress,
    streak: {
      ...streak,
      nextMilestone,
      progressToNextMilestone: nextMilestone ? Math.min(100, Math.round((streak.currentStreak / nextMilestone) * 100)) : 100,
    },
    calendar,
    milestones: STREAK_MILESTONES.map((days) => ({
      days,
      unlocked: streak.milestones.some((item) => item.days === days),
      unlockedAt: streak.milestones.find((item) => item.days === days)?.unlockedAt || null,
    })),
    totalValidStudySeconds: totalStudy[0]?.totalValidStudySeconds || 0,
  };
};
