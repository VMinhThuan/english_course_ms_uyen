import mongoose from 'mongoose';

const gamificationConfigChangeSchema = new mongoose.Schema({
  game: { type: String, enum: ['streak', 'quest'], required: true, index: true },
  changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  before: { type: mongoose.Schema.Types.Mixed, required: true },
  after: { type: mongoose.Schema.Types.Mixed, required: true },
}, { timestamps: true, versionKey: false });

export default mongoose.model('GamificationConfigChange', gamificationConfigChangeSchema);
