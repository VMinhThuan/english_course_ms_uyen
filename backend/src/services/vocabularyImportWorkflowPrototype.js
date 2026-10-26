import { createHash } from 'node:crypto';
import path from 'node:path';
import mongoose from 'mongoose';
import sanitizeHtml from 'sanitize-html';
import Vocabulary from '../models/Vocabulary.js';
import VocabularyChapter from '../models/VocabularyChapter.js';
import VocabularyImportAudit from '../models/VocabularyImportAudit.js';
import VocabularyImportBatch from '../models/VocabularyImportBatch.js';
import VocabularyImportCandidate from '../models/VocabularyImportCandidate.js';
import VocabularyImportCatalogMapping from '../models/VocabularyImportCatalogMapping.js';
import VocabularyTag from '../models/VocabularyTag.js';
import ChapterVocabulary from '../models/ChapterVocabulary.js';
import { adaptVocabularyParserCandidate, VOCABULARY_CATALOG_CANDIDATE_SCHEMA_VERSION } from './vocabularyCatalogCandidateAdapter.js';
import { persistVocabularyCandidateEnvelope } from './vocabularyCandidatePersistence.js';
import {
  createCatalogVocabulary,
  createVocabularyChapter,
  createVocabularyTag,
  addVocabularyToChapter,
} from './vocabularyCatalogService.js';
import { DocxVocabularyParserV2 } from './docxVocabularyParserV2.js';
import { confirmBatchSourceMapping } from './vocabularyImportCatalogMappingPrototype.js';
import { candidateEditorialSnapshot, vocabularyContentHash } from './vocabularyContentDigest.js';

const MAX_PAGE_SIZE = 100;
const MAX_REVIEW_REASON_LENGTH = 500;
const MAX_CANDIDATES_PER_DOCX = 2500;
const MAX_DOCX_FILES_PER_BATCH = 5;
const MAX_BATCH_UPLOAD_BYTES = 25 * 1024 * 1024;
const EDITABLE_FIELDS = new Set(['word', 'partOfSpeech', 'senses', 'notes']);
const STATUS_FILTERS = Object.freeze({
  PARSED: { parseStatus: 'PARSED' },
  VALID: { validationStatus: 'VALIDATION_PASSED' },
  INVALID: { validationStatus: 'VALIDATION_FAILED' },
  NEEDS_REVIEW: { reviewStatus: 'NEEDS_REVIEW' },
  REVIEW_APPROVED: { reviewStatus: 'REVIEW_APPROVED' },
  REVIEW_REJECTED: { reviewStatus: 'REVIEW_REJECTED' },
  IMPORTED_AS_DRAFT: { importStatus: 'IMPORTED_AS_DRAFT' },
});

export class VocabularyImportWorkflowError extends Error {
  constructor(code, message, statusCode = 400, rowErrors = []) {
    super(message);
    this.name = 'VocabularyImportWorkflowError';
    this.code = code;
    this.statusCode = statusCode;
    this.rowErrors = rowErrors;
  }
}

function fail(code, message, statusCode = 400, rowErrors = []) {
  throw new VocabularyImportWorkflowError(code, message, statusCode, rowErrors);
}

function requireObjectId(value, field) {
  if (!mongoose.isObjectIdOrHexString(value)) fail('INVALID_ID', `${field} must be a valid identifier.`);
  return new mongoose.Types.ObjectId(value);
}

function requireActorId(value) {
  return requireObjectId(value, 'actorId');
}

function assertPrototypeDatabase() {
  if (mongoose.connection.readyState !== 1) {
    fail('DATABASE_CONNECTION_REQUIRED', 'Vocabulary import requires an active MongoDB connection.', 503);
  }
}

function requireVersion(value) {
  const version = Number(value);
  if (!Number.isInteger(version) || version < 0) fail('VERSION_REQUIRED', 'A non-negative expectedVersion is required.');
  return version;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeText(value) {
  return String(value ?? '').normalize('NFKC').trim().toLocaleLowerCase('en-US');
}

function asObject(value) {
  return value?.toObject ? value.toObject({ depopulate: true, transform: false }) : value;
}

function statusForCandidate(candidate) {
  if (candidate.importStatus === 'IMPORTED_AS_DRAFT') return 'IMPORTED_AS_DRAFT';
  if (candidate.reviewStatus === 'REVIEW_APPROVED') return 'REVIEW_APPROVED';
  if (candidate.reviewStatus === 'REVIEW_REJECTED') return 'REVIEW_REJECTED';
  if (candidate.validationStatus === 'VALIDATION_FAILED') return 'INVALID';
  if (candidate.validationStatus === 'VALIDATION_PASSED') return 'VALID';
  return 'PARSED';
}

function candidateResponse(candidate) {
  const value = asObject(candidate);
  return { ...value, status: statusForCandidate(value), version: value.__v ?? 0 };
}

function effectiveValues(candidate) {
  const parsed = candidate.parsedValues || {};
  const edited = candidate.editedValues || {};
  const values = { ...parsed, ...edited };
  if (Array.isArray(edited.senses) && Array.isArray(parsed.senses)) {
    values.senses = edited.senses.map((sense, index) => ({ ...(parsed.senses[index] || {}), ...sense }));
  }
  return values;
}

function batchResponse(batch) {
  const value = asObject(batch);
  return { ...value, version: value.__v ?? 0 };
}

function safeFilename(originalName) {
  const leaf = path.posix.basename(String(originalName || '').replace(/\\/g, '/')).normalize('NFC');
  if (!leaf || leaf.length > 180 || /[\u0000-\u001f\u007f]/u.test(leaf) || !/\.docx$/i.test(leaf)) {
    fail('INVALID_FILENAME', 'Upload must have a safe .docx filename.');
  }
  return leaf;
}

function safeSourceFolder(value) {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value !== 'string') fail('INVALID_SOURCE_FOLDER', 'sourceFolder must be plain text.');
  const folder = value.normalize('NFC').trim();
  if (!folder || folder.length > 100 || /[\\/\u0000-\u001f\u007f]/u.test(folder) || folder === '.' || folder === '..') {
    fail('INVALID_SOURCE_FOLDER', 'sourceFolder must be a short relative folder label.');
  }
  if (sanitizeHtml(folder, { allowedTags: [], allowedAttributes: {} }) !== folder) {
    fail('INVALID_SOURCE_FOLDER', 'sourceFolder must not contain HTML.');
  }
  return folder;
}

