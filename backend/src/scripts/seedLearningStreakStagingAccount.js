import dotenv from 'dotenv';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'node:url';
import User from '../models/User.js';
import DailyLearningProgress from '../models/DailyLearningProgress.js';
import LearningStreak from '../models/LearningStreak.js';
import StudentDailyStudy from '../models/StudentDailyStudy.js';
import { getDateKeyInTimezone, refreshLearningStreak, shiftDateKey } from '../services/learningStreakService.js';

dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)) });

const databaseName = 'english_course_staging';
const timezone = 'Asia/Ho_Chi_Minh';
const email = String(process.env.STREAK_TEST_EMAIL || 'streak.qa@staging.msuyen.local').trim().toLowerCase();
const username = String(process.env.STREAK_TEST_USERNAME || 'streak_qa_staging').trim().toLowerCase();
const password = String(process.env.STREAK_TEST_PASSWORD || '');
const completedDays = Math.max(1, Math.min(30, Number(process.env.STREAK_TEST_DAYS || 14)));

if (String(process.env.APP_ENV || '').toLowerCase() !== 'staging') throw new Error('Refusing fixture seed: APP_ENV must be staging.');
if (String(process.env.ALLOW_STAGING_LEARNING_STREAK_FIXTURE).toLowerCase() !== 'true') throw new Error('Set ALLOW_STAGING_LEARNING_STREAK_FIXTURE=true explicitly.');
if (!password || password.length < 12) throw new Error('Set STREAK_TEST_PASSWORD to a password of at least 12 characters.');
if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required.');

const parsed = new URL(process.env.MONGODB_URI);
if (parsed.pathname.replace(/^\//, '') !== databaseName) throw new Error(`Refusing to seed non-staging database ${parsed.pathname}.`);

await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
try {
  const passwordHash = await bcrypt.hash(password, 10);
  const [existingEmail, existingUsername] = await Promise.all([
    User.findOne({ email }).select('_id role').lean(),
    User.findOne({ username }).select('_id email').lean(),
  ]);
  if (existingEmail && existingEmail.role !== 'student') {
    throw new Error(`Refusing to overwrite non-student staging account ${email}.`);
  }
  if (existingUsername && (!existingEmail || String(existingUsername._id) !== String(existingEmail._id))) {
    throw new Error(`Username ${username} belongs to another staging account.`);
  }
  const student = await User.findOneAndUpdate(
    { email },
    { $set: { username, password: passwordHash, fullName: 'Learning Streak Staging QA', groupName: 'QA Staging', role: 'student', status: 'active', isActive: true, timezone, approvedAt: new Date() } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  const today = getDateKeyInTimezone(new Date(), timezone);
  const dateKeys = Array.from({ length: completedDays }, (_, index) => shiftDateKey(today, -(completedDays - 1 - index)));
  const completedAt = new Date();
  await DailyLearningProgress.bulkWrite(dateKeys.map((localDate) => ({ updateOne: { filter: { _id: `${student._id}:${localDate}` }, update: { $set: { student: student._id, localDate, timezone, validStudySeconds: 900, targetSeconds: 900, completed: true, completedAt, activitySeconds: { interactive: 900 } } }, upsert: true } })));
  await StudentDailyStudy.bulkWrite(dateKeys.map((dateKey) => ({ updateOne: { filter: { _id: `${student._id}:${dateKey}` }, update: { $set: { student: student._id, dateKey, activeSeconds: 900, lastActiveAt: completedAt } }, upsert: true } })));
  const streak = await refreshLearningStreak(student._id, timezone);
  const stored = await LearningStreak.findOne({ student: student._id }).select('currentStreak longestStreak totalCompletedDays currentTier lastCompletedDate').lean();
  console.log(JSON.stringify({ status: 'success', database: mongoose.connection.name, account: { email, username, passwordConfigured: true }, studentId: String(student._id), completedDays: dateKeys.length, streak: stored || streak }, null, 2));
} finally {
  await mongoose.disconnect();
}
