import { isDeepStrictEqual } from 'node:util';
import mongoose from 'mongoose';
import VocabularyImportBatch from '../models/VocabularyImportBatch.js';
import VocabularyImportCandidate from '../models/VocabularyImportCandidate.js';
import { computeVocabularyCandidateSourceIdentity } from './vocabularyCatalogCandidateAdapter.js';

export class VocabularyCandidatePersistenceError extends Error {
  constructor(code, message, issues = []) {
    super(message);
    this.name = 'VocabularyCandidatePersistenceError';
    this.code = code;
    this.issues = issues;
  }
}

export function validateVocabularyCandidateEnvelope(envelope) {
  const issues = [];
  const add = (code, field) => issues.push({ code, field });
  const source = envelope?.source;
  const candidate = envelope?.vocabularyCandidate;
  if (!envelope || typeof envelope !== 'object') {
    add('ENVELOPE_REQUIRED', 'envelope');
    return { valid: false, status: 'VALIDATION_FAILED', issues };
  }
  if (typeof envelope.schemaVersion !== 'string' || !envelope.schemaVersion.trim()) add('SCHEMA_VERSION_REQUIRED', 'schemaVersion');
  if (typeof envelope.parserVersion !== 'string' || !envelope.parserVersion.trim()) add('PARSER_VERSION_REQUIRED', 'parserVersion');
  if (!source || typeof source !== 'object') {
    add('SOURCE_METADATA_REQUIRED', 'source');
  } else {
    if (typeof source.relativePath !== 'string' || !source.relativePath.trim()) add('SOURCE_PATH_REQUIRED', 'source.relativePath');
    if (!/^[a-f\d]{64}$/i.test(String(source.fileSha256 || ''))) add('SOURCE_SHA256_INVALID', 'source.fileSha256');
    if (!Number.isInteger(source.sourceOrdinal) || source.sourceOrdinal < 1) add('SOURCE_ORDINAL_INVALID', 'source.sourceOrdinal');
    for (const field of ['paragraphStart', 'paragraphEnd']) {
      const value = source[field];
      if (value !== null && value !== undefined && (!Number.isInteger(value) || value < 0)) {
        add('SOURCE_LOCATOR_INVALID', 'source.' + field);
      }
    }
    try {
      const expectedIdentity = computeVocabularyCandidateSourceIdentity({
        schemaVersion: envelope.schemaVersion,
        relativePath: source.relativePath,
        fileSha256: source.fileSha256,
        sourceOrdinal: source.sourceOrdinal,
        paragraphStart: source.paragraphStart,
        paragraphEnd: source.paragraphEnd,
      });
      if (expectedIdentity !== envelope.sourceIdentity) add('SOURCE_IDENTITY_MISMATCH', 'sourceIdentity');
    } catch {
      add('SOURCE_IDENTITY_INPUT_INVALID', 'sourceIdentity');
    }
  }
  if (typeof envelope.sourceIdentity !== 'string' || !/^[a-f\d]{64}$/i.test(envelope.sourceIdentity)) {
    add('SOURCE_IDENTITY_INVALID', 'sourceIdentity');
  }
  // Content defects remain persistable review rows. The workflow validator marks them
  // INVALID; this layer only rejects a malformed envelope that cannot preserve evidence.
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    add('VOCABULARY_CANDIDATE_REQUIRED', 'vocabularyCandidate');
  }
  if (!envelope.rawValues || typeof envelope.rawValues !== 'object' || Array.isArray(envelope.rawValues)) add('RAW_VALUES_REQUIRED', 'rawValues');
  if (!envelope.editedValues || typeof envelope.editedValues !== 'object' || Array.isArray(envelope.editedValues)) add('EDITED_VALUES_OBJECT_REQUIRED', 'editedValues');
  else if (Object.keys(envelope.editedValues).length > 0) add('INITIAL_EDITED_VALUES_MUST_BE_EMPTY', 'editedValues');
  if (!Array.isArray(envelope.review?.issues)) add('REVIEW_ISSUES_ARRAY_REQUIRED', 'review.issues');
  if (envelope.review?.status !== 'NEEDS_REVIEW') add('REVIEW_REQUIRED', 'review.status');
  if (envelope.review?.publicationEligible !== false) add('PUBLICATION_MUST_REMAIN_BLOCKED', 'review.publicationEligible');
  return {
    valid: issues.length === 0,
    status: issues.length === 0 ? 'VALIDATION_PASSED' : 'VALIDATION_FAILED',
    issues,
  };
}