function normalizeEditedText(value, field, { required = false, maxLength = 2000 } = {}) {
  if (typeof value !== 'string') return { value: '', issue: { code: 'TEXT_REQUIRED', field } };
  const normalized = value.normalize('NFC').trim();
  if (normalized.length > maxLength) return { value: normalized, issue: { code: 'TEXT_TOO_LONG', field } };
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(normalized)) {
    return { value: normalized, issue: { code: 'CONTROL_CHARACTER_NOT_ALLOWED', field } };
  }
  const containsHtml = /<\s*\/?\s*[a-z!][^>]*>/iu.test(normalized);
  const sanitized = sanitizeHtml(normalized, {
    allowedTags: [],
    allowedAttributes: {},
    disallowedTagsMode: 'discard',
  });
  if (containsHtml && sanitized !== normalized) {
    return { value: normalized, issue: { code: 'HTML_CONTENT_NOT_ALLOWED', field } };
  }
  if (required && !normalized) return { value: normalized, issue: { code: 'TEXT_REQUIRED', field } };
  return { value: normalized, issue: null };
}

function validateCandidateContent(parsedValues = {}, editedValues = {}) {
  const issues = [];
  const effective = effectiveValues({ parsedValues, editedValues });
  const word = normalizeEditedText(effective.word, 'word', { required: true, maxLength: 200 });
  if (word.issue) issues.push(word.issue);

  if (!Array.isArray(effective.partOfSpeech) || effective.partOfSpeech.length > 12) {
    issues.push({ code: 'POS_ARRAY_INVALID', field: 'partOfSpeech' });
  } else {
    effective.partOfSpeech.forEach((value, index) => {
      const result = normalizeEditedText(value, `partOfSpeech.${index}`, { required: true, maxLength: 80 });
      if (result.issue) issues.push(result.issue);
    });
  }

  if (!Array.isArray(effective.senses) || effective.senses.length < 1 || effective.senses.length > 30) {
    issues.push({ code: 'SENSES_ARRAY_INVALID', field: 'senses' });
  } else {
    effective.senses.forEach((sense, senseIndex) => {
      const field = `senses.${senseIndex}`;
      if (!sense || typeof sense !== 'object' || Array.isArray(sense)) {
        issues.push({ code: 'SENSE_INVALID', field });
        return;
      }
      const meaning = normalizeEditedText(sense.meaning, `${field}.meaning`, { required: true, maxLength: 4000 });
      if (meaning.issue) issues.push(meaning.issue);
      if (sense.partOfSpeech !== undefined && (!Array.isArray(sense.partOfSpeech) || sense.partOfSpeech.length > 12)) {
        issues.push({ code: 'POS_ARRAY_INVALID', field: `${field}.partOfSpeech` });
      }
      if (!Array.isArray(sense.examples) || sense.examples.length > 20) {
        issues.push({ code: 'EXAMPLES_ARRAY_INVALID', field: `${field}.examples` });
      } else {
        sense.examples.forEach((example, exampleIndex) => {
          const exampleField = `${field}.examples.${exampleIndex}`;
          if (!example || typeof example !== 'object' || Array.isArray(example)) {
            issues.push({ code: 'EXAMPLE_INVALID', field: exampleField });
            return;
          }
          const english = normalizeEditedText(example.english, `${exampleField}.english`, { maxLength: 2000 });
          const vietnamese = normalizeEditedText(example.vietnamese, `${exampleField}.vietnamese`, { maxLength: 2000 });
          if (english.issue) issues.push(english.issue);
          if (vietnamese.issue) issues.push(vietnamese.issue);
          if (!english.value && !vietnamese.value) issues.push({ code: 'EXAMPLE_TEXT_REQUIRED', field: exampleField });
        });
      }
    });
  }

  if (!Array.isArray(effective.notes) || effective.notes.length > 40) {
    issues.push({ code: 'NOTES_ARRAY_INVALID', field: 'notes' });
  } else {
    effective.notes.forEach((value, index) => {
      const result = normalizeEditedText(value, `notes.${index}`, { maxLength: 2000 });
      if (result.issue) issues.push(result.issue);
    });
  }
  return { effective, issues, status: issues.length ? 'VALIDATION_FAILED' : 'VALIDATION_PASSED' };
}

function duplicateFingerprint(values = {}) {
  const senses = Array.isArray(values.senses) ? values.senses : [];
  return JSON.stringify({
    pos: (Array.isArray(values.partOfSpeech) ? values.partOfSpeech : []).map(normalizeText).sort(),
    senses: senses.map((sense) => ({
      pos: (Array.isArray(sense.partOfSpeech) ? sense.partOfSpeech : []).map(normalizeText).sort(),
      meaning: normalizeText(sense.meaning),
      examples: (Array.isArray(sense.examples) ? sense.examples : []).map((example) => [
        normalizeText(example.english), normalizeText(example.vietnamese),
      ]),
    })),
  });
}

function catalogFingerprint(vocabulary) {
  const senses = Array.isArray(vocabulary.catalogSenses) && vocabulary.catalogSenses.length
    ? vocabulary.catalogSenses
    : [{
      partOfSpeech: vocabulary.partOfSpeech ? [vocabulary.partOfSpeech] : [],
      meaning: vocabulary.meaning,
      examples: vocabulary.exampleEnglish || vocabulary.exampleVietnamese
        ? [{ english: vocabulary.exampleEnglish || vocabulary.example, vietnamese: vocabulary.exampleVietnamese }]
        : [],
    }];
  return duplicateFingerprint({
    partOfSpeech: vocabulary.partOfSpeech ? [vocabulary.partOfSpeech] : [],
    senses,
  });
}

function duplicateClass(candidateValues, vocabulary) {
  if (duplicateFingerprint(candidateValues) === catalogFingerprint(vocabulary)) return 'SAME_CONTENT_EXISTING_CATALOG';
  const candidatePos = new Set((candidateValues.partOfSpeech || []).map(normalizeText));
  const existingPos = new Set(String(vocabulary.partOfSpeech || '').split(',').map(normalizeText).filter(Boolean));
  const sharedPos = [...candidatePos].some((value) => existingPos.has(value));
  return sharedPos ? 'SAME_HEADWORD_DIFFERENT_SENSE' : 'SAME_HEADWORD_DIFFERENT_POS';
}

async function findCatalogDuplicates(candidateValues) {
  const word = typeof candidateValues.word === 'string' ? candidateValues.word.trim() : '';
  if (!word) return [];
  const matches = await Vocabulary.find({
    catalogOnly: true,
    word: { $regex: `^${escapeRegex(word)}$`, $options: 'i' },
  })
    .select('_id word partOfSpeech meaning example exampleEnglish exampleVietnamese catalogSenses catalogStatus')
    .limit(20)
    .lean();
  return matches.map((entry) => ({
    vocabularyId: entry._id,
    word: entry.word,
    catalogStatus: entry.catalogStatus,
    classification: duplicateClass(candidateValues, entry),
    reuseAllowed: false,
  }));
}

