import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import ChapterVocabulary from '../models/ChapterVocabulary.js';
import Vocabulary from '../models/Vocabulary.js';
import VocabularyChapter, { normalizeVocabularyChapterTitle } from '../models/VocabularyChapter.js';
import VocabularyTag from '../models/VocabularyTag.js';
import { archiveVocabularyChapter, archiveVocabularyTag } from './vocabularyPublicationWorkflowPrototype.js';

const MAX_PAGE_SIZE = 100;

export class VocabularyCatalogManagementError extends Error {
  constructor(code, message, { statusCode = 400, details = null } = {}) {
    super(message);
    this.name = 'VocabularyCatalogManagementError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export function assertVocabularyPrototypeDatabase() {
  const connection = mongoose.connection;
  if (connection.readyState !== 1) {
    throw new VocabularyCatalogManagementError(
      'DATABASE_CONNECTION_REQUIRED',
      'Vocabulary catalog management requires an active MongoDB connection.',
      { statusCode: 503 },
    );
  }
}

function requireObjectId(value, field) {
  if (!mongoose.isObjectIdOrHexString(value)) {
    throw new VocabularyCatalogManagementError('INVALID_ID', `${field} must be a valid ObjectId.`);
  }
  return new mongoose.Types.ObjectId(value);
}

function escapeRegex(value) {
  return value.replace(/[.*+?^$()|[\]\\{}]/g, '\\$&');
}

function parsePage(page, limit) {
  const pageNumber = Number(page ?? 1);
  const pageSize = Number(limit ?? 20);
  if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > 1_000_000
    || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
    throw new VocabularyCatalogManagementError('INVALID_PAGINATION', 'Page or limit is outside the supported range.');
  }
  return { page: pageNumber, limit: pageSize, skip: (pageNumber - 1) * pageSize };
}

function requireVersion(value) {
  const version = Number(value);
  if (!Number.isInteger(version) || version < 0) {
    throw new VocabularyCatalogManagementError('EXPECTED_VERSION_REQUIRED', 'expectedVersion must be a non-negative integer.');
  }
  return version;
}

function normalizeName(value, field, max = 120) {
  if (typeof value !== 'string') throw new VocabularyCatalogManagementError('INVALID_PAYLOAD', `${field} must be a string.`);
  const normalized = value.normalize('NFKC').trim().replace(/\s+/g, ' ');
  if (!normalized || normalized.length > max) {
    throw new VocabularyCatalogManagementError('INVALID_PAYLOAD', `${field} must contain 1 to ${max} characters.`);
  }
  return normalized;
}

function normalizeDescription(value) {
  if (typeof value !== 'string') throw new VocabularyCatalogManagementError('INVALID_PAYLOAD', 'description must be a string.');
  const description = value.normalize('NFKC').trim();
  if (description.length > 2000) throw new VocabularyCatalogManagementError('INVALID_PAYLOAD', 'description must be at most 2000 characters.');
  return description;
}

function normalizeSlug(value) {
  if (typeof value !== 'string') throw new VocabularyCatalogManagementError('INVALID_PAYLOAD', 'slug must be a string.');
  const slug = value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd')
    .trim().toLocaleLowerCase('en').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (!slug || slug.length > 120 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new VocabularyCatalogManagementError('INVALID_SLUG', 'Slug must contain lowercase letters, numbers, and single hyphens.');
  }
  return slug;
}

function requireSortOrder(value, field = 'sortOrder') {
  if (!Number.isInteger(Number(value)) || Number(value) < 0 || Number(value) > 1_000_000) {
    throw new VocabularyCatalogManagementError('INVALID_SORT_ORDER', `${field} must be a non-negative integer.`);
  }
  return Number(value);
}

function requireChapterNumber(value) {
  if (value === null || value === '' || value === undefined) return null;
  if (!Number.isInteger(Number(value)) || Number(value) < 1 || Number(value) > 100_000) {
    throw new VocabularyCatalogManagementError('INVALID_CHAPTER_NUMBER', 'chapterNumber must be a positive integer or empty.');
  }
  return Number(value);
}

