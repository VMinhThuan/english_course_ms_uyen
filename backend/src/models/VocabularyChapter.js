import mongoose from 'mongoose';
import { VOCABULARY_CATALOG_STATUSES } from './VocabularyTag.js';

export function normalizeVocabularyChapterTitle(value) {
  return String(value || '')
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('en');
}

const vocabularyChapterSchema = new mongoose.Schema(
  {
    tagId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'VocabularyTag',
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    normalizedTitle: {
      type: String,
      default: null,
      select: false,
    },
    description: {
      type: String,
      default: '',
    },
    chapterNumber: {
      type: Number,
      min: 1,
      default: null,
    },
    sortOrder: {
      type: Number,
      min: 0,
      default: 0,
    },
    status: {
      type: String,
      enum: VOCABULARY_CATALOG_STATUSES,
      default: 'draft',
    },
  },
  { timestamps: true, optimisticConcurrency: true }
);

vocabularyChapterSchema.pre('validate', function normalizeTitle() {
  if (this.isModified('title') || !this.normalizedTitle) {
    this.normalizedTitle = normalizeVocabularyChapterTitle(this.title);
  }
});

vocabularyChapterSchema.index(
  { tagId: 1, status: 1, sortOrder: 1, _id: 1 },
  { name: 'vocabulary_chapter_tag_status_order' }
);
vocabularyChapterSchema.index(
  { tagId: 1, normalizedTitle: 1 },
  {
    unique: true,
    name: 'uniq_vocabulary_chapter_tag_title',
    partialFilterExpression: { normalizedTitle: { $type: 'string' } },
  }
);

const VocabularyChapter = mongoose.model('VocabularyChapter', vocabularyChapterSchema);

export default VocabularyChapter;
