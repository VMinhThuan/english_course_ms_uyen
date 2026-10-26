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
    // Captured at start so route selection cannot change which scorer owns an attempt.
    // Legacy attempts resolve this from their assessment's examFormat.
    engine: {
      type: String,
      enum: ['standard', 'toeic'],
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
        translation: { type: String, default: '' },
        answerTranslation: { type: String, default: '' },
        audioText: { type: String, default: '' },
        audioTranslation: { type: String, default: '' },
        audioSource: { type: String, default: '' },
        audioUrl: { type: String, default: '' },
        imageUrl: { type: String, default: '' },
        imageAlt: { type: String, default: '' },
        difficulty: { type: String, default: '' },
        category: { type: String, default: '' },
        tags: [String],
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
    scorePercentage: {
      type: Number,
    },
    // Kept on the attempt so an assessment edit cannot rewrite historical outcomes.
    passScore: {
      type: Number,
    },
    passed: {
      type: Boolean,
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
// Supports bounded per-assessment reporting and optional attempt-start date ranges.
attemptSchema.index({ assessment: 1, startedAt: 1 }, { name: 'assessment_startedAt_report' });
// At most one resumable attempt may exist for a student and an assessment.
attemptSchema.index(
  { student: 1, assessment: 1 },
  { unique: true, partialFilterExpression: { status: 'in_progress' } }
);

const Attempt = mongoose.model('Attempt', attemptSchema);

export default Attempt;
