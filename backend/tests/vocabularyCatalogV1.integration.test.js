import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { strToU8, zipSync } from 'fflate';
import {
  archiveVocabularyChapter,
  addVocabularyToChapter,
  createCatalogVocabulary,
  createVocabularyChapter,
  createVocabularyTag,
  listPublishedCatalogVocabulary,
  VocabularyCatalogError,
} from '../src/services/vocabularyCatalogService.js';
import { adaptVocabularyParserCandidate } from '../src/services/vocabularyCatalogCandidateAdapter.js';
import Vocabulary from '../src/models/Vocabulary.js';
import VocabularyTag from '../src/models/VocabularyTag.js';
import VocabularyChapter from '../src/models/VocabularyChapter.js';
import ChapterVocabulary from '../src/models/ChapterVocabulary.js';
import VocabularyImportBatch from '../src/models/VocabularyImportBatch.js';
import VocabularyImportCandidate from '../src/models/VocabularyImportCandidate.js';
import VocabularyImportAudit from '../src/models/VocabularyImportAudit.js';
import LearningProgress from '../src/models/LearningProgress.js';
import Course from '../src/models/Course.js';
import Lesson from '../src/models/Lesson.js';
import {
  deleteVocabulary,
  getAdminVocabulary,
  getAdminVocabularyById,
  getStudentVocabularyByLesson,
  previewDocxVocabulary,
  confirmDocxVocabularyImport,
  updateVocabulary,
} from '../src/controllers/vocabularyController.js';
import { deleteLesson, getLessonById } from '../src/controllers/lessonController.js';
import { deleteCourse } from '../src/controllers/courseController.js';
import {
  persistVocabularyCandidateEnvelope,
} from '../src/services/vocabularyCandidatePersistence.js';

let memoryServer;

before(async () => {
  assert.equal(mongoose.connection.readyState, 0, 'test must start without an application database connection');
  memoryServer = await MongoMemoryServer.create({
    instance: { ip: '127.0.0.1', dbName: 'vocabulary_catalog_v1_test' },
  });
  const uri = memoryServer.getUri('vocabulary_catalog_v1_test');
  assert.equal(new URL(uri).hostname, '127.0.0.1', 'MongoMemoryServer must bind to loopback');
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  await Promise.all([
    Vocabulary.init(),
    VocabularyTag.init(),
    VocabularyChapter.init(),
    ChapterVocabulary.init(),
    VocabularyImportBatch.init(),
    VocabularyImportCandidate.init(),
    VocabularyImportAudit.init(),
    LearningProgress.init(),
  ]);
});

after(async () => {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  if (memoryServer) await memoryServer.stop();
});

function responseRecorder() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

async function callController(controller, req) {
  const res = responseRecorder();
  let caught;
  await controller(req, res, (error) => { caught = error; });
  if (caught) throw caught;
  return res;
}

function expectCatalogError(code) {
  return (error) => error instanceof VocabularyCatalogError && error.code === code;
}

