import mongoose from 'mongoose';
import ChapterVocabulary from '../models/ChapterVocabulary.js';
import Vocabulary from '../models/Vocabulary.js';
import VocabularyChapter from '../models/VocabularyChapter.js';
import VocabularyImportAudit from '../models/VocabularyImportAudit.js';
import VocabularyImportBatch from '../models/VocabularyImportBatch.js';
import VocabularyImportCandidate from '../models/VocabularyImportCandidate.js';
import VocabularyPublicationAudit from '../models/VocabularyPublicationAudit.js';
import VocabularyTag from '../models/VocabularyTag.js';
import { evaluateVocabularyPublicationEligibility } from './vocabularyPublicationContract.js';
import {
  candidateCatalogSnapshot,
  candidateEditorialSnapshot,
  publicationEntitySnapshot,
  vocabularyCatalogSnapshot,
  vocabularyContentHash,
} from './vocabularyContentDigest.js';

const MAX_SUMMARY_CHAPTERS = 100;
const MAX_SUMMARY_MEMBERSHIPS = 2500;
const MAX_AUDIT_PAGE_SIZE = 100;

const ENTITY_MODEL = Object.freeze({
  TAG: VocabularyTag,
  CHAPTER: VocabularyChapter,
  VOCABULARY: Vocabulary,
});

export class VocabularyPublicationError extends Error {
  constructor(code, message, { statusCode = 400, details = null } = {}) {
    super(message);
    this.name = 'VocabularyPublicationError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

function fail(code, message, statusCode = 400, details = null) {
  throw new VocabularyPublicationError(code, message, { statusCode, details });
}

export function assertVocabularyPublicationPrototypeDatabase() {
  const connection = mongoose.connection;
  if (connection.readyState !== 1) {
    fail('DATABASE_CONNECTION_REQUIRED', 'Vocabulary publication requires an active MongoDB connection.', 503);
  }
}

function objectId(value, field) {
  if (!mongoose.isObjectIdOrHexString(value)) fail('INVALID_ID', `${field} must be a valid ObjectId.`);
  return new mongoose.Types.ObjectId(value);
}

function actorObjectId(value) {
  if (!mongoose.isObjectIdOrHexString(value)) fail('TRUSTED_ADMIN_REQUIRED', 'A verified Admin identity is required.', 401);
  return new mongoose.Types.ObjectId(value);
}

function version(value) {
  const result = Number(value);
  if (!Number.isInteger(result) || result < 0) fail('EXPECTED_VERSION_REQUIRED', 'expectedVersion must be a non-negative integer.');
  return result;
}

function idempotencyKey(value) {
  if (typeof value !== 'string' || !/^[\w.:/-]{16,128}$/.test(value)) {
    fail('IDEMPOTENCY_KEY_REQUIRED', 'idempotencyKey must contain 16 to 128 safe characters.');
  }
  return value;
}

function safeReason(value, { required = true } = {}) {
  if (typeof value !== 'string') fail('INVALID_REASON', 'reason must be plain text.');
  const result = value.normalize('NFC').trim();
  if ((required && !result) || result.length > 500 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(result)) {
    fail('INVALID_REASON', 'reason must be plain text between 1 and 500 characters.');
  }
  return result;
}

function validateKeys(body, allowed, label) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail('INVALID_PAYLOAD', `${label} payload must be an object.`);
  if (Object.keys(body).some((key) => !allowed.has(key))) fail('MASS_ASSIGNMENT_REJECTED', `${label} payload contains unsupported fields.`);
}

function sameId(left, right) {
  return left !== null && left !== undefined && right !== null && right !== undefined && String(left) === String(right);
}

function documentVersion(entity) {
  return Number(entity?.__v || 0);
}

function publicTag(tag) {
  return {
    _id: String(tag._id), name: tag.name, slug: tag.slug, description: tag.description,
    sortOrder: tag.sortOrder || 0, status: tag.status, version: documentVersion(tag),
  };
}

function publicChapter(chapter) {
  return {
    _id: String(chapter._id), tagId: String(chapter.tagId), title: chapter.title,
    description: chapter.description, chapterNumber: chapter.chapterNumber ?? null,
    sortOrder: chapter.sortOrder || 0, status: chapter.status, version: documentVersion(chapter),
  };
}

function publicVocabulary(vocabulary) {
  return {
    _id: String(vocabulary._id), word: vocabulary.word, meaning: vocabulary.meaning,
    partOfSpeech: vocabulary.partOfSpeech, catalogStatus: vocabulary.catalogStatus,
    version: documentVersion(vocabulary),
  };
}

async function withTransaction(work) {
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => { result = await work(session); });
    return result;
  } catch (error) {
    if (error instanceof VocabularyPublicationError) throw error;
    if (error?.name === 'VersionError' || error?.code === 112 || error?.codeName === 'WriteConflict') {
      fail('CONCURRENT_MODIFICATION', 'The record changed. Reload it before continuing.', 409);
    }
    if (error?.code === 11000) fail('IDEMPOTENCY_CONFLICT', 'The request was already applied with a different payload.', 409);
    throw error;
  } finally {
    await session.endSession();
  }
}

