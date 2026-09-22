import mongoose from 'mongoose';

const attemptSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    assessment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Assessment',
      required: true,
    },
    assessmentType: {
      type: String,
      enum: ['exercise', 'exam'],
      default: 'exercise',
    },
    startedAt: {
      type: Date,
      default: Date.now,
      required: true,
    },
    deadlineAt: {
      type: Date,
      required: true,
    },
    submittedAt: {
      type: Date,
    },
    status: {
      type: String,
      enum: ['in_progress', 'submitted', 'completed'],
      default: 'in_progress',
    },
    questionSnapshots: [
      {
        questionId: { type: String, required: true },
        type: { type: String, required: true },
        questionText: { type: String, required: true },
        options: [
          {
            id: String,
            text: String,
          },
        ],
        correctAnswers: [String], // Backend secret snapshot
        score: { type: Number, default: 1 },
        explanation: { type: String, default: '' },
        toeicPart: Number,
        questionGroupId: String,
        questionNumber: Number,
        order: Number,
      },
    ],
    groupSnapshots: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },
    answers: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    flaggedQuestionIds: [
      {
        type: String,
      },
    ],
    revision: {
      type: Number,
      default: 1,
    },
    score: {
      type: Number,
      default: 0,
    },
    maxScore: {
      type: Number,
      default: 0,
    },
    correctCount: {
      type: Number,
      default: 0,
    },
    incorrectCount: {
      type: Number,
      default: 0,
    },
    unansweredCount: {
      type: Number,
      default: 0,
    },
    duration: {
      type: Number, // duration in seconds
      default: 0,
    },
    isExpired: {
      type: Boolean,
      default: false,
    },
    toeicBreakdown: {
      listeningCorrect: { type: Number, default: 0 },
      readingCorrect: { type: Number, default: 0 },
      listeningTotal: { type: Number, default: 0 },
      readingTotal: { type: Number, default: 0 },
      listeningScore: { type: Number, default: 0 },
      readingScore: { type: Number, default: 0 },
      estimatedToeicScore: { type: Number, default: 0 },
      partBreakdown: {
        type: mongoose.Schema.Types.Mixed,
        default: {},
      },
    },
  },

  {
    timestamps: true,
  }
);

attemptSchema.index({ student: 1, assessment: 1, status: 1 });

const Attempt = mongoose.model('Attempt', attemptSchema);

export default Attempt;
