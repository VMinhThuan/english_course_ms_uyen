import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import express from 'express';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { createStudentVocabularyCatalogPrototypeRouter } from '../src/routes/studentVocabularyCatalogPrototypeRoutes.js';
import { createVocabularyStudentCatalogFixtures, vocabularyStudentCatalogFixtureModels } from './helpers/vocabularyStudentCatalogFixtures.js';

let replicaSet;
let server;
let baseUrl;
let fixture;

async function request(path, { token = 'synthetic-student' } = {}) {
  const response = await fetch(`${baseUrl}/student/vocabulary-catalog${path}`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  return { status: response.status, payload: await response.json() };
}

before(async () => {
  assert.equal(mongoose.connection.readyState, 0, 'Student Catalog integration tests must start disconnected from application MongoDB');
  replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1, ip: '127.0.0.1', dbName: 'vocabulary_student_catalog_v4b_test' } });
  const uri = replicaSet.getUri('vocabulary_student_catalog_v4b_test');
  assert.equal(new URL(uri).hostname, '127.0.0.1');
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  assert.equal(mongoose.connection.host, '127.0.0.1');
  assert.equal(mongoose.connection.name, 'vocabulary_student_catalog_v4b_test');
  await Promise.all(vocabularyStudentCatalogFixtureModels.map((model) => model.init()));
  fixture = await createVocabularyStudentCatalogFixtures();

  const app = express();
  app.use(express.json());
  const syntheticAuthentication = (req, _res, next) => {
    if (req.get('authorization') === 'Bearer synthetic-student') req.user = { _id: fixture.actors.studentId, role: 'student' };
    if (req.get('authorization') === 'Bearer synthetic-admin') req.user = { _id: fixture.actors.adminId, role: 'admin' };
    next();
  };
  app.use('/student/vocabulary-catalog', createStudentVocabularyCatalogPrototypeRouter({ authenticateStudent: syntheticAuthentication }));
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  if (replicaSet) await replicaSet.stop();
});

