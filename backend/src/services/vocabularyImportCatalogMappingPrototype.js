import { createHash } from 'node:crypto';
import mongoose from 'mongoose';
import VocabularyChapter from '../models/VocabularyChapter.js';
import VocabularyImportBatch from '../models/VocabularyImportBatch.js';
import VocabularyImportCandidate from '../models/VocabularyImportCandidate.js';
import VocabularyImportCatalogMapping from '../models/VocabularyImportCatalogMapping.js';
import VocabularyTag from '../models/VocabularyTag.js';
import { assertVocabularyPrototypeDatabase } from './vocabularyCatalogManagementPrototype.js';

const MAX_PAGE_SIZE = 100;
const BATCH_STATUSES = new Set(['PARSED', 'NEEDS_REVIEW', 'REVIEW_COMPLETE', 'PARTIALLY_CONFIRMED_DRAFT', 'CONFIRMED_DRAFT', 'FAILED']);

export class VocabularyImportCatalogMappingError extends Error {
  constructor(code, message, { statusCode = 400, details = null } = {}) {
    super(message);
    this.name = 'VocabularyImportCatalogMappingError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

function fail(code, message, statusCode = 400, details = null) {
  throw new VocabularyImportCatalogMappingError(code, message, { statusCode, details });
}

function objectId(value, field) {
  if (!mongoose.isObjectIdOrHexString(value)) fail('INVALID_ID', `${field} must be a valid ObjectId.`);
  return new mongoose.Types.ObjectId(value);
}

function pageOptions(page, limit) {
  const number = Number(page ?? 1);
  const size = Number(limit ?? 20);
  if (!Number.isInteger(number) || number < 1 || number > 1_000_000 || !Number.isInteger(size) || size < 1 || size > MAX_PAGE_SIZE) {
    fail('INVALID_PAGINATION', 'Page or limit is outside the supported range.');
  }
  return { page: number, limit: size, skip: (number - 1) * size };
}

function sourceFileIdentity(relativePath, sha256) {
  return createHash('sha256')
    .update(`vocabulary-source-file-v1\0${relativePath}\0${String(sha256).toUpperCase()}`)
    .digest('hex');
}

function normalizeTitle(value) {
  return String(value || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en');
}

function safeBasename(relativePath) {
  return String(relativePath || '').replace(/\\/g, '/').split('/').filter(Boolean).at(-1) || 'DOCX';
}

function mapEntryDto(entry, source) {
  return {
    sourceFileIdentity: entry.sourceFileIdentity,
    sourceRelativePath: entry.sourceRelativePath,
    sourceFileName: safeBasename(entry.sourceRelativePath),
    fileSha256: entry.fileSha256,
    sourceFolderLabel: entry.sourceFolderLabel || '',
    sourceChapterCandidate: entry.sourceChapterCandidate || '',
    candidateCount: entry.candidateCount || 0,
    chapterAction: entry.chapterAction,
    targetChapterId: entry.targetChapterId ? String(entry.targetChapterId) : null,
    createChapter: entry.createChapter ? {
      title: entry.createChapter.title || '',
      description: entry.createChapter.description || '',
      chapterNumber: entry.createChapter.chapterNumber ?? null,
      sortOrder: entry.createChapter.sortOrder ?? 0,
    } : null,
    resolvedChapterId: entry.resolvedChapterId ? String(entry.resolvedChapterId) : null,
    ...(source ? { sourceStatus: source.status || 'NOT_MAPPED' } : {}),
  };
}

function mappingDto(mapping, batch) {
  const byIdentity = new Map((batch?.sourceFiles || []).map((file) => [
    sourceFileIdentity(file.relativePath, file.fileSha256), file,
  ]));
  const entries = mapping?.entries || (batch?.sourceFiles || []).map((source) => ({
    sourceFileIdentity: sourceFileIdentity(source.relativePath, source.fileSha256),
    sourceRelativePath: source.relativePath,
    fileSha256: source.fileSha256,
    sourceFolderLabel: source.sourceFolder || '',
    sourceChapterCandidate: source.chapterCandidate || '',
    candidateCount: source.candidateCount || 0,
    chapterAction: null,
    targetChapterId: null,
    createChapter: null,
    resolvedChapterId: null,
  }));
  return {
    _id: mapping?._id ? String(mapping._id) : null,
    batchId: String(batch?._id || mapping?.batchId),
    batchIdentity: batch?.batchIdentity || mapping?.batchIdentity,
    batchVersion: batch?.__v ?? 0,
    targetTagId: mapping?.targetTagId ? String(mapping.targetTagId) : null,
    status: mapping?.status || 'NOT_MAPPED',
    version: mapping?.__v ?? null,
    lockedAt: mapping?.lockedAt || null,
    entries: entries.map((entry) => mapEntryDto(entry, byIdentity.get(entry.sourceFileIdentity))),
    updatedAt: mapping?.updatedAt || null,
  };
}

function batchSummary(batch, mappingStatus = 'NOT_MAPPED') {
  const sourceFiles = Array.isArray(batch.sourceFiles) ? batch.sourceFiles : [];
  const folders = [...new Set(sourceFiles.map((file) => String(file.sourceFolder || '').trim()).filter(Boolean))];
  const status = batch.status;
  const confirmStatus = status === 'CONFIRMED_DRAFT' ? 'CONFIRMED'
    : status === 'PARTIALLY_CONFIRMED_DRAFT' ? 'PARTIAL'
      : batch.counts?.importedAsDraft > 0 ? 'PARTIAL' : 'NOT_CONFIRMED';
  return {
    _id: String(batch._id),
    batchIdentity: batch.batchIdentity,
    version: batch.__v ?? 0,
    status,
    confirmStatus,
    sourceFolderLabels: folders,
    fileCount: sourceFiles.length,
    candidateCount: batch.candidateCount || 0,
    counts: {
      parsed: batch.counts?.parsed || 0,
      valid: batch.counts?.valid || 0,
      invalid: batch.counts?.invalid || 0,
      needsReview: batch.counts?.needsReview || 0,
      approved: batch.counts?.approved || 0,
      rejected: batch.counts?.rejected || 0,
      importedAsDraft: batch.counts?.importedAsDraft || 0,
    },
    parserVersions: batch.parserVersions || [],
    mappingStatus,
    createdAt: batch.createdAt,
    updatedAt: batch.updatedAt,
  };
}

async function loadBatch(batchId) {
  const batch = await VocabularyImportBatch.findById(objectId(batchId, 'batchId'));
  if (!batch) fail('BATCH_NOT_FOUND', 'Vocabulary Import Batch was not found.', 404);
  return batch;
}

async function validateCreateChapter(tagId, createChapter) {
  if (!createChapter || typeof createChapter !== 'object' || Array.isArray(createChapter)) fail('CHAPTER_MAPPING_REQUIRED', 'Provide chapter details for a new Chapter.');
  const allowed = new Set(['title', 'description', 'chapterNumber', 'sortOrder']);
  if (Object.keys(createChapter).some((key) => !allowed.has(key))) fail('MASS_ASSIGNMENT_REJECTED', 'New Chapter mapping contains unsupported fields.');
  if (typeof createChapter.title !== 'string' || !createChapter.title.normalize('NFKC').trim()) fail('INVALID_CHAPTER_TITLE', 'New Chapter title is required.');
  const title = createChapter.title.normalize('NFKC').trim().replace(/\s+/g, ' ');
  if (title.length > 120) fail('INVALID_CHAPTER_TITLE', 'New Chapter title must be at most 120 characters.');
  const description = createChapter.description === undefined ? '' : String(createChapter.description).normalize('NFKC').trim();
  if (description.length > 2000) fail('INVALID_CHAPTER_DESCRIPTION', 'New Chapter description must be at most 2000 characters.');
  const chapterNumber = createChapter.chapterNumber === null || createChapter.chapterNumber === '' || createChapter.chapterNumber === undefined
    ? null : Number(createChapter.chapterNumber);
  const sortOrder = Number(createChapter.sortOrder ?? 0);
  if (chapterNumber !== null && (!Number.isInteger(chapterNumber) || chapterNumber < 1)) fail('INVALID_CHAPTER_NUMBER', 'chapterNumber must be a positive integer or empty.');
  if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 1_000_000) fail('INVALID_SORT_ORDER', 'sortOrder must be a non-negative integer.');
  const normalizedTitle = normalizeTitle(title);
  const existing = await VocabularyChapter.findOne({ tagId, normalizedTitle }).select('_id title chapterNumber status');
  if (existing) {
    fail('CHAPTER_TITLE_ALREADY_EXISTS', 'A Chapter with the same normalized title already exists in this Tag. Choose it explicitly or enter a different title.', 409, {
      existingChapter: { _id: String(existing._id), title: existing.title, chapterNumber: existing.chapterNumber, status: existing.status },
    });
  }
  return { title, description, chapterNumber, sortOrder };
}

export async function listVocabularyImportBatchHistory({ search = '', status = '', page = 1, limit = 20 } = {}) {
  assertVocabularyPrototypeDatabase();
  const pagination = pageOptions(page, limit);
  if (typeof search !== 'string' || search.length > 80) fail('INVALID_SEARCH', 'Search must be at most 80 characters.');
  if (status && !BATCH_STATUSES.has(status)) fail('INVALID_STATUS', 'Unsupported Import Batch status.');
  const query = {
    ...(status ? { status } : {}),
    ...(search.trim() ? { $or: [
      ...(mongoose.isObjectIdOrHexString(search.trim()) ? [{ _id: new mongoose.Types.ObjectId(search.trim()) }] : []),
      { batchIdentity: { $regex: search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } },
      { 'sourceFiles.sourceFolder': { $regex: search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } },
    ] } : {}),
  };
  const [batches, total] = await Promise.all([
    VocabularyImportBatch.find(query).select('_id batchIdentity sourceFiles candidateCount counts status parserVersions createdAt updatedAt __v')
      .sort({ createdAt: -1, _id: -1 }).skip(pagination.skip).limit(pagination.limit),
    VocabularyImportBatch.countDocuments(query),
  ]);
  const mappings = await VocabularyImportCatalogMapping.find({ batchId: { $in: batches.map((batch) => batch._id) } }).select('batchId status');
  const mappingStatuses = new Map(mappings.map((mapping) => [String(mapping.batchId), mapping.status]));
  return {
    items: batches.map((batch) => batchSummary(batch, mappingStatuses.get(String(batch._id)) || 'NOT_MAPPED')),
    pagination: { page: pagination.page, limit: pagination.limit, total, pages: Math.ceil(total / pagination.limit) || 1 },
  };
}

export async function getVocabularyImportCatalogMapping(batchId) {
  assertVocabularyPrototypeDatabase();
  const batch = await loadBatch(batchId);
  const mapping = await VocabularyImportCatalogMapping.findOne({ batchId: batch._id });
  return { batch: batchSummary(batch, mapping?.status || 'NOT_MAPPED'), mapping: mappingDto(mapping, batch) };
}

export async function saveVocabularyImportCatalogMapping(batchId, body) {
  assertVocabularyPrototypeDatabase();
  const batch = await loadBatch(batchId);
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail('INVALID_PAYLOAD', 'Catalog mapping payload must be an object.');
  const allowed = new Set(['expectedVersion', 'targetTagId', 'entries']);
  if (Object.keys(body).some((key) => !allowed.has(key))) fail('MASS_ASSIGNMENT_REJECTED', 'Catalog mapping payload contains unsupported fields.');
  const tagId = objectId(body.targetTagId, 'targetTagId');
  const tag = await VocabularyTag.findById(tagId).select('_id status');
  if (!tag) fail('TAG_NOT_FOUND', 'Target Tag was not found.', 404);
  if (tag.status === 'archived') fail('TAG_ARCHIVED', 'An archived Tag cannot be used for import mapping.', 409);
  const existing = await VocabularyImportCatalogMapping.findOne({ batchId: batch._id });
  if (existing?.status === 'LOCKED') fail('MAPPING_LOCKED', 'This mapping is locked because the Batch has already created Drafts.', 409);
  const expectedVersion = body.expectedVersion === null || body.expectedVersion === undefined ? null : Number(body.expectedVersion);
  if (expectedVersion !== null && (!Number.isInteger(expectedVersion) || expectedVersion < 0)) fail('EXPECTED_VERSION_REQUIRED', 'expectedVersion must be a non-negative integer or null for a new mapping.');
  if (existing && expectedVersion !== existing.__v) fail('CONCURRENT_MODIFICATION', 'The mapping changed. Reload it before saving.', 409);
  if (!existing && expectedVersion !== null) fail('CONCURRENT_MODIFICATION', 'The mapping does not exist. Reload the Batch before saving.', 409);

  const importedCount = await VocabularyImportCandidate.countDocuments({ batchId: batch._id, importStatus: 'IMPORTED_AS_DRAFT' });
  if (importedCount > 0) fail('BATCH_ALREADY_CONFIRMED', 'A Batch with confirmed Drafts cannot be remapped.', 409);
  const sourceFiles = batch.sourceFiles || [];
  if (!Array.isArray(body.entries) || body.entries.length !== sourceFiles.length) fail('SOURCE_FILE_MAPPING_REQUIRED', 'Map every DOCX file in the Batch exactly once.');
  const sourceByIdentity = new Map(sourceFiles.map((source) => [sourceFileIdentity(source.relativePath, source.fileSha256), source]));
  const requested = new Map();
  for (const entry of body.entries) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) fail('INVALID_MAPPING_ENTRY', 'Every mapping entry must be an object.');
    const entryAllowed = new Set(['sourceFileIdentity', 'chapterAction', 'targetChapterId', 'createChapter']);
    if (Object.keys(entry).some((key) => !entryAllowed.has(key))) fail('MASS_ASSIGNMENT_REJECTED', 'Mapping entry contains unsupported fields.');
    const identity = String(entry.sourceFileIdentity || '');
    const source = sourceByIdentity.get(identity);
    if (!source) fail('SOURCE_FILE_NOT_FOUND', 'A mapping entry does not match an immutable Batch source file.', 409);
    if (requested.has(identity)) fail('DUPLICATE_SOURCE_FILE_MAPPING', 'Each DOCX file must be mapped exactly once.');
    requested.set(identity, { entry, source });
  }
  if (requested.size !== sourceFiles.length) fail('SOURCE_FILE_MAPPING_REQUIRED', 'Map every DOCX file in the Batch exactly once.');

