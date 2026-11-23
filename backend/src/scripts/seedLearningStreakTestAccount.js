import dotenv from 'dotenv';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import User from '../models/User.js';
import DailyLearningProgress from '../models/DailyLearningProgress.js';
import LearningStreak from '../models/LearningStreak.js';
import StudentDailyStudy from '../models/StudentDailyStudy.js';
import {
  getDateKeyInTimezone,
  refreshLearningStreak,
  shiftDateKey,
} from '../services/learningStreakService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../../.env') });

const EXPECTED_DATABASE = 'english_course';
const TIMEZONE = 'Asia/Ho_Chi_Minh';
const TARGET_SECONDS = 900;
const email = String(process.env.STREAK_TEST_EMAIL || 'streak.qa@msuyen.local').trim().toLowerCase();
const username = String(process.env.STREAK_TEST_USERNAME || 'streak_qa').trim().toLowerCase();
const password = String(process.env.STREAK_TEST_PASSWORD || 'Streak@2026!');
const completedDays = Math.max(1, Math.min(100, Number(process.env.STREAK_TEST_DAYS || 14)));

const assertSafeTarget = (mongoUri) => {
  if (!mongoUri) throw new Error('MONGODB_URI is required. No database changes were made.');
  const parsed = new URL(mongoUri);
  const databaseName = parsed.pathname.replace(/^\//, '');
  if (databaseName !== EXPECTED_DATABASE) {
    throw new Error(`Refusing to seed database "${databaseName || '(default)'}". Use /${EXPECTED_DATABASE} in MONGODB_URI.`);
  }
}

const run = async () => {
  const mongoUri = process.env.MONGODB_URI;
  assertSafeTarget(mongoUri);
  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 15000 });
  if (mongoose.connection.name !== EXPECTED_DATABASE) {
    throw new Error(`Connected to unexpected database "${mongoose.connection.name}".`);
  }

  const existingUsername = await User.findOne({ username }).select('_id email').lean();
  const existingEmail = await User.findOne({ email }).select('_id role').lean();
  if (existingUsername && (!existingEmail || String(existingUsername._id) !== String(existingEmail._id))) {
    throw new Error(`Username "${username}" belongs to another account. No database changes were made.`);
  }
  if (existingEmail?.role && existingEmail.role !== 'student') {
    throw new Error(`Email "${email}" is not a student account. No database changes were made.`);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const student = await User.findOneAndUpdate(
    { email },
    {
      $set: {
        username,
        password: passwordHash,
        fullName: 'Learning Streak QA',
        groupName: 'QA Learning Streak',
        role: 'student',
        status: 'active',
        isActive: true,
        timezone: TIMEZONE,
        approvedAt: new Date(),
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  const todayKey = getDateKeyInTimezone(new Date(), TIMEZONE);
  const dateKeys = Array.from({ length: completedDays }, (_, index) => shiftDateKey(todayKey, -(completedDays - 1 - index)));
  const completedAt = new Date();

  await DailyLearningProgress.bulkWrite(dateKeys.map((localDate) => ({
    updateOne: {
      filter: { _id: `${student._id}:${localDate}` },
      update: {
        $set: {
          student: student._id,
          localDate,
          timezone: TIMEZONE,
          validStudySeconds: TARGET_SECONDS,
          targetSeconds: TARGET_SECONDS,
          completed: true,
          completedAt,
          activitySeconds: { interactive: TARGET_SECONDS },
        },
      },
      upsert: true,
    },
  })));

  await StudentDailyStudy.bulkWrite(dateKeys.map((dateKey) => ({
    updateOne: {
      filter: { _id: `${student._id}:${dateKey}` },
      update: {
        $set: { student: student._id, dateKey, activeSeconds: TARGET_SECONDS, lastActiveAt: completedAt },
      },
      upsert: true,
    },
  })));

  const streak = await refreshLearningStreak(student._id, TIMEZONE);
  const stored = await LearningStreak.findOne({ student: student._id }).select('currentStreak longestStreak totalCompletedDays currentTier lastCompletedDate').lean();

  console.log(JSON.stringify({
    database: mongoose.connection.name,
    account: { email, username, password },
    studentId: String(student._id),
    seededDateRange: { from: dateKeys[0], to: dateKeys.at(-1), completedDays: dateKeys.length },
    streak: stored || streak,
  }, null, 2));
};

try {
  await run();
} finally {
  await mongoose.disconnect().catch(() => {});
}
