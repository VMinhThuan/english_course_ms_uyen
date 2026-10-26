import mongoose from 'mongoose';

const chapterVocabularySchema = new mongoose.Schema(
  {
    chapterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'VocabularyChapter',
      required: true,
    },
    vocabularyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vocabulary',
      required: true,
    },
    sortOrder: {
      type: Number,
      min: 0,
      default: 0,
    },
    sourceIdentity: {
      type: String,
      trim: true,
      default: null,
    },
  },
  { timestamps: true }
);

chapterVocabularySchema.index(
  { chapterId: 1, vocabularyId: 1 },
  { unique: true, name: 'uniq_chapter_vocabulary_membership' }
);
chapterVocabularySchema.index(
  { sourceIdentity: 1 },
  {
    unique: true,
    name: 'uniq_chapter_vocabulary_source_identity',
    partialFilterExpression: { sourceIdentity: { $type: 'string' } },
  }
);
chapterVocabularySchema.index(
  { chapterId: 1, sortOrder: 1, _id: 1 },
  { name: 'chapter_vocabulary_order' }
);
chapterVocabularySchema.index({ vocabularyId: 1 }, { name: 'chapter_vocabulary_reverse_lookup' });

const ChapterVocabulary = mongoose.model('ChapterVocabulary', chapterVocabularySchema);

export default ChapterVocabulary;
