import mongoose from 'mongoose';

export const VOCABULARY_CATALOG_STATUSES = Object.freeze(['draft', 'published', 'archived']);

const vocabularyTagSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    description: {
      type: String,
      default: '',
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

vocabularyTagSchema.index({ slug: 1 }, { unique: true, name: 'uniq_vocabulary_tag_slug' });
vocabularyTagSchema.index(
  { status: 1, sortOrder: 1, _id: 1 },
  { name: 'vocabulary_tag_status_order' }
);

const VocabularyTag = mongoose.model('VocabularyTag', vocabularyTagSchema);

export default VocabularyTag;