  const chapterTitles = new Set();
  const entries = [];
  for (const [identity, { entry, source }] of requested) {
    const base = {
      sourceFileIdentity: identity,
      sourceRelativePath: source.relativePath,
      fileSha256: String(source.fileSha256).toUpperCase(),
      sourceFolderLabel: source.sourceFolder || '',
      sourceChapterCandidate: source.chapterCandidate || '',
      candidateCount: source.candidateCount || 0,
    };
    if (entry.chapterAction === 'EXISTING') {
      const chapterId = objectId(entry.targetChapterId, 'targetChapterId');
      const chapter = await VocabularyChapter.findById(chapterId).select('_id tagId status');
      if (!chapter) fail('CHAPTER_NOT_FOUND', 'Target Chapter was not found.', 404);
      if (String(chapter.tagId) !== String(tagId)) fail('CHAPTER_TAG_MISMATCH', 'The selected Chapter does not belong to the target Tag.', 409);
      if (chapter.status === 'archived') fail('CHAPTER_ARCHIVED', 'An archived Chapter cannot receive an import mapping.', 409);
      entries.push({ ...base, chapterAction: 'EXISTING', targetChapterId: chapter._id, createChapter: undefined, resolvedChapterId: chapter._id });
    } else if (entry.chapterAction === 'CREATE') {
      if (entry.targetChapterId) fail('INVALID_MAPPING_ENTRY', 'A new Chapter mapping must not include targetChapterId.');
      const createChapter = await validateCreateChapter(tagId, entry.createChapter);
      const normalized = normalizeTitle(createChapter.title);
      if (chapterTitles.has(normalized)) fail('DUPLICATE_CHAPTER_MAPPING', 'Two source files cannot create Chapters with the same title in one Tag.', 409);
      chapterTitles.add(normalized);
      entries.push({ ...base, chapterAction: 'CREATE', targetChapterId: null, createChapter, resolvedChapterId: null });
    } else {
      fail('INVALID_CHAPTER_ACTION', 'chapterAction must be EXISTING or CREATE.');
    }
  }

