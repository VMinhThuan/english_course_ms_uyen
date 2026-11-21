import crypto from 'node:crypto';
import mongoose from 'mongoose';
import Vocabulary from '../models/Vocabulary.js';
import DailyVocabularyChallenge from '../models/DailyVocabularyChallenge.js';
import VocabularyStreak from '../models/VocabularyStreak.js';
import VocabularyQuestProgress from '../models/VocabularyQuestProgress.js';
import VocabularyQuestAttempt from '../models/VocabularyQuestAttempt.js';
import GamificationAchievement from '../models/GamificationAchievement.js';
import {
  calculateStreak,
  classifyVocabularyLevel,
  GAMIFICATION_TIMEZONE,
  getDateKey,
  normalizeAnswer,
  normalizeTimezone,
  QUEST_LEVELS,
  starsForAccuracy,
  streakBadgeCodes,
} from '../utils/gamificationUtils.js';

const DAILY_WORD_COUNT = 20;
const QUEST_QUESTION_COUNT = 10;
const QUEST_TIME_LIMIT_SECONDS = 120;
const VOCABULARY_PROJECTION = 'word meaning partOfSpeech explanation example exampleEnglish exampleVietnamese topic order createdAt';

function randomId() {
  return crypto.randomBytes(8).toString('hex');
}

function shuffle(items) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = crypto.randomInt(index + 1);
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function vocabularyFilter() {
  return {
    $or: [
      { catalogOnly: { $ne: true }, status: 'published' },
      { catalogOnly: true, catalogStatus: 'published' },
    ],
  };
}

async function getVocabularyPool() {
  const rows = await Vocabulary.find(vocabularyFilter())
    .select(VOCABULARY_PROJECTION)
    .sort({ order: 1, createdAt: 1, _id: 1 })
    .lean();
  return rows.map((row, index) => ({
    ...row,
    level: classifyVocabularyLevel(row, index, rows.length),
  }));
}

function textForWord(row) {
  return row.meaning || row.explanation || row.word;
}

function makeOptions(target, pool, field, count = 4) {
  const distractors = shuffle(pool.filter((row) => String(row._id) !== String(target._id)
    && String(row[field] || '').trim()
    && String(row[field]).trim() !== String(target[field]).trim()))
    .slice(0, Math.max(0, count - 1));
  return shuffle([target, ...distractors]).map((row, index) => ({
    id: String(index),
    text: String(row[field] || row.word),
    vocabularyId: String(row._id),
  }));
}

function makeDailyQuestion(row, pool, index) {
  const type = ['multiple_choice', 'fill_blank', 'recognition'][index % 3];
  if (type === 'recognition') {
    const options = makeOptions(row, pool, 'word');
    const answer = options.find((option) => option.vocabularyId === String(row._id));
    return {
      questionId: `daily-${index}-${randomId()}`,
      vocabularyId: row._id,
      type,
      prompt: `Từ nào có nghĩa “${textForWord(row)}”?`,
      sentence: '', options, answer: answer?.id || '0',
    };
  }
  if (type === 'fill_blank') {
    const sourceSentence = row.exampleEnglish || row.example || '';
    const sentence = sourceSentence
      ? sourceSentence.replace(new RegExp(row.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), '_____')
      : `Chọn từ phù hợp với nghĩa “${textForWord(row)}”.`;
    const options = makeOptions(row, pool, 'word');
    const answer = options.find((option) => option.vocabularyId === String(row._id));
    return {
      questionId: `daily-${index}-${randomId()}`,
      vocabularyId: row._id,
      type,
      prompt: sentence,
      sentence,
      options, answer: answer?.id || '0',
    };
  }
  const options = makeOptions(row, pool, 'meaning');
  const answer = options.find((option) => option.vocabularyId === String(row._id));
  return {
    questionId: `daily-${index}-${randomId()}`,
    vocabularyId: row._id,
    type,
    prompt: `“${row.word}” có nghĩa là gì?`,
    sentence: '', options, answer: answer?.id || '0',
  };
}

