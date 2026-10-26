import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import User from '../src/models/User.js';
import Vocabulary from '../src/models/Vocabulary.js';
import VocabularyTag from '../src/models/VocabularyTag.js';
import VocabularyChapter from '../src/models/VocabularyChapter.js';
import ChapterVocabulary from '../src/models/ChapterVocabulary.js';
import VocabularyImportBatch from '../src/models/VocabularyImportBatch.js';
import VocabularyImportCandidate from '../src/models/VocabularyImportCandidate.js';
import VocabularyImportAudit from '../src/models/VocabularyImportAudit.js';
import VocabularyImportCatalogMapping from '../src/models/VocabularyImportCatalogMapping.js';
import VocabularyPublicationAudit from '../src/models/VocabularyPublicationAudit.js';
import { syntheticPublicationDocx } from './helpers/vocabularyPublicationV5aHarness.js';

const HOST = '127.0.0.1';
const databaseName = `vocabulary_application_${randomUUID().replaceAll('-', '')}_test`;
let replicaSet;
let server;
let baseUrl;
let setupError;
let actors;

const auth = (token) => ({ Authorization: `Bearer ${token}` });

async function request(path, { method = 'GET', token, body, headers = {} } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(token ? auth(token) : {}),
      ...(body === undefined || body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...headers,
    },
    ...(body === undefined ? {} : { body: body instanceof FormData ? body : JSON.stringify(body) }),
  });
  let payload = null;
  try { payload = await response.json(); } catch { /* The status remains useful for assertions. */ }
  return { response, payload };
}

async function expectData(path, options = {}, status = 200) {
  const result = await request(path, options);
  assert.equal(result.response.status, status, JSON.stringify(result.payload));
  return result.payload.data;
}

before(async () => {
  try {
    assert.equal(mongoose.connection.readyState, 0, 'application integration test requires a disconnected Mongoose process');
    replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1, ip: HOST, dbName: databaseName } });
    const uri = replicaSet.getUri(databaseName);
    assert.equal(new URL(uri).hostname, HOST, 'test database must use loopback');
    process.env.NODE_ENV = 'test';
    process.env.MONGODB_URI = uri;
    process.env.JWT_SECRET = `vocabulary-app-access-${randomUUID()}`;
    process.env.JWT_REFRESH_SECRET = `vocabulary-app-refresh-${randomUUID()}`;
    await mongoose.connect(uri, { autoIndex: true, serverSelectionTimeoutMS: 10000 });
    await Promise.all([
      User.init(), Vocabulary.init(), VocabularyTag.init(), VocabularyChapter.init(), ChapterVocabulary.init(),
      VocabularyImportBatch.init(), VocabularyImportCandidate.init(), VocabularyImportAudit.init(),
      VocabularyImportCatalogMapping.init(), VocabularyPublicationAudit.init(),
    ]);

    const [admin, teacher, student] = await Promise.all([
      User.create({ email: 'catalog-admin@example.test', password: 'safe-password', role: 'admin', status: 'active', isActive: true }),
      User.create({ email: 'catalog-teacher@example.test', password: 'safe-password', role: 'teacher', status: 'active', isActive: true }),
      User.create({ email: 'catalog-student@example.test', password: 'safe-password', role: 'student', status: 'active', isActive: true }),
    ]);
    actors = {
      admin, teacher, student,
      adminToken: jwt.sign({ userId: admin._id }, process.env.JWT_SECRET, { expiresIn: '10m' }),
      teacherToken: jwt.sign({ userId: teacher._id }, process.env.JWT_SECRET, { expiresIn: '10m' }),
      studentToken: jwt.sign({ userId: student._id }, process.env.JWT_SECRET, { expiresIn: '10m' }),
    };

    const { default: app } = await import('../src/app.js');
    server = await new Promise((resolve, reject) => {
      const listener = app.listen(0, HOST, () => resolve(listener));
      listener.once('error', reject);
    });
    baseUrl = `http://${HOST}:${server.address().port}`;
  } catch (error) {
    setupError = error;
    if (server?.listening) await new Promise((resolve) => server.close(resolve));
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect().catch(() => {});
    if (replicaSet) await replicaSet.stop().catch(() => {});
  }
});

after(async () => {
  if (server?.listening) await new Promise((resolve) => server.close(resolve));
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  if (replicaSet) await replicaSet.stop();
});

