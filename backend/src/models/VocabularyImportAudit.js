import mongoose from 'mongoose';

const changedFieldSchema = new mongoose.Schema(
  {
    field: { type: String, required: true, trim: true },
    before: { type: mongoose.Schema.Types.Mixed, default: null },
    after: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { _id: false }
);

const vocabularyImportAuditSchema = new mongoose.Schema(
  {
    batchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'VocabularyImportBatch',
      required: true,
      immutable: true,
    },
    candidateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'VocabularyImportCandidate',
      required: true,
      immutable: true,
    },
    sourceIdentity: { type: String, required: true, immutable: true },
    actorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      immutable: true,
    },
    action: {
      type: String,
      enum: ['FIELDS_EDITED', 'REVIEW_DECISION', 'CONFIRMED_DRAFT'],
      required: true,
      immutable: true,
    },
    changedFields: { type: [changedFieldSchema], default: [] },
    decision: { type: String, enum: ['APPROVE', 'REJECT', 'REQUEST_CHANGES', null], default: null },
    duplicateDecision: { type: String, enum: ['KEEP_SEPARATE', null], default: null },
    reason: { type: String, default: '' },
    details: { type: mongoose.Schema.Types.Mixed, default: null, immutable: true },
    occurredAt: { type: Date, required: true, default: Date.now, immutable: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

vocabularyImportAuditSchema.index(
  { candidateId: 1, occurredAt: 1, _id: 1 },
  { name: 'vocabulary_candidate_audit_timeline' }
);
vocabularyImportAuditSchema.index(
  { actorId: 1, occurredAt: -1 },
  { name: 'vocabulary_candidate_audit_actor' }
);

const VocabularyImportAudit = mongoose.model('VocabularyImportAudit', vocabularyImportAuditSchema);

export default VocabularyImportAudit;
