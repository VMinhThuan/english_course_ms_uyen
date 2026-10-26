import mongoose from 'mongoose';
import ChapterVocabulary from '../models/ChapterVocabulary.js';
import Vocabulary from '../models/Vocabulary.js';
import VocabularyChapter from '../models/VocabularyChapter.js';
import VocabularyImportAudit from '../models/VocabularyImportAudit.js';
import VocabularyImportBatch from '../models/VocabularyImportBatch.js';
import VocabularyImportCandidate from '../models/VocabularyImportCandidate.js';
import VocabularyTag from '../models/VocabularyTag.js';

const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 20;

export class StudentVocabularyCatalogError extends Error {
  constructor(code, message, { statusCode = 400 } = {}) {
    super(message);
    this.name = 'StudentVocabularyCatalogError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

function fail(code, message, statusCode = 400) {
  throw new StudentVocabularyCatalogError(code, message, { statusCode });
}

export function assertStudentCatalogPrototypeDatabase() {
  const connection = mongoose.connection;
  if (connection.readyState !== 1) {
    fail('DATABASE_CONNECTION_REQUIRED', 'Student Vocabulary Catalog requires an active MongoDB connection.', 503);
  }
}

function objectId(value, field) {
  if (!mongoose.isObjectIdOrHexString(value)) fail('INVALID_ID', `${field} must be a valid ObjectId.`);
  return new mongoose.Types.ObjectId(value);
}

function pagination(page, limit) {
  const pageNumber = Number(page ?? 1);
  const pageSize = Number(limit ?? DEFAULT_PAGE_SIZE);
  if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > 1_000_000
    || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
    fail('INVALID_PAGINATION', `page must be positive and limit must be between 1 and ${MAX_PAGE_SIZE}.`);
  }
  return { page: pageNumber, limit: pageSize, skip: (pageNumber - 1) * pageSize };
}

function searchText(value) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string' || value.length > 80) fail('INVALID_SEARCH', 'Search must be at most 80 characters.');
  return value.trim();
}

function escapedRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function safeText(value, maxLength = 4000) {
  return typeof value === 'string' ? value.slice(0, maxLength) : '';
}

function safeTextList(value, { limit = 30, maxLength = 1000 } = {}) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, limit).map((item) => safeText(item, maxLength)).filter(Boolean);
}

function vocabularyDto(row) {
  const catalogSenses = Array.isArray(row.catalogSenses) ? row.catalogSenses.slice(0, 40).map((sense) => ({
    partOfSpeech: safeTextList(sense?.partOfSpeech, { limit: 12, maxLength: 80 }),
    usagePattern: safeText(sense?.usagePattern, 500),
    meaning: safeText(sense?.meaning),
    examples: Array.isArray(sense?.examples) ? sense.examples.slice(0, 20).map((example) => ({
      english: safeText(example?.english, 2000),
      vietnamese: safeText(example?.vietnamese, 2000),
    })) : [],
    notes: safeTextList(sense?.notes, { limit: 20, maxLength: 1000 }),
  })) : [];
  return {
    _id: String(row._id),
    word: safeText(row.word, 300),
    partOfSpeech: safeText(row.partOfSpeech, 300),
    meaning: safeText(row.meaning),
    exampleEnglish: safeText(row.exampleEnglish || row.example, 2000),
    exampleVietnamese: safeText(row.exampleVietnamese, 2000),
    catalogSenses,
    catalogNotes: safeTextList(row.catalogNotes, { limit: 30, maxLength: 1000 }),
    sortOrder: Number.isFinite(Number(row.sortOrder)) ? Number(row.sortOrder) : 0,
  };
}

function tagDto(tag, counts = {}) {
  return {
    _id: String(tag._id),
    name: safeText(tag.name, 120),
    slug: safeText(tag.slug, 120),
    description: safeText(tag.description, 2000),
    sortOrder: tag.sortOrder || 0,
    chapterCount: counts.chapterCount || 0,
    vocabularyCount: counts.vocabularyCount || 0,
    access: 'AVAILABLE',
  };
}

