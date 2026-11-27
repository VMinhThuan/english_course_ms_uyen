import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { fileURLToPath } from 'node:url';
import LearningSession from '../models/LearningSession.js';
import connectDB from '../configs/database.js';

dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)) });

const apply = process.argv.includes('--apply');
const appEnv = String(process.env.APP_ENV || '').toLowerCase();
const databaseName = mongoose.connection.name || (() => {
  try { return new URL(process.env.MONGODB_URI || '').pathname.replace(/^\//, ''); } catch { return ''; }
})();

if (apply) {
  if (appEnv !== 'staging' && String(process.env.ALLOW_PRODUCTION_LEARNING_SESSION_INDEXES).toLowerCase() !== 'true') {
    throw new Error('Refusing to apply the learning-session index outside verified staging. Set ALLOW_PRODUCTION_LEARNING_SESSION_INDEXES=true only after backup and staging verification.');
  }
  if (appEnv === 'staging' && databaseName && databaseName !== 'english_course_staging') {
    throw new Error(`Refusing to apply to ${databaseName}; expected english_course_staging.`);
  }
}

const sameKey = (left, right) => JSON.stringify(left) === JSON.stringify(right);

const listIndexes = async () => {
  try {
    return await LearningSession.collection.listIndexes().toArray();
  } catch (error) {
    // A read-only dry-run on a fresh database must report a missing index,
    // not create the collection or crash on NamespaceNotFound.
    if (error?.codeName === 'NamespaceNotFound' || error?.code === 26) return [];
    throw error;
  }
};

const run = async () => {
  await connectDB();
  const duplicateRows = await LearningSession.aggregate([
    { $match: { status: 'active' } },
    { $group: { _id: '$student', count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
    { $limit: 10 },
  ]);
  if (duplicateRows.length) {
    throw new Error(`Found ${duplicateRows.length} students with duplicate active learning sessions; resolve them before applying the unique index.`);
  }

  const indexes = await listIndexes();
  const expectedKey = { student: 1, status: 1 };
  const existing = indexes.find((index) => sameKey(index.key, expectedKey)
    && index.unique === true
    && JSON.stringify(index.partialFilterExpression) === JSON.stringify({ status: 'active' }));
  if (!existing && apply) {
    await LearningSession.collection.createIndex(expectedKey, {
      name: 'learning_session_one_active_per_student',
      unique: true,
      partialFilterExpression: { status: 'active' },
    });
  }
  console.log(JSON.stringify({
    mode: apply ? 'apply' : 'check',
    database: mongoose.connection.name,
    duplicateActiveStudents: duplicateRows.length,
    indexPresent: Boolean(existing || apply),
  }));
};

try {
  await run();
} finally {
  await mongoose.disconnect();
}