function batchIdentityFor({ schemaVersion, sourceFiles }) {
  return createHash('sha256')
    .update(JSON.stringify([
      schemaVersion,
      sourceFiles.map((file) => [file.relativePath, String(file.fileSha256).toUpperCase()])
        .sort(([pathA, hashA], [pathB, hashB]) => pathA.localeCompare(pathB) || hashA.localeCompare(hashB)),
    ]))
    .digest('hex');
}

function slugify(value) {
  const slug = String(value || '')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
  return slug || 'vocabulary-import';
}

async function withTransaction(work) {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } catch (error) {
    if (error?.name === 'VersionError' || error?.code === 112 || error?.hasErrorLabel?.('TransientTransactionError')) {
      fail('CONCURRENT_MODIFICATION', 'The record changed during this operation. Reload it and retry.', 409);
    }
    if (/Transaction numbers are only allowed|replica set|transactions are not supported/i.test(error?.message || '')) {
      fail('TRANSACTION_REQUIRED', 'This prototype requires a MongoDB replica set for atomic writes.', 503);
    }
    throw error;
  } finally {
    await session.endSession();
  }
}

async function summarizeBatch(batch, session) {
  const rows = await VocabularyImportCandidate.find({ batchId: batch._id })
    .select('parseStatus validationStatus reviewStatus importStatus')
    .session(session)
    .lean();
  const counts = {
    parsed: rows.filter((row) => row.parseStatus === 'PARSED').length,
    valid: rows.filter((row) => row.validationStatus === 'VALIDATION_PASSED').length,
    invalid: rows.filter((row) => row.validationStatus === 'VALIDATION_FAILED').length,
    needsReview: rows.filter((row) => row.reviewStatus === 'NEEDS_REVIEW' || row.reviewStatus === 'EDITED').length,
    approved: rows.filter((row) => row.reviewStatus === 'REVIEW_APPROVED').length,
    rejected: rows.filter((row) => row.reviewStatus === 'REVIEW_REJECTED').length,
    importedAsDraft: rows.filter((row) => row.importStatus === 'IMPORTED_AS_DRAFT').length,
  };
  batch.counts = counts;
  if (counts.importedAsDraft === rows.length && rows.length > 0) batch.status = 'CONFIRMED_DRAFT';
  else if (counts.importedAsDraft > 0) batch.status = 'PARTIALLY_CONFIRMED_DRAFT';
  else if (rows.length > 0 && counts.needsReview === 0) batch.status = 'REVIEW_COMPLETE';
  else if (rows.length > 0) batch.status = 'NEEDS_REVIEW';
  else batch.status = 'PARSED';
  await batch.save({ session });
  return counts;
}

async function loadExistingBatch(batchIdentity) {
  const batch = await VocabularyImportBatch.findOne({ batchIdentity });
  if (!batch) return null;
  const candidates = await VocabularyImportCandidate.find({ batchId: batch._id })
    .sort({ 'sourceMetadata.relativePath': 1, 'sourceMetadata.sourceOrdinal': 1 })
    .limit(50);
  return {
    batch: batchResponse(batch),
    candidates: candidates.map(candidateResponse),
    idempotent: true,
  };
}

async function priorSourceRevisions(relativePath, fileSha256) {
  const rows = await VocabularyImportCandidate.find({
    'sourceMetadata.normalizedRelativePath': relativePath,
    'sourceMetadata.fileSha256': { $ne: String(fileSha256).toUpperCase() },
  })
    .select('_id batchId sourceIdentity sourceMetadata.sourceOrdinal sourceMetadata.fileSha256 reviewStatus importStatus')
    .sort({ createdAt: -1 })
    .limit(5000)
    .lean();
  const byOrdinal = new Map();
  for (const row of rows) {
    const ordinal = row.sourceMetadata?.sourceOrdinal;
    if (Number.isInteger(ordinal) && !byOrdinal.has(ordinal)) byOrdinal.set(ordinal, row);
  }
  return byOrdinal;
}

