import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { fileURLToPath } from 'node:url';
import DailyLearningProgress from '../models/DailyLearningProgress.js';
import LearningSessionHeartbeat from '../models/LearningSessionHeartbeat.js';
import LearningStreak from '../models/LearningStreak.js';
import connectDB from '../configs/database.js';

// Resolve the backend .env even when npm is invoked from the repository root.
dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)) });

const appEnv = String(process.env.APP_ENV || '').toLowerCase();
const isProduction = String(process.env.NODE_ENV || '').toLowerCase() === 'production' || appEnv === 'production';
const isStaging = appEnv === 'staging';
const mongoUri = process.env.MONGODB_URI || '';
let databaseName = '';
try {
  databaseName = new URL(mongoUri).pathname.replace(/^\//, '');
} catch {
  throw new Error('MONGODB_URI must be a valid MongoDB connection string.');
}

if (String(process.env.ALLOW_LEARNING_STREAK_INDEXES).toLowerCase() !== 'true') {
  throw new Error(
    'Refusing to modify a database without explicit approval. Set ALLOW_LEARNING_STREAK_INDEXES=true only for a verified staging or approved migration target.',
  );
}
if (!isStaging) {
  if (!isProduction) {
    throw new Error(
      'Refusing to modify indexes unless APP_ENV=staging, or an explicitly approved production migration is configured.',
    );
  }
  if (String(process.env.ALLOW_PRODUCTION_LEARNING_STREAK_INDEXES).toLowerCase() !== 'true') {
    throw new Error(
      'Refusing to modify a production database. Set ALLOW_PRODUCTION_LEARNING_STREAK_INDEXES=true only after backup and staging verification.',
    );
  }
}
if (isStaging && databaseName !== 'english_course_staging') {
  throw new Error(`Refusing to modify non-staging database ${databaseName || '(default)'}. Expected english_course_staging.`);
}

const expectedIndexes = [
  { model: DailyLearningProgress, name: 'daily_learning_progress_student_date', key: { student: 1, localDate: -1 }, unique: true },
  { model: LearningSessionHeartbeat, name: 'learning_session_heartbeat_idempotency', key: { session: 1, idempotencyKey: 1 }, unique: true },
  { model: LearningSessionHeartbeat, name: 'learning_session_heartbeat_ttl', key: { createdAt: 1 }, expireAfterSeconds: 60 * 60 * 24 * 14 },
  { model: LearningStreak, key: { student: 1 }, unique: true },
];

const sameKey = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const indexMatches = (index, expected) => (
  sameKey(index.key, expected.key)
  && (!expected.name || index.name === expected.name)
  && (!expected.unique || index.unique === true)
  && (expected.expireAfterSeconds === undefined || index.expireAfterSeconds === expected.expireAfterSeconds)
);

const duplicateChecks = [
  { model: DailyLearningProgress, group: { student: '$student', localDate: '$localDate' }, label: 'student/date daily progress' },
  { model: LearningSessionHeartbeat, group: { session: '$session', idempotencyKey: '$idempotencyKey' }, label: 'session/heartbeat idempotency key' },
  { model: LearningStreak, group: { student: '$student' }, label: 'student streak' },
];

const checkDuplicates = async () => {
  for (const check of duplicateChecks) {
    const duplicate = await check.model.aggregate([
      { $group: { _id: check.group, count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
      { $limit: 1 },
    ]);
    if (duplicate.length) throw new Error(`Cannot create Learning Streak indexes: duplicate ${check.label} record exists.`);
  }
};

const checkIndexConflicts = async () => {
  const collections = new Map();
  for (const expected of expectedIndexes) {
    const collectionName = expected.model.collection.name;
    if (!collections.has(collectionName)) {
      collections.set(collectionName, await expected.model.collection.listIndexes().toArray());
    }
    const indexes = collections.get(collectionName);
    const sameKeyIndex = indexes.find((index) => sameKey(index.key, expected.key));
    if (sameKeyIndex && !indexMatches(sameKeyIndex, expected)) throw new Error(`Index conflict on ${collectionName}.${JSON.stringify(expected.key)}.`);
  }
};

const verifyIndexes = async () => {
  const report = [];
  for (const expected of expectedIndexes) {
    const indexes = await expected.model.collection.listIndexes().toArray();
    if (!indexes.some((index) => indexMatches(index, expected))) {
      throw new Error(`Index verification failed for ${expected.model.collection.name}.${JSON.stringify(expected.key)}.`);
    }
    report.push({ collection: expected.model.collection.name, key: expected.key, unique: Boolean(expected.unique), expireAfterSeconds: expected.expireAfterSeconds });
  }
  return report;
};

try {
  const connection = await connectDB();
  await checkDuplicates();
  await checkIndexConflicts();
  await Promise.all([
    DailyLearningProgress.createIndexes(),
    LearningSessionHeartbeat.createIndexes(),
    LearningStreak.createIndexes(),
  ]);
  console.log(JSON.stringify({
    status: 'success',
    environment: process.env.NODE_ENV || 'development',
    database: connection.connection.name,
    verifiedIndexes: await verifyIndexes(),
  }));
} finally {
  await mongoose.disconnect();
}
