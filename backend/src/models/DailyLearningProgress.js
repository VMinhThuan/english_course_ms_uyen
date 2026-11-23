import mongoose from 'mongoose';

const dailyLearningProgressSchema = new mongoose.Schema({
  // Deterministic id guarantees one source-of-truth bucket per learner/day.
  _id: { type: String, required: true },
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  localDate: { type: String, required: true },
  timezone: { type: String, required: true, default: 'Asia/Ho_Chi_Minh' },
  validStudySeconds: { type: Number, required: true, default: 0, min: 0 },
  targetSeconds: { type: Number, required: true, default: 900, min: 1 },
  completed: { type: Boolean, required: true, default: false, index: true },
  completedAt: { type: Date, default: null },
  activitySeconds: { type: Map, of: Number, default: undefined },
}, { timestamps: true, versionKey: false });

dailyLearningProgressSchema.index({ student: 1, localDate: -1 }, { unique: true, name: 'daily_learning_progress_student_date' });
dailyLearningProgressSchema.index({ localDate: 1, completed: 1, student: 1 }, { name: 'daily_learning_progress_calendar' });

const DailyLearningProgress = mongoose.model('DailyLearningProgress', dailyLearningProgressSchema);

export default DailyLearningProgress;
