import mongoose from 'mongoose';

const learningSessionHeartbeatSchema = new mongoose.Schema({
  session: { type: mongoose.Schema.Types.ObjectId, ref: 'LearningSession', required: true },
  idempotencyKey: { type: String, required: true },
}, { timestamps: true, versionKey: false });

learningSessionHeartbeatSchema.index({ session: 1, idempotencyKey: 1 }, { unique: true, name: 'learning_session_heartbeat_idempotency' });
learningSessionHeartbeatSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 14, name: 'learning_session_heartbeat_ttl' });

const LearningSessionHeartbeat = mongoose.model('LearningSessionHeartbeat', learningSessionHeartbeatSchema);

export default LearningSessionHeartbeat;