export async function createVocabularyImportBatch({ files: uploadedFiles, sourceFolder: rawSourceFolder, actorId }) {
  assertPrototypeDatabase();
  const actor = requireActorId(actorId);
  if (!Array.isArray(uploadedFiles) || uploadedFiles.length < 1) fail('FILE_REQUIRED', 'Attach at least one DOCX file using the files field.');
  if (uploadedFiles.length > MAX_DOCX_FILES_PER_BATCH) fail('FILE_COUNT_EXCEEDED', 'A prototype batch accepts at most five DOCX files.', 413);
  const sourceFolder = safeSourceFolder(rawSourceFolder);
  let uploadBytes = 0;
  const uploadDescriptors = uploadedFiles.map((file) => {
    if (!file || !Buffer.isBuffer(file.buffer)) fail('INVALID_UPLOAD', 'Every batch item must contain a DOCX buffer.');
    const filename = safeFilename(file.originalname);
    const relativePath = [sourceFolder, filename].filter(Boolean).join('/');
    uploadBytes += file.size ?? file.buffer.length;
    return { file, filename, relativePath };
  });
  if (uploadBytes > MAX_BATCH_UPLOAD_BYTES) fail('BATCH_UPLOAD_TOO_LARGE', 'Combined DOCX batch size exceeded 25 MiB.', 413);
  const normalizedPaths = uploadDescriptors.map((descriptor) => descriptor.relativePath.toLocaleLowerCase('en-US'));
  if (new Set(normalizedPaths).size !== normalizedPaths.length) fail('DUPLICATE_SOURCE_PATH', 'A batch cannot contain two files with the same relative source path.');

  let parsed;
  try {
    parsed = await DocxVocabularyParserV2.parseDocxFiles(uploadDescriptors.map(({ file, filename, relativePath }) => ({
      buffer: file.buffer,
      source: { relativePath, fileName: filename, sourceFolder },
    })));
  } catch (error) {
    if (String(error?.code || '').startsWith('RESOURCE_LIMIT_')) {
      fail('DOCX_RESOURCE_LIMIT', 'DOCX package exceeded a parser resource limit.', 413);
    }
    fail('INVALID_DOCX', 'DOCX failed package, OOXML or source-layout validation.', 400);
  }
  if (!parsed.items.length) fail('NO_CANDIDATES', 'The DOCX package contained no parseable vocabulary rows.', 422);
  if (parsed.items.length > MAX_CANDIDATES_PER_DOCX) fail('CANDIDATE_LIMIT_EXCEEDED', 'The DOCX batch contains too many candidate rows.', 413);

  const sourceFiles = parsed.documents.map(({ source }) => ({
    relativePath: source.relativePath,
    fileSha256: source.fileSha256,
    sourceFolder: source.sourceFolder,
    chapterCandidate: source.chapterCandidate,
    candidateCount: parsed.items.filter((item) => item.source.relativePath === source.relativePath).length,
  })).sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  const schemaVersion = VOCABULARY_CATALOG_CANDIDATE_SCHEMA_VERSION;
  const identity = batchIdentityFor({ schemaVersion, sourceFiles });
  const existing = await loadExistingBatch(identity);
  if (existing) return existing;

  const previousRevisionsByPath = new Map();
  for (const sourceFile of sourceFiles) {
    previousRevisionsByPath.set(
      sourceFile.relativePath,
      await priorSourceRevisions(sourceFile.relativePath, sourceFile.fileSha256),
    );
  }
  const envelopes = [];
  for (const item of parsed.items) {
    const envelope = adaptVocabularyParserCandidate(item);
    const previous = previousRevisionsByPath.get(item.source.relativePath)?.get(item.source.sourceOrdinal);
    const catalogMatches = await findCatalogDuplicates(envelope.vocabularyCandidate);
    const duplicateMetadata = {
      parser: envelope.duplicateMetadata,
      catalogMatches,
      sourceRevision: previous ? {
        previousBatchId: previous.batchId,
        previousCandidateId: previous._id,
        previousSourceIdentity: previous.sourceIdentity,
        previousFileSha256: previous.sourceMetadata?.fileSha256,
        previousReviewStatus: previous.reviewStatus,
        previousImportStatus: previous.importStatus,
        revisionDetected: true,
      } : null,
    };
    envelope.duplicateMetadata = duplicateMetadata;
    if (previous) {
      envelope.review.reasons = [
        ...envelope.review.reasons,
        { code: 'SOURCE_REVISION_REQUIRES_REVIEW', detail: 'A prior file revision exists at this relative source path.' },
      ];
    }
    envelopes.push(envelope);
  }

  const batchData = {
    batchIdentity: identity,
    actorId: actor,
    schemaVersion,
    parserVersions: [parsed.parserVersion],
    sourceFiles,
    candidateCount: parsed.items.length,
    duplicateGroupCount: parsed.summary.duplicateGroups,
    duplicateOccurrenceCount: parsed.summary.duplicateOccurrences,
    status: 'NEEDS_REVIEW',
  };

  try {
    const result = await withTransaction(async (session) => {
      const [batch] = await VocabularyImportBatch.create([batchData], { session });
      for (const envelope of envelopes) {
        const candidate = await persistVocabularyCandidateEnvelope({ batchId: batch._id, envelope, session });
        const validation = validateCandidateContent(candidate.parsedValues, candidate.editedValues);
        candidate.validationStatus = validation.status;
        candidate.validationIssues = validation.issues;
        candidate.reviewStatus = 'NEEDS_REVIEW';
        candidate.publicationStatus = 'NOT_ELIGIBLE';
        await candidate.save({ session });
      }
      await summarizeBatch(batch, session);
      const candidates = await VocabularyImportCandidate.find({ batchId: batch._id })
        .sort({ 'sourceMetadata.relativePath': 1, 'sourceMetadata.sourceOrdinal': 1 })
        .limit(50)
        .session(session);
      return { batch: batchResponse(batch), candidates: candidates.map(candidateResponse), idempotent: false };
    });
    return result;
  } catch (error) {
    if (error?.code === 11000) {
      const raced = await loadExistingBatch(identity);
      if (raced) return raced;
    }
    throw error;
  }
}

export async function getVocabularyImportBatch(batchId) {
  assertPrototypeDatabase();
  const id = requireObjectId(batchId, 'batchId');
  const batch = await VocabularyImportBatch.findById(id);
  if (!batch) fail('BATCH_NOT_FOUND', 'Vocabulary Import Batch was not found.', 404);
  return batchResponse(batch);
}

export async function listVocabularyImportCandidates(batchId, options = {}) {
  assertPrototypeDatabase();
  const id = requireObjectId(batchId, 'batchId');
  if (!await VocabularyImportBatch.exists({ _id: id })) fail('BATCH_NOT_FOUND', 'Vocabulary Import Batch was not found.', 404);
  const page = Number(options.page ?? 1);
  const limit = Number(options.limit ?? 50);
  if (!Number.isInteger(page) || page < 1 || page > 1_000_000 || !Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) {
    fail('INVALID_PAGINATION', 'Page must be positive and limit must be between 1 and 100.');
  }
  const filter = { batchId: id };
  if (options.status !== undefined) {
    if (typeof options.status !== 'string' || !STATUS_FILTERS[options.status]) fail('INVALID_STATUS_FILTER', 'Candidate status filter is not supported.');
    Object.assign(filter, STATUS_FILTERS[options.status]);
  }
  if (options.reviewStatus !== undefined) {
    if (!['NEEDS_REVIEW', 'EDITED', 'REVIEW_APPROVED', 'REVIEW_REJECTED'].includes(options.reviewStatus)) {
      fail('INVALID_REVIEW_FILTER', 'Review status filter is not supported.');
    }
    filter.reviewStatus = options.reviewStatus;
  }
  if (options.validationStatus !== undefined) {
    if (!['NOT_RUN', 'VALIDATION_PASSED', 'VALIDATION_FAILED'].includes(options.validationStatus)) {
      fail('INVALID_VALIDATION_FILTER', 'Validation status filter is not supported.');
    }
    filter.validationStatus = options.validationStatus;
  }
  if (options.search !== undefined) {
    if (typeof options.search !== 'string' || options.search.length > 80) fail('INVALID_SEARCH', 'Search must be at most 80 characters.');
    const search = options.search.trim();
    if (search) {
      const regex = { $regex: escapeRegex(search), $options: 'i' };
      filter.$or = [
        { 'parsedValues.word': regex },
        { 'editedValues.word': regex },
        { 'sourceMetadata.relativePath': regex },
      ];
    }
  }
  const [items, total] = await Promise.all([
    VocabularyImportCandidate.find(filter)
      .sort({ 'sourceMetadata.relativePath': 1, 'sourceMetadata.sourceOrdinal': 1, _id: 1 })
      .skip((page - 1) * limit)
      .limit(limit),
    VocabularyImportCandidate.countDocuments(filter),
  ]);
  return {
    items: items.map(candidateResponse),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
    rowErrors: items.flatMap((candidate) => candidate.validationIssues.map((issue) => ({
      candidateId: candidate._id,
      ...issue,
    }))),
  };
}

