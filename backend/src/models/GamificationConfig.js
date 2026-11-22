import mongoose from 'mongoose';

const questStageSchema = new mongoose.Schema({
  level: { type: Number, min: 1, max: 4, required: true },
  stage: { type: Number, min: 1, max: 4, required: true },
  vocabularyIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Vocabulary' }],
}, { _id: false });

const gamificationConfigSchema = new mongoose.Schema({
  game: { type: String, enum: ['streak', 'quest'], required: true, unique: true },
  enabled: { type: Boolean, default: true },
  dailyWordCount: { type: Number, enum: [20], default: 20 },
  passThreshold: { type: Number, enum: [80], default: 80 },
  timeLimitSeconds: { type: Number, min: 60, max: 600, default: 120 },
  questionCount: { type: Number, enum: [10], default: 10 },
  levelCount: { type: Number, enum: [4], default: 4 },
  timezone: { type: String, default: 'Asia/Ho_Chi_Minh' },
  questStages: { type: [questStageSchema], default: [] },
}, { timestamps: true, versionKey: false });

export default mongoose.model('GamificationConfig', gamificationConfigSchema);
