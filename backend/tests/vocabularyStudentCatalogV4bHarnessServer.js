import cors from 'cors';
import express from 'express';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { createStudentVocabularyCatalogPrototypeRouter } from '../src/routes/studentVocabularyCatalogPrototypeRoutes.js';
import { createVocabularyStudentCatalogFixtures, vocabularyStudentCatalogFixtureModels } from './helpers/vocabularyStudentCatalogFixtures.js';

const host = '127.0.0.1';
const port = Number(process.env.VOCAB_STUDENT_CATALOG_V4B_HARNESS_PORT || 43192);
const frontendOrigin = process.env.VOCAB_STUDENT_CATALOG_V4B_FRONTEND_ORIGIN || 'http://127.0.0.1:5173';
const databaseName = 'vocabulary_student_catalog_v4b_browser_test';

async function main() {
  if (mongoose.connection.readyState !== 0) throw new Error('V4B browser harness must start disconnected from application MongoDB.');
  const replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1, ip: host, dbName: databaseName } });
  try {
    const uri = replicaSet.getUri(databaseName);
    if (new URL(uri).hostname !== host) throw new Error('V4B MongoMemoryReplSet must bind to loopback.');
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
    if (mongoose.connection.host !== host || mongoose.connection.name !== databaseName || !mongoose.connection.name.endsWith('_test')) {
      throw new Error('V4B harness database safety assertion failed.');
    }
    await Promise.all(vocabularyStudentCatalogFixtureModels.map((model) => model.init()));
    const fixture = await createVocabularyStudentCatalogFixtures();
    const app = express();
    app.use(cors({ origin: frontendOrigin, credentials: true }));
    app.get('/__qa/health', (_req, res) => res.json({ ok: true, host, database: databaseName }));
    app.get('/__qa/fixture', (_req, res) => res.json({
      tags: fixture.tags.map((tag) => String(tag._id)),
      hiddenTags: { draft: String(fixture.hiddenTags.draft._id), archived: String(fixture.hiddenTags.archived._id) },
      chapters: Object.fromEntries(Object.entries(fixture.chapters).map(([key, chapter]) => [key, String(chapter._id)])),
      hiddenTagChapters: Object.fromEntries(Object.entries(fixture.hiddenTagChapters).map(([key, chapter]) => [key, String(chapter._id)])),
      vocabulary: Object.fromEntries(Object.entries(fixture.vocabulary).map(([key, vocabulary]) => [key, String(vocabulary._id)])),
    }));
    const authenticateSyntheticStudent = (req, _res, next) => {
      if (req.get('authorization') === 'Bearer synthetic-student') {
        req.user = { _id: fixture.actors.studentId, role: 'student' };
      } else if (req.get('authorization') === 'Bearer synthetic-admin') {
        req.user = { _id: fixture.actors.adminId, role: 'admin' };
      }
      next();
    };
    app.use('/student/vocabulary-catalog', createStudentVocabularyCatalogPrototypeRouter({ authenticateStudent: authenticateSyntheticStudent }));
    const server = await new Promise((resolve, reject) => {
      const listener = app.listen(port, host, () => resolve(listener));
      listener.once('error', reject);
    });
    process.stdout.write(`STUDENT_VOCAB_CATALOG_V4B_HARNESS_READY http://${host}:${port} ${databaseName}\n`);

    const shutdown = async () => {
      await new Promise((resolve) => server.close(resolve));
      if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
      await replicaSet.stop();
    };
    process.once('SIGINT', () => shutdown().finally(() => process.exit(0)));
    process.once('SIGTERM', () => shutdown().finally(() => process.exit(0)));
  } catch (error) {
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect().catch(() => {});
    await replicaSet.stop();
    throw error;
  }
}

main().catch((error) => {
  process.stderr.write(`${error?.stack || error}\n`);
  process.exitCode = 1;
});
