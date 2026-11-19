import mongoose from 'mongoose';

const studentPresenceSchema = new mongoose.Schema({
  // The student id is also the document id, guaranteeing one presence row per student
  // without relying on production autoIndex behavior.
  _id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  lastSeenAt: { type: Date, required: true },
  lastActiveAt: { type: Date, default: null },
  lastCreditedAt: { type: Date, default: null },
  currentRoute: { type: String, default: '' },
}, { timestamps: true, versionKey: false });

const StudentPresence = mongoose.model('StudentPresence', studentPresenceSchema);

export default StudentPresence;