export async function getVocabularyImportCandidate({ batchId, candidateId }) {
  assertPrototypeDatabase();
  const batchObjectId = requireObjectId(batchId, 'batchId');
  const candidateObjectId = requireObjectId(candidateId, 'candidateId');
  const candidate = await VocabularyImportCandidate.findOne({ _id: candidateObjectId, batchId: batchObjectId });
  if (!candidate) fail('CANDIDATE_NOT_FOUND', 'Vocabulary Import Candidate was not found.', 404);
  const auditHistory = await VocabularyImportAudit.find({ candidateId: candidate._id })
    .sort({ occurredAt: 1, _id: 1 })
    .lean();
  return { candidate: candidateResponse(candidate), auditHistory };
}

function validatePatchPayload(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail('INVALID_PAYLOAD', 'Edit payload must be an object.');
  const allowedBodyFields = new Set(['expectedVersion', 'changes', 'reason']);
  if (Object.keys(body).some((key) => !allowedBodyFields.has(key))) fail('MASS_ASSIGNMENT_REJECTED', 'Edit payload contains unsupported fields.');
  const version = requireVersion(body.expectedVersion);
  if (!body.changes || typeof body.changes !== 'object' || Array.isArray(body.changes)) fail('INVALID_CHANGES', 'changes must be an object.');
  const keys = Object.keys(body.changes);
  if (!keys.length || keys.some((key) => !EDITABLE_FIELDS.has(key))) fail('MASS_ASSIGNMENT_REJECTED', 'Only word, partOfSpeech, senses and notes may be edited.');
  const reason = normalizeEditedText(body.reason, 'reason', { required: true, maxLength: MAX_REVIEW_REASON_LENGTH });
  if (reason.issue) fail('EDIT_REASON_REQUIRED', 'A short edit reason is required.');
  const changes = {};
  const acceptText = (value, field, maxLength) => {
    if (typeof value !== 'string') fail('INVALID_EDIT_VALUE', `${field} must be text.`);
    const normalized = normalizeEditedText(value, field, { maxLength });
    if (normalized.issue && normalized.issue.code !== 'TEXT_REQUIRED') {
      fail('INVALID_EDIT_VALUE', `${field} contains unsupported content.`, 400, [normalized.issue]);
    }
    return normalized.value;
  };
  if (Object.hasOwn(body.changes, 'word')) changes.word = acceptText(body.changes.word, 'word', 200);
  if (Object.hasOwn(body.changes, 'partOfSpeech')) {
    const values = body.changes.partOfSpeech;
    if (!Array.isArray(values) || values.length > 12) fail('INVALID_EDIT_VALUE', 'partOfSpeech must be an array of at most 12 text values.');
    changes.partOfSpeech = values.map((value, index) => acceptText(value, `partOfSpeech.${index}`, 80));
  }
  if (Object.hasOwn(body.changes, 'notes')) {
    const values = body.changes.notes;
    if (!Array.isArray(values) || values.length > 40) fail('INVALID_EDIT_VALUE', 'notes must be an array of at most 40 text values.');
    changes.notes = values.map((value, index) => acceptText(value, `notes.${index}`, 2000));
  }
  if (Object.hasOwn(body.changes, 'senses')) {
    const senses = body.changes.senses;
    if (!Array.isArray(senses) || senses.length > 30) fail('INVALID_EDIT_VALUE', 'senses must be an array of at most 30 objects.');
    changes.senses = senses.map((sense, senseIndex) => {
      const field = `senses.${senseIndex}`;
      if (!sense || typeof sense !== 'object' || Array.isArray(sense)) fail('INVALID_EDIT_VALUE', `${field} must be an object.`);
      const allowedSenseFields = new Set(['partOfSpeech', 'meaning', 'examples']);
      if (Object.keys(sense).some((key) => !allowedSenseFields.has(key))) fail('MASS_ASSIGNMENT_REJECTED', `${field} contains unsupported fields.`);
      if (!Array.isArray(sense.examples) || sense.examples.length > 20) fail('INVALID_EDIT_VALUE', `${field}.examples must be an array of at most 20 objects.`);
      const pos = sense.partOfSpeech ?? [];
      if (!Array.isArray(pos) || pos.length > 12) fail('INVALID_EDIT_VALUE', `${field}.partOfSpeech must be an array.`);
      return {
        partOfSpeech: pos.map((value, index) => acceptText(value, `${field}.partOfSpeech.${index}`, 80)),
        meaning: acceptText(sense.meaning, `${field}.meaning`, 4000),
        examples: sense.examples.map((example, exampleIndex) => {
          const exampleField = `${field}.examples.${exampleIndex}`;
          if (!example || typeof example !== 'object' || Array.isArray(example)) fail('INVALID_EDIT_VALUE', `${exampleField} must be an object.`);
          if (Object.keys(example).some((key) => !['english', 'vietnamese'].includes(key))) fail('MASS_ASSIGNMENT_REJECTED', `${exampleField} contains unsupported fields.`);
          return {
            english: acceptText(example.english ?? '', `${exampleField}.english`, 2000),
            vietnamese: acceptText(example.vietnamese ?? '', `${exampleField}.vietnamese`, 2000),
          };
        }),
      };
    });
  }
  return { version, changes, reason: reason.value };
}

export async function editVocabularyImportCandidate({ batchId, candidateId, actorId, body }) {
  assertPrototypeDatabase();
  const batchObjectId = requireObjectId(batchId, 'batchId');
  const candidateObjectId = requireObjectId(candidateId, 'candidateId');
  const actor = requireActorId(actorId);
  const patch = validatePatchPayload(body);
  return withTransaction(async (session) => {
    const batch = await VocabularyImportBatch.findById(batchObjectId).session(session);
    if (!batch) fail('BATCH_NOT_FOUND', 'Vocabulary Import Batch was not found.', 404);
    const candidate = await VocabularyImportCandidate.findOne({ _id: candidateObjectId, batchId: batchObjectId }).session(session);
    if (!candidate) fail('CANDIDATE_NOT_FOUND', 'Vocabulary Import Candidate was not found.', 404);
    if (candidate.importStatus === 'IMPORTED_AS_DRAFT') fail('CANDIDATE_ALREADY_IMPORTED', 'Imported Draft candidates are immutable.', 409);
    if (candidate.__v !== patch.version) fail('CONCURRENT_MODIFICATION', 'The candidate changed. Reload it before editing.', 409);

    const beforeValues = { ...candidate.parsedValues, ...candidate.editedValues };
    const changedFields = [];
    for (const [field, value] of Object.entries(patch.changes)) {
      candidate.editedValues = { ...candidate.editedValues, [field]: value };
      changedFields.push({ field, before: beforeValues[field] ?? null, after: value });
    }
    const validation = validateCandidateContent(candidate.parsedValues, candidate.editedValues);
    candidate.validationStatus = validation.status;
    candidate.validationIssues = validation.issues;
    candidate.reviewStatus = 'NEEDS_REVIEW';
    candidate.reviewedBy = null;
    candidate.reviewedAt = null;
    candidate.reviewedVersion = null;
    candidate.reviewedContentHash = null;
    candidate.rejectionReason = '';
    candidate.duplicateDecision = null;
    candidate.publicationStatus = 'NOT_ELIGIBLE';
    await candidate.save({ session });
    await VocabularyImportAudit.create([{
      batchId: batch._id,
      candidateId: candidate._id,
      sourceIdentity: candidate.sourceIdentity,
      actorId: actor,
      action: 'FIELDS_EDITED',
      changedFields,
      reason: patch.reason,
    }], { session });
    await summarizeBatch(batch, session);
    return candidateResponse(candidate);
  });
}

