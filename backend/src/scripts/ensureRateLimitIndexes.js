import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { fileURLToPath } from 'node:url';
import RateLimitBucket from '../models/RateLimitBucket.js';
import connectDB from '../configs/database.js';

dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)) });

const apply = process.argv.includes('--apply');
const appEnv = String(process.env.APP_ENV || '').toLowerCase();

if (apply && appEnv !== 'staging' && String(process.env.ALLOW_PRODUCTION_RATE_LIMIT_INDEXES).toLowerCase() !== 'true') {
  throw new Error('Refusing to apply rate-limit indexes outside verified staging. Set ALLOW_PRODUCTION_RATE_LIMIT_INDEXES=true only after backup and staging verification.');
}

const sameKey = (left, right) => JSON.stringify(left) === JSON.stringify(right);

const listIndexes = async () => {
  try {
    return await RateLimitBucket.collection.listIndexes().toArray();
  } catch (error) {
    if (error?.codeName === 'NamespaceNotFound' || error?.code === 26) return [];
    throw error;
  }
};

const run = async () => {
  await connectDB();
  const indexes = await listIndexes();
  const expectedUnique = indexes.find((index) => (
    sameKey(index.key, { key: 1 }) && index.unique === true
  ));
  const expectedTtl = indexes.find((index) => (
    sameKey(index.key, { expiresAt: 1 }) && Number(index.expireAfterSeconds) === 0
  ));

  if (apply) {
    if (!expectedUnique) {
      await RateLimitBucket.collection.createIndex(
        { key: 1 },
        { unique: true, name: 'rate_limit_bucket_key_unique' },
      );
    }
    if (!expectedTtl) {
      await RateLimitBucket.collection.createIndex(
        { expiresAt: 1 },
        { expireAfterSeconds: 0, name: 'rate_limit_bucket_expires_ttl' },
      );
    }
  }

  const verifiedIndexes = await listIndexes();
  console.log(JSON.stringify({
    mode: apply ? 'apply' : 'check',
    database: mongoose.connection.name,
    uniqueKeyIndexPresent: Boolean(expectedUnique || (apply && verifiedIndexes.some((index) => index.name === 'rate_limit_bucket_key_unique'))),
    ttlIndexPresent: Boolean(expectedTtl || (apply && verifiedIndexes.some((index) => index.name === 'rate_limit_bucket_expires_ttl'))),
  }));
};

try {
  await run();
} finally {
  await mongoose.disconnect();
}
