import mongoose from 'mongoose';

const exerciseImportIssueSchema = new mongoose.Schema({
  code: { type: String, required: true, maxlength: 80 },
  field: { type: String, default: 'row', maxlength: 80 },
  severity: { type: String, enum: ['error', 'warning'], default: 'error' },
  message: { type: String, required: true, maxlength: 500 },
}, { _id: false });

const exerciseImportRowSchema = new mongoose.Schema({
  batchId: { type: mongoose.Schema.Types.ObjectId, ref: 'ExerciseImportBatch', required: true, index: true },
  rowNumber: { type: Number, required: true, min: 1 },
  sourceRowNumber: { type: Number, required: true, min: 1 },
  sourceKey: { type: String, default: '', maxlength: 180 },
  action: {
    type: String,
    enum: ['CREATE', 'UPDATE', 'UNCHANGED', 'INVALID', 'DUPLICATE', 'IMPORTED', 'FAILED'],
    required: true,
    index: true,
  },
  data: { type: mongoose.Schema.Types.Mixed, default: {} },
  issues: { type: [exerciseImportIssueSchema], default: [] },
  existingId: { type: mongoose.Schema.Types.ObjectId, default: null },
  existingFingerprint: { type: String, default: '' },
  resultMessage: { type: String, default: '', maxlength: 500 },
}, { timestamps: true });

exerciseImportRowSchema.index({ batchId: 1, rowNumber: 1 }, { unique: true, name: 'uniq_exercise_import_batch_row' });

export default mongoose.model('ExerciseImportRow', exerciseImportRowSchema);