export async function reviewVocabularyImportCandidate({ batchId, candidateId, actorId, body }) {
  assertPrototypeDatabase();
  const batchObjectId = requireObjectId(batchId, 'batchId');
  const candidateObjectId = requireObjectId(candidateId, 'candidateId');
  const actor = requireActorId(actorId);
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail('INVALID_PAYLOAD', 'Review payload must be an object.');
  const allowed = new Set(['expectedVersion', 'decision', 'reason', 'duplicateDecision']);
  if (Object.keys(body).some((key) => !allowed.has(key))) fail('MASS_ASSIGNMENT_REJECTED', 'Review payload contains unsupported fields.');
  const version = requireVersion(body.expectedVersion);
  const decision = body.decision;
  if (!['APPROVE', 'REJECT'].includes(decision)) fail('INVALID_DECISION', 'decision must be APPROVE or REJECT.');
  const reason = normalizeEditedText(body.reason ?? '', 'reason', { required: decision === 'REJECT', maxLength: MAX_REVIEW_REASON_LENGTH });
  if (reason.issue) fail('REJECTION_REASON_REQUIRED', 'A rejection reason is required.');
  const duplicateDecision = body.duplicateDecision ?? null;
  if (duplicateDecision !== null && duplicateDecision !== 'KEEP_SEPARATE') fail('INVALID_DUPLICATE_DECISION', 'Only KEEP_SEPARATE is supported by this prototype.');

  return withTransaction(async (session) => {
    const batch = await VocabularyImportBatch.findById(batchObjectId).session(session);
    if (!batch) fail('BATCH_NOT_FOUND', 'Vocabulary Import Batch was not found.', 404);
    const candidate = await VocabularyImportCandidate.findOne({ _id: candidateObjectId, batchId: batchObjectId }).session(session);
    if (!candidate) fail('CANDIDATE_NOT_FOUND', 'Vocabulary Import Candidate was not found.', 404);
    if (candidate.importStatus === 'IMPORTED_AS_DRAFT') fail('CANDIDATE_ALREADY_IMPORTED', 'Imported Draft candidates cannot be reviewed again.', 409);
    if (candidate.__v !== version) fail('CONCURRENT_MODIFICATION', 'The candidate changed. Reload it before reviewing.', 409);
    if (decision === 'APPROVE' && candidate.validationStatus !== 'VALIDATION_PASSED') {
      fail('CANDIDATE_INVALID', 'Only a valid candidate can be approved.', 409, [{ candidateId: candidate._id, code: 'VALIDATION_REQUIRED' }]);
    }
    const duplicates = candidate.duplicateMetadata || {};
    const needsDuplicateDecision = Boolean(
      duplicates.parser
      || duplicates.sourceRevision?.revisionDetected
      || duplicates.catalogMatches?.length,
    );
    if (decision === 'APPROVE' && needsDuplicateDecision && duplicateDecision !== 'KEEP_SEPARATE') {
      fail('DUPLICATE_DECISION_REQUIRED', 'Review the duplicate annotations and explicitly choose KEEP_SEPARATE before approval.', 409);
    }

    const reviewedAt = new Date();
    const contentHash = decision === 'APPROVE'
      ? vocabularyContentHash(candidateEditorialSnapshot(candidate))
      : null;
    candidate.reviewStatus = decision === 'APPROVE' ? 'REVIEW_APPROVED' : 'REVIEW_REJECTED';
    candidate.reviewedBy = actor;
    candidate.reviewedAt = reviewedAt;
    candidate.reviewedVersion = decision === 'APPROVE' ? version : null;
    candidate.reviewedContentHash = contentHash;
    candidate.rejectionReason = decision === 'REJECT' ? reason.value : '';
    candidate.duplicateDecision = decision === 'APPROVE' ? duplicateDecision : null;
    candidate.publicationStatus = 'NOT_ELIGIBLE';
    await candidate.save({ session });
    await VocabularyImportAudit.create([{
      batchId: batch._id,
      candidateId: candidate._id,
      sourceIdentity: candidate.sourceIdentity,
      actorId: actor,
      action: 'REVIEW_DECISION',
      decision,
      duplicateDecision: candidate.duplicateDecision,
      reason: reason.value,
      occurredAt: reviewedAt,
      details: decision === 'APPROVE' ? { reviewedVersion: version, contentHash } : null,
    }], { session });
    await summarizeBatch(batch, session);
    return candidateResponse(candidate);
  });
}

function validateBulkReviewPayload(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail('INVALID_PAYLOAD', 'Bulk review payload must be an object.');
  const allowed = new Set(['candidateIds', 'approveAll', 'duplicateDecision']);
  if (Object.keys(body).some((key) => !allowed.has(key))) fail('MASS_ASSIGNMENT_REJECTED', 'Bulk review payload contains unsupported fields.');

  const approveAll = body.approveAll === true;
  if (!approveAll && !Array.isArray(body.candidateIds)) {
    fail('CANDIDATE_SELECTION_REQUIRED', 'Select one or more candidates, or explicitly request approveAll.');
  }
  if (approveAll && body.candidateIds !== undefined) {
    fail('INVALID_BULK_SELECTION', 'approveAll cannot be combined with candidateIds.');
  }
  if (!approveAll && (!body.candidateIds.length || body.candidateIds.length > 2500)) {
    fail('INVALID_BULK_SELECTION', 'candidateIds must contain between 1 and 2500 candidates.');
  }
  const candidateIds = approveAll ? [] : body.candidateIds.map((id) => String(requireObjectId(id, 'candidateId')));
  if (!approveAll && new Set(candidateIds).size !== candidateIds.length) fail('INVALID_BULK_SELECTION', 'candidateIds must not contain duplicates.');
  if (body.duplicateDecision !== 'KEEP_SEPARATE') {
    fail('DUPLICATE_DECISION_REQUIRED', 'Bulk approval requires explicit KEEP_SEPARATE for every duplicate annotation.', 409);
  }
  return { approveAll, candidateIds };
}