function asTagSummary(tag, counts = {}) {
  return {
    _id: String(tag._id),
    name: tag.name,
    slug: tag.slug,
    description: tag.description || '',
    sortOrder: tag.sortOrder,
    status: tag.status,
    version: tag.__v || 0,
    chapterCount: counts.chapterCount || 0,
    vocabularyCount: counts.vocabularyCount || 0,
    createdAt: tag.createdAt,
    updatedAt: tag.updatedAt,
  };
}

function asChapterSummary(chapter, vocabularyCount = 0) {
  return {
    _id: String(chapter._id),
    tagId: String(chapter.tagId),
    title: chapter.title,
    description: chapter.description || '',
    chapterNumber: chapter.chapterNumber ?? null,
    sortOrder: chapter.sortOrder,
    status: chapter.status,
    version: chapter.__v || 0,
    vocabularyCount,
    createdAt: chapter.createdAt,
    updatedAt: chapter.updatedAt,
  };
}

async function tagCounts(tagIds) {
  if (!tagIds.length) return new Map();
  const rows = await VocabularyChapter.aggregate([
    { $match: { tagId: { $in: tagIds } } },
    { $lookup: {
      from: ChapterVocabulary.collection.name,
      localField: '_id',
      foreignField: 'chapterId',
      as: 'memberships',
    } },
    { $group: {
      _id: '$tagId',
      chapterCount: { $sum: 1 },
      vocabularyCount: { $sum: { $size: '$memberships' } },
    } },
  ]);
  return new Map(rows.map((row) => [String(row._id), row]));
}

async function chapterCounts(chapterIds) {
  if (!chapterIds.length) return new Map();
  const rows = await ChapterVocabulary.aggregate([
    { $match: { chapterId: { $in: chapterIds } } },
    { $group: { _id: '$chapterId', count: { $sum: 1 } } },
  ]);
  return new Map(rows.map((row) => [String(row._id), row.count]));
}

function duplicateSlugError(error) {
  if (error?.code === 11000 && error?.keyPattern?.slug) {
    return new VocabularyCatalogManagementError('SLUG_ALREADY_EXISTS', 'A Tag with this slug already exists.', { statusCode: 409 });
  }
  return error;
}

function duplicateChapterError(error) {
  if (error?.code === 11000 && error?.keyPattern?.normalizedTitle) {
    return new VocabularyCatalogManagementError(
      'CHAPTER_TITLE_ALREADY_EXISTS',
      'A Chapter with the same normalized title already exists in this Tag. Choose that Chapter explicitly or use a different title.',
      { statusCode: 409 },
    );
  }
  return error;
}

async function resolveChapterTitleConflict(tagId, title, ignoreId = null) {
  const normalizedTitle = normalizeVocabularyChapterTitle(title);
  const query = VocabularyChapter.findOne({
    tagId,
    normalizedTitle,
    ...(ignoreId ? { _id: { $ne: ignoreId } } : {}),
  }).select('_id title chapterNumber status');
  const existing = await query;
  if (existing) {
    throw new VocabularyCatalogManagementError(
      'CHAPTER_TITLE_ALREADY_EXISTS',
      'A Chapter with the same normalized title already exists in this Tag. Choose that Chapter explicitly or use a different title.',
      { statusCode: 409, details: { existingChapter: { _id: String(existing._id), title: existing.title, chapterNumber: existing.chapterNumber, status: existing.status } } },
    );
  }
}

async function loadTag(id) {
  const tag = await VocabularyTag.findById(requireObjectId(id, 'tagId'));
  if (!tag) throw new VocabularyCatalogManagementError('TAG_NOT_FOUND', 'Vocabulary Tag was not found.', { statusCode: 404 });
  return tag;
}

async function loadChapter(id) {
  const chapter = await VocabularyChapter.findById(requireObjectId(id, 'chapterId'));
  if (!chapter) throw new VocabularyCatalogManagementError('CHAPTER_NOT_FOUND', 'Vocabulary Chapter was not found.', { statusCode: 404 });
  return chapter;
}