async function loadEntity(entityType, entityId, session) {
  const Model = ENTITY_MODEL[entityType];
  const entity = await Model.findById(entityId).session(session || null);
  if (!entity) fail(`${entityType}_NOT_FOUND`, `Vocabulary ${entityType.toLowerCase()} was not found.`, 404);
  return entity;
}

async function latestEditorialAudit(entityType, entityId, session) {
  return VocabularyPublicationAudit.findOne({ entityType, entityId, action: 'EDITORIAL_REVIEW_DECISION' })
    .sort({ occurredAt: -1, _id: -1 }).session(session || null);
}

function reviewStatusFor(entityType, entity, audit) {
  if (!audit) return { status: 'NEEDS_REVIEW', blocker: 'EDITORIAL_REVIEW_REQUIRED' };
  if (audit.decision === 'REJECT') return { status: 'REVIEW_REJECTED', blocker: 'EDITORIAL_REVIEW_REJECTED' };
  const currentHash = vocabularyContentHash(publicationEntitySnapshot(entityType, entity));
  const draftVersionChanged = entity.status === 'draft' && audit.entityVersion !== documentVersion(entity);
  if (draftVersionChanged || audit.contentHash !== currentHash) {
    return { status: 'NEEDS_REVIEW', blocker: 'EDITORIAL_REVIEW_STALE' };
  }
  return { status: 'REVIEW_APPROVED', blocker: null };
}

function tagEligibility(tag, review) {
  const blockers = [];
  if (tag.status === 'archived') blockers.push('TAG_ARCHIVED');
  else if (tag.status === 'published') blockers.push('TAG_ALREADY_PUBLISHED');
  else if (tag.status !== 'draft') blockers.push('TAG_NOT_DRAFT');
  if (review.blocker) blockers.push(review.blocker);
  return { eligible: blockers.length === 0, blockers, reviewStatus: review.status };
}

function chapterEligibility(chapter, tag, review) {
  const blockers = [];
  if (chapter.status === 'archived') blockers.push('CHAPTER_ARCHIVED');
  else if (chapter.status === 'published') blockers.push('CHAPTER_ALREADY_PUBLISHED');
  else if (chapter.status !== 'draft') blockers.push('CHAPTER_NOT_DRAFT');
  if (!tag) blockers.push('TAG_MISSING');
  else if (!sameId(chapter.tagId, tag._id)) blockers.push('CHAPTER_TAG_MISMATCH');
  else if (tag.status !== 'published') blockers.push(tag.status === 'archived' ? 'TAG_ARCHIVED' : 'TAG_NOT_PUBLISHED');
  if (review.blocker) blockers.push(review.blocker);
  return { eligible: blockers.length === 0, blockers, reviewStatus: review.status };
}

function duplicateDecisionRequired(candidate) {
  const duplicate = candidate?.duplicateMetadata || {};
  return Boolean(duplicate.parser || duplicate.sourceRevision?.revisionDetected || duplicate.catalogMatches?.length);
}

function candidateAdminDetails(candidate, batch) {
  if (!candidate) return null;
  const sourcePath = String(candidate.sourceMetadata?.relativePath || '').replace(/\\/g, '/');
  return {
    candidateId: String(candidate._id),
    batchId: batch ? String(batch._id) : String(candidate.batchId),
    sourceFileName: sourcePath.split('/').filter(Boolean).at(-1) || null,
    sourceOrdinal: candidate.sourceMetadata?.sourceOrdinal ?? null,
    validationStatus: candidate.validationStatus,
    reviewStatus: candidate.reviewStatus,
    importStatus: candidate.importStatus,
    reviewedBy: candidate.reviewedBy ? String(candidate.reviewedBy) : null,
    reviewedAt: candidate.reviewedAt || null,
    duplicateDecision: candidate.duplicateDecision || null,
  };
}

async function loadVocabularyTarget(vocabularyId, membershipId, session) {
  const vocabulary = await Vocabulary.findById(vocabularyId).session(session || null);
  if (!vocabulary) fail('VOCABULARY_NOT_FOUND', 'Catalog Vocabulary was not found.', 404);
  const membershipObjectId = objectId(membershipId, 'membershipId');
  const membership = await ChapterVocabulary.findOne({ _id: membershipObjectId, vocabularyId: vocabulary._id }).session(session || null);
  if (!membership) fail('MEMBERSHIP_NOT_FOUND', 'The Vocabulary membership was not found.', 404);
  const chapter = await VocabularyChapter.findById(membership.chapterId).session(session || null);
  const tag = chapter ? await VocabularyTag.findById(chapter.tagId).session(session || null) : null;
  return { vocabulary, membership, chapter, tag };
}

