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

const Question = mongoose.model('Question', questionSchema);

export default Question;