function makeQuestQuestion(row, pool, index, level) {
  const modes = ['multiple_choice', 'match', 'fill_blank', 'timed'];
  const mode = modes[index % modes.length];
  const base = makeDailyQuestion(row, pool, index);
  return {
    questionId: `quest-${level}-${index}-${randomId()}`,
    vocabularyId: row._id,
    mode,
    prompt: mode === 'match' ? `Ghép từ “${row.word}” với nghĩa đúng.` : base.prompt,
    sentence: base.sentence,
    options: base.options,
    answer: base.answer,
  };
}

function safeQuestion(question) {
  return {
    questionId: question.questionId,
    vocabularyId: String(question.vocabularyId),
    type: question.type,
    ...(question.mode ? { mode: question.mode } : {}),
    prompt: question.prompt,
    sentence: question.sentence || '',
    options: (question.options || []).map(({ id, text }) => ({ id, text })),
  };
}

function safeChallenge(challenge) {
  return {
    id: String(challenge._id),
    dateKey: challenge.dateKey,
    status: challenge.status,
    totalWords: challenge.totalWords,
    correctCount: challenge.correctCount,
    accuracy: challenge.accuracy,
    completedVocabularyIds: (challenge.completedVocabularyIds || []).map(String),
    completedAt: challenge.completedAt,
    questions: challenge.questions.map(safeQuestion),
  };
}

function safeQuestAttempt(attempt) {
  return {
    id: String(attempt._id), level: attempt.level, stage: attempt.stage,
    status: attempt.status, score: attempt.score, accuracy: attempt.accuracy,
    passed: attempt.passed, stars: attempt.stars, timedOut: Boolean(attempt.timedOut),
    timeLimitSeconds: attempt.timeLimitSeconds, expiresAt: attempt.expiresAt,
    savedAnswers: (attempt.answers || []).map(({ questionId, answer }) => ({ questionId, answer })),
    questions: attempt.questions.map(safeQuestion),
    submittedAt: attempt.submittedAt,
  };
}

async function ensureStreak(student, timezone = GAMIFICATION_TIMEZONE) {
  let streak = await VocabularyStreak.findOne({ student });
  if (!streak) {
    try {
      streak = await VocabularyStreak.create({ student, timezone: normalizeTimezone(timezone) });
    } catch (error) {
      if (error?.code !== 11000) throw error;
      streak = await VocabularyStreak.findOne({ student });
    }
  }
  return streak;
}

async function ensureQuestProgress(student) {
  let progress = await VocabularyQuestProgress.findOne({ student });
  if (!progress) {
    try {
      progress = await VocabularyQuestProgress.create({
        student,
        levels: QUEST_LEVELS.map(({ level }) => ({ level, unlocked: level === 1 })),
      });
    } catch (error) {
      if (error?.code !== 11000) throw error;
      progress = await VocabularyQuestProgress.findOne({ student });
    }
  }
  return progress;
}

async function awardStreakBadges(student, currentStreak) {
  await Promise.all(streakBadgeCodes(currentStreak).map((code) => {
    const day = Number(code.replace('STREAK_', ''));
    return GamificationAchievement.updateOne(
      { student, code },
      { $setOnInsert: { student, code, title: `Chuỗi ${day} ngày` } },
    { upsert: true },
    );
  }));
}

async function completeStreakDay(student, dateKey, timezone) {
  await ensureStreak(student, timezone);
  await VocabularyStreak.updateOne(
    { student },
    { $setOnInsert: { timezone }, $addToSet: { completedDates: dateKey }, $set: { lastCompletedDateKey: dateKey } },
    { upsert: true },
  );
  const refreshed = await ensureStreak(student, timezone);
  const calculation = calculateStreak(refreshed.completedDates, dateKey);
  refreshed.currentStreak = calculation.currentStreak;
  refreshed.longestStreak = Math.max(refreshed.longestStreak, calculation.longestStreak);
  refreshed.badges = [...new Set([...(refreshed.badges || []), ...streakBadgeCodes(refreshed.currentStreak)])];
  refreshed.timezone = refreshed.timezone || timezone;
  await refreshed.save();
  await awardStreakBadges(student, refreshed.currentStreak);
  return refreshed;
}

