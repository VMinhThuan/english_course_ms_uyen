import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import cors from 'cors';
import express from 'express';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { strToU8, zipSync } from 'fflate';
import Vocabulary from '../src/models/Vocabulary.js';
import ChapterVocabulary from '../src/models/ChapterVocabulary.js';
import VocabularyChapter from '../src/models/VocabularyChapter.js';
import VocabularyImportAudit from '../src/models/VocabularyImportAudit.js';
import VocabularyImportBatch from '../src/models/VocabularyImportBatch.js';
import VocabularyImportCandidate from '../src/models/VocabularyImportCandidate.js';
import VocabularyImportCatalogMapping from '../src/models/VocabularyImportCatalogMapping.js';
import VocabularyTag from '../src/models/VocabularyTag.js';
import { createVocabularyCatalogManagementPrototypeRouter } from '../src/routes/vocabularyCatalogManagementPrototypeRoutes.js';
import { createVocabularyImportPrototypeRouter } from '../src/routes/vocabularyImportPrototypeRoutes.js';
import { createCatalogVocabulary, addVocabularyToChapter } from '../src/services/vocabularyCatalogService.js';
import { evaluateVocabularyPublicationEligibility } from '../src/services/vocabularyPublicationContract.js';

const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const CONTENT_TYPES_NS = 'http://schemas.openxmlformats.org/package/2006/content-types';
const PACKAGE_REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';
const actors = { admin: new mongoose.Types.ObjectId(), teacher: new mongoose.Types.ObjectId(), student: new mongoose.Types.ObjectId() };
let replicaSet;
let server;
let baseUrl;

