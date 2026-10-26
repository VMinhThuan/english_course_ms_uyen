import mongoose from 'mongoose';
import ChapterVocabulary from '../models/ChapterVocabulary.js';
import Vocabulary from '../models/Vocabulary.js';
import VocabularyChapter from '../models/VocabularyChapter.js';
import VocabularyTag from '../models/VocabularyTag.js';

const MAX_PAGE_SIZE = 100;

export class VocabularyCatalogError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'VocabularyCatalogError';
    this.code = code;
  }
}

function requireObjectId(value, fieldName) {
  if (!mongoose.isValidObjectId(value)) {
    throw new VocabularyCatalogError('INVALID_ID', fieldName + ' must be a valid ObjectId.');
  }
  return new mongoose.Types.ObjectId(value);
}

function escapeRegex(value) {
  return value.replace(/[.*+?^$()|[\]\\{}]/g, '\\$&');
}

function parsePage(page, limit) {
  const pageNumber = Number(page ?? 1);
  const pageSize = Number(limit ?? 50);
  if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > 1_000_000
    || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
    throw new VocabularyCatalogError('INVALID_PAGINATION', 'Page or limit is outside the supported range.');
  }
  return { page: pageNumber, limit: pageSize, skip: (pageNumber - 1) * pageSize };
}

function isDuplicateKey(error) {
  return error?.code === 11000;
}

async function resolveMembershipRace({ chapterId, vocabularyId, sourceIdentity }) {
  const byIdentity = await ChapterVocabulary.findOne({ sourceIdentity });
  if (byIdentity) {
    if (String(byIdentity.chapterId) === String(chapterId)
      && String(byIdentity.vocabularyId) === String(vocabularyId)) return byIdentity;
    throw new VocabularyCatalogError(
      'SOURCE_IDENTITY_CONFLICT',
      'This source identity is already assigned to a different chapter or vocabulary.',
    );
  }

  const byPair = await ChapterVocabulary.findOne({ chapterId, vocabularyId });
  if (byPair) {
    throw new VocabularyCatalogError(
      'MEMBERSHIP_ALREADY_EXISTS',
      'This vocabulary already has a membership in the chapter with a different source identity.',
    );
  }
  return null;
}

export async function createVocabularyTag(input, { session } = {}) {
  const payload = {
    name: input.name,
    slug: input.slug,
    description: input.description || '',
    sortOrder: input.sortOrder ?? 0,
    status: 'draft',
  };
  const [created] = await VocabularyTag.create([payload], session ? { session } : undefined);
  return created;
}

export async function createVocabularyChapter(input, { session } = {}) {
  const tagId = requireObjectId(input.tagId, 'tagId');
  let tagQuery = VocabularyTag.exists({ _id: tagId });
  if (session) tagQuery = tagQuery.session(session);
  const tagExists = await tagQuery;
  if (!tagExists) throw new VocabularyCatalogError('TAG_NOT_FOUND', 'Vocabulary Tag was not found.');

  const payload = {
    tagId,
    title: input.title,
    description: input.description || '',
    chapterNumber: input.chapterNumber ?? null,
    sortOrder: input.sortOrder ?? 0,
    status: 'draft',
  };
  const [created] = await VocabularyChapter.create([payload], session ? { session } : undefined);
  return created;
}

export async function createCatalogVocabulary(input, { session } = {}) {
  const payload = {
    word: input.word,
    meaning: input.meaning,
    partOfSpeech: input.partOfSpeech || '',
    pronunciation: input.pronunciation || '',
    explanation: input.explanation || '',
    example: input.example || input.exampleEnglish || '',
    exampleEnglish: input.exampleEnglish || input.example || '',
    exampleVietnamese: input.exampleVietnamese || '',
    catalogSenses: input.catalogSenses || [],
    catalogNotes: input.catalogNotes || [],
    audioUrl: input.audioUrl || '',
    topic: input.topic || 'General',
    order: input.order ?? 0,
    catalogOnly: true,
    catalogStatus: 'draft',
    status: 'hidden',
  };
  const [created] = await Vocabulary.create([payload], session ? { session } : undefined);
  return created;
}