/**
 * Approves a deliberate selection, or every currently valid reviewable candidate in a batch.
 * This never imports or publishes content. Duplicate candidates are recorded as KEEP_SEPARATE
 * so the bulk action cannot silently merge editorial source occurrences.
 */
export async function approveVocabularyImportCandidates({ batchId, actorId, body }) {
  assertPrototypeDatabase();
  const batchObjectId = requireObjectId(batchId, 'batchId');
  const actor = requireActorId(actorId);
  const selection = validateBulkReviewPayload(body);

  return withTransaction(async (session) => {
    const batch = await VocabularyImportBatch.findById(batchObjectId).session(session);
    if (!batch) fail('BATCH_NOT_FOUND', 'Vocabulary Import Batch was not found.', 404);

    const filter = {
      batchId: batchObjectId,
      validationStatus: 'VALIDATION_PASSED',
      reviewStatus: { $in: ['NEEDS_REVIEW', 'EDITED'] },
      importStatus: { $ne: 'IMPORTED_AS_DRAFT' },
      ...(selection.approveAll ? {} : { _id: { $in: selection.candidateIds.map((id) => new mongoose.Types.ObjectId(id)) } }),
    };
    const candidates = await VocabularyImportCandidate.find(filter).session(session);
    if (!candidates.length) {
      return { batch: batchResponse(batch), approvedCount: 0, skippedCount: selection.approveAll ? 0 : selection.candidateIds.length };
    }

    const reviewedAt = new Date();
    const audits = [];
    for (const candidate of candidates) {
      const version = candidate.__v || 0;
      const contentHash = vocabularyContentHash(candidateEditorialSnapshot(candidate));
      candidate.reviewStatus = 'REVIEW_APPROVED';
      candidate.reviewedBy = actor;
      candidate.reviewedAt = reviewedAt;
      candidate.reviewedVersion = version;
      candidate.reviewedContentHash = contentHash;
      candidate.rejectionReason = '';
      candidate.duplicateDecision = 'KEEP_SEPARATE';
      candidate.publicationStatus = 'NOT_ELIGIBLE';
      await candidate.save({ session });
      audits.push({
        batchId: batch._id,
        candidateId: candidate._id,
        sourceIdentity: candidate.sourceIdentity,
        actorId: actor,
        action: 'REVIEW_DECISION',
        decision: 'APPROVE',
        duplicateDecision: 'KEEP_SEPARATE',
        reason: 'Bulk approval',
        occurredAt: reviewedAt,
        details: { reviewedVersion: version, contentHash, bulk: true },
      });
    }
    // Mongoose requires ordered writes when creating more than one document in a
    // transaction.  Keep the audit trail atomic with the review decision rather
    // than falling back to an untransactional insert.
    await VocabularyImportAudit.create(audits, { session, ordered: true });
    await summarizeBatch(batch, session);
    return {
      batch: batchResponse(batch),
      approvedCount: candidates.length,
      skippedCount: selection.approveAll ? 0 : selection.candidateIds.length - candidates.length,
    };
  });
}

function catalogSenseValues(values) {
  return values.senses.map((sense) => ({
    partOfSpeech: Array.isArray(sense.partOfSpeech) ? sense.partOfSpeech : [],
    rawPartOfSpeech: sense.rawPartOfSpeech || '',
    usagePattern: sense.usagePattern || '',
    meaning: sense.meaning,
    normalizedMeaning: sense.normalizedMeaning || sense.meaning,
    examples: sense.examples.map((example) => ({
      english: example.english || '',
      vietnamese: example.vietnamese || '',
    })),
    notes: Array.isArray(sense.notes) ? sense.notes : [],
    sourceLocators: Array.isArray(sense.sourceLocators) ? sense.sourceLocators : [],
  }));
}

async function getOrCreateTag(candidate, batch, session) {
  const sourceFile = batch.sourceFiles.find((entry) => entry.relativePath === candidate.sourceMetadata.relativePath);
  if (!sourceFile) fail('SOURCE_FILE_NOT_FOUND', 'Candidate source file is missing from its batch.', 409);
  if (sourceFile.draftTagId) {
    const current = await VocabularyTag.findById(sourceFile.draftTagId).session(session);
    if (current) return current;
  }
  const sourceFolder = candidate.sourceMetadata.sourceFolder || candidate.tagCandidate?.collectionCandidate || 'Vocabulary Import';
  const slug = slugify(sourceFolder);
  let tag = await VocabularyTag.findOne({ slug }).session(session);
  if (!tag) {
    tag = await createVocabularyTag({ name: sourceFolder, slug }, { session });
  }
  sourceFile.draftTagId = tag._id;
  batch.markModified('sourceFiles');
  return tag;
}

async function getOrCreateChapter(candidate, batch, tag, session) {
  const sourceFile = batch.sourceFiles.find((entry) => entry.relativePath === candidate.sourceMetadata.relativePath);
  if (!sourceFile) fail('SOURCE_FILE_NOT_FOUND', 'Candidate source file is missing from its batch.', 409);
  if (sourceFile.draftChapterId) {
    const current = await VocabularyChapter.findById(sourceFile.draftChapterId).session(session);
    if (current) return current;
  }
  const title = candidate.sourceMetadata.chapterCandidate || candidate.chapterCandidate?.title || candidate.sourceMetadata.fileName.replace(/\.docx$/i, '');
  let chapter = await VocabularyChapter.findOne({ tagId: tag._id, title, status: 'draft' }).session(session);
  if (!chapter) {
    const numberMatch = title.match(/(?:start|day|chapter|chaper)\s*(\d+)/i);
    chapter = await createVocabularyChapter({
      tagId: tag._id,
      title,
      chapterNumber: numberMatch ? Number(numberMatch[1]) : null,
      sortOrder: numberMatch ? Number(numberMatch[1]) : 0,
    }, { session });
  }
  sourceFile.draftChapterId = chapter._id;
  batch.markModified('sourceFiles');
  return chapter;
}

