import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import mongoose from 'mongoose';
import ChapterVocabulary from '../src/models/ChapterVocabulary.js';
import Vocabulary from '../src/models/Vocabulary.js';
import VocabularyChapter from '../src/models/VocabularyChapter.js';
import VocabularyImportAudit from '../src/models/VocabularyImportAudit.js';
import VocabularyImportCandidate from '../src/models/VocabularyImportCandidate.js';
import VocabularyTag from '../src/models/VocabularyTag.js';
import { createCatalogVocabulary } from '../src/services/vocabularyCatalogService.js';
import { startVocabularyPublicationV5aHarness, syntheticPublicationDocx } from './helpers/vocabularyPublicationV5aHarness.js';

const harnessPort = Number(process.env.VOCAB_PUBLICATION_V5A_TEST_PORT || 0);
let harness;
const auth = (role = 'admin') => ({ Authorization: `Bearer synthetic-${role}` });

async function request(path, { method = 'GET', body, role = 'admin', headers = {} } = {}) {
  const response = await fetch(`${harness.baseUrl}${path}`, {
    method,
    headers: { ...auth(role), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  let payload = null;
  try { payload = await response.json(); } catch { /* status and empty payload still help assertions */ }
  return { status: response.status, payload };
}

async function createTag(name, slug) {
  return request('/admin/vocabulary-catalog/tags', { method: 'POST', body: { name, slug, description: `Synthetic ${name}` } });
}

async function createChapter(tagId, title) {
  return request(`/admin/vocabulary-catalog/tags/${tagId}/chapters`, {
    method: 'POST', body: { title, chapterNumber: 1, description: `Synthetic ${title}` },
  });
}

async function jsonPayload(result, status = 200) {
  assert.equal(result.status, status, JSON.stringify(result.payload));
  return result.payload.data;
}

async function prepareImportedDrafts({ tagId, chapterId, sources }) {
  const form = new FormData();
  for (const source of sources) {
    form.append('files', new Blob([syntheticPublicationDocx(source)], {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    }), `${source.title}.docx`);
  }
  form.append('sourceFolder', 'TOEIC EASY START');
  const uploadResponse = await fetch(`${harness.baseUrl}/admin/vocabulary-import-batches`, {
    method: 'POST', headers: auth(), body: form,
  });
  const upload = await uploadResponse.json();
  assert.equal(uploadResponse.status, 201, JSON.stringify(upload));
  const batch = upload.data.batch;
  const mappingResult = await request(`/admin/vocabulary-import-batches/${batch._id}/catalog-mapping`);
  const openMapping = await jsonPayload(mappingResult);
  const mappingBody = {
    expectedVersion: null,
    targetTagId: tagId,
    entries: openMapping.mapping.entries.map((entry) => ({
      sourceFileIdentity: entry.sourceFileIdentity,
      chapterAction: 'EXISTING',
      targetChapterId: chapterId,
    })),
  };
  await jsonPayload(await request(`/admin/vocabulary-import-batches/${batch._id}/catalog-mapping`, { method: 'PUT', body: mappingBody }));
  const candidateResult = await request(`/admin/vocabulary-import-batches/${batch._id}/candidates?page=1&limit=20`);
  const candidates = (await jsonPayload(candidateResult)).items;
  assert.equal(candidates.length, sources.length * 2);
  assert.ok(candidates.every((candidate) => candidate.validationStatus === 'VALIDATION_PASSED'), JSON.stringify(candidates.map((item) => item.validationIssues)));
  const perSourceOrdinal = new Map();
  for (const candidate of candidates) {
    const source = sources.find((item) => String(candidate.sourceMetadata?.relativePath || '').endsWith(`${item.title}.docx`));
    assert.ok(source, `candidate path should match one synthetic source: ${candidate.sourceMetadata?.relativePath}`);
    const localOrdinal = (perSourceOrdinal.get(source.title) || 0) + 1;
    perSourceOrdinal.set(source.title, localOrdinal);
    const editedResult = await request(`/admin/vocabulary-import-batches/${batch._id}/candidates/${candidate._id}`, {
      method: 'PATCH',
      body: {
        expectedVersion: candidate.version,
        reason: 'Assign a distinct synthetic word for the publication scenario.',
        changes: { word: `${source.word} ${source.title.toLowerCase().replace(/\s+/g, '-')}-${localOrdinal}` },
      },
    });
    assert.equal(editedResult.status, 200, JSON.stringify(editedResult.payload));
    const edited = editedResult.payload.data;
    const review = await request(`/admin/vocabulary-import-batches/${batch._id}/candidates/${candidate._id}/review`, {
      method: 'POST',
      body: {
        expectedVersion: edited.version,
        decision: 'APPROVE',
        reason: 'Reviewed synthetic content and examples.',
        duplicateDecision: 'KEEP_SEPARATE',
      },
    });
    assert.equal(review.status, 200, JSON.stringify(review.payload));
  }
  const refreshedBatch = await request(`/admin/vocabulary-import-batches/${batch._id}`);
  const batchState = await jsonPayload(refreshedBatch);
  const confirmed = await request(`/admin/vocabulary-import-batches/${batch._id}/confirm`, {
    method: 'POST',
    body: { expectedVersion: batchState.version, candidateIds: candidates.map((candidate) => candidate._id) },
  });
  const confirmData = await jsonPayload(confirmed);
  assert.equal(confirmData.results.length, sources.length * 2);
  return { batchId: String(batch._id), candidates: candidates.map((candidate) => String(candidate._id)), results: confirmData.results };
}

async function reviewStructural(type, entity, decision = 'APPROVE') {
  const path = type === 'TAG' ? `/admin/vocabulary-publication/tags/${entity._id}/review` : `/admin/vocabulary-publication/chapters/${entity._id}/review`;
  const result = await request(path, {
    method: 'POST',
    body: { expectedVersion: entity.version, decision, reason: decision === 'APPROVE' ? 'Checked names, relations and intended catalog scope.' : 'Rejected by synthetic publication test.' },
  });
  return jsonPayload(result);
}

async function publish(type, entity, membershipId = null, key = null, role = 'admin') {
  const root = type === 'TAG' ? 'tags' : type === 'CHAPTER' ? 'chapters' : 'vocabularies';
  const action = 'publish';
  const body = {
    expectedVersion: entity.version,
    idempotencyKey: key || `v5a-test-${new mongoose.Types.ObjectId()}`,
    ...(membershipId ? { membershipId } : {}),
  };
  return request(`/admin/vocabulary-publication/${root}/${entity._id}/${action}`, { method: 'POST', body, role });
}

before(async () => {
  harness = await startVocabularyPublicationV5aHarness({
    port: harnessPort,
    databaseName: `vocabulary_publication_v5a_api_test`,
  });
});

after(async () => { await harness?.close(); });

test('Phase V5A isolated Publication workflow, evidence and Student visibility', async (t) => {
  const createdTag = await jsonPayload(await createTag('V5A Synthetic Release', 'v5a-synthetic-release'), 201);
  const tag = createdTag.tag;
  const createdChapter = await jsonPayload(await createChapter(tag._id, 'Synthetic Published Chapter'), 201);
  const chapter = createdChapter.chapter;

  await t.test('Draft Tag and Chapter are hidden from Student', async () => {
    const tagList = await request('/student/vocabulary-catalog/tags', { role: 'student' });
    assert.equal(tagList.status, 200);
    assert.equal(tagList.payload.data.items.some((item) => item._id === tag._id), false);
    const chapterDetail = await request(`/student/vocabulary-catalog/chapters/${chapter._id}`, { role: 'student' });
    assert.equal(chapterDetail.status, 404);
  });

  await t.test('Trusted Admin is required and status fields cannot be supplied by the client', async () => {
    const body = { expectedVersion: tag.version, idempotencyKey: 'v5a-auth-check-key-0001', status: 'published' };
    assert.equal((await publish('TAG', tag, null, body.idempotencyKey, 'teacher')).status, 403);
    assert.equal((await publish('TAG', tag, null, body.idempotencyKey, 'student')).status, 403);
    const clientStatus = await request(`/admin/vocabulary-publication/tags/${tag._id}/publish`, { method: 'POST', body });
    assert.equal(clientStatus.status, 400);
    assert.equal(clientStatus.payload.code, 'MASS_ASSIGNMENT_REJECTED');
  });

  const reviewedTag = (await reviewStructural('TAG', tag)).entity;
  const reviewedChapter = (await reviewStructural('CHAPTER', chapter)).entity;
  const chapterBeforeParent = await publish('CHAPTER', reviewedChapter);
  assert.equal(chapterBeforeParent.status, 409);
  assert.ok(chapterBeforeParent.payload.details.blockers.includes('TAG_NOT_PUBLISHED'));

  const publishedTagResponse = await publish('TAG', reviewedTag, null, 'v5a-publish-tag-retry-key-001');
  assert.equal(publishedTagResponse.status, 200, JSON.stringify(publishedTagResponse.payload));
  const publishedTag = publishedTagResponse.payload.data.entity;

  await t.test('Published Tag is visible while Draft Chapter remains hidden', async () => {
    const tagList = await request('/student/vocabulary-catalog/tags', { role: 'student' });
    assert.equal(tagList.status, 200);
    assert.equal(tagList.payload.data.items.some((item) => item._id === tag._id), true);
    const chapterDetail = await request(`/student/vocabulary-catalog/chapters/${chapter._id}`, { role: 'student' });
    assert.equal(chapterDetail.status, 404);
  });

  const publishedChapterResponse = await publish('CHAPTER', reviewedChapter);
  assert.equal(publishedChapterResponse.status, 200, JSON.stringify(publishedChapterResponse.payload));
  const publishedChapter = publishedChapterResponse.payload.data.entity;
  const publishedChapterList = await request(`/student/vocabulary-catalog/tags/${tag._id}/chapters`, { role: 'student' });
  assert.equal(publishedChapterList.status, 200);
  assert.ok(publishedChapterList.payload.data.items.some((item) => item._id === chapter._id));
  assert.equal(JSON.stringify(publishedChapterList.payload).includes('sourceIdentity'), false);
  assert.equal(JSON.stringify(publishedChapterList.payload).includes('reviewedBy'), false);
  assert.equal(JSON.stringify(publishedChapterList.payload).includes('rawValues'), false);

  const imported = await prepareImportedDrafts({
    tagId: tag._id,
    chapterId: chapter._id,
    sources: [
      { title: 'Applicant Source', word: 'synthetic applicant', meaning: 'a person who applies for something' },
      { title: 'Reliable Source', word: 'synthetic reliable', meaning: 'able to be trusted' },
    ],
  });
  const summaryResponse = await request(`/admin/vocabulary-publication/tags/${tag._id}/summary`);
  const summary = await jsonPayload(summaryResponse);
  assert.equal(summary.counts.vocabularyTotal, 4);
  assert.equal(summary.counts.reviewed, 4);
  assert.equal(summary.counts.canPublish, 4);
  assert.equal(summary.counts.blocked, 0);
  assert.equal(summary.chapters[0].items.every((item) => item.candidate?.batchId === imported.batchId), true);

  await t.test('Import eligibility requires batch, review/confirm audits, exact membership and unchanged content', async () => {
    const row = summary.chapters[0].items[0];
    const candidate = await VocabularyImportCandidate.findById(row.candidate.candidateId);
    const reviewAudit = await VocabularyImportAudit.findOne({ candidateId: candidate._id, action: 'REVIEW_DECISION' });
    const confirmAudit = await VocabularyImportAudit.findOne({ candidateId: candidate._id, action: 'CONFIRMED_DRAFT' });
    const savedReview = reviewAudit.toObject({ transform: false });

    await VocabularyImportAudit.deleteOne({ _id: reviewAudit._id });
    let eligibility = await request(`/admin/vocabulary-publication/eligibility/VOCABULARY/${row.vocabularyId}?membershipId=${row.membershipId}`);
    assert.equal(eligibility.status, 200);
    assert.ok(eligibility.payload.data.blockers.includes('REVIEW_AUDIT_REQUIRED'));
    await VocabularyImportAudit.create(savedReview);

    const originalChapterId = candidate.importedChapterId;
    candidate.importedChapterId = new mongoose.Types.ObjectId();
    await candidate.save();
    eligibility = await request(`/admin/vocabulary-publication/eligibility/VOCABULARY/${row.vocabularyId}?membershipId=${row.membershipId}`);
    assert.ok(eligibility.payload.data.blockers.includes('IMPORTED_REFERENCE_MISMATCH'));
    candidate.importedChapterId = originalChapterId;
    await candidate.save();

    const originalWord = candidate.editedValues?.word;
    candidate.editedValues = { ...candidate.editedValues, word: 'tampered after review' };
    await candidate.save();
    eligibility = await request(`/admin/vocabulary-publication/eligibility/VOCABULARY/${row.vocabularyId}?membershipId=${row.membershipId}`);
    assert.ok(eligibility.payload.data.blockers.includes('REVIEW_CONTENT_CHANGED'));
    assert.ok(eligibility.payload.data.blockers.includes('IMPORTED_CONTENT_CHANGED'));
    candidate.editedValues = { ...candidate.editedValues, ...(originalWord ? { word: originalWord } : {}) };
    if (!originalWord) delete candidate.editedValues.word;
    await candidate.save();

    const savedConfirm = confirmAudit.toObject({ transform: false });
    await VocabularyImportAudit.deleteOne({ _id: confirmAudit._id });
    eligibility = await request(`/admin/vocabulary-publication/eligibility/VOCABULARY/${row.vocabularyId}?membershipId=${row.membershipId}`);
    assert.ok(eligibility.payload.data.blockers.includes('CONFIRM_AUDIT_REQUIRED'));
    await VocabularyImportAudit.create(savedConfirm);
  });

  await t.test('Vocabulary without import provenance remains blocked; no synthetic audit is created for manual content', async () => {
    const manual = await createCatalogVocabulary({ word: 'manual catalog word', meaning: 'manual test word' });
    const membershipResult = await request(`/admin/vocabulary-catalog/chapters/${chapter._id}/memberships`, {
      method: 'POST', body: { vocabularyId: String(manual._id), expectedVersion: publishedChapter.version },
    });
    assert.equal(membershipResult.status, 201, JSON.stringify(membershipResult.payload));
    const membershipId = membershipResult.payload.data.membershipId;
    const eligibility = await request(`/admin/vocabulary-publication/eligibility/VOCABULARY/${manual._id}?membershipId=${membershipId}`);
    assert.equal(eligibility.status, 200);
    assert.ok(eligibility.payload.data.blockers.includes('IMPORT_PROVENANCE_REQUIRED'));
    assert.equal(await VocabularyImportAudit.countDocuments({ sourceIdentity: null }), 0);
  });

  const firstRow = summary.chapters[0].items.find((item) => item.word.includes('applicant')) || summary.chapters[0].items[0];
  const secondRow = summary.chapters[0].items.find((item) => item.membershipId !== firstRow.membershipId);
  const firstPublishKey = 'v5a-word-publish-retry-idem-key-001';
  const firstPublished = await publish('VOCABULARY', { _id: firstRow.vocabularyId, version: firstRow.version }, firstRow.membershipId, firstPublishKey);
  assert.equal(firstPublished.status, 200, JSON.stringify(firstPublished.payload));
  const replay = await publish('VOCABULARY', { _id: firstRow.vocabularyId, version: firstRow.version }, firstRow.membershipId, firstPublishKey);
  assert.equal(replay.status, 200);
  assert.equal(replay.payload.data.idempotent, true);

  await t.test('Concurrent Publish serializes; Student receives only published Catalog fields', async () => {
    const concurrent = await Promise.all([
      publish('VOCABULARY', { _id: secondRow.vocabularyId, version: secondRow.version }, secondRow.membershipId, 'v5a-word-concurrent-key-0001'),
      publish('VOCABULARY', { _id: secondRow.vocabularyId, version: secondRow.version }, secondRow.membershipId, 'v5a-word-concurrent-key-0002'),
    ]);
    assert.deepEqual(concurrent.map((item) => item.status).sort(), [200, 409]);
    const studentWords = await request(`/student/vocabulary-catalog/chapters/${chapter._id}/vocabularies?limit=20`, { role: 'student' });
    assert.equal(studentWords.status, 200, JSON.stringify(studentWords.payload));
    assert.equal(studentWords.payload.data.items.length, 2);
    const studentText = JSON.stringify(studentWords.payload);
    for (const forbidden of ['sourceIdentity', 'rawValues', 'parsedValues', 'reviewedBy', 'VocabularyPublicationAudit', 'private-source']) {
      assert.equal(studentText.includes(forbidden), false, `Student response leaked ${forbidden}`);
    }
  });

  await t.test('Hide and Archive preserve records but remove Student direct access', async () => {
    const hide = await request(`/admin/vocabulary-publication/vocabularies/${firstRow.vocabularyId}/hide`, {
      method: 'POST', body: {
        expectedVersion: firstPublished.payload.data.entity.version,
        idempotencyKey: 'v5a-word-hide-idempotency-key-01',
        membershipId: firstRow.membershipId,
      },
    });
    assert.equal(hide.status, 200, JSON.stringify(hide.payload));
    const afterHide = await request(`/student/vocabulary-catalog/chapters/${chapter._id}/vocabularies?limit=20`, { role: 'student' });
    assert.equal(afterHide.payload.data.items.length, 1);
    assert.equal(await Vocabulary.countDocuments({ _id: firstRow.vocabularyId }), 1);
    assert.equal(await ChapterVocabulary.countDocuments({ vocabularyId: firstRow.vocabularyId }), 1);

    const currentChapter = await jsonPayload(await request(`/admin/vocabulary-catalog/chapters/${chapter._id}`));
    const archived = await request(`/admin/vocabulary-publication/chapters/${chapter._id}/archive`, {
      method: 'POST', body: {
        expectedVersion: currentChapter.chapter.version,
        idempotencyKey: 'v5a-chapter-archive-idempotency-01',
      },
    });
    assert.equal(archived.status, 200, JSON.stringify(archived.payload));
    const hiddenChapter = await request(`/student/vocabulary-catalog/chapters/${chapter._id}`, { role: 'student' });
    assert.equal(hiddenChapter.status, 404);
    const archivedTag = await request(`/admin/vocabulary-publication/tags/${tag._id}/archive`, {
      method: 'POST', body: {
        expectedVersion: publishedTagResponse.payload.data.entity.version,
        idempotencyKey: 'v5a-tag-archive-idempotency-key-01',
      },
    });
    assert.equal(archivedTag.status, 200, JSON.stringify(archivedTag.payload));
    const hiddenTag = await request(`/student/vocabulary-catalog/tags/${tag._id}/chapters`, { role: 'student' });
    assert.equal(hiddenTag.status, 404);
    assert.equal(await Vocabulary.countDocuments({ _id: { $in: imported.results.map((row) => row.vocabularyId) } }), imported.results.length);
  });

  await t.test('Rejected structural content and stale review snapshots cannot Publish', async () => {
    const rejected = (await jsonPayload(await createTag('V5A Rejected', 'v5a-rejected'), 201)).tag;
    const rejectedReview = await reviewStructural('TAG', rejected, 'REJECT');
    const blocked = await publish('TAG', rejectedReview.entity);
    assert.equal(blocked.status, 409);
    assert.ok(blocked.payload.details.blockers.includes('EDITORIAL_REVIEW_REJECTED'));

    const stale = (await jsonPayload(await createTag('V5A Stale Review', 'v5a-stale-review'), 201)).tag;
    const approved = (await reviewStructural('TAG', stale)).entity;
    const edited = await request(`/admin/vocabulary-catalog/tags/${stale._id}`, {
      method: 'PATCH', body: { expectedVersion: approved.version, name: 'V5A Changed After Review' },
    });
    assert.equal(edited.status, 200, JSON.stringify(edited.payload));
    const stalePublish = await publish('TAG', edited.payload.data.tag);
    assert.equal(stalePublish.status, 409);
    assert.ok(stalePublish.payload.details.blockers.includes('EDITORIAL_REVIEW_STALE'));
  });

  const remainingAudit = await request(`/admin/vocabulary-publication/audit?entityType=TAG&entityId=${tag._id}`);
  assert.equal(remainingAudit.status, 200);
  assert.ok(remainingAudit.payload.data.items.some((entry) => entry.action === 'PUBLISHED' && entry.entityVersion > 0));
  assert.equal(await mongoose.connection.db.databaseName, 'vocabulary_publication_v5a_api_test');
  assert.equal(await VocabularyTag.countDocuments({ status: 'archived' }), 1);
  assert.equal(await VocabularyChapter.countDocuments({ status: 'archived' }), 1);
  assert.equal(await Vocabulary.countDocuments({ catalogStatus: 'archived' }), 1);
});