  if (existing) {
    existing.targetTagId = tagId;
    existing.entries = entries;
    try { await existing.save(); } catch (error) {
      if (error?.name === 'VersionError') fail('CONCURRENT_MODIFICATION', 'The mapping changed. Reload it before saving.', 409);
      if (error?.code === 11000) fail('CHAPTER_TITLE_ALREADY_EXISTS', 'A Chapter title was added to this Tag while the mapping was being saved.', 409);
      throw error;
    }
    return { batch: batchSummary(batch, existing.status), mapping: mappingDto(existing, batch) };
  }

  try {
    const [created] = await VocabularyImportCatalogMapping.create([{
      batchId: batch._id,
      batchIdentity: batch.batchIdentity,
      targetTagId: tagId,
      entries,
      status: 'MAPPED',
    }]);
    return { batch: batchSummary(batch, created.status), mapping: mappingDto(created, batch) };
  } catch (error) {
    if (error?.code === 11000) fail('CONCURRENT_MODIFICATION', 'Another Admin saved a mapping for this Batch. Reload before continuing.', 409);
    throw error;
  }
}

export async function requireBatchCatalogMapping(batchId) {
  assertVocabularyPrototypeDatabase();
  const id = objectId(batchId, 'batchId');
  const mapping = await VocabularyImportCatalogMapping.findOne({ batchId: id }).select('_id status batchIdentity');
  return mapping;
}

