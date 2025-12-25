import mongoose from 'mongoose';

const testSchema = new mongoose.Schema(
  {
    lesson: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Lesson',
      required: true,
    },
    type: {
      type: String,
      enum: ['reading', 'listening', 'speaking', 'writing'],
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    questions: [
      {
        question: {
          type: String,
          required: true,
        },
        type: {
          type: String,
          enum: ['multiple-choice', 'fill-blank', 'essay'],
          default: 'multiple-choice',
        },
        options: [String], // For multiple-choice
        correctAnswer: {
          type: String,
          required: true,
        },
        points: {
          type: Number,
          default: 1,
        },
        // For reading test with TTS
        textToRead: String, // Text for student to read
        expectedText: String, // Expected text for auto-check
        similarityThreshold: {
          type: Number,
          default: 0.8, // 80% similarity required
        },
      },
    ],
    totalPoints: {
      type: Number,
      default: 0,
    },
    timeLimit: {
      type: Number, // minutes
      default: 30,
    },
  },
  {
    timestamps: true,
  }
);

// Calculate total points before saving
testSchema.pre('save', function (next) {
  this.totalPoints = this.questions.reduce(
    (sum, q) => sum + q.points,
    0
  );
  next();
});

const Test = mongoose.model('Test', testSchema);

export default Test;

