import mongoose from 'mongoose';

const milestoneSchema = new mongoose.Schema({
  days: { type: Number, required: true, min: 1 },
  unlockedAt: { type: Date, required: true },
}, { _id: false });

const learningStreakSchema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
  currentStreak: { type: Number, default: 0, min: 0 },
  longestStreak: { type: Number, default: 0, min: 0 },
  lastCompletedDate: { type: String, default: null },
  totalCompletedDays: { type: Number, default: 0, min: 0 },
  currentTier: { type: Number, default: 0, min: 0, max: 7 },
  timezone: { type: String, default: 'Asia/Ho_Chi_Minh' },
  milestones: { type: [milestoneSchema], default: [] },
}, { timestamps: true, versionKey: false });

learningStreakSchema.index({ currentStreak: -1 });
learningStreakSchema.index({ longestStreak: -1 });

const LearningStreak = mongoose.model('LearningStreak', learningStreakSchema);

export default LearningStreak;