function comparableEnvelopeData(batchId, envelope) {
  return {
    batchId: String(batchId),
    schemaVersion: envelope.schemaVersion,
    parserVersion: envelope.parserVersion,
    sourceIdentity: envelope.sourceIdentity,
    sourceMetadata: envelope.source,
    tagCandidate: envelope.tagCandidate,
    chapterCandidate: envelope.chapterCandidate,
    parsedValues: envelope.vocabularyCandidate,
    rawValues: envelope.rawValues,
    duplicateMetadata: envelope.duplicateMetadata,
    parserReviewReasons: envelope.review.reasons,
    parserIssues: envelope.review.issues,
  };
}

function matchesEnvelope(document, batchId, envelope) {
  const stored = document.toObject({ depopulate: true, transform: false });
  const comparable = comparableEnvelopeData(batchId, envelope);
  return Object.entries(comparable).every(([field, value]) => (
    field === 'batchId'
      ? String(stored[field]) === value
      : isDeepStrictEqual(stored[field], value)
  ));
}

async function resolveIdempotentCandidate(batchId, envelope, session) {
  let query = VocabularyImportCandidate.findOne({ sourceIdentity: envelope.sourceIdentity });
  if (session) query = query.session(session);
  const existing = await query;
  if (!existing) return null;
  if (matchesEnvelope(existing, batchId, envelope)) return existing;
  throw new VocabularyCandidatePersistenceError(
    'SOURCE_IDENTITY_COLLISION',
    'The source identity already exists with different batch or candidate evidence.',
  );
}

export async function persistVocabularyCandidateEnvelope({ batchId, envelope, session }) {
  if (!mongoose.isObjectIdOrHexString(batchId)) {
    throw new VocabularyCandidatePersistenceError('INVALID_BATCH_ID', 'batchId must be an ObjectId.');
  }
  let batchQuery = VocabularyImportBatch.exists({ _id: batchId });
  if (session) batchQuery = batchQuery.session(session);
  if (!await batchQuery) {
    throw new VocabularyCandidatePersistenceError('BATCH_NOT_FOUND', 'Vocabulary Import Batch was not found.');
  }
  const validation = validateVocabularyCandidateEnvelope(envelope);
  if (!validation.valid) {
    throw new VocabularyCandidatePersistenceError(
      'CANDIDATE_VALIDATION_FAILED',
      'The candidate envelope failed structural validation.',
      validation.issues,
    );
  }

  const existing = await resolveIdempotentCandidate(batchId, envelope, session);
  if (existing) return existing;

  try {
    const candidateData = {
      batchId,
      schemaVersion: envelope.schemaVersion,
      parserVersion: envelope.parserVersion,
      sourceIdentity: envelope.sourceIdentity,
      sourceMetadata: envelope.source,
      tagCandidate: envelope.tagCandidate,
      chapterCandidate: envelope.chapterCandidate,
      parsedValues: envelope.vocabularyCandidate,
      rawValues: envelope.rawValues,
      editedValues: envelope.editedValues,
      duplicateMetadata: envelope.duplicateMetadata,
      parserReviewReasons: envelope.review.reasons,
      parserIssues: envelope.review.issues,
      validationStatus: validation.status,
      validationIssues: validation.issues,
      reviewStatus: 'NEEDS_REVIEW',
      publicationStatus: 'NOT_ELIGIBLE',
    };
    const created = await VocabularyImportCandidate.create(
      [candidateData],
      session ? { session } : undefined,
    );
    return created[0];
  } catch (error) {
    if (session) throw error;
    if (error?.code !== 11000) throw error;
    const raced = await resolveIdempotentCandidate(batchId, envelope, session);
    if (raced) return raced;
    throw error;
  }
}