export async function getVocabularyPublicationEligibility(entityType, entityId, options = {}) {
  assertVocabularyPublicationPrototypeDatabase();
  const id = objectId(entityId, 'entityId');
  if (entityType === 'TAG') {
    const tag = await loadEntity('TAG', id);
    const review = reviewStatusFor('TAG', tag, await latestEditorialAudit('TAG', tag._id));
    return { entityType, entity: publicTag(tag), ...tagEligibility(tag, review) };
  }
  if (entityType === 'CHAPTER') {
    const chapter = await loadEntity('CHAPTER', id);
    const tag = await VocabularyTag.findById(chapter.tagId);
    const review = reviewStatusFor('CHAPTER', chapter, await latestEditorialAudit('CHAPTER', chapter._id));
    return { entityType, entity: publicChapter(chapter), ...chapterEligibility(chapter, tag, review) };
  }
  if (entityType === 'VOCABULARY') {
    const membershipId = objectId(options.membershipId, 'membershipId');
    const target = await loadVocabularyTarget(id, membershipId);
    const result = await vocabularyEligibility(target);
    return {
      entityType,
      entity: publicVocabulary(target.vocabulary),
      membershipId: String(target.membership._id),
      chapter: target.chapter ? publicChapter(target.chapter) : null,
      tag: target.tag ? publicTag(target.tag) : null,
      ...result,
    };
  }
  fail('INVALID_ENTITY_TYPE', 'entityType must be TAG, CHAPTER or VOCABULARY.');
}

async function reviewStructuralEntity(entityType, entityId, actorId, body) {
  assertVocabularyPublicationPrototypeDatabase();
  validateKeys(body, new Set(['expectedVersion', 'decision', 'reason']), 'Editorial review');
  const id = objectId(entityId, `${entityType.toLowerCase()}Id`);
  const actor = actorObjectId(actorId);
  const expectedVersion = version(body.expectedVersion);
  if (!['APPROVE', 'REJECT'].includes(body.decision)) fail('INVALID_DECISION', 'decision must be APPROVE or REJECT.');
  const reason = safeReason(body.reason);

  return withTransaction(async (session) => {
    const entity = await loadEntity(entityType, id, session);
    if (entity.status === 'archived') fail(`${entityType}_ARCHIVED`, 'Archived content cannot be reviewed.', 409);
    if (entity.status === 'published') fail(`${entityType}_ALREADY_PUBLISHED`, 'Published content is immutable in this prototype; archive it before replacing it.', 409);
    const currentVersion = documentVersion(entity);
    if (currentVersion !== expectedVersion) fail('CONCURRENT_MODIFICATION', 'The record changed. Reload it before reviewing.', 409);
    const contentHash = vocabularyContentHash(publicationEntitySnapshot(entityType, entity));
    const now = new Date();
    const Model = ENTITY_MODEL[entityType];
    const updated = await Model.findOneAndUpdate(
      { _id: id, __v: currentVersion, status: 'draft' },
      { $inc: { __v: 1 }, $set: { updatedAt: now } },
      { new: true, session, runValidators: true },
    );
    if (!updated) fail('CONCURRENT_MODIFICATION', 'The record changed. Reload it before reviewing.', 409);
    const audit = await VocabularyPublicationAudit.create([{
      entityType,
      entityId: id,
      action: 'EDITORIAL_REVIEW_DECISION',
      decision: body.decision,
      actorId: actor,
      previousVersion: currentVersion,
      entityVersion: currentVersion + 1,
      contentHash,
      reason,
      occurredAt: now,
    }], { session });
    return {
      entity: entityType === 'TAG' ? publicTag(updated) : publicChapter(updated),
      reviewStatus: body.decision === 'APPROVE' ? 'REVIEW_APPROVED' : 'REVIEW_REJECTED',
      audit: safeAudit(audit[0]),
    };
  });
}

export function reviewVocabularyTag(tagId, actorId, body) {
  return reviewStructuralEntity('TAG', tagId, actorId, body);
}

export function reviewVocabularyChapter(chapterId, actorId, body) {
  return reviewStructuralEntity('CHAPTER', chapterId, actorId, body);
}

function safeAudit(audit) {
  return {
    _id: String(audit._id),
    entityType: audit.entityType,
    entityId: String(audit.entityId),
    action: audit.action,
    decision: audit.decision || null,
    actorId: String(audit.actorId),
    previousVersion: audit.previousVersion ?? null,
    entityVersion: audit.entityVersion,
    occurredAt: audit.occurredAt,
    reason: audit.reason || '',
    details: audit.details || null,
  };
}