function requestedCandidateIds(value) {
  if (value === undefined) return null;
  if (!Array.isArray(value) || value.length < 1 || value.length > 2500) fail('INVALID_CANDIDATE_IDS', 'candidateIds must be a non-empty array of at most 2500 ids.');
  const unique = [...new Set(value.map((id) => String(requireObjectId(id, 'candidateId'))))];
  if (unique.length !== value.length) fail('DUPLICATE_CANDIDATE_IDS', 'candidateIds must not contain duplicates.');
  return unique.map((id) => new mongoose.Types.ObjectId(id));
}

export async function confirmVocabularyImportDraft({ batchId, actorId, body }) {
  assertPrototypeDatabase();
  const batchObjectId = requireObjectId(batchId, 'batchId');
  const actor = requireActorId(actorId);
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail('INVALID_PAYLOAD', 'Confirm payload must be an object.');
  const allowed = new Set(['expectedVersion', 'candidateIds']);
  if (Object.keys(body).some((key) => !allowed.has(key))) fail('MASS_ASSIGNMENT_REJECTED', 'Confirm payload contains unsupported fields.');
  const expectedVersion = requireVersion(body.expectedVersion);
  const requestedIds = requestedCandidateIds(body.candidateIds);

  return withTransaction(async (session) => {
    const batch = await VocabularyImportBatch.findById(batchObjectId).session(session);
    if (!batch) fail('BATCH_NOT_FOUND', 'Vocabulary Import Batch was not found.', 404);
    const filter = {
      batchId: batch._id,
      ...(requestedIds ? { _id: { $in: requestedIds } } : { reviewStatus: 'REVIEW_APPROVED' }),
    };
    const candidates = await VocabularyImportCandidate.find(filter)
      .sort({ 'sourceMetadata.relativePath': 1, 'sourceMetadata.sourceOrdinal': 1, _id: 1 })
      .session(session);
    if (requestedIds && candidates.length !== requestedIds.length) {
      fail('CANDIDATE_NOT_FOUND', 'One or more candidate ids do not belong to this batch.', 404);
    }
    if (batch.__v !== expectedVersion) {
      const alreadyImported = candidates.length > 0 && candidates.every((candidate) => candidate.importStatus === 'IMPORTED_AS_DRAFT');
      if (alreadyImported) {
        return {
          batch: batchResponse(batch),
          results: candidates.map((candidate) => ({ candidateId: candidate._id, status: 'IMPORTED_AS_DRAFT', vocabularyId: candidate.importedVocabularyId, chapterId: candidate.importedChapterId, membershipId: candidate.importedMembershipId })),
          rowErrors: [],
          idempotent: true,
        };
      }
      fail('CONCURRENT_MODIFICATION', 'The batch changed. Reload it before confirming.', 409);
    }

    const eligible = [];
    const rowErrors = [];
    for (const candidate of candidates) {
      if (candidate.importStatus === 'IMPORTED_AS_DRAFT') {
        eligible.push(candidate);
        continue;
      }
      const errors = [];
      if (candidate.validationStatus !== 'VALIDATION_PASSED') errors.push({ code: 'VALIDATION_REQUIRED' });
      if (candidate.reviewStatus !== 'REVIEW_APPROVED') errors.push({ code: 'EDITORIAL_APPROVAL_REQUIRED' });
      if (errors.length) rowErrors.push({ candidateId: candidate._id, errors });
      else eligible.push(candidate);
    }
    if (!eligible.length) {
      return { batch: batchResponse(batch), results: [], rowErrors, idempotent: false };
    }

    const catalogMapping = await VocabularyImportCatalogMapping.findOne({ batchId: batch._id }).session(session);

    for (const candidate of eligible) {
      if (candidate.importStatus === 'IMPORTED_AS_DRAFT') continue;
      const values = effectiveValues(candidate);
      const validation = validateCandidateContent(candidate.parsedValues, candidate.editedValues);
      if (validation.status !== 'VALIDATION_PASSED') {
        rowErrors.push({ candidateId: candidate._id, errors: validation.issues });
        continue;
      }
      let tag;
      let chapter;
      if (catalogMapping) {
        const mappedTarget = await confirmBatchSourceMapping({ batch, candidate, session, mapping: catalogMapping });
        tag = mappedTarget.tag;
        chapter = mappedTarget.chapter;
      } else {
        tag = await getOrCreateTag(candidate, batch, session);
        chapter = await getOrCreateChapter(candidate, batch, tag, session);
      }
      const firstSense = values.senses[0];
      const firstExample = firstSense.examples[0] || {};
      const vocabulary = await createCatalogVocabulary({
        word: values.word,
        meaning: firstSense.meaning,
        partOfSpeech: Array.isArray(values.partOfSpeech) ? values.partOfSpeech.join(', ') : '',
        exampleEnglish: firstExample.english || '',
        exampleVietnamese: firstExample.vietnamese || '',
        catalogSenses: catalogSenseValues(values),
        catalogNotes: Array.isArray(values.notes) ? values.notes : [],
        topic: candidate.sourceMetadata.topicCandidate || 'General',
        order: candidate.sourceMetadata.sourceOrdinal,
      }, { session });
      const membership = await addVocabularyToChapter({
        chapterId: chapter._id,
        vocabularyId: vocabulary._id,
        sourceIdentity: candidate.sourceIdentity,
        sortOrder: candidate.sourceMetadata.sourceOrdinal,
        session,
      });

      candidate.importStatus = 'IMPORTED_AS_DRAFT';
      candidate.importedVocabularyId = vocabulary._id;
      candidate.importedChapterId = chapter._id;
      candidate.importedMembershipId = membership._id;
      candidate.publicationStatus = 'NOT_ELIGIBLE';
      await candidate.save({ session });
      await VocabularyImportAudit.create([{
        batchId: batch._id,
        candidateId: candidate._id,
        sourceIdentity: candidate.sourceIdentity,
        actorId: actor,
        action: 'CONFIRMED_DRAFT',
        details: {
          tagId: tag._id,
          chapterId: chapter._id,
          vocabularyId: vocabulary._id,
          membershipId: membership._id,
          reviewedContentHash: candidate.reviewedContentHash,
        },
      }], { session });
    }

    if (catalogMapping && eligible.some((candidate) => candidate.importStatus === 'IMPORTED_AS_DRAFT')) {
      catalogMapping.status = 'LOCKED';
      catalogMapping.lockedAt ||= new Date();
      catalogMapping.lockedBy ||= actor;
      await catalogMapping.save({ session });
    }

    await summarizeBatch(batch, session);
    const results = eligible.map((candidate) => ({
      candidateId: candidate._id,
      status: candidate.importStatus,
      vocabularyId: candidate.importedVocabularyId,
      chapterId: candidate.importedChapterId,
      membershipId: candidate.importedMembershipId,
    }));
    return { batch: batchResponse(batch), results, rowErrors, idempotent: false };
  });
}
