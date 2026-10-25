import mongoose from 'mongoose';

const questionBankSelectionBatchSchema = new mongoose.Schema(
  {
    assessment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Assessment',
      required: true,
      index: true,
    },
    idempotencyKey: {
      type: String,
      required: true,
      maxlength: 128,
    },
    requestHash: {
      type: String,
      required: true,
    },
    requestedQuestionIds: {
      type: [String],
      default: [],
    },
    groupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'QuestionGroup',
    },
    status: {
      type: String,
      enum: ['processing', 'completed'],
      default: 'processing',
    },
    results: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    completedAt: Date,
  },
  { timestamps: true }
);

questionBankSelectionBatchSchema.index(
  { assessment: 1, idempotencyKey: 1 },
  { unique: true, name: 'uniq_question_bank_selection_idempotency_key' }
);

const QuestionBankSelectionBatch = mongoose.model('QuestionBankSelectionBatch', questionBankSelectionBatchSchema);

export default QuestionBankSelectionBatch;