function createSyntheticLegacyDocx() {
  const wordNamespace = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const contentTypesNamespace = 'http://schemas.openxmlformats.org/package/2006/content-types';
  const packageRelationshipsNamespace = 'http://schemas.openxmlformats.org/package/2006/relationships';
  const body = [
    '1. synthetic item (noun)',
    'Meaning:',
    'synthetic meaning',
    'Example:',
    'This is a synthetic example.',
    '→ Đây là ví dụ tổng hợp.',
  ].map((text) => `<w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`).join('');
  const document = `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="${wordNamespace}"><w:body>${body}<w:sectPr/></w:body></w:document>`;
  const entries = {
    '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="${contentTypesNamespace}"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
    '_rels/.rels': `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="${packageRelationshipsNamespace}"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
    'word/document.xml': document,
  };
  return Buffer.from(zipSync(
    Object.fromEntries(Object.entries(entries).map(([name, value]) => [name, strToU8(value)])),
    { level: 6 },
  ));
}

test('V1 catalog foundation, legacy compatibility, indexes and source adapter', async (t) => {
  await t.test('models, lifecycle query, ordering, filtering and pagination', async () => {
    const suffix = new mongoose.Types.ObjectId().toString();
    const tag = await createVocabularyTag({
      name: 'Catalog ' + suffix,
      slug: 'catalog-' + suffix,
      status: 'published',
    });
    assert.equal(tag.status, 'draft', 'new tags always enter Draft');

    const chapterOne = await createVocabularyChapter({
      tagId: tag._id,
      title: 'Chapter One',
      chapterNumber: 1,
      sortOrder: 1,
      status: 'published',
    });
    const chapterTwo = await createVocabularyChapter({
      tagId: tag._id,
      title: 'Chapter Two',
      chapterNumber: 2,
      sortOrder: 2,
    });
    assert.equal(chapterOne.status, 'draft', 'new chapters always enter Draft');
    await VocabularyChapter.updateOne({ _id: chapterOne._id }, { $set: { status: 'published' } });
    await VocabularyChapter.updateOne({ _id: chapterTwo._id }, { $set: { status: 'published' } });
    await VocabularyTag.updateOne({ _id: tag._id }, { $set: { status: 'published' } });

    const first = await createCatalogVocabulary({ word: '[core]', meaning: 'lõi' });
    const second = await createCatalogVocabulary({ word: 'reserve', meaning: 'dự trữ' });
    const sameHeadwordDifferentSense = await createCatalogVocabulary({
      word: 'reserve',
      meaning: 'đặt chỗ trước',
    });
    assert.equal(first.catalogStatus, 'draft');
    assert.equal(first.status, 'hidden');
    assert.equal(first.lesson, undefined);
    assert.equal(first.course, undefined);
    assert.equal(JSON.parse(JSON.stringify(first)).catalogOnly, true);
    assert.equal(JSON.parse(JSON.stringify(first)).catalogStatus, 'draft');
    assert.notEqual(String(second._id), String(sameHeadwordDifferentSense._id), 'same-headword senses stay separate');
    await Vocabulary.updateMany(
      { _id: { $in: [first._id, second._id, sameHeadwordDifferentSense._id] } },
      { $set: { catalogStatus: 'published' } },
    );

    const firstMembership = await addVocabularyToChapter({
      chapterId: chapterOne._id,
      vocabularyId: first._id,
      sourceIdentity: 'source-' + suffix + '-first',
      sortOrder: 1,
    });
    await addVocabularyToChapter({
      chapterId: chapterOne._id,
      vocabularyId: second._id,
      sourceIdentity: 'source-' + suffix + '-second',
      sortOrder: 2,
    });
    await addVocabularyToChapter({
      chapterId: chapterOne._id,
      vocabularyId: sameHeadwordDifferentSense._id,
      sourceIdentity: 'source-' + suffix + '-third',
      sortOrder: 3,
    });
    await addVocabularyToChapter({
      chapterId: chapterTwo._id,
      vocabularyId: first._id,
      sourceIdentity: 'source-' + suffix + '-fourth',
      sortOrder: 1,
    });

    const draftTag = await createVocabularyTag({
      name: 'Draft ' + suffix,
      slug: 'draft-' + suffix,
    });
    const chapterUnderDraftTag = await createVocabularyChapter({
      tagId: draftTag._id,
      title: 'Published chapter under draft tag',
    });
    await VocabularyChapter.updateOne(
      { _id: chapterUnderDraftTag._id },
      { $set: { status: 'published' } },
    );
    const excludedByTag = await createCatalogVocabulary({ word: 'hidden tag', meaning: 'x' });
    await Vocabulary.updateOne({ _id: excludedByTag._id }, { $set: { catalogStatus: 'published' } });
    await addVocabularyToChapter({
      chapterId: chapterUnderDraftTag._id,
      vocabularyId: excludedByTag._id,
      sourceIdentity: 'source-' + suffix + '-draft-tag',
    });

    const draftChapter = await createVocabularyChapter({
      tagId: tag._id,
      title: 'Still Draft',
    });
    const excludedByChapter = await createCatalogVocabulary({ word: 'hidden chapter', meaning: 'x' });
    await Vocabulary.updateOne({ _id: excludedByChapter._id }, { $set: { catalogStatus: 'published' } });
    await addVocabularyToChapter({
      chapterId: draftChapter._id,
      vocabularyId: excludedByChapter._id,
      sourceIdentity: 'source-' + suffix + '-draft-chapter',
    });

    const excludedByVocabulary = await createCatalogVocabulary({ word: 'hidden vocabulary', meaning: 'x' });
    await addVocabularyToChapter({
      chapterId: chapterOne._id,
      vocabularyId: excludedByVocabulary._id,
      sourceIdentity: 'source-' + suffix + '-draft-vocabulary',
      sortOrder: 4,
    });

    const allPublished = await listPublishedCatalogVocabulary({ tagId: tag._id, limit: 10 });
    assert.equal(allPublished.pagination.total, 4);
    assert.deepEqual(
      allPublished.items.map((item) => item.vocabulary.word),
      ['[core]', 'reserve', 'reserve', '[core]'],
      'chapter and membership ordering must be stable, and one Vocabulary may appear in two Chapters',
    );
    assert.ok(allPublished.items.every((item) => item.vocabulary.catalogOnly === undefined));

    const firstPage = await listPublishedCatalogVocabulary({ tagId: tag._id, page: 1, limit: 1 });
    const secondPage = await listPublishedCatalogVocabulary({ tagId: tag._id, page: 2, limit: 1 });
    assert.equal(firstPage.pagination.total, 4);
    assert.equal(firstPage.pagination.pages, 4);
    assert.equal(firstPage.items[0].vocabulary.word, '[core]');
    assert.equal(secondPage.items[0].vocabulary.word, 'reserve');
    assert.equal(
      (await listPublishedCatalogVocabulary({ search: '[core]', limit: 10 })).pagination.total,
      2,
      'search metacharacters are treated literally',
    );
    assert.equal(
      (await listPublishedCatalogVocabulary({ chapterId: chapterTwo._id })).pagination.total,
      1,
    );
    assert.equal(
      (await listPublishedCatalogVocabulary({ tagId: draftTag._id })).pagination.total,
      0,
    );
    await assert.rejects(
      listPublishedCatalogVocabulary({ page: 0 }),
      expectCatalogError('INVALID_PAGINATION'),
    );
    await assert.rejects(
      createVocabularyChapter({ tagId: new mongoose.Types.ObjectId(), title: 'Orphan' }),
      expectCatalogError('TAG_NOT_FOUND'),
    );
    assert.ok(firstMembership._id);
  });

  await t.test('membership identity, duplicate handling and concurrent retries', async () => {
    const suffix = new mongoose.Types.ObjectId().toString();
    const tag = await createVocabularyTag({ name: 'Retry ' + suffix, slug: 'retry-' + suffix });
    const chapter = await createVocabularyChapter({ tagId: tag._id, title: 'Retry Chapter' });
    const vocabulary = await createCatalogVocabulary({ word: 'retry', meaning: 'thử lại' });
    const identity = 'sha256:' + suffix;
    const first = await addVocabularyToChapter({
      chapterId: chapter._id,
      vocabularyId: vocabulary._id,
      sourceIdentity: identity,
    });
    const retry = await addVocabularyToChapter({
      chapterId: chapter._id,
      vocabularyId: vocabulary._id,
      sourceIdentity: identity,
      sortOrder: 99,
    });
    assert.equal(String(retry._id), String(first._id));
    assert.equal(retry.sortOrder, first.sortOrder, 'an idempotent retry does not silently rewrite ordering');

    const otherVocabulary = await createCatalogVocabulary({ word: 'different', meaning: 'khác' });
    await assert.rejects(
      addVocabularyToChapter({
        chapterId: chapter._id,
        vocabularyId: otherVocabulary._id,
        sourceIdentity: identity,
      }),
      expectCatalogError('SOURCE_IDENTITY_CONFLICT'),
    );
    await assert.rejects(
      addVocabularyToChapter({
        chapterId: chapter._id,
        vocabularyId: vocabulary._id,
        sourceIdentity: 'different-' + suffix,
      }),
      expectCatalogError('MEMBERSHIP_ALREADY_EXISTS'),
    );
    await assert.rejects(
      ChapterVocabulary.create({
        chapterId: chapter._id,
        vocabularyId: vocabulary._id,
        sourceIdentity: 'direct-pair-duplicate:' + suffix,
      }),
      (error) => error.code === 11000,
      'the unique pair index rejects duplicate rows at the database layer',
    );
    const otherChapter = await createVocabularyChapter({ tagId: tag._id, title: 'Other source target' });
    await assert.rejects(
      ChapterVocabulary.create({
        chapterId: otherChapter._id,
        vocabularyId: otherVocabulary._id,
        sourceIdentity: identity,
      }),
      (error) => error.code === 11000,
      'the source identity index rejects reuse on a different pair',
    );

    const concurrentChapter = await createVocabularyChapter({ tagId: tag._id, title: 'Concurrent Chapter' });
    const concurrentIdentity = 'concurrent:' + suffix;
    const attempts = await Promise.all(Array.from({ length: 8 }, () => addVocabularyToChapter({
      chapterId: concurrentChapter._id,
      vocabularyId: vocabulary._id,
      sourceIdentity: concurrentIdentity,
    })));
    assert.equal(new Set(attempts.map((item) => String(item._id))).size, 1);
    assert.equal(
      await ChapterVocabulary.countDocuments({
        chapterId: concurrentChapter._id,
        vocabularyId: vocabulary._id,
      }),
      1,
    );
  });

  await t.test('archive preserves Membership, Vocabulary and LearningProgress', async () => {
    const suffix = new mongoose.Types.ObjectId().toString();
    const tag = await createVocabularyTag({ name: 'Archive ' + suffix, slug: 'archive-' + suffix });
    const chapter = await createVocabularyChapter({ tagId: tag._id, title: 'Archive me' });
    const vocabulary = await createCatalogVocabulary({ word: 'archive', meaning: 'lưu trữ' });
    const membership = await addVocabularyToChapter({
      chapterId: chapter._id,
      vocabularyId: vocabulary._id,
      sourceIdentity: 'archive:' + suffix,
    });
    const progress = await LearningProgress.create({
      student: new mongoose.Types.ObjectId(),
      lesson: new mongoose.Types.ObjectId(),
      course: new mongoose.Types.ObjectId(),
    });

    const archived = await archiveVocabularyChapter(chapter._id);
    assert.equal(archived.status, 'archived');
    assert.equal(await ChapterVocabulary.countDocuments({ _id: membership._id }), 1);
    assert.equal(await Vocabulary.countDocuments({ _id: vocabulary._id }), 1);
    assert.equal(await LearningProgress.countDocuments({ _id: progress._id }), 1);
  });

  await t.test('legacy required refs, endpoints and flashcard DTO stay compatible', async () => {
    const missingLegacyReferences = new Vocabulary({ word: 'legacy', meaning: 'từ cũ' });
    await assert.rejects(
      missingLegacyReferences.validate(),
      (error) => error.name === 'ValidationError'
        && Boolean(error.errors.lesson)
        && Boolean(error.errors.course),
    );

    const course = await Course.create({
      title: 'Legacy compatibility course ' + new mongoose.Types.ObjectId(),
      description: 'Disposable fixture for the legacy Vocabulary contract.',
      teacher: new mongoose.Types.ObjectId(),
      level: 'Beginner',
      englishType: 'General',
    });
    const lesson = await Lesson.create({
      title: 'Legacy compatibility lesson',
      course: course._id,
      status: 'published',
    });
    const legacy = await Vocabulary.create({
      word: 'lesson word',
      meaning: 'nghĩa bài học',
      partOfSpeech: 'noun',
      exampleEnglish: 'An example.',
      exampleVietnamese: 'Một ví dụ.',
      lesson: lesson._id,
      course: course._id,
      topic: 'Legacy Chapter',
    });
    const catalog = await createCatalogVocabulary({
      word: 'catalog only',
      meaning: 'chỉ thuộc catalog',
      topic: 'Catalog Chapter',
    });
    const catalogWithUnexpectedLessonLink = await createCatalogVocabulary({
      word: 'catalog linked unexpectedly',
      meaning: 'defense-in-depth fixture',
    });
    await Vocabulary.updateOne(
      { _id: catalogWithUnexpectedLessonLink._id },
      { $set: { lesson: lesson._id, course: course._id, status: 'published' } },
    );
    assert.equal(legacy.status, 'published');
    assert.equal(catalog.status, 'hidden');

    const student = await callController(getStudentVocabularyByLesson, {
      params: {},
      query: { page: '1', limit: '10' },
    });
    assert.equal(student.statusCode, 200);
    assert.deepEqual(student.body.data.vocabulary.map((word) => word.word), ['lesson word']);
    assert.ok(student.body.data.topics.includes('Legacy Chapter'));
    assert.ok(!student.body.data.topics.includes('Catalog Chapter'));
    const flashcardWord = JSON.parse(JSON.stringify(student.body.data.vocabulary[0]));
    for (const field of ['_id', 'word', 'meaning', 'partOfSpeech', 'exampleEnglish', 'exampleVietnamese', 'topic']) {
      assert.ok(Object.hasOwn(flashcardWord, field), 'legacy flashcard DTO keeps ' + field);
    }
    assert.equal(Object.hasOwn(flashcardWord, 'catalogOnly'), false);
    assert.equal(Object.hasOwn(flashcardWord, 'catalogStatus'), false);

    const lessonDetail = await callController(getLessonById, {
      params: { id: lesson._id.toString() },
      query: {},
      user: { role: 'admin' },
    });
    assert.deepEqual(
      lessonDetail.body.data.vocabulary.map((word) => word.word),
      ['lesson word'],
      'Lesson detail excludes catalog rows even if an unexpected legacy link exists',
    );

    const adminList = await callController(getAdminVocabulary, { query: { page: '1', limit: '50' } });
    assert.deepEqual(adminList.body.data.vocabulary.map((word) => word.word), ['lesson word']);
    const byId = await callController(getAdminVocabularyById, {
      params: { id: catalog._id.toString() },
      query: {},
    });
    assert.equal(byId.statusCode, 404);
    const update = await callController(updateVocabulary, {
      params: { id: catalog._id.toString() },
      body: { word: 'should not update', catalogOnly: false },
      query: {},
    });
    assert.equal(update.statusCode, 404);
    const deletion = await callController(deleteVocabulary, {
      params: { id: catalog._id.toString() },
      query: {},
    });
    assert.equal(deletion.statusCode, 404);
    assert.equal((await Vocabulary.findById(catalog._id)).word, 'catalog only');

    const lessonDeletion = await callController(deleteLesson, {
      params: { id: lesson._id.toString() },
      query: {},
      user: { role: 'admin' },
    });
    assert.equal(lessonDeletion.statusCode, 200);
    assert.equal(await Vocabulary.exists({ _id: legacy._id }), null);
    assert.ok(await Vocabulary.exists({ _id: catalogWithUnexpectedLessonLink._id }));

    const courseForDeletion = await Course.create({
      title: 'Cascade compatibility course ' + new mongoose.Types.ObjectId(),
      description: 'Disposable fixture for safe legacy cascade.',
      teacher: new mongoose.Types.ObjectId(),
      level: 'Beginner',
      englishType: 'General',
    });
    const lessonForDeletion = await Lesson.create({
      title: 'Cascade compatibility lesson',
      course: courseForDeletion._id,
      status: 'published',
    });
    const catalogForCourseDeletion = await createCatalogVocabulary({
      word: 'course cascade guard',
      meaning: 'Catalog row survives',
    });
    await Vocabulary.updateOne(
      { _id: catalogForCourseDeletion._id },
      { $set: { lesson: lessonForDeletion._id, course: courseForDeletion._id, status: 'published' } },
    );
    const courseDeletion = await callController(deleteCourse, {
      params: { id: courseForDeletion._id.toString() },
      query: {},
      user: { role: 'admin' },
    });
    assert.equal(courseDeletion.statusCode, 200);
    assert.ok(await Vocabulary.exists({ _id: catalogForCourseDeletion._id }));
  });

  await t.test('legacy DOCX preview and confirm remain isolated from Catalog-only rows', async () => {
    const suffix = new mongoose.Types.ObjectId().toString();
    const course = await Course.create({
      title: 'Synthetic DOCX course ' + suffix,
      description: 'Disposable synthetic import fixture.',
      teacher: new mongoose.Types.ObjectId(),
      level: 'Beginner',
      englishType: 'General',
    });
    const lesson = await Lesson.create({
      title: 'Synthetic DOCX lesson',
      course: course._id,
      status: 'published',
      topic: 'Synthetic Topic',
    });
    const catalogOnly = await createCatalogVocabulary({
      word: 'synthetic item',
      meaning: 'catalog-only fixture',
    });

    const preview = await callController(previewDocxVocabulary, {
      body: { courseId: course._id.toString(), lessonId: lesson._id.toString() },
      file: {
        buffer: createSyntheticLegacyDocx(),
        originalname: 'synthetic-legacy-import.docx',
        size: 0,
        mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      },
      user: { role: 'admin' },
    });
    assert.equal(preview.statusCode, 200);
    assert.equal(preview.body.data.summary.valid, 1);
    assert.equal(preview.body.data.summary.duplicates, 0, 'Catalog-only same-headword rows do not participate in legacy duplicates');
    assert.equal(await Vocabulary.countDocuments({ lesson: lesson._id, catalogOnly: { $ne: true } }), 0);

    const confirmation = await callController(confirmDocxVocabularyImport, {
      body: {
        courseId: course._id.toString(),
        lessonId: lesson._id.toString(),
        items: preview.body.data.items,
        duplicateAction: 'skip',
      },
      user: { role: 'admin' },
    });
    assert.equal(confirmation.statusCode, 200);
    assert.equal(confirmation.body.data.created, 1);
    assert.ok(await Vocabulary.exists({
      word: 'synthetic item',
      lesson: lesson._id,
      course: course._id,
      catalogOnly: { $ne: true },
    }));
    assert.ok(await Vocabulary.exists({ _id: catalogOnly._id, catalogOnly: true }));
  });

  await t.test('declared indexes exist in the isolated database', async () => {
    const slug = 'unique-index-' + new mongoose.Types.ObjectId();
    await VocabularyTag.create({ name: 'Unique index', slug });
    await assert.rejects(
      VocabularyTag.create({ name: 'Duplicate index', slug }),
      (error) => error.code === 11000,
      'the Tag slug index is unique',
    );
    const [vocabularyIndexes, tagIndexes, chapterIndexes, membershipIndexes] = await Promise.all([
      Vocabulary.collection.indexes(),
      VocabularyTag.collection.indexes(),
      VocabularyChapter.collection.indexes(),
      ChapterVocabulary.collection.indexes(),
    ]);
    assert.ok(vocabularyIndexes.some((index) => index.name === 'catalog_status_word'
      && index.partialFilterExpression?.catalogOnly === true));
    assert.ok(tagIndexes.some((index) => index.name === 'uniq_vocabulary_tag_slug' && index.unique));
    assert.ok(chapterIndexes.some((index) => index.name === 'vocabulary_chapter_tag_status_order'));
    assert.ok(membershipIndexes.some((index) => index.name === 'uniq_chapter_vocabulary_membership' && index.unique));
    assert.ok(membershipIndexes.some((index) => index.name === 'uniq_chapter_vocabulary_source_identity' && index.unique));
    assert.ok(membershipIndexes.some((index) => index.name === 'chapter_vocabulary_order'));
  });
});

test('candidate persistence keeps synthetic raw evidence immutable and retries idempotent', async () => {
  const suffix = new mongoose.Types.ObjectId().toString();
  const batch = await VocabularyImportBatch.create({
    batchIdentity: 'synthetic-batch-' + suffix,
    actorId: new mongoose.Types.ObjectId(),
    schemaVersion: '1.0.0',
    parserVersions: ['2.1.0'],
    sourceFiles: [{
      relativePath: 'synthetic/chapter.docx',
      fileSha256: 'a'.repeat(64),
      sourceFolder: 'Synthetic',
      chapterCandidate: 'Synthetic Chapter',
      candidateCount: 1,
    }],
    candidateCount: 1,
    status: 'NEEDS_REVIEW',
  });
  const envelope = adaptVocabularyParserCandidate({
    source: {
      relativePath: 'synthetic/chapter.docx',
      fileSha256: 'a'.repeat(64),
      parserVersion: '2.1.0',
      sourceOrdinal: 1,
      paragraphStart: 2,
      paragraphEnd: 3,
      sourceFolder: 'Synthetic',
      chapterCandidate: 'Synthetic Chapter',
    },
    word: 'synthetic',
    partOfSpeech: ['noun'],
    senses: [{
      meaning: 'dữ liệu tổng hợp',
      examples: [{ english: 'This is synthetic.', vietnamese: 'Đây là dữ liệu tổng hợp.' }],
    }],
    notes: [],
    raw: { word: 'synthetic', untouched: ['source', 'evidence'] },
    reviewStatus: 'NEEDS_REVIEW',
    reviewReasons: [{ code: 'SYNTHETIC_REVIEW_REQUIRED' }],
    issues: [],
    duplicateCandidate: { groupId: 'synthetic-group', merged: false },
  });

  const [first, concurrentRetry] = await Promise.all([
    persistVocabularyCandidateEnvelope({ batchId: batch._id, envelope }),
    persistVocabularyCandidateEnvelope({ batchId: batch._id, envelope }),
  ]);
  assert.equal(String(first._id), String(concurrentRetry._id));
  assert.equal(await VocabularyImportCandidate.countDocuments({ batchId: batch._id }), 1);
  assert.equal(first.validationStatus, 'VALIDATION_PASSED');
  assert.equal(first.reviewStatus, 'NEEDS_REVIEW');
  assert.equal(first.publicationStatus, 'NOT_ELIGIBLE');
  assert.deepEqual(first.rawValues, envelope.rawValues);
  assert.deepEqual(first.editedValues, {});

  const conflictingEnvelope = structuredClone(envelope);
  conflictingEnvelope.vocabularyCandidate.word = 'different synthetic value';
  await assert.rejects(
    persistVocabularyCandidateEnvelope({ batchId: batch._id, envelope: conflictingEnvelope }),
    (error) => error.code === 'SOURCE_IDENTITY_COLLISION',
  );

  const editable = await VocabularyImportCandidate.findById(first._id);
  editable.editedValues = { word: 'synthetic edit' };
  editable.reviewStatus = 'EDITED';
  editable.markModified('editedValues');
  await editable.save();
  const actorId = new mongoose.Types.ObjectId();
  const audit = await VocabularyImportAudit.create({
    batchId: batch._id,
    candidateId: editable._id,
    sourceIdentity: envelope.sourceIdentity,
    actorId,
    action: 'FIELDS_EDITED',
    changedFields: [{ field: 'word', before: 'synthetic', after: 'synthetic edit' }],
    occurredAt: new Date('2026-01-01T00:00:00.000Z'),
  });
  const persisted = await VocabularyImportCandidate.findById(first._id).lean();
  assert.deepEqual(persisted.rawValues, envelope.rawValues, 'edits never overwrite raw source evidence');
  assert.deepEqual(persisted.parsedValues, envelope.vocabularyCandidate);
  assert.deepEqual(persisted.editedValues, { word: 'synthetic edit' });
  assert.equal(persisted.reviewStatus, 'EDITED');
  assert.equal(persisted.publicationStatus, 'NOT_ELIGIBLE');
  assert.equal(String(audit.actorId), String(actorId));
  assert.equal(audit.changedFields[0].field, 'word');

  const retryAfterEdit = await persistVocabularyCandidateEnvelope({ batchId: batch._id, envelope });
  assert.equal(String(retryAfterEdit._id), String(first._id));
  assert.deepEqual(retryAfterEdit.editedValues, { word: 'synthetic edit' });
  assert.equal(retryAfterEdit.reviewStatus, 'EDITED', 'an import retry preserves reviewer state');
});

test('Parser V2.1 candidate adapter preserves source evidence and is deterministic', () => {
  const candidate = {
    source: {
      relativePath: 'TOEIC EASY START\\Start 1.docx',
      fileSha256: 'a'.repeat(64).toUpperCase(),
      parserVersion: '2.1.0',
      sourceOrdinal: 7,
      sourceDisplayNumber: 8,
      sourceDisplayLabel: '08.',
      paragraphStart: 12,
      paragraphEnd: 14,
      layout: 'EASY_START_INLINE_NUMBERED_PARAGRAPH',
      sourceFolder: 'TOEIC EASY START',
      chapterCandidate: 'Start 1',
      collectionCandidate: 'TOEIC EASY START',
      topicCandidate: null,
      tableIndex: null,
      rowIndex: null,
      cellIndex: null,
    },
    word: 'approve',
    partOfSpeech: ['verb'],
    rawPartOfSpeech: 'v.',
    senses: [{ meaning: 'chấp thuận', examples: [{ english: 'We approve it.', vietnamese: 'Chúng tôi chấp thuận.' }] }],
    notes: [],
    raw: { word: 'approve', text: 'approve (v.): chấp thuận', paragraphs: [{ paragraphIndex: 12 }] },
    normalized: { word: 'approve' },
    reviewStatus: 'NEEDS_REVIEW',
    reviewReasons: [{ code: 'SOURCE_CANDIDATE_NOT_HUMAN_VERIFIED' }],
    issues: [{ code: 'GOLDEN_NOT_VERIFIED', severity: 'review' }],
    duplicateCandidate: { groupId: 'source-duplicate:approve', merged: false },
  };

  const adapted = adaptVocabularyParserCandidate(candidate);
  const retried = adaptVocabularyParserCandidate(candidate);
  assert.equal(adapted.schemaVersion, '1.0.0');
  assert.equal(adapted.parserVersion, '2.1.0');
  assert.equal(adapted.sourceIdentity, retried.sourceIdentity);
  assert.equal(adapted.source.relativePath, candidate.source.relativePath, 'original path is preserved');
  assert.equal(adapted.source.normalizedRelativePath, 'TOEIC EASY START/Start 1.docx');
  assert.equal(adapted.source.fileSha256, candidate.source.fileSha256);
  assert.equal(adapted.source.sourceOrdinal, 7);
  assert.equal(adapted.source.paragraphStart, 12);
  assert.equal(adapted.source.paragraphEnd, 14);
  assert.deepEqual(adapted.rawValues, candidate.raw);
  assert.deepEqual(adapted.editedValues, {});
  assert.deepEqual(adapted.duplicateMetadata, candidate.duplicateCandidate);
  assert.deepEqual(adapted.review.issues, candidate.issues);
  assert.equal(adapted.review.status, 'NEEDS_REVIEW');
  assert.equal(adapted.review.parserStatus, 'NEEDS_REVIEW');
  assert.equal(adapted.review.publicationEligible, false);
  assert.equal(adapted.tagCandidate.reviewStatus, 'NEEDS_REVIEW');
  assert.equal(adapted.chapterCandidate.title, 'Start 1');
  assert.throws(
    () => adaptVocabularyParserCandidate({ ...candidate, source: { ...candidate.source, relativePath: '../outside.docx' } }),
    /must not escape/,
  );
  assert.throws(
    () => adaptVocabularyParserCandidate({ ...candidate, source: { ...candidate.source, fileSha256: 'bad' } }),
    /SHA-256/,
  );
  assert.equal(
    adaptVocabularyParserCandidate({ ...candidate, reviewStatus: 'APPROVED' }).review.status,
    'NEEDS_REVIEW',
    'the adapter never accepts an upstream approval as editorial review',
  );
});
