import mongoose from 'mongoose';

const questionSchema = new mongoose.Schema(
  {
    questionText: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      enum: ['single_choice', 'multiple_choice', 'fill_blank', 'typed_answer'],
      required: true,
    },
    explanation: {
      type: String,
      default: '',
    },
    options: [
      {
        id: { type: String, required: true },
        text: { type: String, required: true },
      },
    ],
    correctAnswers: [
      {
        type: String,
        required: true,
      },
    ],
    score: {
      type: Number,
      default: 1,
      min: 0.1,
    },
    lesson: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Lesson',
    },
    topic: {
      type: String,
      default: 'General',
    },
    status: {
      type: String,
      enum: ['draft', 'published', 'hidden'],
      default: 'draft',
    },
    toeicPart: {
      type: Number,
      min: 1,
      max: 7,
    },
    questionGroup: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'QuestionGroup',
    },
    questionNumber: {
      type: Number,
    },
    order: {
      type: Number,
      default: 1,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },

  {
    timestamps: true,
  }
);

const Question = mongoose.model('Question', questionSchema);

export default Question;