test('Vocabulary Catalog is mounted in the application with JWT RBAC and student access without enrollment', {
  skip: setupError ? `BLOCKED: isolated application database could not start (${setupError.message})` : false,
}, async (t) => {
  const denied = await request('/api/v1/admin/vocabulary-catalog/tags', { method: 'POST', body: { name: 'No identity', slug: 'no-identity' } });
  assert.equal(denied.response.status, 401);
  const teacherDenied = await request('/api/v1/admin/vocabulary-catalog/tags', {
    method: 'POST', token: actors.teacherToken, body: { name: 'Teacher denied', slug: 'teacher-denied' }, headers: { role: 'admin' },
  });
  assert.equal(teacherDenied.response.status, 403, 'client role headers cannot promote a Teacher');
  const adminOnStudentApi = await request('/api/v1/student/vocabulary-catalog/tags', { token: actors.adminToken });
  assert.equal(adminOnStudentApi.response.status, 403, 'Catalog student reads are strictly Student-only');

  const tag = (await expectData('/api/v1/admin/vocabulary-catalog/tags', {
    method: 'POST', token: actors.adminToken, body: { name: 'Application Catalog', slug: 'application-catalog', description: 'Application mounted fixture' },
  }, 201)).tag;
  const chapter = (await expectData(`/api/v1/admin/vocabulary-catalog/tags/${tag._id}/chapters`, {
    method: 'POST', token: actors.adminToken, body: { title: 'Application Chapter', chapterNumber: 1, description: 'Integration fixture chapter' },
  }, 201)).chapter;

  await t.test('Import maps, reviews, and confirms Draft records through the mounted application API', async () => {
    const form = new FormData();
    form.append('files', new Blob([syntheticPublicationDocx({ title: 'Application source' })], {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    }), 'Application source.docx');
    form.append('sourceFolder', 'TOEIC EASY START');
    const upload = await request('/api/v1/admin/vocabulary-import-batches', { method: 'POST', token: actors.adminToken, body: form });
    assert.equal(upload.response.status, 201, JSON.stringify(upload.payload));
    const batch = upload.payload.data.batch;
    const mapping = await expectData(`/api/v1/admin/vocabulary-import-batches/${batch._id}/catalog-mapping`, { token: actors.adminToken });
    await expectData(`/api/v1/admin/vocabulary-import-batches/${batch._id}/catalog-mapping`, {
      method: 'PUT', token: actors.adminToken, body: {
        expectedVersion: null,
        targetTagId: tag._id,
        entries: mapping.mapping.entries.map((entry) => ({
          sourceFileIdentity: entry.sourceFileIdentity,
          chapterAction: 'EXISTING',
          targetChapterId: chapter._id,
        })),
      },
    });
    const candidatePage = await expectData(`/api/v1/admin/vocabulary-import-batches/${batch._id}/candidates?page=1&limit=20`, { token: actors.adminToken });
    assert.ok(candidatePage.items.length > 0);
    for (const candidate of candidatePage.items) {
      const edited = await expectData(`/api/v1/admin/vocabulary-import-batches/${batch._id}/candidates/${candidate._id}`, {
        method: 'PATCH', token: actors.adminToken, body: {
          expectedVersion: candidate.version,
          reason: 'Application integration editorial correction.',
          changes: { word: `${candidate.word} ${candidate._id.toString().slice(-6)}` },
        },
      });
      await expectData(`/api/v1/admin/vocabulary-import-batches/${batch._id}/candidates/${candidate._id}/review`, {
        method: 'POST', token: actors.adminToken, body: {
          expectedVersion: edited.version,
          decision: 'APPROVE',
          reason: 'Reviewed through the mounted application API.',
          duplicateDecision: 'KEEP_SEPARATE',
        },
      });
    }
    const currentBatch = await expectData(`/api/v1/admin/vocabulary-import-batches/${batch._id}`, { token: actors.adminToken });
    const confirmed = await expectData(`/api/v1/admin/vocabulary-import-batches/${batch._id}/confirm`, {
      method: 'POST', token: actors.adminToken, body: {
        expectedVersion: currentBatch.version,
        candidateIds: candidatePage.items.map((candidate) => candidate._id),
      },
    });
    assert.equal(confirmed.results.length, candidatePage.items.length);
  });

  const reviewedTag = (await expectData(`/api/v1/admin/vocabulary-publication/tags/${tag._id}/review`, {
    method: 'POST', token: actors.adminToken, body: { expectedVersion: tag.version, decision: 'APPROVE', reason: 'Structure reviewed in application integration.' },
  })).entity;
  const reviewedChapter = (await expectData(`/api/v1/admin/vocabulary-publication/chapters/${chapter._id}/review`, {
    method: 'POST', token: actors.adminToken, body: { expectedVersion: chapter.version, decision: 'APPROVE', reason: 'Chapter reviewed in application integration.' },
  })).entity;
  await expectData(`/api/v1/admin/vocabulary-publication/tags/${tag._id}/publish`, {
    method: 'POST', token: actors.adminToken, body: { expectedVersion: reviewedTag.version, idempotencyKey: 'application-tag-publish-0001' },
  });
  await expectData(`/api/v1/admin/vocabulary-publication/chapters/${chapter._id}/publish`, {
    method: 'POST', token: actors.adminToken, body: { expectedVersion: reviewedChapter.version, idempotencyKey: 'application-chapter-publish-0001' },
  });

  const summary = await expectData(`/api/v1/admin/vocabulary-publication/tags/${tag._id}/summary`, { token: actors.adminToken });
  assert.ok(summary.chapters[0].items.length > 0);
  for (const row of summary.chapters[0].items) {
    const published = await expectData(`/api/v1/admin/vocabulary-publication/vocabularies/${row.vocabularyId}/publish`, {
      method: 'POST', token: actors.adminToken, body: {
        expectedVersion: row.version,
        membershipId: row.membershipId,
        idempotencyKey: `application-vocabulary-${row.vocabularyId}`,
      },
    });
    const replay = await expectData(`/api/v1/admin/vocabulary-publication/vocabularies/${row.vocabularyId}/publish`, {
      method: 'POST', token: actors.adminToken, body: {
        expectedVersion: published.entity.version,
        membershipId: row.membershipId,
        idempotencyKey: `application-vocabulary-${row.vocabularyId}`,
      },
    });
    assert.equal(replay.idempotent, true);
  }

  await t.test('Student reads only Published Catalog data without an Enrollment record', async () => {
    assert.equal(await mongoose.model('Enrollment').countDocuments({ student: actors.student._id }), 0);
    const tags = await expectData('/api/v1/student/vocabulary-catalog/tags?page=1&limit=20', { token: actors.studentToken });
    assert.ok(tags.items.some((item) => item._id === tag._id));
    const chapters = await expectData(`/api/v1/student/vocabulary-catalog/tags/${tag._id}/chapters?page=1&limit=20`, { token: actors.studentToken });
    assert.ok(chapters.items.some((item) => item._id === chapter._id));
    const words = await expectData(`/api/v1/student/vocabulary-catalog/chapters/${chapter._id}/vocabularies?page=1&limit=20`, { token: actors.studentToken });
    assert.ok(words.items.length > 0);
    const serialized = JSON.stringify(words);
    for (const privateField of ['sourceIdentity', 'rawValues', 'parsedValues', 'reviewedBy']) assert.equal(serialized.includes(privateField), false);
  });

  await t.test('Manual Catalog Vocabulary remains blocked without import provenance', async () => {
    const manual = await Vocabulary.create({ word: 'manual application word', meaning: 'manual provenance fixture', catalogOnly: true, catalogStatus: 'draft' });
    const currentChapter = await expectData(`/api/v1/admin/vocabulary-catalog/chapters/${chapter._id}`, { token: actors.adminToken });
    const membership = await expectData(`/api/v1/admin/vocabulary-catalog/chapters/${chapter._id}/memberships`, {
      method: 'POST', token: actors.adminToken, body: { vocabularyId: String(manual._id), expectedVersion: currentChapter.chapter.version },
    }, 201);
    const eligibility = await expectData(`/api/v1/admin/vocabulary-publication/eligibility/VOCABULARY/${manual._id}?membershipId=${membership.membershipId}`, { token: actors.adminToken });
    assert.ok(eligibility.blockers.includes('IMPORT_PROVENANCE_REQUIRED'));
    assert.equal(await VocabularyImportAudit.countDocuments({ sourceIdentity: null }), 0);
  });
});
