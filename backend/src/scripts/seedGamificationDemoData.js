import dotenv from 'dotenv';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import User from '../models/User.js';
import Vocabulary from '../models/Vocabulary.js';
import GamificationConfig from '../models/GamificationConfig.js';
import DailyVocabularyChallenge from '../models/DailyVocabularyChallenge.js';
import VocabularyStreak from '../models/VocabularyStreak.js';
import VocabularyQuestAttempt from '../models/VocabularyQuestAttempt.js';
import VocabularyQuestProgress from '../models/VocabularyQuestProgress.js';
import { updateGamificationConfig } from '../services/gamificationConfigService.js';
import { getDateKey } from '../utils/gamificationUtils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const backendRoot = join(__dirname, '../..');
dotenv.config({ path: join(backendRoot, '.env') });

const DEMO_EMAIL = 'minigame.demo@toeicmsuyen.vn';
const DEMO_USERNAME = 'minigame_demo';
const DEMO_PASSWORD = 'Demo@Password123';
const WORDS_PER_STAGE = 10;
const STAGE_COUNT = 16;
const TOTAL_WORDS = WORDS_PER_STAGE * STAGE_COUNT;
const PUBLISHED_VOCABULARY_FILTER = {
  $or: [
    { catalogOnly: { $ne: true }, status: 'published' },
    { catalogOnly: true, catalogStatus: 'published' },
  ],
};

const applying = process.argv.includes('--apply');
const dryRun = process.argv.includes('--dry-run') || !applying;

const daysAgo = (days) => new Date(Date.now() - days * 24 * 60 * 60 * 1000);

const makeOptions = (target, pool) => {
  const distractors = pool
    .filter((item) => String(item._id) !== String(target._id))
    .slice(0, 3);
  const options = [target, ...distractors].map((item, index) => ({
    id: String(index),
    text: item.meaning,
    vocabularyId: item._id,
  }));
  return { options, answer: '0' };
};

const makeDailyQuestions = (vocabulary) => vocabulary.map((item, index) => {
  const { options, answer } = makeOptions(item, vocabulary.slice(index + 1).concat(vocabulary.slice(0, index)));
  return {
    questionId: `demo-daily-${index + 1}`,
    vocabularyId: item._id,
    type: index % 3 === 0 ? 'recognition' : 'multiple_choice',
    prompt: `Từ “${item.word}” có nghĩa là gì?`,
    sentence: item.exampleEnglish || '',
    options,
    answer,
  };
});

const makeQuestQuestions = (vocabulary, level, stage) => vocabulary.map((item, index) => {
  const { options, answer } = makeOptions(item, vocabulary.slice(index + 1).concat(vocabulary.slice(0, index)));
  return {
    questionId: `demo-quest-${level}-${stage}-${index + 1}`,
    vocabularyId: item._id,
    mode: ['multiple_choice', 'match', 'fill_blank', 'timed'][index % 4],
    prompt: `Chọn nghĩa phù hợp với từ “${item.word}”.`,
    sentence: item.exampleEnglish || '',
    options,
    answer,
  };
});

const buildStageAssignments = (vocabulary) => {
  const assignments = [];
  let offset = 0;
  for (let level = 1; level <= 4; level += 1) {
    for (let stage = 1; stage <= 4; stage += 1) {
      const words = vocabulary.slice(offset, offset + WORDS_PER_STAGE);
      assignments.push({ level, stage, vocabularyIds: words.map((item) => item._id) });
      offset += WORDS_PER_STAGE;
    }
  }
  return assignments;
};

const assignmentSummary = (assignments) => assignments.map((item) => ({
  level: item.level,
  stage: item.stage,
  count: item.vocabularyIds.length,
}));

