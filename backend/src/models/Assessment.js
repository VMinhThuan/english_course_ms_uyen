import mongoose from 'mongoose';

const assessmentSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: '',
    },
    type: {
      type: String,
      enum: ['exercise', 'exam'],
      required: true,
    },
    questions: [
      {
        question: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Question',
          required: true,
        },
        score: {
          type: Number,
          default: 1,
        },
      },
    ],
    durationMinutes: {
      type: Number,
      default: 30,
      min: 1,
    },
    totalScore: {
      type: Number,
      default: 0,
    },
    // Percentage required to pass. 0 preserves the previous behaviour for legacy assessments.
    passScore: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    status: {
      type: String,
      enum: ['draft', 'published', 'hidden'],
      default: 'draft',
    },
    availableFrom: {
      type: Date,
    },
    availableUntil: {
      type: Date,
    },
    attemptLimit: {
      type: Number,
      default: 0, // 0 = unlimited
      min: 0,
    },
    showCorrectAnswers: {
      type: Boolean,
      default: true,
    },
    examFormat: {
      type: String,
      enum: ['standard', 'toeic'],
      default: 'standard',
    },
    toeicMode: {
      type: String,
      enum: ['practice', 'mini_test', 'full_test'],
      default: 'full_test',
    },
    toeicConfig: {
      totalQuestions: { type: Number, default: 200 },
      durationMinutes: { type: Number, default: 120 },
      listeningQuestionCount: { type: Number, default: 100 },
      readingQuestionCount: { type: Number, default: 100 },
      listeningDurationMinutes: { type: Number, default: 45 },
      readingDurationMinutes: { type: Number, default: 75 },
      scoringMode: {
        type: String,
        enum: ['raw', 'estimated_toeic'],
        default: 'raw',
      },
    },
    parts: [
      {
        partNumber: { type: Number, required: true, min: 1, max: 7 },
        name: { type: String, required: true },
        section: { type: String, enum: ['listening', 'reading'], required: true },
        instructions: { type: String, default: '' },
        order: { type: Number, default: 1 },
        durationMinutes: { type: Number, default: 0 },
      },
    ],
    questionGroups: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'QuestionGroup',
      },
    ],
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    // Provenance for imports produced by the approved TOEIC crawler exporter.
    // Kept separate from display fields so re-importing the same source is idempotent.
    crawlerSourceSystem: {
      type: String,
      select: false,
    },
    crawlerSourceId: {
      type: String,
      select: false,
    },
    crawlerContentHash: {
      type: String,
      select: false,
    },
    // Short lease serializes Part 5 bank-selection writes without requiring
    // MongoDB replica-set transactions. Hidden from API serialization.
    bankSelectionLockToken: {
      type: String,
      select: false,
    },
    bankSelectionLockExpiresAt: {
      type: Date,
      select: false,
    },
  },

  {
    timestamps: true,
  }
);

// Auto-calculate totalScore before save
assessmentSchema.pre('save', function (next) {
  if (this.questions && this.questions.length > 0) {
    this.totalScore = this.questions.reduce((sum, item) => sum + (item.score || 1), 0);
  } else {
    this.totalScore = 0;
  }
  next();
});

assessmentSchema.index(
  { crawlerSourceSystem: 1, crawlerSourceId: 1 },
  { unique: true, sparse: true, name: 'uniq_toeic_crawler_source' }
);

const Assessment = mongoose.model('Assessment', assessmentSchema);

export default Assessment;