function chapterDto(chapter, tag, vocabularyCount = 0) {
  return {
    _id: String(chapter._id),
    tagId: String(tag._id),
    tagName: safeText(tag.name, 120),
    title: safeText(chapter.title, 120),
    description: safeText(chapter.description, 2000),
    chapterNumber: chapter.chapterNumber ?? null,
    sortOrder: chapter.sortOrder || 0,
    vocabularyCount,
    access: 'AVAILABLE',
  };
}

function eligibleMembershipStages() {
  return [
    { $match: { sourceIdentity: { $type: 'string', $ne: '' } } },
    {
      $lookup: {
        from: Vocabulary.collection.name,
        localField: 'vocabularyId',
        foreignField: '_id',
        as: '_catalogVocabulary',
      },
    },
    { $unwind: '$_catalogVocabulary' },
    { $match: { '_catalogVocabulary.catalogOnly': true, '_catalogVocabulary.catalogStatus': 'published' } },
    {
      $lookup: {
        from: VocabularyImportCandidate.collection.name,
        let: {
          sourceIdentity: '$sourceIdentity',
          membershipId: '$_id',
          chapterId: '$chapterId',
          vocabularyId: '$vocabularyId',
        },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$sourceIdentity', '$$sourceIdentity'] },
                  { $eq: ['$reviewStatus', 'REVIEW_APPROVED'] },
                  { $eq: ['$importStatus', 'IMPORTED_AS_DRAFT'] },
                  { $eq: ['$importedMembershipId', '$$membershipId'] },
                  { $eq: ['$importedChapterId', '$$chapterId'] },
                  { $eq: ['$importedVocabularyId', '$$vocabularyId'] },
                  { $ne: [{ $ifNull: ['$reviewedBy', null] }, null] },
                  { $ne: [{ $ifNull: ['$reviewedAt', null] }, null] },
                ],
              },
            },
          },
          {
            $lookup: {
              from: VocabularyImportBatch.collection.name,
              localField: 'batchId',
              foreignField: '_id',
              pipeline: [{ $project: { _id: 1 } }, { $limit: 1 }],
              as: '_batchEvidence',
            },
          },
          { $match: { $expr: { $gt: [{ $size: '$_batchEvidence' }, 0] } } },
          {
            $lookup: {
              from: VocabularyImportAudit.collection.name,
              let: {
                candidateId: '$_id',
                batchId: '$batchId',
                sourceIdentity: '$sourceIdentity',
                reviewerId: '$reviewedBy',
              },
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $and: [
                        { $eq: ['$candidateId', '$$candidateId'] },
                        { $eq: ['$batchId', '$$batchId'] },
                        { $eq: ['$sourceIdentity', '$$sourceIdentity'] },
                        { $eq: ['$actorId', '$$reviewerId'] },
                        { $eq: ['$action', 'REVIEW_DECISION'] },
                        { $eq: ['$decision', 'APPROVE'] },
                        { $ne: [{ $ifNull: ['$occurredAt', null] }, null] },
                      ],
                    },
                  },
                },
                { $limit: 1 },
                { $project: { _id: 1 } },
              ],
              as: '_reviewAuditEvidence',
            },
          },
          { $match: { $expr: { $gt: [{ $size: '$_reviewAuditEvidence' }, 0] } } },
          {
            $lookup: {
              from: VocabularyImportAudit.collection.name,
              let: {
                candidateId: '$_id',
                batchId: '$batchId',
                sourceIdentity: '$sourceIdentity',
                membershipId: '$$membershipId',
                chapterId: '$$chapterId',
                vocabularyId: '$$vocabularyId',
              },
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $and: [
                        { $eq: ['$candidateId', '$$candidateId'] },
                        { $eq: ['$batchId', '$$batchId'] },
                        { $eq: ['$sourceIdentity', '$$sourceIdentity'] },
                        { $eq: ['$action', 'CONFIRMED_DRAFT'] },
                        { $ne: [{ $ifNull: ['$actorId', null] }, null] },
                        { $ne: [{ $ifNull: ['$occurredAt', null] }, null] },
                        { $eq: ['$details.membershipId', '$$membershipId'] },
                        { $eq: ['$details.chapterId', '$$chapterId'] },
                        { $eq: ['$details.vocabularyId', '$$vocabularyId'] },
                      ],
                    },
                  },
                },
                { $limit: 1 },
                { $project: { _id: 1 } },
              ],
              as: '_importAuditEvidence',
            },
          },
          { $match: { $expr: { $gt: [{ $size: '$_importAuditEvidence' }, 0] } } },
          { $limit: 1 },
          { $project: { _id: 1 } },
        ],
        as: '_approvedImportEvidence',
      },
    },
    { $match: { $expr: { $gt: [{ $size: '$_approvedImportEvidence' }, 0] } } },
  ];
}

