import mongoose from 'mongoose';

const levelSchema = new mongoose.Schema({
  level: { type: Number, required: true },
  unlocked: { type: Boolean, default: false },
  completed: { type: Boolean, default: false },
  bestAccuracy: { type: Number, default: 0 },
  bestScore: { type: Number, default: 0 },
  stars: { type: Number, default: 0, min: 0, max: 3 },
  completedStages: { type: [Number], default: [] },
  attempts: { type: Number, default: 0 },
  unlockedAt: { type: Date, default: null },
  completedAt: { type: Date, default: null },
}, { _id: false });

const vocabularyQuestProgressSchema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  levels: { type: [levelSchema], default: [] },
}, { timestamps: true, versionKey: false });

export default mongoose.model('VocabularyQuestProgress', vocabularyQuestProgressSchema);
