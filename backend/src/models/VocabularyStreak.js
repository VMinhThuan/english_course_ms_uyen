import mongoose from 'mongoose';

const vocabularyStreakSchema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  timezone: { type: String, default: 'Asia/Ho_Chi_Minh' },
  currentStreak: { type: Number, default: 0, min: 0 },
  longestStreak: { type: Number, default: 0, min: 0 },
  completedDates: { type: [String], default: [] },
  badges: { type: [String], default: [] },
  lastCompletedDateKey: { type: String, default: null },
}, { timestamps: true, versionKey: false });

export default mongoose.model('VocabularyStreak', vocabularyStreakSchema);