async function transitionEntity({ entityType, entityId, actorId, action, body, membershipId = null }) {
  assertVocabularyPublicationPrototypeDatabase();
  const id = objectId(entityId, `${entityType.toLowerCase()}Id`);
  const actor = actorObjectId(actorId);
  validateKeys(body, new Set(['expectedVersion', 'idempotencyKey', ...(membershipId ? ['membershipId'] : [])]), 'Publication');
  const expectedVersion = version(body.expectedVersion);
  const key = idempotencyKey(body.idempotencyKey);
  const selectedMembershipId = membershipId ? objectId(body.membershipId, 'membershipId') : null;

  return withTransaction(async (session) => {
    const prior = await VocabularyPublicationAudit.findOne({ entityType, entityId: id, idempotencyKey: key }).session(session);
    const entity = await loadEntity(entityType, id, session);
    if (prior) {
      const desiredState = action === 'PUBLISHED'
        ? (entityType === 'VOCABULARY' ? entity.catalogStatus === 'published' : entity.status === 'published')
        : (entityType === 'VOCABULARY' ? entity.catalogStatus === 'archived' : entity.status === 'archived');
      const membershipMatches = entityType !== 'VOCABULARY' || sameId(prior.details?.membershipId, selectedMembershipId);
      if (prior.action === action && desiredState && membershipMatches && prior.entityVersion === documentVersion(entity)) {
        return { entity: responseEntity(entityType, entity), audit: safeAudit(prior), idempotent: true };
      }
      fail('IDEMPOTENCY_KEY_REUSED', 'This idempotencyKey already belongs to a different publication request.', 409);
    }

    const currentVersion = documentVersion(entity);
    if (currentVersion !== expectedVersion) fail('CONCURRENT_MODIFICATION', 'The record changed. Reload it before continuing.', 409);
    if (action === 'PUBLISHED') {
      const eligibility = await evaluateTransition(entityType, entity, session, selectedMembershipId);
      if (!eligibility.eligible) {
        fail('PUBLICATION_BLOCKED', 'Publication is blocked until every eligibility requirement is satisfied.', 409, {
          entityType,
          entityId: String(id),
          blockers: eligibility.blockers,
        });
      }
    } else if (entityType === 'VOCABULARY' && entity.catalogOnly !== true) {
      fail('CATALOG_VOCABULARY_REQUIRED', 'Only Catalog-only Vocabulary can be hidden by this prototype.', 409);
    }

    const Model = ENTITY_MODEL[entityType];
    const nextStatus = action === 'PUBLISHED' ? 'published' : 'archived';
    const update = entityType === 'VOCABULARY'
      ? { $set: { catalogStatus: nextStatus, ...(action === 'HIDDEN' ? { status: 'hidden' } : {}) }, $inc: { __v: 1 } }
      : { $set: { status: nextStatus, updatedAt: new Date() }, $inc: { __v: 1 } };
    if (action === 'HIDDEN') update.$set.status = 'hidden';
    const filter = { _id: id, __v: currentVersion };
    if (entityType === 'VOCABULARY') filter.catalogOnly = true;
    const updated = await Model.findOneAndUpdate(filter, update, { new: true, session, runValidators: true });
    if (!updated) fail('CONCURRENT_MODIFICATION', 'The record changed. Reload it before continuing.', 409);
    const actionName = action === 'HIDDEN' ? 'HIDDEN' : action === 'ARCHIVED' ? 'ARCHIVED' : 'PUBLISHED';
    const snapshot = publicationEntitySnapshot(entityType, updated);
    const [audit] = await VocabularyPublicationAudit.create([{
      entityType,
      entityId: id,
      action: actionName,
      actorId: actor,
      previousVersion: currentVersion,
      entityVersion: currentVersion + 1,
      contentHash: vocabularyContentHash(snapshot),
      idempotencyKey: key,
      details: selectedMembershipId ? { membershipId: selectedMembershipId } : null,
      occurredAt: new Date(),
    }], { session });
    return { entity: responseEntity(entityType, updated), audit: safeAudit(audit), idempotent: false };
  });
}

function responseEntity(entityType, entity) {
  if (entityType === 'TAG') return publicTag(entity);
  if (entityType === 'CHAPTER') return publicChapter(entity);
  return publicVocabulary(entity);
}

async function evaluateTransition(entityType, entity, session, membershipId = null) {
  if (entityType === 'TAG') {
    const review = reviewStatusFor('TAG', entity, await latestEditorialAudit('TAG', entity._id, session));
    return tagEligibility(entity, review);
  }
  if (entityType === 'CHAPTER') {
    const [tag, reviewAudit] = await Promise.all([
      VocabularyTag.findById(entity.tagId).session(session),
      latestEditorialAudit('CHAPTER', entity._id, session),
    ]);
    return chapterEligibility(entity, tag, reviewStatusFor('CHAPTER', entity, reviewAudit));
  }
  const target = await loadVocabularyTarget(entity._id, membershipId, session);
  return vocabularyEligibility(target, session);
}

async function loadMembershipContext(chapter, membership, session, preload = {}) {
  const [vocabulary, tag] = await Promise.all([
    preload.vocabulary || Vocabulary.findById(membership.vocabularyId).session(session || null),
    preload.tag || VocabularyTag.findById(chapter.tagId).session(session || null),
  ]);
  return { vocabulary, membership, chapter, tag };
}