async function applyQuestCompletionsToDailyChallenge(student, attemptId, answers) {
  const correctAnswers = answers.filter((answer) => answer.isCorrect);
  if (!correctAnswers.length) return;
  const streak = await ensureStreak(student);
  const dateKey = getDateKey(new Date(), streak.timezone);
  const challenge = await DailyVocabularyChallenge.findOne({ student, dateKey, status: 'in_progress' });
  if (!challenge) return;
  const dailyVocabularyIds = new Set(challenge.questions.map((question) => String(question.vocabularyId)));

  for (const answer of correctAnswers.filter((item) => dailyVocabularyIds.has(String(item.vocabularyId)))) {
    const updated = await DailyVocabularyChallenge.findOneAndUpdate(
      { _id: challenge._id, status: 'in_progress', completedVocabularyIds: { $ne: answer.vocabularyId } },
      {
        $push: { responses: { vocabularyId: answer.vocabularyId, questionId: `quest:${attemptId}:${answer.questionId}`, answer: answer.answer, isCorrect: true } },
        $addToSet: { completedVocabularyIds: answer.vocabularyId },
        $inc: { correctCount: 1 },
      },
      { new: true },
    );
    if (updated && updated.correctCount >= updated.totalWords) {
      const completed = await DailyVocabularyChallenge.findOneAndUpdate(
        { _id: updated._id, status: 'in_progress', correctCount: { $gte: updated.totalWords } },
        { $set: { status: 'completed', completedAt: new Date(), accuracy: Math.round((updated.correctCount / updated.totalWords) * 100) } },
        { new: true },
      );
      if (completed) await completeStreakDay(student, completed.dateKey, completed.timezone);
    }
  }
}

export async function getGamificationOverview(student, requestedTimezone) {
  const streak = await ensureStreak(student, requestedTimezone);
  const timezone = normalizeTimezone(streak.timezone || requestedTimezone);
  const todayKey = getDateKey(new Date(), timezone);
  const liveStreak = calculateStreak(streak.completedDates, todayKey);
  if (streak.currentStreak !== liveStreak.currentStreak) {
    streak.currentStreak = liveStreak.currentStreak;
    streak.longestStreak = Math.max(streak.longestStreak, liveStreak.longestStreak);
    await streak.save();
  }
  const challenge = await DailyVocabularyChallenge.findOne({ student, dateKey: todayKey });
  const progress = await ensureQuestProgress(student);
  const history = await DailyVocabularyChallenge.find({ student })
    .select('dateKey status correctCount totalWords accuracy completedAt')
    .sort({ dateKey: -1 }).limit(42).lean();
  const attempts = await VocabularyQuestAttempt.find({ student, status: 'submitted' })
    .select('level score accuracy passed stars createdAt').sort({ createdAt: -1 }).limit(20).lean();
  const activeAttempt = await VocabularyQuestAttempt.findOne({ student, status: 'in_progress' })
    .sort({ createdAt: -1 });
  const dailyTotals = await DailyVocabularyChallenge.aggregate([
    { $match: { student: new mongoose.Types.ObjectId(student), status: 'completed' } },
    { $group: { _id: null, correct: { $sum: '$correctCount' }, total: { $sum: '$totalWords' } } },
  ]);
  const questTotalsAggregation = await VocabularyQuestAttempt.aggregate([
    { $match: { student: new mongoose.Types.ObjectId(student), status: 'submitted' } },
    { $group: { _id: null, correct: { $sum: '$correctCount' }, total: { $sum: '$totalQuestions' } } },
  ]);
  const questTotals = questTotalsAggregation[0] || { correct: 0, total: 0 };
  const dailyTotal = dailyTotals[0] || { correct: 0, total: 0 };
  const combinedTotal = dailyTotal.total + questTotals.total;
  const combinedCorrect = dailyTotal.correct + questTotals.correct;
  return {
    today: { dateKey: todayKey, challenge: challenge ? safeChallenge(challenge) : null },
    streak: {
      current: liveStreak.currentStreak,
      longest: streak.longestStreak,
      completedDates: streak.completedDates,
      badges: streak.badges,
      timezone,
    },
    history,
    achievements: await GamificationAchievement.find({ student }).sort({ earnedAt: -1 }).lean(),
    statistics: {
      dailyCompletedWords: dailyTotal.correct,
      overallAccuracy: combinedTotal ? Math.round((combinedCorrect / combinedTotal) * 100) : 0,
      questAttempts: attempts.length,
    },
    quest: {
      currentLevel: progress.levels.find((item) => item.unlocked && !item.completed)?.level
        || progress.levels.find((item) => item.unlocked)?.level || 1,
      levels: QUEST_LEVELS.map((definition) => ({
        ...definition,
        ...(progress.levels.find((item) => item.level === definition.level)?.toObject?.()
          || progress.levels.find((item) => item.level === definition.level)
          || { level: definition.level, unlocked: definition.level === 1 }),
      })),
      recentAttempts: attempts,
      activeAttempt: activeAttempt ? safeQuestAttempt(activeAttempt) : null,
    },
  };
}

