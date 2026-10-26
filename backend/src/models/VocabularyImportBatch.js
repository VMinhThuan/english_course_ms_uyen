import mongoose from 'mongoose';

const batchSourceSchema = new mongoose.Schema(
  {
    relativePath: { type: String, required: true, trim: true },
    fileSha256: { type: String, required: true, uppercase: true, match: /^[a-f\d]{64}$/i },
    sourceFolder: { type: String, default: null },
    chapterCandidate: { type: String, default: null },
    candidateCount: { type: Number, min: 0, required: true },
    draftTagId: { type: mongoose.Schema.Types.ObjectId, ref: 'VocabularyTag', default: null },
    draftChapterId: { type: mongoose.Schema.Types.ObjectId, ref: 'VocabularyChapter', default: null },
  },
  { _id: false }
);

const vocabularyImportBatchSchema = new mongoose.Schema(
  {
    batchIdentity: { type: String, required: true, unique: true, trim: true, immutable: true },
    actorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      immutable: true,
    },
    schemaVersion: { type: String, required: true, trim: true },
    parserVersions: [{ type: String, trim: true }],
    sourceFiles: { type: [batchSourceSchema], default: [] },
    candidateCount: { type: Number, min: 0, required: true },
    counts: {
      parsed: { type: Number, min: 0, default: 0 },
      valid: { type: Number, min: 0, default: 0 },
      invalid: { type: Number, min: 0, default: 0 },
      needsReview: { type: Number, min: 0, default: 0 },
      approved: { type: Number, min: 0, default: 0 },
      rejected: { type: Number, min: 0, default: 0 },
      importedAsDraft: { type: Number, min: 0, default: 0 },
    },
    duplicateGroupCount: { type: Number, min: 0, default: 0 },
    duplicateOccurrenceCount: { type: Number, min: 0, default: 0 },
    status: {
      type: String,
      enum: ['PARSED', 'NEEDS_REVIEW', 'REVIEW_COMPLETE', 'PARTIALLY_CONFIRMED_DRAFT', 'CONFIRMED_DRAFT', 'FAILED'],
      default: 'NEEDS_REVIEW',
    },
  },
  { timestamps: true, optimisticConcurrency: true, minimize: false }
);

vocabularyImportBatchSchema.index(
  { status: 1, createdAt: -1, _id: 1 },
  { name: 'vocabulary_import_batch_status_created' }
);

const VocabularyImportBatch = mongoose.model('VocabularyImportBatch', vocabularyImportBatchSchema);

export default VocabularyImportBatch;
