import mongoose from 'mongoose';
import ChapterVocabulary from '../../src/models/ChapterVocabulary.js';
import Vocabulary from '../../src/models/Vocabulary.js';
import VocabularyChapter from '../../src/models/VocabularyChapter.js';
import VocabularyImportAudit from '../../src/models/VocabularyImportAudit.js';
import VocabularyImportBatch from '../../src/models/VocabularyImportBatch.js';
import VocabularyImportCandidate from '../../src/models/VocabularyImportCandidate.js';
import VocabularyTag from '../../src/models/VocabularyTag.js';

const reviewerId = new mongoose.Types.ObjectId();
const importerId = new mongoose.Types.ObjectId();
let candidateOrdinal = 0;

async function createTag(name, slug, status = 'published', sortOrder = 0) {
  return VocabularyTag.create({ name, slug, status, sortOrder, description: `Synthetic ${name} description` });
}

async function createChapter(tag, title, status = 'published', sortOrder = 0, chapterNumber = sortOrder + 1) {
  return VocabularyChapter.create({ tagId: tag._id, title, status, sortOrder, chapterNumber, description: `Synthetic ${title} description` });
}

async function createVocabulary({ word, meaning, status = 'published', catalogSenses, catalogNotes = [] }) {
  return Vocabulary.create({
    word,
    meaning,
    partOfSpeech: 'noun',
    example: 'A synthetic example.',
    exampleEnglish: 'A synthetic example.',
    exampleVietnamese: 'Một ví dụ tổng hợp.',
    catalogOnly: true,
    catalogStatus: status,
    catalogSenses: catalogSenses || [{
      partOfSpeech: ['noun'],
      rawPartOfSpeech: 'internal raw POS',
      usagePattern: 'in a synthetic context',
      meaning,
      normalizedMeaning: 'internal normalized meaning',
      examples: [{ english: 'A synthetic example.', vietnamese: 'Một ví dụ tổng hợp.' }],
      notes: ['A learner-facing note.'],
      sourceLocators: [{ path: 'C:\\private\\customer.docx', fileSha256: 'A'.repeat(64) }],
    }],
    catalogNotes,
  });
}

async function createBatch() {
  return VocabularyImportBatch.create({
    batchIdentity: `synthetic-student-catalog-${new mongoose.Types.ObjectId()}`,
    actorId: importerId,
    schemaVersion: 'synthetic-v1',
    parserVersions: ['synthetic-parser-v1'],
    candidateCount: 1,
    sourceFiles: [],
    status: 'CONFIRMED_DRAFT',
  });
}

async function createMembershipEvidence({
  chapter,
  vocabulary,
  sortOrder = 0,
  reviewStatus = 'REVIEW_APPROVED',
  includeReviewAudit = true,
  includeImportAudit = true,
  importedChapterId = chapter._id,
  importedVocabularyId = vocabulary._id,
}) {
  candidateOrdinal += 1;
  const batch = await createBatch();
  const sourceIdentity = `synthetic:${new mongoose.Types.ObjectId()}`;
  const membership = await ChapterVocabulary.create({
    chapterId: chapter._id,
    vocabularyId: vocabulary._id,
    sourceIdentity,
    sortOrder,
  });
  const reviewedAt = reviewStatus === 'REVIEW_APPROVED' ? new Date() : null;
  const candidate = await VocabularyImportCandidate.create({
    batchId: batch._id,
    schemaVersion: 'synthetic-v1',
    parserVersion: 'synthetic-parser-v1',
    sourceIdentity,
    sourceMetadata: {
      relativePath: `synthetic/private-source-${candidateOrdinal}.docx`,
      fileSha256: 'B'.repeat(64),
      sourceOrdinal: candidateOrdinal,
    },
    parsedValues: { word: vocabulary.word, senses: [{ meaning: vocabulary.meaning }] },
    rawValues: { privateSourceText: 'synthetic-private-source-content' },
    validationStatus: 'VALIDATION_PASSED',
    reviewStatus,
    reviewedBy: reviewedAt ? reviewerId : null,
    reviewedAt,
    importStatus: 'IMPORTED_AS_DRAFT',
    importedVocabularyId,
    importedChapterId,
    importedMembershipId: membership._id,
  });
  if (includeReviewAudit && reviewedAt) {
    await VocabularyImportAudit.create({
      batchId: batch._id,
      candidateId: candidate._id,
      sourceIdentity,
      actorId: reviewerId,
      action: 'REVIEW_DECISION',
      decision: 'APPROVE',
    });
  }
  if (includeImportAudit) {
    await VocabularyImportAudit.create({
      batchId: batch._id,
      candidateId: candidate._id,
      sourceIdentity,
      actorId: importerId,
      action: 'CONFIRMED_DRAFT',
      details: {
        chapterId: chapter._id,
        vocabularyId: vocabulary._id,
        membershipId: membership._id,
      },
    });
  }
  return { batch, candidate, membership };
}

