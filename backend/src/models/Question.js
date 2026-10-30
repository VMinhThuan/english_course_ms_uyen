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
    translation: {
      type: String,
      default: '',
    },
    answerTranslation: {
      type: String,
      default: '',
    },
    audioText: {
      type: String,
      default: '',
    },
    audioTranslation: {
      type: String,
      default: '',
    },
    audioSource: {
      type: String,
      enum: ['', 'stored', 'browser-tts'],
      default: '',
    },
    audioUrl: {
      type: String,
      default: '',
    },
    imageUrl: {
      type: String,
      default: '',
    },
    imageAlt: {
      type: String,
      default: '',
    },
    difficulty: {
      type: String,
      default: '',
    },
    category: {
      type: String,
      default: '',
    },
    tags: {
      type: [String],
      default: [],
    },
    sourceType: {
      type: String,
      default: '',
    },
    sourceLabel: {
      type: String,
      default: '',
    },
    sourceProvider: {
      type: String,
      default: '',
    },
    sourceUrl: {
      type: String,
      default: '',
    },
    sourceDetail: {
      type: String,
      default: '',
    },
    sourceNote: {
      type: String,
      default: '',
    },
    evidence: {
      type: String,
      default: '',
    },
    evidenceLocation: {
      type: String,
      default: '',
    },
    choiceNotes: {
      type: [String],
      default: [],
    },
    sourceMetadata: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
      select: false,
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
      default: null,
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
    // Stable standalone-bank order. This differs from questionNumber, which
    // remains the number inside an original TOEIC full test.
    part5BankOrder: {
      type: Number,
      min: 1,
    },
    order: {
      type: Number,
      default: 1,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    // Set only by the TOEIC Part 5 importer. The sparse unique index provides
    // an atomic cross-batch claim without requiring a migration of old Questions.
    importStemOptionsFingerprint: {
      type: String,
      select: false,
    },
    importFingerprintVersion: {
      type: Number,
      select: false,
    },
    importBatchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'QuestionImportBatch',
      select: false,
    },
    importRowNumber: {
      type: Number,
      select: false,
    },
    // Part 5 bank selections create assessment-scoped copies. These fields
    // preserve provenance without linking a bank Question into a TOEIC group.
    bankSourceQuestionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Question',
      select: false,
    },
    bankTargetAssessmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Assessment',
      select: false,
    },
    bankSourceSelectionBatchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'QuestionBankSelectionBatch',
      select: false,
    },
    crawlerSourceId: {
      type: String,
      select: false,
    },
  },

  {
    timestamps: true,
  }
);

questionSchema.index(
  { importStemOptionsFingerprint: 1 },
  { unique: true, sparse: true, name: 'uniq_question_import_stem_options_fingerprint' }
);
questionSchema.index(
  { questionGroup: 1, crawlerSourceId: 1 },
  { unique: true, sparse: true, name: 'uniq_toeic_crawler_question_per_group' }
);
questionSchema.index(
  { bankTargetAssessmentId: 1, bankSourceQuestionId: 1 },
  { unique: true, sparse: true, name: 'uniq_question_bank_source_per_assessment' }
);
questionSchema.index(
  { toeicPart: 1, status: 1, part5BankOrder: 1, _id: 1 },
  { name: 'idx_part5_bank_display_order' }
);

const Question = mongoose.model('Question', questionSchema);

export default Question;