export async function startDailyChallenge(student, requestedTimezone) {
  const streak = await ensureStreak(student, requestedTimezone);
  const timezone = normalizeTimezone(streak.timezone || requestedTimezone);
  const dateKey = getDateKey(new Date(), timezone);
  const existing = await DailyVocabularyChallenge.findOne({ student, dateKey });
  if (existing) return safeChallenge(existing);
  const pool = await getVocabularyPool();
  if (pool.length < DAILY_WORD_COUNT) {
    const error = new Error('Chưa có đủ 20 từ vựng đã xuất bản để mở thử thách hôm nay.');
    error.statusCode = 409; error.code = 'INSUFFICIENT_VOCABULARY'; throw error;
  }
  const questions = shuffle(pool).slice(0, DAILY_WORD_COUNT).map((row, index) => makeDailyQuestion(row, pool, index));
  try {
    const challenge = await DailyVocabularyChallenge.create({ student, dateKey, timezone, questions });
    return safeChallenge(challenge);
  } catch (error) {
    if (error?.code === 11000) return safeChallenge(await DailyVocabularyChallenge.findOne({ student, dateKey }));
    throw error;
  }
}

export async function answerDailyChallenge(student, challengeId, questionId, answer) {
  const challenge = await DailyVocabularyChallenge.findOne({ _id: challengeId, student }).select('+questions.answer');
  if (!challenge) { const error = new Error('Không tìm thấy thử thách.'); error.statusCode = 404; throw error; }
  const question = challenge.questions.find((item) => item.questionId === questionId);
  if (!question) { const error = new Error('Câu hỏi không hợp lệ.'); error.statusCode = 400; throw error; }
  if (challenge.status === 'completed') return { challenge: safeChallenge(challenge), isCorrect: false, alreadyCompleted: true };
  const submitted = normalizeAnswer(answer);
  const isCorrect = submitted === normalizeAnswer(question.answer);
  const response = { vocabularyId: question.vocabularyId, questionId, answer: String(answer ?? '').slice(0, 200), isCorrect };
  let updated;
  if (isCorrect) {
    updated = await DailyVocabularyChallenge.findOneAndUpdate(
      { _id: challengeId, student, status: 'in_progress', completedVocabularyIds: { $ne: question.vocabularyId } },
      { $push: { responses: response }, $addToSet: { completedVocabularyIds: question.vocabularyId }, $inc: { correctCount: 1 } },
      { new: true },
    ).select('+questions.answer');
    if (!updated) {
      updated = await DailyVocabularyChallenge.findOne({ _id: challengeId, student }).select('+questions.answer');
      return { challenge: safeChallenge(updated), isCorrect: true, alreadyCompleted: true };
    }
  } else {
    updated = await DailyVocabularyChallenge.findOneAndUpdate(
      { _id: challengeId, student, status: 'in_progress' },
      { $push: { responses: response } }, { new: true },
    ).select('+questions.answer');
  }
  if (updated.correctCount >= updated.totalWords && updated.status === 'in_progress') {
    const completed = await DailyVocabularyChallenge.findOneAndUpdate(
      { _id: challengeId, student, status: 'in_progress', correctCount: { $gte: updated.totalWords } },
      { $set: { status: 'completed', completedAt: new Date(), accuracy: Math.round((updated.correctCount / updated.totalWords) * 100) } },
      { new: true },
    ).select('+questions.answer');
    if (completed) {
      await completeStreakDay(student, completed.dateKey, completed.timezone);
      updated = completed;
    }
  }
  return { challenge: safeChallenge(updated), isCorrect, completed: updated.status === 'completed' };
}