export async function addVocabularyToChapter({ chapterId: rawChapterId, vocabularyId: rawVocabularyId, sourceIdentity, sortOrder = 0, session }) {
  const chapterId = requireObjectId(rawChapterId, 'chapterId');
  const vocabularyId = requireObjectId(rawVocabularyId, 'vocabularyId');
  const normalizedIdentity = typeof sourceIdentity === 'string' ? sourceIdentity.trim() : '';
  if (!normalizedIdentity) {
    throw new VocabularyCatalogError('SOURCE_IDENTITY_REQUIRED', 'A source identity is required for catalog membership.');
  }
  if (!Number.isInteger(Number(sortOrder)) || Number(sortOrder) < 0) {
    throw new VocabularyCatalogError('INVALID_SORT_ORDER', 'sortOrder must be a non-negative integer.');
  }

  let chapterQuery = VocabularyChapter.exists({ _id: chapterId });
  let vocabularyQuery = Vocabulary.findOne({ _id: vocabularyId, catalogOnly: true }).select('_id');
  if (session) {
    chapterQuery = chapterQuery.session(session);
    vocabularyQuery = vocabularyQuery.session(session);
  }
  const [chapter, vocabulary] = await Promise.all([chapterQuery, vocabularyQuery]);
  if (!chapter) throw new VocabularyCatalogError('CHAPTER_NOT_FOUND', 'Vocabulary Chapter was not found.');
  if (!vocabulary) throw new VocabularyCatalogError('CATALOG_VOCABULARY_NOT_FOUND', 'Catalog Vocabulary was not found.');

  let identityQuery = ChapterVocabulary.findOne({ sourceIdentity: normalizedIdentity });
  if (session) identityQuery = identityQuery.session(session);
  const existingByIdentity = await identityQuery;
  if (existingByIdentity) {
    if (String(existingByIdentity.chapterId) === String(chapterId)
      && String(existingByIdentity.vocabularyId) === String(vocabularyId)) return existingByIdentity;
    throw new VocabularyCatalogError(
      'SOURCE_IDENTITY_CONFLICT',
      'This source identity is already assigned to a different chapter or vocabulary.',
    );
  }

  let pairQuery = ChapterVocabulary.findOne({ chapterId, vocabularyId });
  if (session) pairQuery = pairQuery.session(session);
  const existingPair = await pairQuery;
  if (existingPair) {
    if (existingPair.sourceIdentity === normalizedIdentity) return existingPair;
    throw new VocabularyCatalogError(
      'MEMBERSHIP_ALREADY_EXISTS',
      'This vocabulary already has a membership in the chapter with a different source identity.',
    );
  }

  try {
    const payload = {
      chapterId,
      vocabularyId,
      sortOrder: Number(sortOrder),
      sourceIdentity: normalizedIdentity,
    };
    const [created] = await ChapterVocabulary.create([payload], session ? { session } : undefined);
    return created;
  } catch (error) {
    if (session) throw error;
    if (!isDuplicateKey(error)) throw error;
    const racedMembership = await resolveMembershipRace({
      chapterId,
      vocabularyId,
      sourceIdentity: normalizedIdentity,
    });
    if (racedMembership) return racedMembership;
    throw error;
  }
}

export async function archiveVocabularyChapter(chapterId) {
  const id = requireObjectId(chapterId, 'chapterId');
  return VocabularyChapter.findByIdAndUpdate(
    id,
    { $set: { status: 'archived' } },
    { new: true, runValidators: true },
  );
}

export async function listPublishedCatalogVocabulary({
  tagId,
  chapterId,
  search = '',
  page = 1,
  limit = 50,
} = {}) {
  const pagination = parsePage(page, limit);
  if (tagId !== undefined) requireObjectId(tagId, 'tagId');
  if (chapterId !== undefined) requireObjectId(chapterId, 'chapterId');
  if (typeof search !== 'string' || search.length > 80) {
    throw new VocabularyCatalogError('INVALID_SEARCH', 'Search must be a string of at most 80 characters.');
  }

  const pipeline = [
    { $lookup: {
      from: VocabularyChapter.collection.name,
      localField: 'chapterId',
      foreignField: '_id',
      as: 'chapter',
    } },
    { $unwind: '$chapter' },
    { $match: {
      'chapter.status': 'published',
      ...(chapterId ? { chapterId: new mongoose.Types.ObjectId(chapterId) } : {}),
      ...(tagId ? { 'chapter.tagId': new mongoose.Types.ObjectId(tagId) } : {}),
    } },
    { $lookup: {
      from: VocabularyTag.collection.name,
      localField: 'chapter.tagId',
      foreignField: '_id',
      as: 'tag',
    } },
    { $unwind: '$tag' },
    { $match: { 'tag.status': 'published' } },
    { $lookup: {
      from: Vocabulary.collection.name,
      localField: 'vocabularyId',
      foreignField: '_id',
      as: 'vocabulary',
    } },
    { $unwind: '$vocabulary' },
    { $match: {
      'vocabulary.catalogOnly': true,
      'vocabulary.catalogStatus': 'published',
      ...(search.trim() ? {
        $or: [
          { 'vocabulary.word': { $regex: escapeRegex(search.trim()), $options: 'i' } },
          { 'vocabulary.meaning': { $regex: escapeRegex(search.trim()), $options: 'i' } },
          { 'vocabulary.partOfSpeech': { $regex: escapeRegex(search.trim()), $options: 'i' } },
        ],
      } : {}),
    } },
    { $sort: {
      'chapter.sortOrder': 1,
      'chapter.chapterNumber': 1,
      'chapter._id': 1,
      sortOrder: 1,
      _id: 1,
    } },
    { $facet: {
      items: [
        { $skip: pagination.skip },
        { $limit: pagination.limit },
        { $project: {
          _id: 0,
          membership: {
            _id: '$_id',
            chapterId: '$chapterId',
            vocabularyId: '$vocabularyId',
            sortOrder: '$sortOrder',
            sourceIdentity: '$sourceIdentity',
          },
          chapter: {
            _id: '$chapter._id',
            tagId: '$chapter.tagId',
            title: '$chapter.title',
            chapterNumber: '$chapter.chapterNumber',
            sortOrder: '$chapter.sortOrder',
          },
          tag: {
            _id: '$tag._id',
            name: '$tag.name',
            slug: '$tag.slug',
          },
          vocabulary: {
            _id: '$vocabulary._id',
            word: '$vocabulary.word',
            meaning: '$vocabulary.meaning',
            partOfSpeech: '$vocabulary.partOfSpeech',
            pronunciation: '$vocabulary.pronunciation',
            exampleEnglish: '$vocabulary.exampleEnglish',
            exampleVietnamese: '$vocabulary.exampleVietnamese',
          },
        } },
      ],
      total: [{ $count: 'count' }],
    } },
  ];
  const [result = { items: [], total: [] }] = await ChapterVocabulary.aggregate(pipeline);
  return {
    items: result.items,
    pagination: {
      page: pagination.page,
      limit: pagination.limit,
      total: result.total[0]?.count || 0,
      pages: Math.ceil((result.total[0]?.count || 0) / pagination.limit) || 1,
    },
  };
}
