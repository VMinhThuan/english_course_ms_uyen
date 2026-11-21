import mongoose from 'mongoose';

const answerSchema = new mongoose.Schema({
  questionId: String,
  vocabularyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vocabulary' },
  answer: String,
  isCorrect: Boolean,
}, { _id: false });

const questionSchema = new mongoose.Schema({
  questionId: String,
  vocabularyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vocabulary' },
  mode: { type: String, enum: ['multiple_choice', 'match', 'fill_blank', 'timed'], required: true },
  prompt: String,
  sentence: String,
  options: [{ id: String, text: String }],
  answer: { type: String, select: false },
}, { _id: false });

const vocabularyQuestAttemptSchema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  level: { type: Number, required: true },
  stage: { type: Number, min: 1, max: 4, default: 1 },
  questions: { type: [questionSchema], required: true },
  answers: { type: [answerSchema], default: [] },
  status: { type: String, enum: ['in_progress', 'submitted'], default: 'in_progress' },
  timeLimitSeconds: { type: Number, default: 120, min: 1, max: 3600 },
  expiresAt: { type: Date, default: null },
  timedOut: { type: Boolean, default: false },
  score: { type: Number, default: 0 },
  correctCount: { type: Number, default: 0, min: 0, max: 10 },
  totalQuestions: { type: Number, default: 10, min: 1, max: 10 },
  accuracy: { type: Number, default: 0 },
  passed: { type: Boolean, default: false },
  stars: { type: Number, default: 0, min: 0, max: 3 },
  startedAt: { type: Date, default: Date.now },
  submittedAt: { type: Date, default: null },
}, { timestamps: true, versionKey: false });

vocabularyQuestAttemptSchema.index({ student: 1, level: 1, createdAt: -1 });

export default mongoose.model('VocabularyQuestAttempt', vocabularyQuestAttemptSchema);
