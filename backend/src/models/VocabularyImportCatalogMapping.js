import mongoose from 'mongoose';

const importCatalogMappingEntrySchema = new mongoose.Schema(
  {
    sourceFileIdentity: { type: String, required: true, immutable: true },
    sourceRelativePath: { type: String, required: true, immutable: true },
    fileSha256: { type: String, required: true, uppercase: true, match: /^[a-f\d]{64}$/i, immutable: true },
    sourceFolderLabel: { type: String, default: '' },
    sourceChapterCandidate: { type: String, default: '' },
    candidateCount: { type: Number, min: 0, default: 0 },
    chapterAction: { type: String, enum: ['EXISTING', 'CREATE'], required: true },
    targetChapterId: { type: mongoose.Schema.Types.ObjectId, ref: 'VocabularyChapter', default: null },
    createChapter: {
      title: { type: String, trim: true, default: '' },
      description: { type: String, default: '' },
      chapterNumber: { type: Number, min: 1, default: null },
      sortOrder: { type: Number, min: 0, default: 0 },
    },
    resolvedChapterId: { type: mongoose.Schema.Types.ObjectId, ref: 'VocabularyChapter', default: null },
  },
  { _id: false }
);

const vocabularyImportCatalogMappingSchema = new mongoose.Schema(
  {
    batchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'VocabularyImportBatch',
      required: true,
      unique: true,
      immutable: true,
    },
    batchIdentity: { type: String, required: true, immutable: true },
    targetTagId: { type: mongoose.Schema.Types.ObjectId, ref: 'VocabularyTag', required: true },
    entries: { type: [importCatalogMappingEntrySchema], required: true },
    status: { type: String, enum: ['MAPPED', 'LOCKED'], default: 'MAPPED' },
    lockedAt: { type: Date, default: null },
    lockedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, optimisticConcurrency: true, minimize: false }
);

vocabularyImportCatalogMappingSchema.index(
  { targetTagId: 1, updatedAt: -1 },
  { name: 'vocabulary_import_mapping_tag_updated' }
);

const VocabularyImportCatalogMapping = mongoose.model(
  'VocabularyImportCatalogMapping',
  vocabularyImportCatalogMappingSchema
);

export default VocabularyImportCatalogMapping;
