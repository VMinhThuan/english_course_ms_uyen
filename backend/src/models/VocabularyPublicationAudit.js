import mongoose from 'mongoose';

const vocabularyPublicationAuditSchema = new mongoose.Schema(
  {
    entityType: { type: String, enum: ['TAG', 'CHAPTER', 'VOCABULARY'], required: true, immutable: true },
    entityId: { type: mongoose.Schema.Types.ObjectId, required: true, immutable: true },
    action: {
      type: String,
      enum: ['EDITORIAL_REVIEW_DECISION', 'PUBLISHED', 'ARCHIVED', 'HIDDEN'],
      required: true,
      immutable: true,
    },
    decision: { type: String, enum: ['APPROVE', 'REJECT', null], default: null, immutable: true },
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
    previousVersion: { type: Number, min: 0, default: null, immutable: true },
    entityVersion: { type: Number, min: 0, required: true, immutable: true },
    contentHash: { type: String, match: /^[a-f\d]{64}$/i, default: null, immutable: true },
    idempotencyKey: { type: String, trim: true, default: null, immutable: true },
    reason: { type: String, default: '', immutable: true },
    details: { type: mongoose.Schema.Types.Mixed, default: null, immutable: true },
    occurredAt: { type: Date, required: true, default: Date.now, immutable: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

vocabularyPublicationAuditSchema.index(
  { entityType: 1, entityId: 1, occurredAt: -1, _id: -1 },
  { name: 'vocabulary_publication_audit_timeline' },
);
vocabularyPublicationAuditSchema.index(
  { entityType: 1, entityId: 1, idempotencyKey: 1 },
  {
    unique: true,
    name: 'uniq_vocabulary_publication_idempotency_key',
    partialFilterExpression: { idempotencyKey: { $type: 'string' } },
  },
);

const VocabularyPublicationAudit = mongoose.model('VocabularyPublicationAudit', vocabularyPublicationAuditSchema);

export default VocabularyPublicationAudit;
