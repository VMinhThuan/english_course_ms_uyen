import mongoose from 'mongoose';

const studentDailyStudySchema = new mongoose.Schema({
  // Deterministic id `${student}:${dateKey}` enforces one daily bucket without a migration.
  _id: { type: String, required: true },
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  dateKey: { type: String, required: true }, // Calendar date in Asia/Ho_Chi_Minh.
  activeSeconds: { type: Number, default: 0, min: 0 },
  lastActiveAt: { type: Date, default: null },
}, { timestamps: true, versionKey: false });

studentDailyStudySchema.index({ student: 1, dateKey: -1 }, { name: 'student_daily_study_lookup' });
studentDailyStudySchema.index({ dateKey: 1, student: 1 }, { name: 'student_daily_study_weekly_leaderboard' });

const StudentDailyStudy = mongoose.model('StudentDailyStudy', studentDailyStudySchema);

export default StudentDailyStudy;
