import mongoose from 'mongoose';

export const TRACKED_EXERCISE_TYPES = [
  'part1-dictation',
  'vocabulary-dictation',
  'hard-words-dictation',
  'part2-challenge',
  'grammar-tense-classification',
  'grammar-active-to-passive',
];

const exerciseSubmissionSchema = new mongoose.Schema({
  // Deterministic id by student, exercise, source, and client key makes retries idempotent.
  _id: { type: String, required: true },
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  clientSubmissionId: { type: String, required: true },
  exerciseType: { type: String, enum: TRACKED_EXERCISE_TYPES, required: true },
  sourceId: { type: mongoose.Schema.Types.ObjectId, default: null },
  sourceTitle: { type: String, default: '' },
  submittedAt: { type: Date, required: true, default: Date.now },
  total: { type: Number, default: 0 },
  correctCount: { type: Number, default: 0 },
  incorrectCount: { type: Number, default: 0 },
  partialCount: { type: Number, default: 0 },
  unansweredCount: { type: Number, default: 0 },
  correctFieldCount: { type: Number, default: null },
  totalFieldCount: { type: Number, default: null },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  questions: { type: [mongoose.Schema.Types.Mixed], default: [] },
}, { timestamps: true, versionKey: false });

exerciseSubmissionSchema.index({ student: 1, submittedAt: -1 }, { name: 'exercise_submission_student_date' });
exerciseSubmissionSchema.index({ student: 1, exerciseType: 1, submittedAt: -1 }, { name: 'exercise_submission_student_type_date' });

const ExerciseSubmission = mongoose.model('ExerciseSubmission', exerciseSubmissionSchema);

export default ExerciseSubmission;