function eligibleMembershipCountLookup() {
  return {
    $lookup: {
      from: ChapterVocabulary.collection.name,
      let: { chapterId: '$_id' },
      pipeline: [
        { $match: { $expr: { $eq: ['$chapterId', '$$chapterId'] } } },
        ...eligibleMembershipStages(),
        { $count: 'count' },
      ],
      as: '_eligibleVocabularyCount',
    },
  };
}

function countFromLookup(field = '_eligibleVocabularyCount') {
  return { $ifNull: [{ $arrayElemAt: [`$${field}.count`, 0] }, 0] };
}

async function requirePublishedTag(tagId) {
  const id = objectId(tagId, 'tagId');
  const tag = await VocabularyTag.findOne({ _id: id, status: 'published' })
    .select('_id name slug description sortOrder status').lean();
  if (!tag) fail('TAG_NOT_FOUND', 'Published Vocabulary Tag was not found.', 404);
  return tag;
}

async function requirePublishedChapter(chapterId) {
  const id = objectId(chapterId, 'chapterId');
  const chapter = await VocabularyChapter.findOne({ _id: id, status: 'published' })
    .select('_id tagId title description chapterNumber sortOrder status').lean();
  if (!chapter) fail('CHAPTER_NOT_FOUND', 'Published Vocabulary Chapter was not found.', 404);
  const tag = await VocabularyTag.findOne({ _id: chapter.tagId, status: 'published' })
    .select('_id name slug description sortOrder status').lean();
  if (!tag) fail('CHAPTER_NOT_FOUND', 'Published Vocabulary Chapter was not found.', 404);
  return { chapter, tag };
}

async function countEligibleVocabulary(chapterId) {
  const [result] = await ChapterVocabulary.aggregate([
    { $match: { chapterId } },
    ...eligibleMembershipStages(),
    { $count: 'count' },
  ]);
  return result?.count || 0;
}

export async function listStudentVocabularyCatalogTags({ search = '', page = 1, limit = DEFAULT_PAGE_SIZE } = {}) {
  assertStudentCatalogPrototypeDatabase();
  const paging = pagination(page, limit);
  const query = searchText(search);
  const tagFilter = {
    status: 'published',
    ...(query ? { $or: [
      { name: { $regex: escapedRegex(query), $options: 'i' } },
      { slug: { $regex: escapedRegex(query), $options: 'i' } },
    ] } : {}),
  };
  const [tags, total] = await Promise.all([
    VocabularyTag.find(tagFilter).select('_id name slug description sortOrder status')
      .sort({ sortOrder: 1, _id: 1 }).skip(paging.skip).limit(paging.limit).lean(),
    VocabularyTag.countDocuments(tagFilter),
  ]);
  const countsByTag = new Map();
  if (tags.length) {
    const counts = await VocabularyChapter.aggregate([
      { $match: { tagId: { $in: tags.map((tag) => tag._id) }, status: 'published' } },
      eligibleMembershipCountLookup(),
      { $addFields: { vocabularyCount: countFromLookup() } },
      { $group: {
        _id: '$tagId',
        chapterCount: { $sum: 1 },
        vocabularyCount: { $sum: '$vocabularyCount' },
      } },
    ]);
    for (const row of counts) countsByTag.set(String(row._id), row);
  }
  return {
    items: tags.map((tag) => tagDto(tag, countsByTag.get(String(tag._id)))),
    pagination: { page: paging.page, limit: paging.limit, total, pages: Math.ceil(total / paging.limit) || 1 },
  };
}