async function requireWritableTag(tagId) {
  const tag = await loadTag(tagId);
  if (tag.status === 'archived') {
    throw new VocabularyCatalogManagementError('TAG_ARCHIVED', 'An archived Tag cannot receive Chapters or import mappings.', { statusCode: 409 });
  }
  return tag;
}

async function bumpChapterVersion(chapter, expectedVersion, session) {
  const version = requireVersion(expectedVersion);
  if ((chapter.__v || 0) !== version) {
    throw new VocabularyCatalogManagementError('CONCURRENT_MODIFICATION', 'The Chapter changed. Reload it before saving.', { statusCode: 409 });
  }
  const result = await VocabularyChapter.updateOne(
    { _id: chapter._id, __v: version },
    { $inc: { __v: 1 }, $set: { updatedAt: new Date() } },
    { session },
  );
  if (result.modifiedCount !== 1) {
    throw new VocabularyCatalogManagementError('CONCURRENT_MODIFICATION', 'The Chapter changed. Reload it before saving.', { statusCode: 409 });
  }
}

async function withTransaction(work) {
  const session = await mongoose.startSession();
  let value;
  try {
    await session.withTransaction(async () => { value = await work(session); });
    return value;
  } catch (error) {
    if (error?.name === 'VersionError') {
      throw new VocabularyCatalogManagementError('CONCURRENT_MODIFICATION', 'The record changed. Reload it before saving.', { statusCode: 409 });
    }
    if (error?.code === 11000) throw duplicateChapterError(error);
    throw error;
  } finally {
    await session.endSession();
  }
}

export async function listVocabularyTags({ search = '', status = '', page = 1, limit = 20 } = {}) {
  assertVocabularyPrototypeDatabase();
  const pagination = parsePage(page, limit);
  if (typeof search !== 'string' || search.length > 80) throw new VocabularyCatalogManagementError('INVALID_SEARCH', 'Search must be at most 80 characters.');
  if (status && !['draft', 'published', 'archived'].includes(status)) throw new VocabularyCatalogManagementError('INVALID_STATUS', 'Unsupported Tag status.');
  const filter = {
    ...(status ? { status } : {}),
    ...(search.trim() ? { $or: [
      { name: { $regex: escapeRegex(search.trim()), $options: 'i' } },
      { slug: { $regex: escapeRegex(search.trim()), $options: 'i' } },
    ] } : {}),
  };
  const [tags, total] = await Promise.all([
    VocabularyTag.find(filter).sort({ sortOrder: 1, _id: 1 }).skip(pagination.skip).limit(pagination.limit),
    VocabularyTag.countDocuments(filter),
  ]);
  const counts = await tagCounts(tags.map((tag) => tag._id));
  return {
    items: tags.map((tag) => asTagSummary(tag, counts.get(String(tag._id)))),
    pagination: { page: pagination.page, limit: pagination.limit, total, pages: Math.ceil(total / pagination.limit) || 1 },
  };
}

export async function getVocabularyTag(tagId) {
  assertVocabularyPrototypeDatabase();
  const tag = await loadTag(tagId);
  const counts = await tagCounts([tag._id]);
  return asTagSummary(tag, counts.get(String(tag._id)));
}

export async function createManagedVocabularyTag(body) {
  assertVocabularyPrototypeDatabase();
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new VocabularyCatalogManagementError('INVALID_PAYLOAD', 'Tag payload must be an object.');
  const allowed = new Set(['name', 'slug', 'description', 'sortOrder']);
  if (Object.keys(body).some((key) => !allowed.has(key))) throw new VocabularyCatalogManagementError('MASS_ASSIGNMENT_REJECTED', 'Tag payload contains unsupported fields.');
  const description = body.description === undefined ? '' : normalizeDescription(body.description);
  try {
    const [tag] = await VocabularyTag.create([{
      name: normalizeName(body.name, 'name'),
      slug: normalizeSlug(body.slug),
      description,
      sortOrder: requireSortOrder(body.sortOrder ?? 0),
      status: 'draft',
    }]);
    return asTagSummary(tag);
  } catch (error) {
    throw duplicateSlugError(error);
  }
}

