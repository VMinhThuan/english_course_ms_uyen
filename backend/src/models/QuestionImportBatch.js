import mongoose from 'mongoose';

const questionImportBatchSchema = new mongoose.Schema({
  fileSha256: {
    type: String,
    required: true,
    match: /^[a-f0-9]{64}$/,
  },
  sourceFileName: {
    type: String,
    required: true,
    maxlength: 240,
  },
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  uploadedAt: {
    type: Date,
    default: Date.now,
  },
  sheetName: {
    type: String,
    default: '',
    maxlength: 100,
  },
  headerRowNumber: {
    type: Number,
    default: 0,
    min: 0,
  },
  totalRows: {
    type: Number,
    default: 0,
    min: 0,
  },
  rowCounts: {
    valid: { type: Number, default: 0, min: 0 },
    invalid: { type: Number, default: 0, min: 0 },
    duplicate: { type: Number, default: 0, min: 0 },
    needsReview: { type: Number, default: 0, min: 0 },
  },
  resultCounts: {
    imported: { type: Number, default: 0, min: 0 },
    failed: { type: Number, default: 0, min: 0 },
  },
  state: {
    type: String,
    enum: ['PREVIEW_BUILDING', 'PREVIEW_READY', 'PREVIEW_FAILED', 'EDITING', 'CONFIRMING', 'PARTIALLY_CONFIRMED', 'CONFIRMED'],
    default: 'PREVIEW_BUILDING',
    index: true,
  },
  activeOperationToken: {
    type: String,
    default: '',
  },
  activeOperationUntil: {
    type: Date,
    default: null,
  },
  lastOperationError: {
    type: String,
    default: '',
    maxlength: 500,
  },
  confirmedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  confirmedAt: {
    type: Date,
    default: null,
  },
}, { timestamps: true });

questionImportBatchSchema.index({ fileSha256: 1 }, { unique: true, name: 'uniq_question_import_file_sha256' });

const QuestionImportBatch = mongoose.model('QuestionImportBatch', questionImportBatchSchema);

export default QuestionImportBatch;