async function vocabularyEligibility(target, session = null) {
  return vocabularyEligibilityBase({ ...target, session });
}

async function vocabularyEligibilityBase({ vocabulary, membership, chapter, tag, reviewStatus, session }) {
  const blockers = [];
  if (!vocabulary || vocabulary.catalogOnly !== true) blockers.push('CATALOG_VOCABULARY_REQUIRED');
  else if (vocabulary.catalogStatus === 'archived') blockers.push('VOCABULARY_ARCHIVED');
  else if (vocabulary.catalogStatus === 'published') blockers.push('VOCABULARY_ALREADY_PUBLISHED');
  else if (vocabulary.catalogStatus !== 'draft') blockers.push('VOCABULARY_NOT_DRAFT');
  const visibility = evaluateVocabularyPublicationEligibility({
    tag,
    chapter,
    vocabulary: vocabulary ? { catalogOnly: vocabulary.catalogOnly, catalogStatus: 'published', _id: vocabulary._id } : null,
    membership,
    reviewStatus: 'REVIEW_APPROVED',
  });
  blockers.push(...visibility.blockers.filter((code) => code !== 'VOCABULARY_NOT_PUBLISHED' && code !== 'EDITORIAL_REVIEW_REQUIRED'));
  if (!membership) return { eligible: false, blockers: [...new Set(blockers)], reviewStatus: reviewStatus || 'NEEDS_REVIEW', candidate: null };

  const candidate = membership.sourceIdentity
    ? await VocabularyImportCandidate.findOne({ sourceIdentity: membership.sourceIdentity }).session(session || null)
    : null;
  if (!candidate) {
    blockers.push(membership.sourceIdentity ? 'CANDIDATE_PROVENANCE_REQUIRED' : 'IMPORT_PROVENANCE_REQUIRED');
    return { eligible: false, blockers: [...new Set(blockers)], reviewStatus: reviewStatus || 'NEEDS_REVIEW', candidate: null };
  }

  const [batch, importAudits] = await Promise.all([
    VocabularyImportBatch.findById(candidate.batchId).session(session || null),
    VocabularyImportAudit.find({ candidateId: candidate._id }).session(session || null),
  ]);
  if (candidate.reviewStatus !== 'REVIEW_APPROVED') blockers.push(candidate.reviewStatus === 'REVIEW_REJECTED' ? 'CANDIDATE_REJECTED' : 'CANDIDATE_REVIEW_REQUIRED');
  if (candidate.validationStatus !== 'VALIDATION_PASSED') blockers.push('CANDIDATE_VALIDATION_REQUIRED');
  if (candidate.importStatus !== 'IMPORTED_AS_DRAFT') blockers.push('CONFIRM_DRAFT_REQUIRED');
  if (!candidate.reviewedBy || !candidate.reviewedAt) blockers.push('REVIEW_ACTOR_AND_TIME_REQUIRED');
  if (!batch) blockers.push('IMPORT_BATCH_REQUIRED');
  if (!sameId(candidate.importedVocabularyId, vocabulary?._id)
    || !sameId(candidate.importedChapterId, chapter?._id)
    || !sameId(candidate.importedMembershipId, membership._id)) blockers.push('IMPORTED_REFERENCE_MISMATCH');
  if (candidate.duplicateDecision !== 'KEEP_SEPARATE' && duplicateDecisionRequired(candidate)) blockers.push('DUPLICATE_DECISION_REQUIRED');

  const reviewedAt = candidate.reviewedAt?.getTime?.();
  const reviewAudit = importAudits.find((audit) => audit.action === 'REVIEW_DECISION'
    && audit.decision === 'APPROVE'
    && sameId(audit.batchId, candidate.batchId)
    && audit.sourceIdentity === candidate.sourceIdentity
    && sameId(audit.actorId, candidate.reviewedBy)
    && audit.occurredAt?.getTime?.() === reviewedAt);
  if (!reviewAudit) blockers.push('REVIEW_AUDIT_REQUIRED');
  const editorialHash = vocabularyContentHash(candidateEditorialSnapshot(candidate));
  if (!candidate.reviewedContentHash || candidate.reviewedVersion === null || candidate.reviewedVersion === undefined) blockers.push('REVIEW_CONTENT_EVIDENCE_REQUIRED');
  else if (candidate.reviewedContentHash !== editorialHash) blockers.push('REVIEW_CONTENT_CHANGED');
  if (reviewAudit && (reviewAudit.details?.contentHash !== candidate.reviewedContentHash
    || reviewAudit.details?.reviewedVersion !== candidate.reviewedVersion)) blockers.push('REVIEW_AUDIT_CONTENT_MISMATCH');

  const confirmAudit = importAudits.find((audit) => audit.action === 'CONFIRMED_DRAFT'
    && sameId(audit.batchId, candidate.batchId)
    && audit.sourceIdentity === candidate.sourceIdentity
    && sameId(audit.details?.membershipId, membership._id)
    && sameId(audit.details?.chapterId, chapter?._id)
    && sameId(audit.details?.vocabularyId, vocabulary?._id));
  if (!confirmAudit) blockers.push('CONFIRM_AUDIT_REQUIRED');
  if (confirmAudit && !sameId(confirmAudit.details?.tagId, tag?._id)) blockers.push('CONFIRM_TAG_REFERENCE_MISMATCH');
  if (confirmAudit && confirmAudit.details?.reviewedContentHash !== candidate.reviewedContentHash) blockers.push('CONFIRM_REVIEW_SNAPSHOT_MISMATCH');
  if (candidate.reviewedContentHash && vocabulary
    && vocabularyContentHash(candidateCatalogSnapshot(candidate)) !== vocabularyContentHash(vocabularyCatalogSnapshot(vocabulary))) {
    blockers.push('IMPORTED_CONTENT_CHANGED');
  }

  return {
    eligible: blockers.length === 0,
    blockers: [...new Set(blockers)],
    reviewStatus: candidate.reviewStatus,
    candidate: candidateAdminDetails(candidate, batch),
  };
}

