import mongoose from 'mongoose';

const responseSchema = new mongoose.Schema({
  vocabularyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vocabulary', required: true },
  questionId: { type: String, required: true },
  answer: { type: String, default: '' },
  isCorrect: { type: Boolean, required: true },
  answeredAt: { type: Date, default: Date.now },
}, { _id: false });

const questionSchema = new mongoose.Schema({
  questionId: { type: String, required: true },
  vocabularyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vocabulary', required: true },
  type: { type: String, enum: ['multiple_choice', 'fill_blank', 'recognition'], required: true },
  prompt: { type: String, required: true },
  sentence: { type: String, default: '' },
  options: [{ id: String, text: String }],
  answer: { type: String, required: true, select: false },
}, { _id: false });

const dailyVocabularyChallengeSchema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  dateKey: { type: String, required: true },
  timezone: { type: String, required: true },
  status: { type: String, enum: ['in_progress', 'completed'], default: 'in_progress' },
  totalWords: { type: Number, default: 20, min: 20, max: 20 },
  correctCount: { type: Number, default: 0, min: 0, max: 20 },
  questions: { type: [questionSchema], required: true },
  responses: { type: [responseSchema], default: [] },
  completedVocabularyIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Vocabulary' }],
  accuracy: { type: Number, default: 0 },
  startedAt: { type: Date, default: Date.now },
  completedAt: { type: Date, default: null },
}, { timestamps: true, versionKey: false });

dailyVocabularyChallengeSchema.index({ student: 1, dateKey: 1 }, { unique: true });

export default mongoose.model('DailyVocabularyChallenge', dailyVocabularyChallengeSchema);