export async function updateManagedVocabularyTag(tagId, body) {
  assertVocabularyPrototypeDatabase();
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new VocabularyCatalogManagementError('INVALID_PAYLOAD', 'Tag payload must be an object.');
  const allowed = new Set(['expectedVersion', 'name', 'slug', 'description', 'sortOrder']);
  if (Object.keys(body).some((key) => !allowed.has(key))) throw new VocabularyCatalogManagementError('MASS_ASSIGNMENT_REJECTED', 'Tag payload contains unsupported fields.');
  const tag = await loadTag(tagId);
  const version = requireVersion(body.expectedVersion);
  if ((tag.__v || 0) !== version) throw new VocabularyCatalogManagementError('CONCURRENT_MODIFICATION', 'The Tag changed. Reload it before saving.', { statusCode: 409 });
  if (tag.status === 'archived') throw new VocabularyCatalogManagementError('TAG_ARCHIVED', 'Archived Tags cannot be edited.', { statusCode: 409 });
  if (tag.status === 'published') throw new VocabularyCatalogManagementError('PUBLISHED_ENTITY_IMMUTABLE', 'Published Tags cannot be edited. Archive and replace the content through a reviewed workflow.', { statusCode: 409 });
  if (Object.hasOwn(body, 'name')) tag.name = normalizeName(body.name, 'name');
  if (Object.hasOwn(body, 'slug')) tag.slug = normalizeSlug(body.slug);
  if (Object.hasOwn(body, 'description')) tag.description = normalizeDescription(body.description);
  if (Object.hasOwn(body, 'sortOrder')) tag.sortOrder = requireSortOrder(body.sortOrder);
  try {
    await tag.save();
    return asTagSummary(tag);
  } catch (error) {
    if (error?.name === 'VersionError') throw new VocabularyCatalogManagementError('CONCURRENT_MODIFICATION', 'The Tag changed. Reload it before saving.', { statusCode: 409 });
    throw duplicateSlugError(error);
  }
}

export async function archiveManagedVocabularyTag(tagId, body, actorId = null) {
  assertVocabularyPrototypeDatabase();
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some((key) => key !== 'expectedVersion')) {
    throw new VocabularyCatalogManagementError('MASS_ASSIGNMENT_REJECTED', 'Archive payload only accepts expectedVersion.');
  }
  const tag = await loadTag(tagId);
  const version = requireVersion(body.expectedVersion);
  if ((tag.__v || 0) !== version) throw new VocabularyCatalogManagementError('CONCURRENT_MODIFICATION', 'The Tag changed. Reload it before archiving.', { statusCode: 409 });
  if (actorId) {
    await archiveVocabularyTag(tagId, actorId, { expectedVersion: version, idempotencyKey: `v4a-archive-tag-${randomUUID()}` });
    const archivedTag = await loadTag(tagId);
    const archivedCounts = await tagCounts([archivedTag._id]);
    return asTagSummary(archivedTag, archivedCounts.get(String(archivedTag._id)));
  }
  if (tag.status !== 'archived') {
    tag.status = 'archived';
    try { await tag.save(); } catch (error) {
      if (error?.name === 'VersionError') throw new VocabularyCatalogManagementError('CONCURRENT_MODIFICATION', 'The Tag changed. Reload it before archiving.', { statusCode: 409 });
      throw error;
    }
  }
  const counts = await tagCounts([tag._id]);
  return asTagSummary(tag, counts.get(String(tag._id)));
}