async function evaluateVocabularySummaryRow({ chapter, membership, vocabulary, tag }) {
  const candidate = membership.sourceIdentity
    ? await VocabularyImportCandidate.findOne({ sourceIdentity: membership.sourceIdentity })
    : null;
  const batch = candidate ? await VocabularyImportBatch.findById(candidate.batchId) : null;
  const audits = candidate ? await VocabularyImportAudit.find({ candidateId: candidate._id }) : [];
  const result = await vocabularyEligibilitySummary({ vocabulary, membership, chapter, tag, candidate, batch, audits });
  return {
    membershipId: String(membership._id),
    vocabularyId: vocabulary ? String(vocabulary._id) : String(membership.vocabularyId),
    word: vocabulary?.word || '[Vocabulary không tồn tại]',
    catalogStatus: vocabulary?.catalogStatus || 'missing',
    version: vocabulary ? documentVersion(vocabulary) : null,
    reviewStatus: candidate?.reviewStatus || 'NEEDS_REVIEW',
    eligible: result.eligible,
    blockers: result.blockers,
    candidate: candidateAdminDetails(candidate, batch),
  };
}

async function vocabularyEligibilitySummary({ vocabulary, membership, chapter, tag, candidate, batch, audits }) {
  const blockers = [];
  if (!vocabulary || vocabulary.catalogOnly !== true) blockers.push('CATALOG_VOCABULARY_REQUIRED');
  else if (vocabulary.catalogStatus === 'archived') blockers.push('VOCABULARY_ARCHIVED');
  else if (vocabulary.catalogStatus === 'published') blockers.push('VOCABULARY_ALREADY_PUBLISHED');
  else if (vocabulary.catalogStatus !== 'draft') blockers.push('VOCABULARY_NOT_DRAFT');
  const visibility = evaluateVocabularyPublicationEligibility({
    tag,
    chapter,
    vocabulary: vocabulary ? { _id: vocabulary._id, catalogOnly: vocabulary.catalogOnly, catalogStatus: 'published' } : null,
    membership,
    reviewStatus: 'REVIEW_APPROVED',
  });
  blockers.push(...visibility.blockers.filter((code) => code !== 'VOCABULARY_NOT_PUBLISHED' && code !== 'EDITORIAL_REVIEW_REQUIRED'));
  if (!candidate) {
    blockers.push(membership.sourceIdentity ? 'CANDIDATE_PROVENANCE_REQUIRED' : 'IMPORT_PROVENANCE_REQUIRED');
    return { eligible: false, blockers: [...new Set(blockers)] };
  }
  if (candidate.reviewStatus !== 'REVIEW_APPROVED') blockers.push(candidate.reviewStatus === 'REVIEW_REJECTED' ? 'CANDIDATE_REJECTED' : 'CANDIDATE_REVIEW_REQUIRED');
  if (candidate.validationStatus !== 'VALIDATION_PASSED') blockers.push('CANDIDATE_VALIDATION_REQUIRED');
  if (candidate.importStatus !== 'IMPORTED_AS_DRAFT') blockers.push('CONFIRM_DRAFT_REQUIRED');
  if (!candidate.reviewedBy || !candidate.reviewedAt) blockers.push('REVIEW_ACTOR_AND_TIME_REQUIRED');
  if (!batch) blockers.push('IMPORT_BATCH_REQUIRED');
  if (!sameId(candidate.importedVocabularyId, vocabulary?._id)
    || !sameId(candidate.importedChapterId, chapter?._id)
    || !sameId(candidate.importedMembershipId, membership._id)) blockers.push('IMPORTED_REFERENCE_MISMATCH');
  if (candidate.duplicateDecision !== 'KEEP_SEPARATE' && duplicateDecisionRequired(candidate)) blockers.push('DUPLICATE_DECISION_REQUIRED');
  const reviewAudit = audits.find((audit) => audit.action === 'REVIEW_DECISION'
    && audit.decision === 'APPROVE'
    && sameId(audit.batchId, candidate.batchId)
    && audit.sourceIdentity === candidate.sourceIdentity
    && sameId(audit.actorId, candidate.reviewedBy)
    && audit.occurredAt?.getTime?.() === candidate.reviewedAt?.getTime?.());
  if (!reviewAudit) blockers.push('REVIEW_AUDIT_REQUIRED');
  const reviewHash = vocabularyContentHash(candidateEditorialSnapshot(candidate));
  if (!candidate.reviewedContentHash || candidate.reviewedVersion === null || candidate.reviewedVersion === undefined) blockers.push('REVIEW_CONTENT_EVIDENCE_REQUIRED');
  else if (candidate.reviewedContentHash !== reviewHash) blockers.push('REVIEW_CONTENT_CHANGED');
  if (reviewAudit && (reviewAudit.details?.contentHash !== candidate.reviewedContentHash
    || reviewAudit.details?.reviewedVersion !== candidate.reviewedVersion)) blockers.push('REVIEW_AUDIT_CONTENT_MISMATCH');
  const confirmAudit = audits.find((audit) => audit.action === 'CONFIRMED_DRAFT'
    && sameId(audit.batchId, candidate.batchId)
    && audit.sourceIdentity === candidate.sourceIdentity
    && sameId(audit.details?.membershipId, membership._id)
    && sameId(audit.details?.chapterId, chapter?._id)
    && sameId(audit.details?.vocabularyId, vocabulary?._id));
  if (!confirmAudit) blockers.push('CONFIRM_AUDIT_REQUIRED');
  if (confirmAudit && !sameId(confirmAudit.details?.tagId, tag?._id)) blockers.push('CONFIRM_TAG_REFERENCE_MISMATCH');
  if (confirmAudit && confirmAudit.details?.reviewedContentHash !== candidate.reviewedContentHash) blockers.push('CONFIRM_REVIEW_SNAPSHOT_MISMATCH');
  if (candidate.reviewedContentHash && vocabulary
    && vocabularyContentHash(candidateCatalogSnapshot(candidate)) !== vocabularyContentHash(vocabularyCatalogSnapshot(vocabulary))) {
    blockers.push('IMPORTED_CONTENT_CHANGED');
  }
  return { eligible: blockers.length === 0, blockers: [...new Set(blockers)] };
}

