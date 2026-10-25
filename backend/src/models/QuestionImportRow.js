import mongoose from 'mongoose';

const importOptionSchema = new mongoose.Schema({
  id: { type: String, required: true, maxlength: 16 },
  text: { type: String, default: '', maxlength: 4000 },
}, { _id: false });

const importIssueSchema = new mongoose.Schema({
  code: { type: String, required: true, maxlength: 80 },
  field: { type: String, required: true, maxlength: 80 },
  severity: { type: String, enum: ['error', 'warning'], required: true },
  message: { type: String, required: true, maxlength: 500 },
}, { _id: false });

const valuesSchema = new mongoose.Schema({
  questionText: { type: String, default: '', maxlength: 4000 },
  options: { type: [importOptionSchema], default: [] },
  correctAnswers: { type: [String], default: [] },
  explanation: { type: String, default: '', maxlength: 4000 },
}, { _id: false });

const sourceValuesSchema = new mongoose.Schema({
  questionText: { type: String, default: '', maxlength: 4000 },
  optionA: { type: String, default: '', maxlength: 4000 },
  optionB: { type: String, default: '', maxlength: 4000 },
  optionC: { type: String, default: '', maxlength: 4000 },
  optionD: { type: String, default: '', maxlength: 4000 },
  correctAnswer: { type: String, default: '', maxlength: 4000 },
  explanation: { type: String, default: '', maxlength: 4000 },
}, { _id: false });

const questionImportRowSchema = new mongoose.Schema({
  batchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'QuestionImportBatch',
    required: true,
  },
  sheetName: {
    type: String,
    required: true,
    maxlength: 100,
  },
  rowNumber: {
    type: Number,
    required: true,
    min: 1,
    max: 1020,
  },
  sourceValues: {
    type: sourceValuesSchema,
    required: true,
  },
  values: {
    type: valuesSchema,
    required: true,
  },
  formulaFields: {
    type: [String],
    default: [],
  },
  sourceIssues: {
    type: [importIssueSchema],
    default: [],
  },
  editedFields: {
    type: [String],
    default: [],
  },
  issues: {
    type: [importIssueSchema],
    default: [],
  },
  status: {
    type: String,
    enum: ['VALID', 'NEEDS_REVIEW', 'INVALID', 'DUPLICATE'],
    required: true,
  },
  importState: {
    type: String,
    enum: ['PENDING', 'CLAIMED', 'IMPORTED', 'FAILED', 'SKIPPED', 'DUPLICATE'],
    default: 'PENDING',
    index: true,
  },
  fingerprintVersion: {
    type: Number,
    required: true,
    default: 1,
  },
  stemFingerprint: {
    type: String,
    required: true,
  },
  stemOptionsFingerprint: {
    type: String,
    required: true,
  },
  contentFingerprint: {
    type: String,
    required: true,
  },
  duplicateOfRowNumber: {
    type: Number,
    default: null,
  },
  questionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Question',
    default: null,
  },
  claimToken: {
    type: String,
    default: '',
  },
  claimExpiresAt: {
    type: Date,
    default: null,
  },
  attemptCount: {
    type: Number,
    default: 0,
    min: 0,
  },
  resultCode: {
    type: String,
    default: '',
    maxlength: 80,
  },
  resultMessage: {
    type: String,
    default: '',
    maxlength: 500,
  },
}, { timestamps: true });

questionImportRowSchema.index({ batchId: 1, rowNumber: 1 }, { unique: true, name: 'uniq_question_import_batch_row' });
questionImportRowSchema.index({ stemFingerprint: 1, batchId: 1 });
questionImportRowSchema.index({ stemFingerprint: 1, importState: 1 });

const QuestionImportRow = mongoose.model('QuestionImportRow', questionImportRowSchema);

export default QuestionImportRow;
