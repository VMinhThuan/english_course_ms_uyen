import mongoose from 'mongoose';

export const EXERCISE_IMPORT_TYPES = [
  'part1-dictation',
  'vocabulary-dictation',
  'hard-words-dictation',
  'part2-challenge',
  'grammar-tense-classification',
  'grammar-active-to-passive',
  'road-to-part-7',
];

const exerciseImportBatchSchema = new mongoose.Schema({
  exerciseType: { type: String, required: true, enum: EXERCISE_IMPORT_TYPES },
  fileSha256: { type: String, required: true, match: /^[a-f0-9]{64}$/ },
  sourceFileName: { type: String, required: true, maxlength: 240 },
  sheetName: { type: String, default: '', maxlength: 100 },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  rowCounts: {
    create: { type: Number, default: 0, min: 0 },
    update: { type: Number, default: 0, min: 0 },
    unchanged: { type: Number, default: 0, min: 0 },
    invalid: { type: Number, default: 0, min: 0 },
    duplicate: { type: Number, default: 0, min: 0 },
  },
  resultCounts: {
    imported: { type: Number, default: 0, min: 0 },
    failed: { type: Number, default: 0, min: 0 },
  },
  state: {
    type: String,
    enum: ['PREVIEW_READY', 'CONFIRMING', 'PARTIALLY_CONFIRMED', 'CONFIRMED'],
    default: 'PREVIEW_READY',
    index: true,
  },
  confirmedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  confirmedAt: { type: Date, default: null },
}, { timestamps: true });

exerciseImportBatchSchema.index({ uploadedBy: 1, createdAt: -1 });

export default mongoose.model('ExerciseImportBatch', exerciseImportBatchSchema);