async function ensureDemoStudent() {
  const password = await bcrypt.hash(DEMO_PASSWORD, 10);
  return User.findOneAndUpdate(
    { email: DEMO_EMAIL },
    {
      $setOnInsert: {
        email: DEMO_EMAIL,
        username: DEMO_USERNAME,
        password,
        fullName: 'Học viên Demo Mini Game',
        groupName: 'Lớp Demo Gamification',
        role: 'student',
        status: 'active',
        isActive: true,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
}

async function ensureAdmin() {
  const admin = await User.findOne({ role: 'admin', status: { $ne: 'rejected' } }).select('_id').lean();
  if (!admin) throw new Error('Không tìm thấy tài khoản admin để ghi lịch sử cấu hình Mini Game.');
  return admin;
}

async function seedActivity(demoStudent, stageAssignments) {
  await Promise.all([
    DailyVocabularyChallenge.deleteMany({ student: demoStudent._id }),
    VocabularyStreak.deleteMany({ student: demoStudent._id }),
    VocabularyQuestAttempt.deleteMany({ student: demoStudent._id }),
    VocabularyQuestProgress.deleteMany({ student: demoStudent._id }),
  ]);

  const assignedWords = stageAssignments.flatMap((assignment) => assignment.vocabularyIds);
  const vocabularyById = new Map((await Vocabulary.find({ _id: { $in: assignedWords } }).lean()).map((item) => [String(item._id), item]));
  const todayKey = getDateKey(new Date(), 'Asia/Ho_Chi_Minh');
  const dailyVocabulary = assignedWords.slice(0, 20).map((id) => vocabularyById.get(String(id))).filter(Boolean);
  const dailyQuestions = makeDailyQuestions(dailyVocabulary);

  await DailyVocabularyChallenge.create({
    student: demoStudent._id,
    dateKey: todayKey,
    timezone: 'Asia/Ho_Chi_Minh',
    status: 'completed',
    totalWords: 20,
    correctCount: 18,
    questions: dailyQuestions,
    responses: dailyQuestions.map((question, index) => ({
      vocabularyId: question.vocabularyId,
      questionId: question.questionId,
      answer: question.answer,
      isCorrect: index < 18,
      answeredAt: daysAgo(0),
    })),
    completedVocabularyIds: dailyVocabulary.slice(0, 18).map((item) => item._id),
    accuracy: 90,
    startedAt: daysAgo(0),
    completedAt: daysAgo(0),
  });

  await VocabularyStreak.create({
    student: demoStudent._id,
    timezone: 'Asia/Ho_Chi_Minh',
    currentStreak: 7,
    longestStreak: 7,
    completedDates: Array.from({ length: 7 }, (_, index) => getDateKey(daysAgo(index), 'Asia/Ho_Chi_Minh')),
    badges: ['STREAK_7'],
    lastCompletedDateKey: todayKey,
  });

  const accuracyByLevel = { 1: 90, 2: 85, 3: 75, 4: 65 };
  const attempts = [];
  for (const assignment of stageAssignments) {
    const words = assignment.vocabularyIds.map((id) => vocabularyById.get(String(id))).filter(Boolean);
    const questions = makeQuestQuestions(words, assignment.level, assignment.stage);
    const accuracy = accuracyByLevel[assignment.level];
    const correctCount = Math.round((questions.length * accuracy) / 100);
    attempts.push({
      student: demoStudent._id,
      level: assignment.level,
      stage: assignment.stage,
      questions,
      answers: questions.map((question, index) => ({
        questionId: question.questionId,
        vocabularyId: question.vocabularyId,
        answer: question.answer,
        isCorrect: index < correctCount,
      })),
      status: 'submitted',
      timeLimitSeconds: 120,
      expiresAt: daysAgo(8 - assignment.level),
      score: correctCount * 10,
      correctCount,
      totalQuestions: questions.length,
      accuracy,
      passed: accuracy >= 80,
      stars: accuracy >= 95 ? 3 : accuracy >= 90 ? 2 : accuracy >= 80 ? 1 : 0,
      startedAt: daysAgo(8 - assignment.level),
      submittedAt: daysAgo(8 - assignment.level),
      createdAt: daysAgo(8 - assignment.level),
      updatedAt: daysAgo(8 - assignment.level),
    });
  }
  await VocabularyQuestAttempt.insertMany(attempts);

  await VocabularyQuestProgress.create({
    student: demoStudent._id,
    levels: [
      { level: 1, unlocked: true, completed: true, bestAccuracy: 90, bestScore: 360, stars: 2, completedStages: [1, 2, 3, 4], attempts: 4, unlockedAt: daysAgo(12), completedAt: daysAgo(9) },
      { level: 2, unlocked: true, completed: true, bestAccuracy: 85, bestScore: 340, stars: 1, completedStages: [1, 2, 3, 4], attempts: 4, unlockedAt: daysAgo(9), completedAt: daysAgo(6) },
      { level: 3, unlocked: true, completed: false, bestAccuracy: 75, bestScore: 300, stars: 0, completedStages: [], attempts: 4, unlockedAt: daysAgo(6) },
      { level: 4, unlocked: false, completed: false, bestAccuracy: 65, bestScore: 260, stars: 0, completedStages: [], attempts: 4 },
    ],
  });
}

async function run() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI chưa được cấu hình trong backend/.env.');
  const target = new URL(process.env.MONGODB_URI);
  if (target.pathname.replace(/^\//, '') !== 'english_course') {
    throw new Error(`Từ chối chạy ngoài database english_course (đang là ${target.pathname || '(default)'}).`);
  }

  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
  const [admin, currentConfig] = await Promise.all([
    ensureAdmin(),
    GamificationConfig.findOne({ game: 'quest' }).lean(),
  ]);

  const currentAssignments = currentConfig?.questStages || [];
  const hasExistingAssignments = currentAssignments.some((item) => item.vocabularyIds?.length);
  if (hasExistingAssignments) {
    throw new Error('Quest đã có assignment vocabulary. Không ghi đè dữ liệu hiện tại. Hãy kiểm tra trên Admin Mini Game trước khi seed lại.');
  }

  const availableVocabulary = await Vocabulary.find({
    ...PUBLISHED_VOCABULARY_FILTER,
    toeicLevel: null,
  }).sort({ order: 1, createdAt: 1, _id: 1 }).limit(TOTAL_WORDS).lean();
  if (availableVocabulary.length < TOTAL_WORDS) {
    throw new Error(`Không đủ vocabulary chưa phân loại: cần ${TOTAL_WORDS}, hiện có ${availableVocabulary.length}.`);
  }

  const assignments = buildStageAssignments(availableVocabulary);
  const updates = assignments.flatMap(({ level, vocabularyIds }) => vocabularyIds.map((vocabularyId) => ({
    updateOne: {
      filter: { _id: vocabularyId, ...PUBLISHED_VOCABULARY_FILTER, toeicLevel: null },
      update: { $set: { toeicLevel: level } },
    },
  })));

  const report = {
    mode: dryRun ? 'dry-run' : 'apply',
    database: mongoose.connection.name,
    vocabularyAvailable: availableVocabulary.length,
    vocabularyToClassify: TOTAL_WORDS,
    stageAssignments: assignmentSummary(assignments),
    demoStudent: DEMO_EMAIL,
    demoPassword: DEMO_PASSWORD,
  };

  if (dryRun) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const writeResult = await Vocabulary.bulkWrite(updates, { ordered: true });
  await updateGamificationConfig('quest', {
    enabled: true,
    timeLimitSeconds: 120,
    stageAssignments: assignments,
  }, admin._id);
  await updateGamificationConfig('streak', { enabled: true }, admin._id);
  const demoStudent = await ensureDemoStudent();
  await seedActivity(demoStudent, assignments);

  const [savedConfig, classifiedCount] = await Promise.all([
    GamificationConfig.findOne({ game: 'quest' }).lean(),
    Vocabulary.countDocuments({ ...PUBLISHED_VOCABULARY_FILTER, toeicLevel: { $in: [1, 2, 3, 4] } }),
  ]);
  console.log(JSON.stringify({
    ...report,
    insertedOrUpdatedVocabulary: writeResult.modifiedCount,
    configuredStages: savedConfig?.questStages?.length || 0,
    classifiedPublishedVocabulary: classifiedCount,
    activitySeeded: true,
  }, null, 2));
}

try {
  await run();
} catch (error) {
  console.error(`Gamification demo seed failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect().catch(() => {});
}