function escapeXml(value) { return String(value).replace(/[<>&"']/g, (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[char]); }
function paragraph(text, numId = '') {
  const numbering = numId ? `<w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="${numId}"/></w:numPr></w:pPr>` : '';
  const lines = text.split('\n').map((line) => `<w:r><w:t xml:space="preserve">${escapeXml(line)}</w:t></w:r>`).join('<w:r><w:br/></w:r>');
  return `<w:p>${numbering}${lines}</w:p>`;
}
function syntheticDocx() {
  const body = [
    paragraph('Start 1'),
    paragraph('synthetic item (noun): a made up entry\nThis is a synthetic example.\n→ Đây là ví dụ tổng hợp.', '1'),
    paragraph('synthetic item (noun): a second synthetic sense\nA second example for review.\n→ Ví dụ thứ hai để kiểm duyệt.', '1'),
  ].join('');
  const document = `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="${WORD_NS}"><w:body>${body}<w:sectPr/></w:body></w:document>`;
  const numbering = `<?xml version="1.0"?><w:numbering xmlns:w="${WORD_NS}"><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>`;
  const parts = {
    '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="${CONTENT_TYPES_NS}"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
    '_rels/.rels': `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="${PACKAGE_REL_NS}"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
    'word/document.xml': document,
    'word/numbering.xml': numbering,
  };
  return Buffer.from(zipSync(Object.fromEntries(Object.entries(parts).map(([name, value]) => [name, strToU8(value)])), { level: 6 }));
}
function auth(role = 'admin') { return { authorization: `Bearer synthetic-${role}` }; }
async function json(path, { method = 'GET', body, role = 'admin' } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { ...auth(role), ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const payload = await response.json();
  return { status: response.status, payload };
}
async function createTag(name = 'TOEIC Easy Start', slug = 'toeic-easy-start') {
  return json('/admin/vocabulary-catalog/tags', { method: 'POST', body: { name, slug } });
}
async function uploadFiles(files, sourceFolder = 'TOEIC EASY START') {
  const form = new FormData();
  for (const file of files) form.append('files', new Blob([file.buffer], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), file.filename);
  form.append('sourceFolder', sourceFolder);
  const response = await fetch(`${baseUrl}/admin/vocabulary-import-batches`, { method: 'POST', headers: auth(), body: form });
  return { status: response.status, payload: await response.json() };
}

before(async () => {
  assert.equal(mongoose.connection.readyState, 0, 'V4A tests must start disconnected from application MongoDB');
  replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1, ip: '127.0.0.1', dbName: 'vocabulary_v4a_integration_test' } });
  const uri = replicaSet.getUri('vocabulary_v4a_integration_test');
  assert.equal(new URL(uri).hostname, '127.0.0.1');
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  assert.equal(mongoose.connection.name, 'vocabulary_v4a_integration_test');
  await Promise.all([
    Vocabulary.init(), VocabularyTag.init(), VocabularyChapter.init(), ChapterVocabulary.init(),
    VocabularyImportBatch.init(), VocabularyImportCandidate.init(), VocabularyImportAudit.init(), VocabularyImportCatalogMapping.init(),
  ]);
  const app = express();
  app.use(cors());
  const syntheticAuth = (req, _res, next) => {
    for (const [role, id] of Object.entries(actors)) if (req.get('authorization') === `Bearer synthetic-${role}`) req.user = { _id: id, role };
    next();
  };
  app.use('/admin/vocabulary-catalog', createVocabularyCatalogManagementPrototypeRouter({ authenticateAdmin: syntheticAuth }));
  app.use('/admin/vocabulary-import-batches', createVocabularyImportPrototypeRouter({ authenticateAdmin: syntheticAuth, requireCatalogMappingForConfirm: true }));
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  if (replicaSet) await replicaSet.stop();
});

test('Phase V4A Tag, Chapter, membership, import mapping and publication contract', async (t) => {
  await t.test('Admin-only prototype auth rejects missing, client-supplied, Teacher and Student identity', async () => {
    const missing = await fetch(`${baseUrl}/admin/vocabulary-catalog/tags`);
    assert.equal(missing.status, 401);
    const supplied = await fetch(`${baseUrl}/admin/vocabulary-catalog/tags`, { headers: { role: 'admin' } });
    assert.equal(supplied.status, 401);
    assert.equal((await json('/admin/vocabulary-catalog/tags', { role: 'teacher' })).status, 403);
    assert.equal((await json('/admin/vocabulary-catalog/tags', { role: 'student' })).status, 403);
    assert.equal((await fetch(`${baseUrl}/api/v1/vocabulary`)).status, 404, 'V4A adds no Student Catalog API');
  });

  let firstTag;
  let firstChapter;
  await t.test('Tag create/edit, unique slug, search, counts and non-cascading archive', async () => {
    const created = await createTag('TOEIC Easy Start', 'toeic-easy-start');
    assert.equal(created.status, 201, JSON.stringify(created.payload));
    firstTag = created.payload.data.tag;
    assert.equal(firstTag.status, 'draft');
    const duplicate = await createTag('Other name', 'toeic-easy-start');
    assert.equal(duplicate.status, 409);
    assert.equal(duplicate.payload.code, 'SLUG_ALREADY_EXISTS');
    const chapterResponse = await json(`/admin/vocabulary-catalog/tags/${firstTag._id}/chapters`, {
      method: 'POST', body: { title: 'Chapter One', chapterNumber: 1, sortOrder: 2 },
    });
    assert.equal(chapterResponse.status, 201, JSON.stringify(chapterResponse.payload));
    firstChapter = chapterResponse.payload.data.chapter;
    assert.equal(firstChapter.status, 'draft');
    const word = await createCatalogVocabulary({ word: 'ordered', meaning: 'có thứ tự' });
    await json(`/admin/vocabulary-catalog/chapters/${firstChapter._id}/memberships`, {
      method: 'POST', body: { vocabularyId: String(word._id), expectedVersion: firstChapter.version },
    }).then((result) => assert.equal(result.status, 201, JSON.stringify(result.payload)));
    const duplicateTitle = await json(`/admin/vocabulary-catalog/tags/${firstTag._id}/chapters`, {
      method: 'POST', body: { title: ' chapter   one ', chapterNumber: 9 },
    });
    assert.equal(duplicateTitle.status, 409);
    assert.equal(duplicateTitle.payload.code, 'CHAPTER_TITLE_ALREADY_EXISTS');
    const updated = await json(`/admin/vocabulary-catalog/tags/${firstTag._id}`, {
      method: 'PATCH', body: { expectedVersion: firstTag.version, name: 'Easy Start', slug: 'easy-start', description: 'TOEIC source', sortOrder: 3 },
    });
    assert.equal(updated.status, 200, JSON.stringify(updated.payload));
    const filtered = await json('/admin/vocabulary-catalog/tags?search=easy&status=draft&page=1&limit=1');
    assert.equal(filtered.payload.data.pagination.total, 1);
    assert.equal(filtered.payload.data.items[0].chapterCount, 1);
    assert.equal(filtered.payload.data.items[0].vocabularyCount, 1);
    const archived = await json(`/admin/vocabulary-catalog/tags/${firstTag._id}/archive`, {
      method: 'POST', body: { expectedVersion: updated.payload.data.tag.version },
    });
    assert.equal(archived.payload.data.tag.status, 'archived');
    assert.equal(await VocabularyChapter.countDocuments({ _id: firstChapter._id }), 1);
    assert.equal(await ChapterVocabulary.countDocuments({ chapterId: firstChapter._id }), 1);
    assert.equal(await Vocabulary.countDocuments({ catalogOnly: true }), 1);
    const blockedChapterCreate = await json(`/admin/vocabulary-catalog/tags/${firstTag._id}/chapters`, { method: 'POST', body: { title: 'No new chapter' } });
    assert.equal(blockedChapterCreate.status, 409);
  });

  await t.test('Chapter update, explicit move, archive and membership visibility', async () => {
    const targetTagResponse = await createTag('Second Source', 'second-source');
    const targetTag = targetTagResponse.payload.data.tag;
    const newChapter = await json(`/admin/vocabulary-catalog/tags/${targetTag._id}/chapters`, { method: 'POST', body: { title: 'Target chapter', sortOrder: 5 } });
    assert.equal(newChapter.status, 201);
    const currentFirstChapter = await json(`/admin/vocabulary-catalog/chapters/${firstChapter._id}`);
    const moving = await json(`/admin/vocabulary-catalog/chapters/${firstChapter._id}`, {
      method: 'PATCH', body: { expectedVersion: currentFirstChapter.payload.data.chapter.version, tagId: targetTag._id, title: 'Moved chapter', description: 'Moved by explicit Tag ID', chapterNumber: 3, sortOrder: 1 },
    });
    assert.equal(moving.status, 200, JSON.stringify(moving.payload));
    assert.equal(moving.payload.data.chapter.tagId, targetTag._id);
    assert.equal(await ChapterVocabulary.countDocuments({ chapterId: firstChapter._id }), 1);
    const movedList = await json(`/admin/vocabulary-catalog/tags/${targetTag._id}/chapters?search=Moved`);
    assert.equal(movedList.payload.data.pagination.total, 1);
    const archived = await json(`/admin/vocabulary-catalog/chapters/${firstChapter._id}/archive`, { method: 'POST', body: { expectedVersion: moving.payload.data.chapter.version } });
    assert.equal(archived.payload.data.chapter.status, 'archived');
    assert.equal(await ChapterVocabulary.countDocuments({ chapterId: firstChapter._id }), 1);
  });

  await t.test('Membership add, duplicate guard, ordered move and content isolation across Chapters', async () => {
    const tag = await createTag('Membership QA', 'membership-qa');
    const tagId = tag.payload.data.tag._id;
    const chapters = [];
    for (const title of ['Card A', 'Card B']) {
      const result = await json(`/admin/vocabulary-catalog/tags/${tagId}/chapters`, { method: 'POST', body: { title } });
      assert.equal(result.status, 201);
      chapters.push(result.payload.data.chapter);
    }
    const words = await Promise.all([
      createCatalogVocabulary({ word: 'alpha', meaning: 'một' }),
      createCatalogVocabulary({ word: 'beta', meaning: 'hai' }),
      createCatalogVocabulary({ word: 'gamma', meaning: 'ba' }),
    ]);
    const before = words.map((word) => ({ id: String(word._id), word: word.word, meaning: word.meaning, senses: word.catalogSenses }));
    const createdIds = [];
    let version = chapters[0].version;
    for (const word of words) {
      const result = await json(`/admin/vocabulary-catalog/chapters/${chapters[0]._id}/memberships`, { method: 'POST', body: { vocabularyId: String(word._id), expectedVersion: version } });
      assert.equal(result.status, 201, JSON.stringify(result.payload));
      createdIds.push(result.payload.data.membershipId);
      version = result.payload.data.chapter.version;
    }
    const duplicate = await json(`/admin/vocabulary-catalog/chapters/${chapters[0]._id}/memberships`, { method: 'POST', body: { vocabularyId: String(words[0]._id), expectedVersion: version } });
    assert.equal(duplicate.status, 409);
    assert.equal(duplicate.payload.code, 'MEMBERSHIP_ALREADY_EXISTS');
    const secondChapterMember = await addVocabularyToChapter({ chapterId: chapters[1]._id, vocabularyId: words[0]._id, sourceIdentity: `manual-qa-${new mongoose.Types.ObjectId()}`, sortOrder: 40 });
    const reorder = await json(`/admin/vocabulary-catalog/chapters/${chapters[0]._id}/memberships/reorder`, {
      method: 'POST', body: { expectedVersion: version, membershipIds: [...createdIds].reverse() },
    });
    assert.equal(reorder.status, 200, JSON.stringify(reorder.payload));
    const listA = await json(`/admin/vocabulary-catalog/chapters/${chapters[0]._id}/memberships`);
    const listB = await json(`/admin/vocabulary-catalog/chapters/${chapters[1]._id}/memberships`);
    assert.deepEqual(listA.payload.data.items.map((item) => item.vocabulary.word), ['gamma', 'beta', 'alpha']);
    assert.equal(String(listB.payload.data.items[0]._id), String(secondChapterMember._id));
    const wordsByTag = await json(`/admin/vocabulary-catalog/tags/${tagId}/vocabulary?search=alpha&page=1&limit=20`);
    assert.equal(wordsByTag.status, 200, JSON.stringify(wordsByTag.payload));
    assert.equal(wordsByTag.payload.data.pagination.total, 2, 'one Vocabulary may remain visible through both Chapter memberships');
    assert.equal(wordsByTag.payload.data.items.every((item) => item.vocabulary.word === 'alpha'), true);
    assert.deepEqual(wordsByTag.payload.data.items.map((item) => item.chapter.title).sort(), ['Card A', 'Card B']);
    const after = await Vocabulary.find({ _id: { $in: words.map((word) => word._id) } }).sort({ word: 1 }).lean();
    assert.deepEqual(after.map((word) => ({ id: String(word._id), word: word.word, meaning: word.meaning, senses: word.catalogSenses })), before.sort((a, b) => a.word.localeCompare(b.word)));
    assert.deepEqual(listA.payload.data.items.map((item) => item.sortOrder), [10, 20, 30]);
  });

  await t.test('Import Batch history is paged and omits raw source, filenames, hashes and relative paths', async () => {
    const created = await uploadFiles([{ filename: 'History Only.docx', buffer: syntheticDocx() }], 'TOEIC EASY START');
    assert.equal(created.status, 201, JSON.stringify(created.payload));
    const result = await json('/admin/vocabulary-import-batches?page=1&limit=1&search=TOEIC');
    assert.equal(result.status, 200, JSON.stringify(result.payload));
    assert.equal(result.payload.data.pagination.total, 1);
    const row = result.payload.data.items[0];
    assert.equal(row.fileCount, 1);
    assert.equal(row.candidateCount, 2);
    assert.deepEqual(row.sourceFolderLabels, ['TOEIC EASY START']);
    assert.equal(row.mappingStatus, 'NOT_MAPPED');
    const serialized = JSON.stringify(row);
    for (const forbidden of ['History Only.docx', 'fileSha256', 'relativePath', 'rawValues', 'parsedValues', 'sourceIdentity']) assert.equal(serialized.includes(forbidden), false);
  });

  await t.test('Explicit import mapping preserves reviewed Batch and source identity; Confirm uses IDs and locks mapping', async () => {
    const uploaded = await uploadFiles([
      { filename: 'Existing Chapter.docx', buffer: syntheticDocx({ title: 'Existing Chapter', word: 'first mapped word' }) },
      { filename: 'New Chapter.docx', buffer: syntheticDocx({ title: 'New Chapter', word: 'second mapped word' }) },
    ], 'TOEIC EASY START');
    assert.equal(uploaded.status, 201, JSON.stringify(uploaded.payload));
    const batch = uploaded.payload.data.batch;
    const candidates = uploaded.payload.data.candidates;
    assert.equal(candidates.length, 4);
    const beforeCandidates = candidates.map((candidate) => ({ id: candidate._id, sourceIdentity: candidate.sourceIdentity, rawValues: candidate.rawValues, parsedValues: candidate.parsedValues }));
    for (const candidate of candidates) {
      const detail = await json(`/admin/vocabulary-import-batches/${batch._id}/candidates/${candidate._id}`);
      const reviewed = await json(`/admin/vocabulary-import-batches/${batch._id}/candidates/${candidate._id}/review`, {
        method: 'POST', body: { expectedVersion: detail.payload.data.candidate.version, decision: 'APPROVE', duplicateDecision: 'KEEP_SEPARATE', reason: 'Approved synthetic catalog QA entry.' },
      });
      assert.equal(reviewed.status, 200, JSON.stringify(reviewed.payload));
    }
    const currentBatch = await json(`/admin/vocabulary-import-batches/${batch._id}`);
    const tag = await createTag('Mapped Source', 'mapped-source');
    const targetTag = tag.payload.data.tag;
    const existingChapter = await json(`/admin/vocabulary-catalog/tags/${targetTag._id}/chapters`, { method: 'POST', body: { title: 'Start 1' } });
    assert.equal(existingChapter.status, 201);
    const openMapping = await json(`/admin/vocabulary-import-batches/${batch._id}/catalog-mapping`);
    assert.equal(openMapping.payload.data.mapping.entries.length, 2);
    assert.equal(openMapping.payload.data.mapping.entries[0].sourceFolderLabel, 'TOEIC EASY START');
    assert.ok(openMapping.payload.data.mapping.entries[0].sourceRelativePath.endsWith('.docx'));
    assert.ok(openMapping.payload.data.mapping.entries[0].fileSha256);
    const ordered = openMapping.payload.data.mapping.entries;
    const duplicateName = await json(`/admin/vocabulary-import-batches/${batch._id}/catalog-mapping`, {
      method: 'PUT', body: {
        expectedVersion: null, targetTagId: targetTag._id,
        entries: ordered.map((entry, index) => ({ sourceFileIdentity: entry.sourceFileIdentity, chapterAction: 'CREATE', createChapter: { title: index === 0 ? 'Start 1' : 'Different New Chapter' } })),
      },
    });
    assert.equal(duplicateName.status, 409);
    assert.equal(duplicateName.payload.code, 'CHAPTER_TITLE_ALREADY_EXISTS');
    assert.equal(await VocabularyImportCatalogMapping.countDocuments({ batchId: batch._id }), 0);
    const mappingBody = {
      expectedVersion: null,
      targetTagId: targetTag._id,
      entries: ordered.map((entry) => entry.sourceFileName === 'Existing Chapter.docx'
        ? { sourceFileIdentity: entry.sourceFileIdentity, chapterAction: 'EXISTING', targetChapterId: existingChapter.payload.data.chapter._id }
        : { sourceFileIdentity: entry.sourceFileIdentity, chapterAction: 'CREATE', createChapter: { title: 'New Explicit Chapter', chapterNumber: 7, sortOrder: 9 } }),
    };
    const saved = await json(`/admin/vocabulary-import-batches/${batch._id}/catalog-mapping`, { method: 'PUT', body: mappingBody });
    assert.equal(saved.status, 200, JSON.stringify(saved.payload));
    assert.equal(saved.payload.data.mapping.targetTagId, targetTag._id);
    assert.equal(saved.payload.data.mapping.status, 'MAPPED');
    const afterMap = await json(`/admin/vocabulary-import-batches/${batch._id}/candidates?page=1&limit=20`);
    assert.deepEqual(afterMap.payload.data.items.map((candidate) => ({ id: candidate._id, sourceIdentity: candidate.sourceIdentity, rawValues: candidate.rawValues, parsedValues: candidate.parsedValues })), beforeCandidates);
    const staleMapping = await json(`/admin/vocabulary-import-batches/${batch._id}/catalog-mapping`, {
      method: 'PUT', body: { ...mappingBody, expectedVersion: null },
    });
    assert.equal(staleMapping.status, 409);
    assert.equal(staleMapping.payload.code, 'CONCURRENT_MODIFICATION');
    const unmappedBatch = await uploadFiles([{ filename: 'No Map.docx', buffer: syntheticDocx() }], 'TOEIC EASY START');
    assert.equal(unmappedBatch.status, 201);
    const blocked = await json(`/admin/vocabulary-import-batches/${unmappedBatch.payload.data.batch._id}/confirm`, {
      method: 'POST', body: { expectedVersion: unmappedBatch.payload.data.batch.version, candidateIds: [unmappedBatch.payload.data.candidates[0]._id] },
    });
    assert.equal(blocked.status, 409);
    assert.equal(blocked.payload.code, 'CATALOG_MAPPING_REQUIRED');
    const confirmed = await json(`/admin/vocabulary-import-batches/${batch._id}/confirm`, {
      method: 'POST', body: { expectedVersion: currentBatch.payload.data.version, candidateIds: candidates.map((candidate) => candidate._id) },
    });
    assert.equal(confirmed.status, 200, JSON.stringify(confirmed.payload));
    assert.equal(confirmed.payload.data.results.length, 4, 'each of the two files contributes two separately reviewed candidates');
    const finalMapping = await json(`/admin/vocabulary-import-batches/${batch._id}/catalog-mapping`);
    const finalMappingEntryByPath = new Map(finalMapping.payload.data.mapping.entries.map((entry) => [entry.sourceRelativePath, entry]));
    const candidateAfter = await json(`/admin/vocabulary-import-batches/${batch._id}/candidates?page=1&limit=20`);
    for (const candidate of candidateAfter.payload.data.items) {
      const relativePath = candidate.sourceMetadata.relativePath;
      const mapEntry = finalMappingEntryByPath.get(relativePath);
      assert.ok(mapEntry, `mapped source file should match immutable parser path ${relativePath}`);
      assert.equal(String(candidate.importedChapterId), relativePath.endsWith('/Existing Chapter.docx') ? existingChapter.payload.data.chapter._id : mapEntry.resolvedChapterId);
      assert.equal(candidate.sourceIdentity, beforeCandidates.find((item) => item.id === candidate._id).sourceIdentity);
    }
    assert.equal(finalMapping.payload.data.mapping.status, 'LOCKED');
    assert.ok(finalMapping.payload.data.mapping.entries.find((entry) => entry.sourceRelativePath.endsWith('/New Chapter.docx')).resolvedChapterId);
    const rejectedRemap = await json(`/admin/vocabulary-import-batches/${batch._id}/catalog-mapping`, { method: 'PUT', body: { ...mappingBody, expectedVersion: finalMapping.payload.data.mapping.version } });
    assert.equal(rejectedRemap.status, 409);
    assert.equal(rejectedRemap.payload.code, 'MAPPING_LOCKED');
    assert.equal((await VocabularyChapter.find({ tagId: targetTag._id })).length, 2, 'the pre-existing similarly named Chapter is explicit and the new Chapter was created separately');
  });

  await t.test('Optimistic versions serialize concurrent Tag edits', async () => {
    const tag = await createTag('Concurrent', 'concurrent');
    const value = tag.payload.data.tag;
    const results = await Promise.all([
      json(`/admin/vocabulary-catalog/tags/${value._id}`, { method: 'PATCH', body: { expectedVersion: value.version, name: 'Concurrent A' } }),
      json(`/admin/vocabulary-catalog/tags/${value._id}`, { method: 'PATCH', body: { expectedVersion: value.version, name: 'Concurrent B' } }),
    ]);
    assert.deepEqual(results.map((result) => result.status).sort(), [200, 409]);
  });

  await t.test('Publication eligibility requires every state and membership; no API publishes data', async () => {
    const references = { tagId: 'tag-1', chapterId: 'chapter-1', vocabularyId: 'vocabulary-1' };
    const ready = evaluateVocabularyPublicationEligibility({
      tag: { _id: references.tagId, status: 'published' }, chapter: { _id: references.chapterId, tagId: references.tagId, status: 'published' },
      vocabulary: { _id: references.vocabularyId, catalogOnly: true, catalogStatus: 'published' },
      membership: { _id: 'membership', chapterId: references.chapterId, vocabularyId: references.vocabularyId }, reviewStatus: 'REVIEW_APPROVED',
    });
    assert.equal(ready.eligible, true);
    const draftTag = evaluateVocabularyPublicationEligibility({
      tag: { _id: references.tagId, status: 'draft' }, chapter: { _id: references.chapterId, tagId: references.tagId, status: 'published' },
      vocabulary: { _id: references.vocabularyId, catalogOnly: true, catalogStatus: 'published' },
      membership: { _id: 'membership', chapterId: references.chapterId, vocabularyId: references.vocabularyId }, reviewStatus: 'REVIEW_APPROVED',
    });
    assert.equal(draftTag.eligible, false);
    assert.ok(draftTag.blockers.includes('TAG_NOT_PUBLISHED'));
    assert.ok(draftTag.blockers.includes('EDITORIAL_REVIEW_REQUIRED') === false);
    const noMembership = evaluateVocabularyPublicationEligibility({
      tag: { _id: references.tagId, status: 'published' }, chapter: { _id: references.chapterId, tagId: references.tagId, status: 'published' },
      vocabulary: { _id: references.vocabularyId, catalogOnly: true, catalogStatus: 'published' }, reviewStatus: 'REVIEW_APPROVED',
    });
    assert.ok(noMembership.blockers.includes('CHAPTER_MEMBERSHIP_REQUIRED'));
    const wrongMembership = evaluateVocabularyPublicationEligibility({
      tag: { _id: references.tagId, status: 'published' }, chapter: { _id: references.chapterId, tagId: 'another-tag', status: 'published' },
      vocabulary: { _id: references.vocabularyId, catalogOnly: true, catalogStatus: 'published' },
      membership: { _id: 'membership', chapterId: 'another-chapter', vocabularyId: 'another-vocabulary' }, reviewStatus: 'REVIEW_APPROVED',
    });
    assert.ok(wrongMembership.blockers.includes('CHAPTER_TAG_MISMATCH'));
    assert.ok(wrongMembership.blockers.includes('MEMBERSHIP_CHAPTER_MISMATCH'));
    assert.ok(wrongMembership.blockers.includes('MEMBERSHIP_VOCABULARY_MISMATCH'));
    const noPublishRoute = await fetch(`${baseUrl}/admin/vocabulary-catalog/tags/publish`, { method: 'POST', headers: { ...auth(), 'content-type': 'application/json' }, body: JSON.stringify({}) });
    assert.equal(noPublishRoute.status, 404);
  });
});