export async function listManagedVocabularyChapters(tagId, { search = '', status = '', page = 1, limit = 20 } = {}) {
  assertVocabularyPrototypeDatabase();
  const tagObjectId = requireObjectId(tagId, 'tagId');
  await loadTag(tagObjectId);
  const pagination = parsePage(page, limit);
  if (typeof search !== 'string' || search.length > 80) throw new VocabularyCatalogManagementError('INVALID_SEARCH', 'Search must be at most 80 characters.');
  if (status && !['draft', 'published', 'archived'].includes(status)) throw new VocabularyCatalogManagementError('INVALID_STATUS', 'Unsupported Chapter status.');
  const filter = {
    tagId: tagObjectId,
    ...(status ? { status } : {}),
    ...(search.trim() ? { $or: [
      { title: { $regex: escapeRegex(search.trim()), $options: 'i' } },
      { description: { $regex: escapeRegex(search.trim()), $options: 'i' } },
    ] } : {}),
  };
  const [chapters, total] = await Promise.all([
    VocabularyChapter.find(filter).sort({ sortOrder: 1, chapterNumber: 1, _id: 1 }).skip(pagination.skip).limit(pagination.limit),
    VocabularyChapter.countDocuments(filter),
  ]);
  const counts = await chapterCounts(chapters.map((chapter) => chapter._id));
  return {
    items: chapters.map((chapter) => asChapterSummary(chapter, counts.get(String(chapter._id)))),
    pagination: { page: pagination.page, limit: pagination.limit, total, pages: Math.ceil(total / pagination.limit) || 1 },
  };
}

export async function getManagedVocabularyChapter(chapterId) {
  assertVocabularyPrototypeDatabase();
  const chapter = await loadChapter(chapterId);
  const counts = await chapterCounts([chapter._id]);
  return asChapterSummary(chapter, counts.get(String(chapter._id)));
}

export async function createManagedVocabularyChapter(tagId, body) {
  assertVocabularyPrototypeDatabase();
  const tag = await requireWritableTag(tagId);
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new VocabularyCatalogManagementError('INVALID_PAYLOAD', 'Chapter payload must be an object.');
  const allowed = new Set(['title', 'description', 'chapterNumber', 'sortOrder']);
  if (Object.keys(body).some((key) => !allowed.has(key))) throw new VocabularyCatalogManagementError('MASS_ASSIGNMENT_REJECTED', 'Chapter payload contains unsupported fields.');
  const title = normalizeName(body.title, 'title');
  await resolveChapterTitleConflict(tag._id, title);
  try {
    const [chapter] = await VocabularyChapter.create([{
      tagId: tag._id,
      title,
      description: body.description === undefined ? '' : normalizeDescription(body.description),
      chapterNumber: requireChapterNumber(body.chapterNumber),
      sortOrder: requireSortOrder(body.sortOrder ?? 0),
      status: 'draft',
    }]);
    return asChapterSummary(chapter);
  } catch (error) {
    throw duplicateChapterError(error);
  }
}

export async function updateManagedVocabularyChapter(chapterId, body) {
  assertVocabularyPrototypeDatabase();
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new VocabularyCatalogManagementError('INVALID_PAYLOAD', 'Chapter payload must be an object.');
  const allowed = new Set(['expectedVersion', 'tagId', 'title', 'description', 'chapterNumber', 'sortOrder']);
  if (Object.keys(body).some((key) => !allowed.has(key))) throw new VocabularyCatalogManagementError('MASS_ASSIGNMENT_REJECTED', 'Chapter payload contains unsupported fields.');
  const chapter = await loadChapter(chapterId);
  const version = requireVersion(body.expectedVersion);
  if ((chapter.__v || 0) !== version) throw new VocabularyCatalogManagementError('CONCURRENT_MODIFICATION', 'The Chapter changed. Reload it before saving.', { statusCode: 409 });
  if (chapter.status === 'archived') throw new VocabularyCatalogManagementError('CHAPTER_ARCHIVED', 'Archived Chapters cannot be edited.', { statusCode: 409 });
  if (chapter.status === 'published') throw new VocabularyCatalogManagementError('PUBLISHED_ENTITY_IMMUTABLE', 'Published Chapters cannot be edited. Archive and replace the content through a reviewed workflow.', { statusCode: 409 });
  let targetTag = null;
  if (Object.hasOwn(body, 'tagId')) {
    targetTag = await requireWritableTag(body.tagId);
    chapter.tagId = targetTag._id;
  }
  if (Object.hasOwn(body, 'title')) chapter.title = normalizeName(body.title, 'title');
  if (Object.hasOwn(body, 'description')) chapter.description = normalizeDescription(body.description);
  if (Object.hasOwn(body, 'chapterNumber')) chapter.chapterNumber = requireChapterNumber(body.chapterNumber);
  if (Object.hasOwn(body, 'sortOrder')) chapter.sortOrder = requireSortOrder(body.sortOrder);
  if (chapter.isModified('title') || chapter.isModified('tagId')) await resolveChapterTitleConflict(chapter.tagId, chapter.title, chapter._id);
  try {
    await chapter.save();
    const counts = await chapterCounts([chapter._id]);
    return asChapterSummary(chapter, counts.get(String(chapter._id)));
  } catch (error) {
    if (error?.name === 'VersionError') throw new VocabularyCatalogManagementError('CONCURRENT_MODIFICATION', 'The Chapter changed. Reload it before saving.', { statusCode: 409 });
    throw duplicateChapterError(error);
  }
}