test('Student Catalog prototype enforces published state and immutable import provenance', async (t) => {
  await t.test('authentication and role are enforced before any catalog response', async () => {
    assert.equal((await request('/tags', { token: null })).status, 401);
    assert.equal((await request('/tags', { token: 'synthetic-admin' })).status, 403);
    assert.equal((await request('/tags')).status, 200);
  });

  await t.test('only three published Tags appear with counts from eligible published Chapters and Vocabulary', async () => {
    const result = await request('/tags?page=1&limit=10');
    assert.equal(result.status, 200, JSON.stringify(result.payload));
    assert.equal(result.payload.data.pagination.total, 3);
    assert.deepEqual(result.payload.data.items.map((tag) => tag.name), [
      'Synthetic Fundamentals', 'Synthetic Collocations', 'Synthetic Essentials',
    ]);
    assert.deepEqual(result.payload.data.items.map(({ chapterCount, vocabularyCount }) => [chapterCount, vocabularyCount]), [[3, 6], [1, 1], [1, 0]]);
    const serialized = JSON.stringify(result.payload);
    for (const hidden of ['Synthetic Draft Tag', 'Synthetic Archived Tag', 'rawValues', 'sourceIdentity', 'fileSha256', 'private-source']) {
      assert.equal(serialized.includes(hidden), false, `Unexpected tag response field/content: ${hidden}`);
    }
  });

  await t.test('Chapter cards have stable order, one card per Chapter and exact eligible counts', async () => {
    const result = await request(`/tags/${fixture.tags[0]._id}/chapters?page=1&limit=10`);
    assert.equal(result.status, 200, JSON.stringify(result.payload));
    assert.deepEqual(result.payload.data.items.map((chapter) => chapter.title), [
      'Synthetic Start 1', 'Synthetic Start 2', 'Synthetic Empty Chapter',
    ]);
    assert.deepEqual(result.payload.data.items.map((chapter) => chapter.vocabularyCount), [4, 2, 0]);
    assert.equal(result.payload.data.pagination.total, 3);
    assert.deepEqual(
      [result.payload.data.tag.chapterCount, result.payload.data.tag.vocabularyCount],
      [3, 6],
    );
    assert.equal(result.payload.data.items.filter((chapter) => chapter._id === String(fixture.chapters.start1._id)).length, 1);
    assert.equal((await request(`/tags/${fixture.tags[1]._id}/chapters?search=Collocation`)).payload.data.pagination.total, 1);
  });

  await t.test('direct IDs cannot bypass Draft, Archived, missing parent Tag or invalid ID checks', async () => {
    for (const chapter of [fixture.chapters.draft, fixture.chapters.archived, fixture.hiddenTagChapters.draft, fixture.hiddenTagChapters.archived]) {
      const result = await request(`/chapters/${chapter._id}`);
      assert.equal(result.status, 404, `${chapter.title} must remain hidden`);
    }
    assert.equal((await request(`/tags/${fixture.hiddenTags.draft._id}/chapters`)).status, 404);
    assert.equal((await request('/chapters/not-an-object-id')).status, 400);
    assert.equal((await request('/tags/not-an-object-id/chapters')).status, 400);
  });

  await t.test('Vocabulary response preserves multiple senses, POS, bilingual examples and notes with an allowlist', async () => {
    const result = await request(`/chapters/${fixture.chapters.start1._id}/vocabularies?page=1&limit=100`);
    assert.equal(result.status, 200, JSON.stringify(result.payload));
    const items = result.payload.data.items;
    assert.deepEqual(items.map((item) => item.word), [
      'synthetic record', 'synthetic charge', 'synthetic charge', 'synthetic shared',
    ]);
    const record = items[0];
    assert.equal(record.catalogSenses.length, 2);
    assert.deepEqual(record.catalogSenses.map((sense) => sense.partOfSpeech), [['noun'], ['verb']]);
    assert.equal(record.catalogSenses[0].examples.length, 2);
    assert.equal(record.catalogSenses[0].examples[0].vietnamese, 'Hãy lưu hồ sơ của từng chuyến hàng.');
    assert.equal(record.catalogSenses[1].notes[0], 'A second sense note.');
    assert.deepEqual(record.catalogNotes, ['Chapter-level synthetic note.', '<img src=x onerror="window.__catalogXss=1">']);
    const allowed = ['_id', 'word', 'partOfSpeech', 'meaning', 'exampleEnglish', 'exampleVietnamese', 'catalogSenses', 'catalogNotes', 'sortOrder'];
    assert.deepEqual(Object.keys(record).sort(), [...allowed].sort());
    const serialized = JSON.stringify(result.payload);
    for (const hidden of ['rawValues', 'rawPartOfSpeech', 'normalizedMeaning', 'sourceLocators', 'sourceIdentity', 'fileSha256', 'private-source', 'reviewedBy', 'reviewStatus', 'C:\\\\private']) {
      assert.equal(serialized.includes(hidden), false, `Unexpected vocabulary response field/content: ${hidden}`);
    }
  });

  await t.test('Vocabulary membership, Catalog status, audit and Candidate references fail closed', async () => {
    const result = await request(`/chapters/${fixture.chapters.start1._id}/vocabularies?limit=100`);
    const visibleWords = result.payload.data.items.map((item) => item.word);
    for (const hidden of [
      fixture.vocabulary.draftWord,
      fixture.vocabulary.archivedWord,
      fixture.vocabulary.unreviewedWord,
      fixture.vocabulary.missingReviewAuditWord,
      fixture.vocabulary.missingImportAuditWord,
      fixture.vocabulary.wrongChapterReferenceWord,
      fixture.vocabulary.noProvenanceWord,
      fixture.vocabulary.noMembershipWord,
    ]) assert.equal(visibleWords.includes(hidden.word), false, `${hidden.word} must be excluded`);
    assert.equal(result.payload.data.pagination.total, 4);
    const direct = await request(`/chapters/${fixture.chapters.start2._id}/vocabularies`);
    assert.deepEqual(direct.payload.data.items.map((item) => item.word), ['synthetic shared', 'synthetic budget']);
  });

  await t.test('search is escaped and pagination is bounded', async () => {
    const literal = await request(`/chapters/${fixture.chapters.start1._id}/vocabularies?search=charge&limit=1`);
    assert.equal(literal.payload.data.pagination.total, 2);
    assert.equal(literal.payload.data.items.length, 1);
    assert.equal(literal.payload.data.pagination.pages, 2);
    const injection = await request(`/chapters/${fixture.chapters.start1._id}/vocabularies?search=${encodeURIComponent('.*')}`);
    assert.equal(injection.payload.data.pagination.total, 0);
    assert.equal((await request(`/chapters/${fixture.chapters.start1._id}/vocabularies?limit=101`)).status, 400);
    assert.equal((await request(`/chapters/${fixture.chapters.start1._id}/vocabularies?page=0`)).status, 400);
    assert.equal((await request(`/chapters/${fixture.chapters.start1._id}/vocabularies?search=${'x'.repeat(81)}`)).status, 400);
  });

  await t.test('empty Chapter remains available and read-only router has no write method', async () => {
    const empty = await request(`/chapters/${fixture.chapters.empty._id}/vocabularies`);
    assert.equal(empty.status, 200);
    assert.equal(empty.payload.data.pagination.total, 0);
    assert.deepEqual(empty.payload.data.items, []);
    const post = await fetch(`${baseUrl}/student/vocabulary-catalog/tags`, {
      method: 'POST', headers: { authorization: 'Bearer synthetic-student', 'content-type': 'application/json' }, body: '{}',
    });
    assert.equal(post.status, 404);
  });
});