async function reviewForSummary(entityType, entity) {
  const audit = await latestEditorialAudit(entityType, entity._id);
  const review = reviewStatusFor(entityType, entity, audit);
  return {
    status: review.status,
    blockers: review.blocker ? [review.blocker] : [],
    latest: audit ? safeAudit(audit) : null,
  };
}

export async function getVocabularyPublicationTagSummary(tagId) {
  assertVocabularyPublicationPrototypeDatabase();
  const tag = await loadEntity('TAG', objectId(tagId, 'tagId'));
  const [tagReview, chapters, chapterTotal] = await Promise.all([
    reviewForSummary('TAG', tag),
    VocabularyChapter.find({ tagId: tag._id }).sort({ sortOrder: 1, chapterNumber: 1, _id: 1 }).limit(MAX_SUMMARY_CHAPTERS + 1),
    VocabularyChapter.countDocuments({ tagId: tag._id }),
  ]);
  if (chapterTotal > MAX_SUMMARY_CHAPTERS) {
    fail('SUMMARY_LIMIT_EXCEEDED', `Tag has more than ${MAX_SUMMARY_CHAPTERS} Chapters. Narrow the publication summary before reviewing.`, 413);
  }
  const chapterIds = chapters.map((chapter) => chapter._id);
  const memberships = await ChapterVocabulary.find({ chapterId: { $in: chapterIds } })
    .sort({ chapterId: 1, sortOrder: 1, _id: 1 }).limit(MAX_SUMMARY_MEMBERSHIPS + 1);
  if (memberships.length > MAX_SUMMARY_MEMBERSHIPS) {
    fail('SUMMARY_LIMIT_EXCEEDED', `Tag has more than ${MAX_SUMMARY_MEMBERSHIPS} Vocabulary memberships.`, 413);
  }
  const [tagDoc, vocabularyDocs] = await Promise.all([
    VocabularyTag.findById(tag._id),
    Vocabulary.find({ _id: { $in: memberships.map((item) => item.vocabularyId) } }),
  ]);
  const vocabularyById = new Map(vocabularyDocs.map((item) => [String(item._id), item]));
  const rows = [];
  for (const membership of memberships) {
    const chapter = chapters.find((item) => sameId(item._id, membership.chapterId));
    rows.push(await evaluateVocabularySummaryRow({
      chapter,
      membership,
      vocabulary: vocabularyById.get(String(membership.vocabularyId)) || null,
      tag: tagDoc,
    }));
  }
  const chaptersWithReview = await Promise.all(chapters.map(async (chapter) => ({
    entity: publicChapter(chapter),
    review: await reviewForSummary('CHAPTER', chapter),
    eligibility: chapterEligibility(chapter, tag, await reviewStatusForChapter(chapter)),
    items: rows.filter((row) => memberships.find((item) => String(item._id) === row.membershipId)?.chapterId.toString() === String(chapter._id)),
  })));
  for (const chapter of chaptersWithReview) {
    chapter.counts = summarizeVocabularyRows(chapter.items);
    chapter.items = chapter.items.map((row) => ({ ...row }));
  }
  const allVocabularyRows = rows;
  const counts = summarizeVocabularyRows(allVocabularyRows);
  const tagState = tagEligibility(tag, { status: tagReview.status, blocker: tagReview.blockers[0] || null });
  const tagAudit = await VocabularyPublicationAudit.find({
    $or: [
      { entityType: 'TAG', entityId: tag._id },
      ...chapterIds.map((entityId) => ({ entityType: 'CHAPTER', entityId })),
      ...memberships.map((membership) => ({ entityType: 'VOCABULARY', entityId: membership.vocabularyId })),
    ],
  }).sort({ occurredAt: -1, _id: -1 }).limit(100);
  return {
    tag: publicTag(tag),
    review: tagReview,
    eligibility: tagState,
    counts: { chapterTotal, ...counts },
    chapters: chaptersWithReview,
    audit: tagAudit.map(safeAudit),
  };
}

