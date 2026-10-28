import mongoose from 'mongoose';

const hardWordsDictationSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 160 },
  sourceKey: { type: String, trim: true, unique: true, sparse: true },
  sourceWorkbook: { type: String, trim: true, default: '' },
  testNumber: { type: Number, min: 1 },
  sectionNumber: { type: Number, min: 1 },
  firstWord: { type: Number, min: 1 },
  lastWord: { type: Number, min: 1 },
  audioFilename: { type: String, trim: true, default: '' },
  audioUrl: { type: String, trim: true, default: '' },
  answers: [
    {
      text: { type: String, required: true, trim: true, maxlength: 1000 },
      translation: { type: String, default: '', trim: true, maxlength: 1000 },
      order: { type: Number, required: true, min: 1 },
    },
  ],
  isVisible: { type: Boolean, default: false },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

hardWordsDictationSchema.index({ testNumber: 1, sectionNumber: 1 }, { name: 'hard_words_dictation_order' });
hardWordsDictationSchema.index({ isVisible: 1, testNumber: 1, sectionNumber: 1 }, { name: 'hard_words_dictation_student_list' });

const HardWordsDictation = mongoose.model('HardWordsDictation', hardWordsDictationSchema);

export default HardWordsDictation;
