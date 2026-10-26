import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import express from 'express';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { strToU8, zipSync } from 'fflate';
import Vocabulary from '../src/models/Vocabulary.js';
import VocabularyTag from '../src/models/VocabularyTag.js';
import VocabularyChapter from '../src/models/VocabularyChapter.js';
import ChapterVocabulary from '../src/models/ChapterVocabulary.js';
import VocabularyImportBatch from '../src/models/VocabularyImportBatch.js';
import VocabularyImportCandidate from '../src/models/VocabularyImportCandidate.js';
import VocabularyImportAudit from '../src/models/VocabularyImportAudit.js';
import { createVocabularyImportPrototypeRouter } from '../src/routes/vocabularyImportPrototypeRoutes.js';

const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const CONTENT_TYPES_NS = 'http://schemas.openxmlformats.org/package/2006/content-types';
const PACKAGE_REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';
const adminId = new mongoose.Types.ObjectId();
const teacherId = new mongoose.Types.ObjectId();

let replicaSet;
let server;
let baseUrl;

function xmlEscape(value) {
  return String(value).replace(/[<>&"']/g, (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[char]);
}

function paragraph(text, numId = '') {
  const numbering = numId
    ? `<w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="${numId}"/></w:numPr></w:pPr>`
    : '';
  const lines = text.split('\n').map((line) => `<w:r><w:t xml:space="preserve">${xmlEscape(line)}</w:t></w:r>`).join('<w:r><w:br/></w:r>');
  return `<w:p>${numbering}${lines}</w:p>`;
}

function syntheticDocx({ secondMeaning = 'a synthetic term used for a test', thirdWord = '' } = {}) {
  const entries = [
    paragraph('Start 1'),
    paragraph('synthetic item (noun): a made up entry\nThis is a synthetic example.\n→ Đây là ví dụ tổng hợp.', '1'),
    paragraph(`${thirdWord || 'synthetic item'} (noun): ${secondMeaning}\nA second synthetic example.\n→ Ví dụ tổng hợp thứ hai.`, '1'),
  ].join('');
  const document = `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="${WORD_NS}"><w:body>${entries}<w:sectPr/></w:body></w:document>`;
  const numbering = `<?xml version="1.0"?><w:numbering xmlns:w="${WORD_NS}"><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>`;
  const parts = {
    '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="${CONTENT_TYPES_NS}"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
    '_rels/.rels': `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="${PACKAGE_REL_NS}"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
    'word/document.xml': document,
    'word/numbering.xml': numbering,
  };
  return Buffer.from(zipSync(Object.fromEntries(Object.entries(parts).map(([name, value]) => [name, strToU8(value)])), { level: 6 }));
}

function authHeaders(role = 'admin') {
  return { authorization: `Bearer synthetic-${role}` };
}

async function postFile(buffer, { filename = 'Start 1.docx', mime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', auth = 'admin', sourceFolder = 'TOEIC EASY START' } = {}) {
  const form = new FormData();
  form.append('files', new Blob([buffer], { type: mime }), filename);
  if (sourceFolder) form.append('sourceFolder', sourceFolder);
  return fetch(`${baseUrl}/admin/vocabulary-import-batches`, { method: 'POST', headers: authHeaders(auth), body: form });
}

async function postFiles(files, { auth = 'admin', sourceFolder = 'TOEIC EASY START' } = {}) {
  const form = new FormData();
  for (const { buffer, filename } of files) {
    form.append('files', new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), filename);
  }
  if (sourceFolder) form.append('sourceFolder', sourceFolder);
  return fetch(`${baseUrl}/admin/vocabulary-import-batches`, { method: 'POST', headers: authHeaders(auth), body: form });
}

async function jsonRequest(path, { method = 'GET', body, auth = 'admin' } = {}) {
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: { ...authHeaders(auth), ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function readJson(response) {
  return { status: response.status, body: await response.json() };
}

before(async () => {
  assert.equal(mongoose.connection.readyState, 0, 'the harness must start disconnected from application MongoDB');
  replicaSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, ip: '127.0.0.1', dbName: 'vocabulary_v3a_prototype_test' },
  });
  const uri = replicaSet.getUri('vocabulary_v3a_prototype_test');
  assert.equal(new URL(uri).hostname, '127.0.0.1', 'writes must use loopback MongoMemoryServer');
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  assert.equal(mongoose.connection.host, '127.0.0.1');
  assert.equal(mongoose.connection.name, 'vocabulary_v3a_prototype_test');
  await Promise.all([
    Vocabulary.init(), VocabularyTag.init(), VocabularyChapter.init(), ChapterVocabulary.init(),
    VocabularyImportBatch.init(), VocabularyImportCandidate.init(), VocabularyImportAudit.init(),
  ]);

  const app = express();
  const syntheticAuth = (req, _res, next) => {
    // This test-only middleware assigns identity from a fixed synthetic token. It never
    // reads role/actor fields from request JSON, query parameters or multipart fields.
    if (req.get('authorization') === 'Bearer synthetic-admin') req.user = { _id: adminId, role: 'admin' };
    if (req.get('authorization') === 'Bearer synthetic-teacher') req.user = { _id: teacherId, role: 'teacher' };
    return next();
  };
  app.use('/admin/vocabulary-import-batches', createVocabularyImportPrototypeRouter({ authenticateAdmin: syntheticAuth }));
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  if (replicaSet) await replicaSet.stop();
});

test('V3A prototype upload, review, audit, source revision and concurrent Draft confirmation', async (t) => {
  await t.test('authentication, multipart policy and DOCX package validation', async () => {
    const buffer = syntheticDocx();
    const unauthenticated = await fetch(`${baseUrl}/admin/vocabulary-import-batches`, { method: 'POST', body: new FormData() });
    assert.equal(unauthenticated.status, 401);
    const clientSuppliedRole = await fetch(`${baseUrl}/admin/vocabulary-import-batches`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ role: 'admin', actorId: String(adminId) }),
    });
    assert.equal(clientSuppliedRole.status, 401);
    const teacher = await postFile(buffer, { auth: 'teacher' });
    assert.equal(teacher.status, 403);
    const wrongMime = await postFile(buffer, { mime: 'text/plain' });
    assert.equal(wrongMime.status, 400);
    const badSignature = await postFile(Buffer.from('synthetic-not-a-zip'), { filename: 'Start 1.docx' });
    assert.equal(badSignature.status, 400);
    const invalidPackage = await postFile(Buffer.from(zipSync({ 'synthetic.xml': strToU8('<synthetic/>') })), { filename: 'Start 1.docx' });
    const invalidPackageBody = await readJson(invalidPackage);
    assert.equal(invalidPackageBody.status, 400);
    assert.equal(invalidPackageBody.body.code, 'INVALID_DOCX');
    const excessiveUpload = await postFile(Buffer.concat([buffer, Buffer.alloc(10 * 1024 * 1024)]));
    assert.equal(excessiveUpload.status, 413);
    const unexpectedField = new FormData();
    unexpectedField.append('files', new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), 'Start 1.docx');
    unexpectedField.append('role', 'admin');
    const massAssignedIdentity = await readJson(await fetch(`${baseUrl}/admin/vocabulary-import-batches`, { method: 'POST', headers: authHeaders(), body: unexpectedField }));
    assert.equal(massAssignedIdentity.status, 400);
    assert.equal(massAssignedIdentity.body.code, 'INVALID_UPLOAD_FIELDS');
    assert.equal(await VocabularyImportBatch.countDocuments(), 0);
    assert.equal(await VocabularyImportCandidate.countDocuments(), 0);
  });

  let batchId;
  let firstCandidate;
  let secondCandidate;
  await t.test('upload creates an idempotent Batch and preserves source candidates for preview', async () => {
    const buffer = syntheticDocx();
    const created = await readJson(await postFile(buffer));
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.equal(created.body.status, 'success');
    const payload = created.body.data;
    batchId = String(payload.batch._id);
    assert.equal(payload.batch.actorId, String(adminId));
    assert.equal(payload.batch.candidateCount, 2);
    assert.equal(payload.batch.counts.parsed, 2);
    assert.equal(payload.batch.counts.valid, 2);
    assert.equal(payload.batch.counts.needsReview, 2);
    assert.equal(payload.batch.status, 'NEEDS_REVIEW');
    assert.equal(payload.idempotent, false);
    assert.equal(payload.candidates.length, 2);
    [firstCandidate, secondCandidate] = payload.candidates;
    assert.equal(firstCandidate.status, 'VALID');
    assert.equal(firstCandidate.reviewStatus, 'NEEDS_REVIEW');
    assert.equal(firstCandidate.publicationStatus, 'NOT_ELIGIBLE');
    assert.equal(firstCandidate.sourceMetadata.relativePath, 'TOEIC EASY START/Start 1.docx');
    assert.equal(firstCandidate.sourceMetadata.fileSha256.length, 64);
    assert.equal('lesson' in firstCandidate, false);
    assert.equal('course' in firstCandidate, false);

    const retry = await readJson(await postFile(buffer));
    assert.equal(retry.status, 200);
    assert.equal(retry.body.data.idempotent, true);
    assert.equal(String(retry.body.data.batch._id), batchId);
    assert.equal(await VocabularyImportBatch.countDocuments(), 1);
    assert.equal(await VocabularyImportCandidate.countDocuments({ batchId }), 2);

    const list = await readJson(await jsonRequest(`/admin/vocabulary-import-batches/${batchId}/candidates?page=1&limit=1&search=synthetic%20item&status=NEEDS_REVIEW`));
    assert.equal(list.status, 200);
    assert.equal(list.body.data.pagination.total, 2);
    assert.equal(list.body.data.items.length, 1);
    assert.equal(list.body.data.items[0].status, 'VALID');
    const detail = await readJson(await jsonRequest(`/admin/vocabulary-import-batches/${batchId}/candidates/${firstCandidate._id}`));
    assert.equal(detail.status, 200);
    assert.equal(detail.body.data.auditHistory.length, 0);
  });

  await t.test('field edits are allow-listed, optimistic and audited without mutating raw or parsed values', async () => {
    const storedBefore = await VocabularyImportCandidate.findById(firstCandidate._id).lean();
    const massAssignment = await readJson(await jsonRequest(
      `/admin/vocabulary-import-batches/${batchId}/candidates/${firstCandidate._id}`,
      { method: 'PATCH', body: { expectedVersion: firstCandidate.version, reason: 'synthetic test', changes: { word: 'changed', sourceIdentity: 'forged' } } },
    ));
    assert.equal(massAssignment.status, 400);
    assert.equal(massAssignment.body.code, 'MASS_ASSIGNMENT_REJECTED');
    const nestedMassAssignment = await readJson(await jsonRequest(
      `/admin/vocabulary-import-batches/${batchId}/candidates/${firstCandidate._id}`,
      { method: 'PATCH', body: { expectedVersion: firstCandidate.version, reason: 'synthetic test', changes: { senses: [{ meaning: 'forged source', sourceLocators: [] }] } } },
    ));
    assert.equal(nestedMassAssignment.status, 400);
    assert.equal(nestedMassAssignment.body.code, 'MASS_ASSIGNMENT_REJECTED');
    const htmlPayload = await readJson(await jsonRequest(
      `/admin/vocabulary-import-batches/${batchId}/candidates/${firstCandidate._id}`,
      { method: 'PATCH', body: { expectedVersion: firstCandidate.version, reason: 'synthetic test', changes: { word: '<script>alert(1)</script>' } } },
    ));
    assert.equal(htmlPayload.status, 400);
    assert.equal(htmlPayload.body.code, 'INVALID_EDIT_VALUE');

    const patchBody = {
      expectedVersion: firstCandidate.version,
      reason: 'Editorial correction in synthetic fixture.',
      changes: {
        word: 'synthetic item edited',
        senses: [{
          partOfSpeech: ['noun'],
          meaning: 'an editor-approved synthetic entry',
          examples: [{ english: 'This is an edited example.', vietnamese: 'Đây là ví dụ đã sửa.' }],
        }],
        notes: ['Edited in isolated test.'],
      },
    };
    const edited = await readJson(await jsonRequest(
      `/admin/vocabulary-import-batches/${batchId}/candidates/${firstCandidate._id}`,
      { method: 'PATCH', body: patchBody },
    ));
    assert.equal(edited.status, 200);
    assert.equal(edited.body.data.status, 'VALID');
    assert.equal(edited.body.data.reviewStatus, 'NEEDS_REVIEW');
    assert.equal(edited.body.data.editedValues.word, patchBody.changes.word);
    const invalidated = await readJson(await jsonRequest(
      `/admin/vocabulary-import-batches/${batchId}/candidates/${firstCandidate._id}`,
      { method: 'PATCH', body: { expectedVersion: edited.body.data.version, reason: 'Synthetic validation boundary.', changes: { senses: [{ partOfSpeech: ['noun'], meaning: '', examples: [] }] } } },
    ));
    assert.equal(invalidated.status, 200);
    assert.equal(invalidated.body.data.status, 'INVALID');
    const revalidated = await readJson(await jsonRequest(
      `/admin/vocabulary-import-batches/${batchId}/candidates/${firstCandidate._id}`,
      { method: 'PATCH', body: { expectedVersion: invalidated.body.data.version, reason: 'Restore valid synthetic definition.', changes: { senses: patchBody.changes.senses } } },
    ));
    assert.equal(revalidated.status, 200);
    assert.equal(revalidated.body.data.status, 'VALID');
    const storedAfter = await VocabularyImportCandidate.findById(firstCandidate._id).lean();
    assert.deepEqual(storedAfter.rawValues, storedBefore.rawValues);
    assert.deepEqual(storedAfter.parsedValues, storedBefore.parsedValues);
    assert.equal(storedAfter.sourceIdentity, storedBefore.sourceIdentity);
    const details = await readJson(await jsonRequest(`/admin/vocabulary-import-batches/${batchId}/candidates/${firstCandidate._id}`));
    assert.equal(details.body.data.auditHistory.length, 3);
    assert.equal(details.body.data.auditHistory[0].action, 'FIELDS_EDITED');
    assert.equal(String(details.body.data.auditHistory[0].actorId), String(adminId));
    assert.equal(details.body.data.auditHistory[0].changedFields.length, 3);

    const oldVersion = firstCandidate.version;
    const staleEdit = await readJson(await jsonRequest(
      `/admin/vocabulary-import-batches/${batchId}/candidates/${firstCandidate._id}`,
      { method: 'PATCH', body: { expectedVersion: oldVersion, reason: 'stale retry', changes: { notes: [] } } },
    ));
    assert.equal(staleEdit.status, 409);
    assert.equal(staleEdit.body.code, 'CONCURRENT_MODIFICATION');
    firstCandidate = revalidated.body.data;

    const auditFailureCandidate = await VocabularyImportCandidate.findById(secondCandidate._id).lean();
    const originalAuditCreate = VocabularyImportAudit.create;
    VocabularyImportAudit.create = async () => { throw new Error('synthetic audit storage failure'); };
    try {
      const partialWriteAttempt = await readJson(await jsonRequest(
        `/admin/vocabulary-import-batches/${batchId}/candidates/${secondCandidate._id}`,
        { method: 'PATCH', body: { expectedVersion: secondCandidate.version, reason: 'Must roll back if audit fails.', changes: { notes: ['must not persist'] } } },
      ));
      assert.equal(partialWriteAttempt.status, 500);
      assert.equal(partialWriteAttempt.body.code, 'IMPORT_WORKFLOW_FAILED');
    } finally {
      VocabularyImportAudit.create = originalAuditCreate;
    }
    const afterAuditFailure = await VocabularyImportCandidate.findById(secondCandidate._id).lean();
    assert.equal(afterAuditFailure.__v, auditFailureCandidate.__v);
    assert.deepEqual(afterAuditFailure.editedValues, auditFailureCandidate.editedValues);
    assert.equal(await VocabularyImportAudit.countDocuments({ candidateId: secondCandidate._id }), 0);

    const concurrentEditBody = {
      expectedVersion: secondCandidate.version,
      reason: 'Concurrent synthetic edit attempt.',
      changes: { notes: ['one writer wins'] },
    };
    const concurrentEdits = await Promise.all([
      jsonRequest(`/admin/vocabulary-import-batches/${batchId}/candidates/${secondCandidate._id}`, { method: 'PATCH', body: concurrentEditBody }),
      jsonRequest(`/admin/vocabulary-import-batches/${batchId}/candidates/${secondCandidate._id}`, { method: 'PATCH', body: concurrentEditBody }),
    ]);
    const editOutcomes = await Promise.all(concurrentEdits.map(readJson));
    assert.equal(editOutcomes.filter((outcome) => outcome.status === 200).length, 1);
    assert.equal(editOutcomes.filter((outcome) => outcome.status === 409).length, 1);
    assert.equal(await VocabularyImportAudit.countDocuments({ candidateId: secondCandidate._id, action: 'FIELDS_EDITED' }), 1);
    secondCandidate = editOutcomes.find((outcome) => outcome.status === 200).body.data;
  });

  await t.test('review requires explicit duplicate treatment and records rejection reason', async () => {
    const unapprovedDuplicate = await readJson(await jsonRequest(
      `/admin/vocabulary-import-batches/${batchId}/candidates/${firstCandidate._id}/review`,
      { method: 'POST', body: { expectedVersion: firstCandidate.version, decision: 'APPROVE' } },
    ));
    assert.equal(unapprovedDuplicate.status, 409);
    assert.equal(unapprovedDuplicate.body.code, 'DUPLICATE_DECISION_REQUIRED');

    const approved = await readJson(await jsonRequest(
      `/admin/vocabulary-import-batches/${batchId}/candidates/${firstCandidate._id}/review`,
      { method: 'POST', body: { expectedVersion: firstCandidate.version, decision: 'APPROVE', duplicateDecision: 'KEEP_SEPARATE', reason: 'Keep this occurrence distinct.' } },
    ));
    assert.equal(approved.status, 200);
    assert.equal(approved.body.data.reviewStatus, 'REVIEW_APPROVED');
    assert.equal(approved.body.data.duplicateDecision, 'KEEP_SEPARATE');
    firstCandidate = approved.body.data;

    const rejected = await readJson(await jsonRequest(
      `/admin/vocabulary-import-batches/${batchId}/candidates/${secondCandidate._id}/review`,
      { method: 'POST', body: { expectedVersion: secondCandidate.version, decision: 'REJECT', reason: 'Synthetic editorial rejection.' } },
    ));
    assert.equal(rejected.status, 200);
    assert.equal(rejected.body.data.status, 'REVIEW_REJECTED');
    assert.equal(rejected.body.data.rejectionReason, 'Synthetic editorial rejection.');
    secondCandidate = rejected.body.data;
    const batch = await readJson(await jsonRequest(`/admin/vocabulary-import-batches/${batchId}`));
    assert.equal(batch.body.data.counts.approved, 1);
    assert.equal(batch.body.data.counts.rejected, 1);
    assert.equal(batch.body.data.status, 'REVIEW_COMPLETE');
  });

  await t.test('Confirm Draft is atomic, rich-content preserving and retry/concurrency safe', async () => {
    const batch = await readJson(await jsonRequest(`/admin/vocabulary-import-batches/${batchId}`));
    const confirmBody = { expectedVersion: batch.body.data.version, candidateIds: [firstCandidate._id] };
    const confirms = await Promise.all([
      jsonRequest(`/admin/vocabulary-import-batches/${batchId}/confirm`, { method: 'POST', body: confirmBody }),
      jsonRequest(`/admin/vocabulary-import-batches/${batchId}/confirm`, { method: 'POST', body: confirmBody }),
    ]);
    const results = await Promise.all(confirms.map(readJson));
    for (const result of results) assert.equal(result.status, 200, JSON.stringify(result.body));
    assert.equal(results.filter((result) => result.body.data.idempotent).length, 1);
    assert.equal(results.every((result) => result.body.data.results[0].status === 'IMPORTED_AS_DRAFT'), true);
    assert.equal(await Vocabulary.countDocuments({ catalogOnly: true }), 1);
    assert.equal(await Vocabulary.countDocuments({ catalogStatus: 'published' }), 0);
    assert.equal(await VocabularyTag.countDocuments(), 1);
    assert.equal(await VocabularyChapter.countDocuments(), 1);
    assert.equal(await ChapterVocabulary.countDocuments(), 1);

    const persistedCandidate = await VocabularyImportCandidate.findById(firstCandidate._id).lean();
    const draftVocabulary = await Vocabulary.findById(persistedCandidate.importedVocabularyId).lean();
    assert.equal(draftVocabulary.catalogStatus, 'draft');
    assert.equal(draftVocabulary.status, 'hidden');
    assert.equal(draftVocabulary.lesson, undefined);
    assert.equal(draftVocabulary.course, undefined);
    assert.equal(draftVocabulary.catalogSenses.length, 1);
    assert.equal(draftVocabulary.catalogSenses[0].examples.length, 1);
    assert.equal(draftVocabulary.catalogNotes[0], 'Edited in isolated test.');
    assert.equal(await VocabularyImportAudit.countDocuments({ candidateId: firstCandidate._id, action: 'CONFIRMED_DRAFT' }), 1);
    assert.equal(await VocabularyImportCandidate.countDocuments({ reviewStatus: 'REVIEW_REJECTED', importStatus: 'IMPORTED_AS_DRAFT' }), 0);

    const staleCandidateEdit = await readJson(await jsonRequest(
      `/admin/vocabulary-import-batches/${batchId}/candidates/${firstCandidate._id}`,
      { method: 'PATCH', body: { expectedVersion: firstCandidate.version, reason: 'late edit', changes: { notes: [] } } },
    ));
    assert.equal(staleCandidateEdit.status, 409);
    assert.equal(staleCandidateEdit.body.code, 'CANDIDATE_ALREADY_IMPORTED');
  });

  await t.test('changed source file is detected as a revision and requires human review before another Draft', async () => {
    const revised = await readJson(await postFile(syntheticDocx({ secondMeaning: 'a revised synthetic meaning', thirdWord: 'synthetic item edited' })));
    assert.equal(revised.status, 201, JSON.stringify(revised.body));
    assert.notEqual(String(revised.body.data.batch._id), batchId);
    const revisionCandidate = revised.body.data.candidates[0];
    const catalogDuplicateCandidate = revised.body.data.candidates[1];
    assert.equal(revisionCandidate.duplicateMetadata.sourceRevision.revisionDetected, true);
    assert.equal(revisionCandidate.reviewStatus, 'NEEDS_REVIEW');
    assert.equal(revisionCandidate.status, 'VALID');
    assert.equal(catalogDuplicateCandidate.duplicateMetadata.catalogMatches.length, 1);
    assert.equal(catalogDuplicateCandidate.duplicateMetadata.catalogMatches[0].reuseAllowed, false);
    const withoutDecision = await readJson(await jsonRequest(
      `/admin/vocabulary-import-batches/${revised.body.data.batch._id}/candidates/${revisionCandidate._id}/review`,
      { method: 'POST', body: { expectedVersion: revisionCandidate.version, decision: 'APPROVE' } },
    ));
    assert.equal(withoutDecision.status, 409);
    assert.equal(withoutDecision.body.code, 'DUPLICATE_DECISION_REQUIRED');
    const reviewed = await readJson(await jsonRequest(
      `/admin/vocabulary-import-batches/${revised.body.data.batch._id}/candidates/${revisionCandidate._id}/review`,
      { method: 'POST', body: { expectedVersion: revisionCandidate.version, decision: 'APPROVE', duplicateDecision: 'KEEP_SEPARATE' } },
    ));
    assert.equal(reviewed.status, 200);
    const revisedBatch = await readJson(await jsonRequest(`/admin/vocabulary-import-batches/${revised.body.data.batch._id}`));
    const body = { expectedVersion: revisedBatch.body.data.version, candidateIds: [revisionCandidate._id] };
    const concurrent = await Promise.all([
      jsonRequest(`/admin/vocabulary-import-batches/${revised.body.data.batch._id}/confirm`, { method: 'POST', body }),
      jsonRequest(`/admin/vocabulary-import-batches/${revised.body.data.batch._id}/confirm`, { method: 'POST', body }),
    ]);
    const outcomes = await Promise.all(concurrent.map(readJson));
    for (const outcome of outcomes) assert.equal(outcome.status, 200, JSON.stringify(outcome.body));
    assert.equal(await Vocabulary.countDocuments({ catalogOnly: true }), 2);
    assert.equal(await ChapterVocabulary.countDocuments(), 2);
    assert.equal(await VocabularyImportAudit.countDocuments({ candidateId: revisionCandidate._id, action: 'CONFIRMED_DRAFT' }), 1);
  });

  await t.test('multi-file Batch annotates exact same-content occurrences across Chapters without merging', async () => {
    const sharedFileContent = syntheticDocx({ thirdWord: 'different synthetic item' });
    const uploaded = await readJson(await postFiles([
      { buffer: sharedFileContent, filename: 'Start 3.docx' },
      { buffer: sharedFileContent, filename: 'Start 4.docx' },
    ]));
    assert.equal(uploaded.status, 201);
    assert.equal(uploaded.body.data.batch.sourceFiles.length, 2);
    assert.equal(uploaded.body.data.batch.candidateCount, 4);
    assert.ok(uploaded.body.data.batch.duplicateGroupCount >= 1);
    assert.equal(uploaded.body.data.candidates.length, 4);
    assert.equal(uploaded.body.data.candidates.every((candidate) => candidate.reviewStatus === 'NEEDS_REVIEW'), true);
    assert.equal(await VocabularyImportCandidate.countDocuments({ batchId: uploaded.body.data.batch._id }), 4);
    assert.equal(await Vocabulary.countDocuments({ catalogOnly: true }), 2, 'upload preview must never create Catalog Vocabulary');
  });
});
