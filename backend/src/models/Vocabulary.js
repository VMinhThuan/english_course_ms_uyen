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
    audioUrl: {
      type: String,
      trim: true,
      default: '',
    },
    lesson: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Lesson',
      required: true,
    },
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course',
      required: true,
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
      default: 'published',
    },
  },
  {
    timestamps: true,
  }
);

vocabularySchema.index({ lesson: 1, topic: 1, order: 1 });

const Vocabulary = mongoose.model('Vocabulary', vocabularySchema);

export default Vocabulary;