export async function archiveManagedVocabularyChapter(chapterId, body, actorId = null) {
  assertVocabularyPrototypeDatabase();
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some((key) => key !== 'expectedVersion')) {
    throw new VocabularyCatalogManagementError('MASS_ASSIGNMENT_REJECTED', 'Archive payload only accepts expectedVersion.');
  }
  const chapter = await loadChapter(chapterId);
  const version = requireVersion(body.expectedVersion);
  if ((chapter.__v || 0) !== version) throw new VocabularyCatalogManagementError('CONCURRENT_MODIFICATION', 'The Chapter changed. Reload it before archiving.', { statusCode: 409 });
  if (actorId) {
    await archiveVocabularyChapter(chapterId, actorId, { expectedVersion: version, idempotencyKey: `v4a-archive-chapter-${randomUUID()}` });
    const archivedChapter = await loadChapter(chapterId);
    const archivedCounts = await chapterCounts([archivedChapter._id]);
    return asChapterSummary(archivedChapter, archivedCounts.get(String(archivedChapter._id)));
  }
  if (chapter.status !== 'archived') {
    chapter.status = 'archived';
    try { await chapter.save(); } catch (error) {
      if (error?.name === 'VersionError') throw new VocabularyCatalogManagementError('CONCURRENT_MODIFICATION', 'The Chapter changed. Reload it before archiving.', { statusCode: 409 });
      throw error;
    }
  }
  const counts = await chapterCounts([chapter._id]);
  return asChapterSummary(chapter, counts.get(String(chapter._id)));
}

export async function listCatalogVocabularyOptions({ search = '', page = 1, limit = 20 } = {}) {
  assertVocabularyPrototypeDatabase();
  const pagination = parsePage(page, limit);
  if (typeof search !== 'string' || search.length > 80) throw new VocabularyCatalogManagementError('INVALID_SEARCH', 'Search must be at most 80 characters.');
  const filter = {
    catalogOnly: true,
    catalogStatus: { $ne: 'archived' },
    ...(search.trim() ? { $or: [
      { word: { $regex: escapeRegex(search.trim()), $options: 'i' } },
      { meaning: { $regex: escapeRegex(search.trim()), $options: 'i' } },
    ] } : {}),
  };
  const [vocabulary, total] = await Promise.all([
    Vocabulary.find(filter).select('_id word meaning partOfSpeech catalogStatus').sort({ word: 1, _id: 1 }).skip(pagination.skip).limit(pagination.limit),
    Vocabulary.countDocuments(filter),
  ]);
  return {
    items: vocabulary.map((item) => ({ _id: String(item._id), word: item.word, meaning: item.meaning, partOfSpeech: item.partOfSpeech, catalogStatus: item.catalogStatus })),
    pagination: { page: pagination.page, limit: pagination.limit, total, pages: Math.ceil(total / pagination.limit) || 1 },
  };
}