export async function listStudentVocabularyCatalogChapters(tagId, { search = '', page = 1, limit = DEFAULT_PAGE_SIZE } = {}) {
  assertStudentCatalogPrototypeDatabase();
  const tag = await requirePublishedTag(tagId);
  const paging = pagination(page, limit);
  const query = searchText(search);
  const match = {
    tagId: tag._id,
    status: 'published',
    ...(query ? { $or: [
      { title: { $regex: escapedRegex(query), $options: 'i' } },
      { description: { $regex: escapedRegex(query), $options: 'i' } },
    ] } : {}),
  };
  const [result = { items: [], total: [] }] = await VocabularyChapter.aggregate([
    { $match: match },
    { $sort: { sortOrder: 1, chapterNumber: 1, _id: 1 } },
    { $facet: {
      items: [
        { $skip: paging.skip },
        { $limit: paging.limit },
        eligibleMembershipCountLookup(),
        { $addFields: { vocabularyCount: countFromLookup() } },
        { $project: { _id: 1, tagId: 1, title: 1, description: 1, chapterNumber: 1, sortOrder: 1, vocabularyCount: 1 } },
      ],
      total: [{ $count: 'count' }],
    } },
  ]);
  return {
    tag: tagDto(tag),
    items: result.items.map((chapter) => chapterDto(chapter, tag, chapter.vocabularyCount)),
    pagination: {
      page: paging.page,
      limit: paging.limit,
      total: result.total[0]?.count || 0,
      pages: Math.ceil((result.total[0]?.count || 0) / paging.limit) || 1,
    },
  };
}

export async function getStudentVocabularyCatalogChapter(chapterId) {
  assertStudentCatalogPrototypeDatabase();
  const { chapter, tag } = await requirePublishedChapter(chapterId);
  return { chapter: chapterDto(chapter, tag, await countEligibleVocabulary(chapter._id)) };
}

export async function listStudentVocabularyCatalogChapterVocabulary(chapterId, { search = '', page = 1, limit = DEFAULT_PAGE_SIZE } = {}) {
  assertStudentCatalogPrototypeDatabase();
  const { chapter } = await requirePublishedChapter(chapterId);
  const paging = pagination(page, limit);
  const query = searchText(search);
  const searchMatch = query ? { $match: { $or: [
    { '_catalogVocabulary.word': { $regex: escapedRegex(query), $options: 'i' } },
    { '_catalogVocabulary.meaning': { $regex: escapedRegex(query), $options: 'i' } },
    { '_catalogVocabulary.partOfSpeech': { $regex: escapedRegex(query), $options: 'i' } },
  ] } } : null;
  const [result = { items: [], total: [] }] = await ChapterVocabulary.aggregate([
    { $match: { chapterId: chapter._id } },
    ...eligibleMembershipStages(),
    ...(searchMatch ? [searchMatch] : []),
    { $sort: { sortOrder: 1, _id: 1 } },
    { $facet: {
      items: [
        { $skip: paging.skip },
        { $limit: paging.limit },
        { $project: {
          _id: '$_catalogVocabulary._id',
          word: '$_catalogVocabulary.word',
          partOfSpeech: '$_catalogVocabulary.partOfSpeech',
          meaning: '$_catalogVocabulary.meaning',
          example: '$_catalogVocabulary.example',
          exampleEnglish: '$_catalogVocabulary.exampleEnglish',
          exampleVietnamese: '$_catalogVocabulary.exampleVietnamese',
          catalogSenses: '$_catalogVocabulary.catalogSenses',
          catalogNotes: '$_catalogVocabulary.catalogNotes',
          sortOrder: 1,
        } },
      ],
      total: [{ $count: 'count' }],
    } },
  ]);
  return {
    chapterId: String(chapter._id),
    items: result.items.map(vocabularyDto),
    pagination: {
      page: paging.page,
      limit: paging.limit,
      total: result.total[0]?.count || 0,
      pages: Math.ceil((result.total[0]?.count || 0) / paging.limit) || 1,
    },
  };
}
