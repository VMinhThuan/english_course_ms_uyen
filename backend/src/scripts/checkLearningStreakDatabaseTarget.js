import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { fileURLToPath } from 'node:url';

dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)) });

const REQUIRED_APP_ENV = 'staging';
const REQUIRED_DATABASE = 'english_course_staging';
const shouldConnect = process.argv.includes('--connect');

const describeTarget = (mongoUri) => {
  if (!mongoUri) throw new Error('MONGODB_URI is required.');
  const parsed = new URL(mongoUri);
  const database = parsed.pathname.replace(/^\//, '');
  if (String(process.env.APP_ENV || '').toLowerCase() !== REQUIRED_APP_ENV) {
    throw new Error(`Refusing target check: APP_ENV must be ${REQUIRED_APP_ENV}.`);
  }
  if (database !== REQUIRED_DATABASE) {
    throw new Error(`Refusing target check: database must be ${REQUIRED_DATABASE}, got ${database || '(default)'}.`);
  }
  return { protocol: parsed.protocol, host: parsed.host, database };
};

const target = describeTarget(process.env.MONGODB_URI);
try {
  if (shouldConnect) {
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000, connectTimeoutMS: 10000 });
    if (mongoose.connection.name !== REQUIRED_DATABASE) throw new Error(`Connected to unexpected database ${mongoose.connection.name}.`);
    await mongoose.connection.db.command({ ping: 1 });
  }
  console.log(JSON.stringify({ status: 'success', connected: shouldConnect, target: { protocol: target.protocol, host: target.host, database: target.database } }));
} finally {
  await mongoose.disconnect().catch(() => {});
}