export async function listChapterMemberships(chapterId, { search = '', page = 1, limit = 50 } = {}) {
  assertVocabularyPrototypeDatabase();
  const chapter = await loadChapter(chapterId);
  const pagination = parsePage(page, limit);
  if (typeof search !== 'string' || search.length > 80) throw new VocabularyCatalogManagementError('INVALID_SEARCH', 'Search must be at most 80 characters.');
  const pipeline = [
    { $match: { chapterId: chapter._id } },
    { $lookup: { from: Vocabulary.collection.name, localField: 'vocabularyId', foreignField: '_id', as: 'vocabulary' } },
    { $unwind: '$vocabulary' },
    { $match: {
      'vocabulary.catalogOnly': true,
      'vocabulary.catalogStatus': { $ne: 'archived' },
      ...(search.trim() ? { $or: [
        { 'vocabulary.word': { $regex: escapeRegex(search.trim()), $options: 'i' } },
        { 'vocabulary.meaning': { $regex: escapeRegex(search.trim()), $options: 'i' } },
      ] } : {}),
    } },
    { $sort: { sortOrder: 1, _id: 1 } },
    { $facet: {
      items: [
        { $skip: pagination.skip },
        { $limit: pagination.limit },
        { $project: {
          _id: 1,
          chapterId: 1,
          vocabularyId: 1,
          sortOrder: 1,
          version: '$__v',
          vocabulary: {
            _id: '$vocabulary._id',
            word: '$vocabulary.word',
            meaning: '$vocabulary.meaning',
            partOfSpeech: '$vocabulary.partOfSpeech',
            catalogStatus: '$vocabulary.catalogStatus',
          },
        } },
      ],
      total: [{ $count: 'count' }],
    } },
  ];
  const [result = { items: [], total: [] }] = await ChapterVocabulary.aggregate(pipeline);
  return {
    chapter: asChapterSummary(chapter, result.total[0]?.count || 0),
    items: result.items.map((item) => ({
      _id: String(item._id), chapterId: String(item.chapterId), vocabularyId: String(item.vocabularyId),
      sortOrder: item.sortOrder, version: item.version || 0,
      vocabulary: { ...item.vocabulary, _id: String(item.vocabulary._id) },
    })),
    pagination: {
      page: pagination.page, limit: pagination.limit, total: result.total[0]?.count || 0,
      pages: Math.ceil((result.total[0]?.count || 0) / pagination.limit) || 1,
    },
  };
}

export async function addCatalogVocabularyMembership(chapterId, body) {
  assertVocabularyPrototypeDatabase();
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some((key) => !['vocabularyId', 'expectedVersion'].includes(key))) {
    throw new VocabularyCatalogManagementError('MASS_ASSIGNMENT_REJECTED', 'Membership payload only accepts vocabularyId and expectedVersion.');
  }
  const chapterObjectId = requireObjectId(chapterId, 'chapterId');
  const vocabularyObjectId = requireObjectId(body.vocabularyId, 'vocabularyId');
  return withTransaction(async (session) => {
    const chapter = await VocabularyChapter.findById(chapterObjectId).session(session);
    if (!chapter) throw new VocabularyCatalogManagementError('CHAPTER_NOT_FOUND', 'Vocabulary Chapter was not found.', { statusCode: 404 });
    if (chapter.status === 'archived') throw new VocabularyCatalogManagementError('CHAPTER_ARCHIVED', 'Archived Chapters cannot receive memberships.', { statusCode: 409 });
    const tag = await VocabularyTag.findById(chapter.tagId).session(session);
    if (!tag || tag.status === 'archived') throw new VocabularyCatalogManagementError('TAG_ARCHIVED', 'An archived or missing Tag cannot receive memberships.', { statusCode: 409 });
    const vocabulary = await Vocabulary.findOne({ _id: vocabularyObjectId, catalogOnly: true, catalogStatus: { $ne: 'archived' } }).select('_id').session(session);
    if (!vocabulary) throw new VocabularyCatalogManagementError('CATALOG_VOCABULARY_NOT_FOUND', 'An active Catalog Vocabulary was not found.', { statusCode: 404 });
    const existing = await ChapterVocabulary.findOne({ chapterId: chapterObjectId, vocabularyId: vocabularyObjectId }).session(session);
    if (existing) throw new VocabularyCatalogManagementError('MEMBERSHIP_ALREADY_EXISTS', 'This Vocabulary already belongs to the Chapter.', { statusCode: 409 });
    const currentVersion = requireVersion(body.expectedVersion);
    await bumpChapterVersion(chapter, currentVersion, session);
    const last = await ChapterVocabulary.findOne({ chapterId: chapterObjectId }).sort({ sortOrder: -1, _id: -1 }).select('sortOrder').session(session);
    const sortOrder = last ? last.sortOrder + 10 : 10;
    let membership;
    try {
      [membership] = await ChapterVocabulary.create([{ chapterId: chapterObjectId, vocabularyId: vocabularyObjectId, sortOrder }], { session });
    } catch (error) {
      if (error?.code === 11000) throw new VocabularyCatalogManagementError('MEMBERSHIP_ALREADY_EXISTS', 'This Vocabulary already belongs to the Chapter.', { statusCode: 409 });
      throw error;
    }
    const updatedChapter = await VocabularyChapter.findById(chapterObjectId).session(session);
    return { membershipId: String(membership._id), chapter: asChapterSummary(updatedChapter), sortOrder };
  });
}

