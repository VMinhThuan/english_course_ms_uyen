import mongoose from 'mongoose';

const vocabularyImportCandidateSchema = new mongoose.Schema(
  {
    batchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'VocabularyImportBatch',
      required: true,
    },
    schemaVersion: { type: String, required: true, trim: true, immutable: true },
    parserVersion: { type: String, required: true, trim: true, immutable: true },
    sourceIdentity: { type: String, required: true, unique: true, immutable: true },
    sourceMetadata: { type: mongoose.Schema.Types.Mixed, required: true, immutable: true },
    tagCandidate: { type: mongoose.Schema.Types.Mixed, default: null, immutable: true },
    chapterCandidate: { type: mongoose.Schema.Types.Mixed, default: null, immutable: true },
    parsedValues: { type: mongoose.Schema.Types.Mixed, required: true, immutable: true },
    rawValues: { type: mongoose.Schema.Types.Mixed, required: true, immutable: true },
    editedValues: { type: mongoose.Schema.Types.Mixed, default: {} },
    duplicateMetadata: { type: mongoose.Schema.Types.Mixed, default: null, immutable: true },
    parserReviewReasons: { type: [mongoose.Schema.Types.Mixed], default: [], immutable: true },
    parserIssues: { type: [mongoose.Schema.Types.Mixed], default: [], immutable: true },
    validationIssues: { type: [mongoose.Schema.Types.Mixed], default: [] },
    parseStatus: {
      type: String,
      enum: ['PARSED'],
      default: 'PARSED',
      immutable: true,
    },
    validationStatus: {
      type: String,
      enum: ['NOT_RUN', 'VALIDATION_PASSED', 'VALIDATION_FAILED'],
      default: 'NOT_RUN',
    },
    reviewStatus: {
      type: String,
      enum: ['NEEDS_REVIEW', 'EDITED', 'REVIEW_APPROVED', 'REVIEW_REJECTED'],
      default: 'NEEDS_REVIEW',
    },
    duplicateDecision: { type: String, enum: ['KEEP_SEPARATE', null], default: null },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
    reviewedVersion: { type: Number, min: 0, default: null },
    reviewedContentHash: { type: String, match: /^[a-f\d]{64}$/i, default: null },
    rejectionReason: { type: String, default: '' },
    importStatus: {
      type: String,
      enum: ['NOT_IMPORTED', 'IMPORTED_AS_DRAFT'],
      default: 'NOT_IMPORTED',
    },
    importedVocabularyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vocabulary', default: null },
    importedChapterId: { type: mongoose.Schema.Types.ObjectId, ref: 'VocabularyChapter', default: null },
    importedMembershipId: { type: mongoose.Schema.Types.ObjectId, ref: 'ChapterVocabulary', default: null },
    publicationStatus: {
      type: String,
      enum: ['NOT_ELIGIBLE', 'PUBLICATION_ELIGIBLE'],
      default: 'NOT_ELIGIBLE',
    },
  },
  { timestamps: true, optimisticConcurrency: true, minimize: false }
);

vocabularyImportCandidateSchema.index(
  { batchId: 1, 'sourceMetadata.relativePath': 1, 'sourceMetadata.sourceOrdinal': 1 },
  { unique: true, name: 'vocabulary_candidate_batch_source_ordinal' }
);
vocabularyImportCandidateSchema.index(
  { batchId: 1, reviewStatus: 1, 'sourceMetadata.relativePath': 1, 'sourceMetadata.sourceOrdinal': 1 },
  { name: 'vocabulary_candidate_batch_review_order' }
);

const VocabularyImportCandidate = mongoose.model(
  'VocabularyImportCandidate',
  vocabularyImportCandidateSchema
);

export default VocabularyImportCandidate;
