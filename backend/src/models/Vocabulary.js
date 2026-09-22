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

const Vocabulary = mongoose.model('Vocabulary', vocabularySchema);

export default Vocabulary;