export async function startQuestAssessment(student, level, stage = 1) {
  const numericLevel = Number(level); const numericStage = Number(stage);
  if (!QUEST_LEVELS.some((item) => item.level === numericLevel) || numericStage < 1 || numericStage > 4) {
    const error = new Error('Cấp độ hoặc chặng chơi không hợp lệ.'); error.statusCode = 400; throw error;
  }
  const progress = await ensureQuestProgress(student);
  const levelProgress = progress.levels.find((item) => item.level === numericLevel);
  if (!levelProgress?.unlocked) { const error = new Error('Cấp độ này chưa được mở khóa.'); error.statusCode = 403; error.code = 'QUEST_LEVEL_LOCKED'; throw error; }
  const existingAttempt = await VocabularyQuestAttempt.findOne({ student, level: numericLevel, stage: numericStage, status: 'in_progress' }).sort({ createdAt: -1 });
  if (existingAttempt) return safeQuestAttempt(existingAttempt);
  const allPool = await getVocabularyPool();
  const levelPool = allPool.filter((row) => row.level === numericLevel);
  if (levelPool.length < QUEST_QUESTION_COUNT) { const error = new Error('Cấp độ này chưa có đủ dữ liệu từ vựng để mở bài chơi.'); error.statusCode = 409; error.code = 'INSUFFICIENT_LEVEL_VOCABULARY'; throw error; }
  const questions = shuffle(levelPool).slice(0, QUEST_QUESTION_COUNT).map((row, index) => makeQuestQuestion(row, levelPool, index, numericLevel));
  const attempt = await VocabularyQuestAttempt.create({
    student, level: numericLevel, stage: numericStage, questions,
    timeLimitSeconds: QUEST_TIME_LIMIT_SECONDS,
    expiresAt: new Date(Date.now() + QUEST_TIME_LIMIT_SECONDS * 1000),
  });
  return safeQuestAttempt(attempt);
}

export async function saveQuestAnswer(student, attemptId, questionId, answer) {
  const attempt = await VocabularyQuestAttempt.findOne({ _id: attemptId, student, status: 'in_progress' });
  if (!attempt) { const error = new Error('Lượt chơi không còn hoạt động.'); error.statusCode = 404; throw error; }
  if (attempt.expiresAt && attempt.expiresAt <= new Date()) { const error = new Error('Lượt chơi đã hết thời gian.'); error.statusCode = 409; error.code = 'QUEST_TIME_EXPIRED'; throw error; }
  if (!attempt.questions.some((question) => question.questionId === questionId)) { const error = new Error('Câu hỏi không hợp lệ.'); error.statusCode = 400; throw error; }
  const value = String(answer ?? '').slice(0, 200);
  const updated = await VocabularyQuestAttempt.findOneAndUpdate(
    { _id: attemptId, student, status: 'in_progress', 'answers.questionId': questionId },
    { $set: { 'answers.$.answer': value } }, { new: true },
  );
  if (updated) return safeQuestAttempt(updated);
  return safeQuestAttempt(await VocabularyQuestAttempt.findOneAndUpdate(
    { _id: attemptId, student, status: 'in_progress' },
    { $push: { answers: { questionId, answer: value } } }, { new: true },
  ));
}

