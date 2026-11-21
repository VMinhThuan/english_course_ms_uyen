import mongoose from 'mongoose';

const gamificationAchievementSchema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  code: { type: String, required: true },
  title: { type: String, required: true },
  earnedAt: { type: Date, default: Date.now },
}, { versionKey: false });

gamificationAchievementSchema.index({ student: 1, code: 1 }, { unique: true });

export default mongoose.model('GamificationAchievement', gamificationAchievementSchema);