export async function createVocabularyStudentCatalogFixtures() {
  candidateOrdinal = 0;
  const tags = await Promise.all([
    createTag('Synthetic Fundamentals', 'synthetic-fundamentals', 'published', 1),
    createTag('Synthetic Collocations', 'synthetic-collocations', 'published', 2),
    createTag('Synthetic Essentials', 'synthetic-essentials', 'published', 3),
  ]);
  const [fundamentals, collocations, essentials] = tags;
  const chapters = {
    start1: await createChapter(fundamentals, 'Synthetic Start 1', 'published', 1, 1),
    start2: await createChapter(fundamentals, 'Synthetic Start 2', 'published', 2, 2),
    empty: await createChapter(fundamentals, 'Synthetic Empty Chapter', 'published', 3, 3),
    draft: await createChapter(fundamentals, 'Synthetic Draft Chapter', 'draft', 4, 4),
    archived: await createChapter(fundamentals, 'Synthetic Archived Chapter', 'archived', 5, 5),
    collocation: await createChapter(collocations, 'Synthetic Collocation Chapter', 'published', 1, 1),
    essential: await createChapter(essentials, 'Synthetic Essential Chapter', 'published', 1, 1),
  };
  const hiddenTags = {
    draft: await createTag('Synthetic Draft Tag', 'synthetic-draft-tag', 'draft', 4),
    archived: await createTag('Synthetic Archived Tag', 'synthetic-archived-tag', 'archived', 5),
  };
  const hiddenTagChapters = {
    draft: await createChapter(hiddenTags.draft, 'Synthetic Chapter under Draft Tag', 'published', 1, 1),
    archived: await createChapter(hiddenTags.archived, 'Synthetic Chapter under Archived Tag', 'published', 1, 1),
  };

  const multiSenseVocabulary = await createVocabulary({
    word: 'synthetic record',
    meaning: 'hồ sơ; ghi lại',
    catalogSenses: [
      {
        partOfSpeech: ['noun'], rawPartOfSpeech: 'internal noun', usagePattern: 'keep a record',
        meaning: 'hồ sơ tổng hợp', normalizedMeaning: 'private normalized value',
        examples: [
          { english: 'Keep a record of each shipment.', vietnamese: 'Hãy lưu hồ sơ của từng chuyến hàng.' },
          { english: 'The record is complete.', vietnamese: 'Hồ sơ đã đầy đủ.' },
        ], notes: ['Learner-facing sense note.'], sourceLocators: [{ path: 'D:\\customer\\source.docx' }],
      },
      {
        partOfSpeech: ['verb'], rawPartOfSpeech: 'internal verb', usagePattern: 'record a result',
        meaning: 'ghi lại', normalizedMeaning: 'private second normalized value',
        examples: [{ english: 'They record each result.', vietnamese: 'Họ ghi lại từng kết quả.' }],
        notes: ['A second sense note.'], sourceLocators: [{ fileSha256: 'C'.repeat(64) }],
      },
    ],
    catalogNotes: ['Chapter-level synthetic note.', '<img src=x onerror="window.__catalogXss=1">'],
  });
  const chargeCost = await createVocabulary({ word: 'synthetic charge', meaning: 'khoản phí' });
  const chargeAccuse = await createVocabulary({ word: 'synthetic charge', meaning: 'buộc tội' });
  const sharedWord = await createVocabulary({ word: 'synthetic shared', meaning: 'dùng chung hai chapter' });
  const secondChapterWord = await createVocabulary({ word: 'synthetic budget', meaning: 'ngân sách tổng hợp' });
  const collocationWord = await createVocabulary({ word: 'synthetic collocation', meaning: 'cụm từ tổng hợp' });
  const draftWord = await createVocabulary({ word: 'hidden draft vocabulary', meaning: 'không được trả về', status: 'draft' });
  const archivedWord = await createVocabulary({ word: 'hidden archived vocabulary', meaning: 'không được trả về', status: 'archived' });
  const unreviewedWord = await createVocabulary({ word: 'hidden unreviewed vocabulary', meaning: 'không được trả về' });
  const missingReviewAuditWord = await createVocabulary({ word: 'hidden missing review audit', meaning: 'không được trả về' });
  const missingImportAuditWord = await createVocabulary({ word: 'hidden missing import audit', meaning: 'không được trả về' });
  const wrongChapterReferenceWord = await createVocabulary({ word: 'hidden wrong chapter reference', meaning: 'không được trả về' });
  const noProvenanceWord = await createVocabulary({ word: 'hidden without provenance', meaning: 'không được trả về' });
  const noMembershipWord = await createVocabulary({ word: 'hidden without membership', meaning: 'không được trả về' });

  await Promise.all([
    createMembershipEvidence({ chapter: chapters.start1, vocabulary: multiSenseVocabulary, sortOrder: 1 }),
    createMembershipEvidence({ chapter: chapters.start1, vocabulary: chargeCost, sortOrder: 2 }),
    createMembershipEvidence({ chapter: chapters.start1, vocabulary: chargeAccuse, sortOrder: 3 }),
    createMembershipEvidence({ chapter: chapters.start1, vocabulary: sharedWord, sortOrder: 4 }),
    createMembershipEvidence({ chapter: chapters.start2, vocabulary: sharedWord, sortOrder: 1 }),
    createMembershipEvidence({ chapter: chapters.start2, vocabulary: secondChapterWord, sortOrder: 2 }),
    createMembershipEvidence({ chapter: chapters.start1, vocabulary: draftWord, sortOrder: 5 }),
    createMembershipEvidence({ chapter: chapters.start1, vocabulary: archivedWord, sortOrder: 6 }),
    createMembershipEvidence({ chapter: chapters.start1, vocabulary: unreviewedWord, sortOrder: 7, reviewStatus: 'NEEDS_REVIEW' }),
    createMembershipEvidence({ chapter: chapters.start1, vocabulary: missingReviewAuditWord, sortOrder: 8, includeReviewAudit: false }),
    createMembershipEvidence({ chapter: chapters.start1, vocabulary: missingImportAuditWord, sortOrder: 9, includeImportAudit: false }),
    createMembershipEvidence({ chapter: chapters.start1, vocabulary: wrongChapterReferenceWord, sortOrder: 10, importedChapterId: chapters.start2._id }),
    createMembershipEvidence({ chapter: chapters.collocation, vocabulary: collocationWord, sortOrder: 1 }),
    createMembershipEvidence({ chapter: chapters.start1, vocabulary: noProvenanceWord, sortOrder: 11 }).then(async ({ membership }) => {
      await VocabularyImportCandidate.deleteOne({ sourceIdentity: membership.sourceIdentity });
      await VocabularyImportAudit.deleteMany({ sourceIdentity: membership.sourceIdentity });
    }),
  ]);
  void noMembershipWord;

  return {
    actors: { studentId: new mongoose.Types.ObjectId(), adminId: new mongoose.Types.ObjectId() },
    tags,
    hiddenTags,
    chapters,
    hiddenTagChapters,
    vocabulary: {
      multiSenseVocabulary,
      chargeCost,
      chargeAccuse,
      sharedWord,
      draftWord,
      archivedWord,
      unreviewedWord,
      missingReviewAuditWord,
      missingImportAuditWord,
      wrongChapterReferenceWord,
      noProvenanceWord,
      noMembershipWord,
    },
  };
}

export const vocabularyStudentCatalogFixtureModels = [
  Vocabulary, VocabularyTag, VocabularyChapter, ChapterVocabulary,
  VocabularyImportBatch, VocabularyImportCandidate, VocabularyImportAudit,
];