export async function submitQuestAssessment(student, attemptId, submittedAnswers) {
  let attempt = await VocabularyQuestAttempt.findOne({ _id: attemptId, student }).select('+questions.answer');
  if (!attempt) { const error = new Error('Không tìm thấy lượt chơi.'); error.statusCode = 404; throw error; }
  if (attempt.status === 'submitted') return safeQuestAttempt(attempt);
  if (!Array.isArray(submittedAnswers) || submittedAnswers.length !== attempt.questions.length) {
    const error = new Error('Vui lòng hoàn thành tất cả câu hỏi trước khi nộp bài.'); error.statusCode = 400; throw error;
  }
  const answerMap = new Map(submittedAnswers.map((item) => [String(item.questionId), item.answer]));
  const answers = attempt.questions.map((question) => {
    const answer = answerMap.get(question.questionId);
    return {
      questionId: question.questionId,
      vocabularyId: question.vocabularyId,
      answer: String(answer ?? '').slice(0, 200),
      isCorrect: normalizeAnswer(answer) === normalizeAnswer(question.answer),
    };
  });
  const timedOut = Boolean(attempt.expiresAt && attempt.expiresAt <= new Date());
  const scoredAnswers = timedOut ? answers.map((item) => ({ ...item, isCorrect: false })) : answers;
  const scoredCorrectCount = scoredAnswers.filter((item) => item.isCorrect).length;
  const accuracy = Math.round((scoredCorrectCount / attempt.questions.length) * 100);
  const passed = accuracy >= 80;
  const stars = starsForAccuracy(accuracy);
  const submittedAt = new Date();
  const persisted = await VocabularyQuestAttempt.findOneAndUpdate(
    { _id: attemptId, student, status: 'in_progress' },
    { $set: { answers: scoredAnswers, score: scoredCorrectCount * 10, correctCount: scoredCorrectCount, totalQuestions: attempt.questions.length, accuracy, passed, stars, timedOut, status: 'submitted', submittedAt } },
    { new: true },
  ).select('+questions.answer');
  if (!persisted) {
    const alreadySubmitted = await VocabularyQuestAttempt.findOne({ _id: attemptId, student }).select('+questions.answer');
    return safeQuestAttempt(alreadySubmitted);
  }
  attempt = persisted;
  await applyQuestCompletionsToDailyChallenge(student, attemptId, scoredAnswers);
  const progressUpdate = {
    $inc: { 'levels.$[current].attempts': 1 },
    $max: { 'levels.$[current].bestAccuracy': accuracy, 'levels.$[current].bestScore': attempt.score, 'levels.$[current].stars': stars },
  };
  if (passed) {
    progressUpdate.$set = {
      'levels.$[current].completed': true,
      'levels.$[current].completedAt': new Date(),
      'levels.$[next].unlocked': true,
      'levels.$[next].unlockedAt': new Date(),
    };
    progressUpdate.$addToSet = { 'levels.$[current].completedStages': attempt.stage };
    await GamificationAchievement.updateOne(
      { student, code: `QUEST_LEVEL_${attempt.level}` },
      { $setOnInsert: { student, code: `QUEST_LEVEL_${attempt.level}`, title: `Hoàn thành cấp ${attempt.level}` } },
      { upsert: true },
    );
  }
  await VocabularyQuestProgress.updateOne(
    { student }, progressUpdate,
    { arrayFilters: [{ 'current.level': attempt.level }, { 'next.level': attempt.level + 1 }] },
  );
  return safeQuestAttempt(attempt);
}