export async function reorderChapterMemberships(chapterId, body) {
  assertVocabularyPrototypeDatabase();
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some((key) => !['membershipIds', 'expectedVersion'].includes(key))) {
    throw new VocabularyCatalogManagementError('MASS_ASSIGNMENT_REJECTED', 'Reorder payload only accepts membershipIds and expectedVersion.');
  }
  const chapterObjectId = requireObjectId(chapterId, 'chapterId');
  if (!Array.isArray(body.membershipIds) || body.membershipIds.length > 2500) throw new VocabularyCatalogManagementError('INVALID_MEMBERSHIP_ORDER', 'membershipIds must be an array with at most 2500 entries.');
  const orderedIds = body.membershipIds.map((id) => String(requireObjectId(id, 'membershipId')));
  if (new Set(orderedIds).size !== orderedIds.length) throw new VocabularyCatalogManagementError('DUPLICATE_MEMBERSHIP_ID', 'membershipIds must not contain duplicates.');
  return withTransaction(async (session) => {
    const chapter = await VocabularyChapter.findById(chapterObjectId).session(session);
    if (!chapter) throw new VocabularyCatalogManagementError('CHAPTER_NOT_FOUND', 'Vocabulary Chapter was not found.', { statusCode: 404 });
    if (chapter.status === 'archived') throw new VocabularyCatalogManagementError('CHAPTER_ARCHIVED', 'Archived Chapters cannot be reordered.', { statusCode: 409 });
    const current = await ChapterVocabulary.find({ chapterId: chapterObjectId }).sort({ sortOrder: 1, _id: 1 }).select('_id').session(session);
    const currentIds = current.map((item) => String(item._id));
    if (currentIds.length !== orderedIds.length || currentIds.some((id) => !orderedIds.includes(id))) {
      throw new VocabularyCatalogManagementError('MEMBERSHIP_SET_CHANGED', 'Reload the Chapter before changing its order.', { statusCode: 409 });
    }
    await bumpChapterVersion(chapter, body.expectedVersion, session);
    if (orderedIds.length) {
      await ChapterVocabulary.bulkWrite(orderedIds.map((id, index) => ({
        updateOne: { filter: { _id: new mongoose.Types.ObjectId(id), chapterId: chapterObjectId }, update: { $set: { sortOrder: (index + 1) * 10 } } },
      })), { session, ordered: true });
    }
    const updatedChapter = await VocabularyChapter.findById(chapterObjectId).session(session);
    return asChapterSummary(updatedChapter, orderedIds.length);
  });
}

export const vocabularyCatalogManagementInternals = Object.freeze({ normalizeSlug, normalizeChapterTitle: normalizeVocabularyChapterTitle });
