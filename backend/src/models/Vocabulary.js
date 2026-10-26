import mongoose from 'mongoose';

const vocabularySchema = new mongoose.Schema(
  {
    word: {
      type: String,
      required: true,
      trim: true,
    },
    meaning: {
      type: String,
      required: true,
      trim: true,
    },
    partOfSpeech: {
      type: String,
      trim: true,
      default: '',
    },
    pronunciation: {
      type: String,
      default: '',
    },
    explanation: {
      type: String,
      default: '',
    },
    example: {
      type: String,
      default: '',
    },
    exampleEnglish: {
      type: String,
      trim: true,
      default: '',
    },
    exampleVietnamese: {
      type: String,
      trim: true,
      default: '',
    },
    // Vocabulary is independent from courses and lessons. Legacy rows are migrated into the catalog.
    catalogOnly: {
      type: Boolean,
      default: false,
    },
    catalogStatus: {
      type: String,
      enum: ['draft', 'published', 'archived'],
      required: function requiredForCatalog() {
        return this.catalogOnly === true;
      },
      default: undefined,
    },
    // Rich V3 import content is Catalog-only. Legacy Vocabulary DTOs do not expose these fields.
    catalogSenses: {
      type: [mongoose.Schema.Types.Mixed],
      default: undefined,
    },
    catalogNotes: {
      type: [String],
      default: undefined,
    },
    audioUrl: {
      type: String,
      trim: true,
      default: '',
    },
    topic: {
      type: String,
      default: 'General',
    },
    order: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ['published', 'hidden'],
      default: function defaultLegacyVisibility() {
        return this.catalogOnly === true ? 'hidden' : 'published';
      },
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_document, value) {
        // Keep legacy REST and flashcard DTOs unchanged without hiding catalog state internally.
        if (value.catalogOnly !== true) {
          delete value.catalogOnly;
          delete value.catalogStatus;
          delete value.catalogSenses;
          delete value.catalogNotes;
        }
        return value;
      },
    },
  }
);

vocabularySchema.index(
  { catalogStatus: 1, word: 1, _id: 1 },
  {
    name: 'catalog_status_word',
    partialFilterExpression: { catalogOnly: true },
  }
);

const Vocabulary = mongoose.model('Vocabulary', vocabularySchema);

export default Vocabulary;