async function reviewStatusForChapter(chapter) {
  return reviewStatusFor('CHAPTER', chapter, await latestEditorialAudit('CHAPTER', chapter._id));
}

function summarizeVocabularyRows(items) {
  const reviewed = items.filter((item) => item.reviewStatus === 'REVIEW_APPROVED').length;
  const canPublish = items.filter((item) => item.eligible).length;
  return {
    vocabularyTotal: items.length,
    reviewed,
    unreviewed: items.length - reviewed,
    canPublish,
    blocked: items.length - canPublish,
  };
}

async function publishOrHide(entityType, entityId, actorId, body, action, membershipId = null) {
  const requestBody = membershipId
    ? { ...body, membershipId }
    : body;
  return transitionEntity({ entityType, entityId, actorId, action, body: requestBody, membershipId: Boolean(membershipId) });
}

export function publishVocabularyTag(tagId, actorId, body) {
  return publishOrHide('TAG', tagId, actorId, body, 'PUBLISHED');
}

export function archiveVocabularyTag(tagId, actorId, body) {
  return publishOrHide('TAG', tagId, actorId, body, 'ARCHIVED');
}

export function publishVocabularyChapter(chapterId, actorId, body) {
  return publishOrHide('CHAPTER', chapterId, actorId, body, 'PUBLISHED');
}

export function archiveVocabularyChapter(chapterId, actorId, body) {
  return publishOrHide('CHAPTER', chapterId, actorId, body, 'ARCHIVED');
}

export function publishCatalogVocabulary(vocabularyId, actorId, body) {
  return publishOrHide('VOCABULARY', vocabularyId, actorId, body, 'PUBLISHED', body?.membershipId);
}

export function hideCatalogVocabulary(vocabularyId, actorId, body) {
  return publishOrHide('VOCABULARY', vocabularyId, actorId, body, 'HIDDEN', body?.membershipId);
}

export async function listVocabularyPublicationAudit({ entityType, entityId, page = 1, limit = 50 } = {}) {
  assertVocabularyPublicationPrototypeDatabase();
  if (!Object.hasOwn(ENTITY_MODEL, entityType)) fail('INVALID_ENTITY_TYPE', 'entityType must be TAG, CHAPTER or VOCABULARY.');
  const id = objectId(entityId, 'entityId');
  const pageNumber = Number(page);
  const pageSize = Number(limit);
  if (!Number.isInteger(pageNumber) || pageNumber < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > MAX_AUDIT_PAGE_SIZE) {
    fail('INVALID_PAGINATION', `page must be positive and limit must be 1 to ${MAX_AUDIT_PAGE_SIZE}.`);
  }
  const filter = { entityType, entityId: id };
  const [items, total] = await Promise.all([
    VocabularyPublicationAudit.find(filter).sort({ occurredAt: -1, _id: -1 }).skip((pageNumber - 1) * pageSize).limit(pageSize),
    VocabularyPublicationAudit.countDocuments(filter),
  ]);
  return {
    items: items.map(safeAudit),
    pagination: { page: pageNumber, limit: pageSize, total, pages: Math.ceil(total / pageSize) || 1 },
  };
}

export const vocabularyPublicationWorkflowPrototypeInternals = Object.freeze({
  vocabularyEligibilityBase,
  summarizeVocabularyRows,
  reviewStatusFor,
});