export async function confirmBatchSourceMapping({ batch, candidate, session, mapping: suppliedMapping }) {
  const mapping = suppliedMapping || await VocabularyImportCatalogMapping.findOne({ batchId: batch._id }).session(session);
  if (!mapping) return null;
  if (mapping.batchIdentity !== batch.batchIdentity) fail('BATCH_IDENTITY_MISMATCH', 'The mapping no longer matches immutable Batch identity.', 409);
  const targetTag = await VocabularyTag.findById(mapping.targetTagId).session(session);
  if (!targetTag || targetTag.status === 'archived') fail('TAG_ARCHIVED', 'The mapped Tag was archived. Update the mapping before Confirm.', 409);
  const identity = sourceFileIdentity(candidate.sourceMetadata.relativePath, candidate.sourceMetadata.fileSha256);
  const entry = mapping.entries.find((item) => item.sourceFileIdentity === identity);
  if (!entry) fail('SOURCE_FILE_MAPPING_REQUIRED', 'This candidate source file has no explicit Tag and Chapter mapping.', 409);

  let chapter;
  if (entry.chapterAction === 'EXISTING') {
    chapter = await VocabularyChapter.findById(entry.targetChapterId).session(session);
    if (!chapter || String(chapter.tagId) !== String(mapping.targetTagId) || chapter.status === 'archived') {
      fail('MAPPED_CHAPTER_UNAVAILABLE', 'The selected Chapter is missing, archived, or no longer belongs to the mapped Tag.', 409);
    }
  } else {
    if (entry.resolvedChapterId) {
      chapter = await VocabularyChapter.findById(entry.resolvedChapterId).session(session);
      if (!chapter || String(chapter.tagId) !== String(mapping.targetTagId) || chapter.status === 'archived') {
        fail('MAPPED_CHAPTER_UNAVAILABLE', 'The newly created Chapter is missing, archived, or no longer belongs to the mapped Tag.', 409);
      }
    } else {
      const normalizedTitle = normalizeTitle(entry.createChapter?.title);
      const existing = await VocabularyChapter.findOne({ tagId: mapping.targetTagId, normalizedTitle }).session(session).select('_id');
      if (existing) fail('CHAPTER_TITLE_ALREADY_EXISTS', 'A Chapter with this title now exists in the Tag. Select it explicitly and save the mapping before Confirm.', 409, { existingChapterId: String(existing._id) });
      try {
        [chapter] = await VocabularyChapter.create([{
          tagId: mapping.targetTagId,
          title: entry.createChapter.title,
          description: entry.createChapter.description || '',
          chapterNumber: entry.createChapter.chapterNumber ?? null,
          sortOrder: entry.createChapter.sortOrder ?? 0,
          status: 'draft',
        }], { session });
      } catch (error) {
        if (error?.code === 11000) fail('CHAPTER_TITLE_ALREADY_EXISTS', 'A Chapter with this title now exists in the Tag. Select it explicitly and save the mapping before Confirm.', 409);
        throw error;
      }
      entry.resolvedChapterId = chapter._id;
    }
  }

  return { tag: targetTag, chapter, mapping };
}

export function sourceFileIdentityForMapping(relativePath, fileSha256) {
  return sourceFileIdentity(relativePath, fileSha256);
}
