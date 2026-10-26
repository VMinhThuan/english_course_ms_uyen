import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import ChapterVocabulary from '../models/ChapterVocabulary.js';
import Vocabulary from '../models/Vocabulary.js';
import VocabularyChapter, { normalizeVocabularyChapterTitle } from '../models/VocabularyChapter.js';
import VocabularyTag from '../models/VocabularyTag.js';

const normalizeText = (value, field, maxLength = 2000) => {
  if (typeof value !== 'string') throw new Error(`${field} phải là văn bản.`);
  const result = value.normalize('NFKC').trim();
  if (!result || result.length > maxLength) throw new Error(`${field} không được để trống hoặc quá dài.`);
  return result;
};

const createSlug = (value) => value.normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[đĐ]/g, 'd')
  .toLocaleLowerCase('en')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '')
  .slice(0, 120);

const requireId = (value, field) => {
  if (!mongoose.isObjectIdOrHexString(value)) throw new Error(`${field} không hợp lệ.`);
  return new mongoose.Types.ObjectId(value);
};

export async function publishVocabularyImport({ tagId, tagName, chapterId, chapterTitle, items }) {
  if (!Array.isArray(items) || items.length < 1 || items.length > 1000) {
    throw new Error('Chọn từ 1 đến 1000 từ hợp lệ để xuất bản.');
  }
  const preparedItems = items.map((item) => ({
    word: normalizeText(item?.word, 'Từ tiếng Anh', 160),
    meaning: normalizeText(item?.meaning, 'Nghĩa', 4000),
    partOfSpeech: typeof item?.partOfSpeech === 'string' ? item.partOfSpeech.trim().slice(0, 120) : '',
    pronunciation: typeof item?.pronunciation === 'string' ? item.pronunciation.trim().slice(0, 300) : '',
    explanation: typeof item?.explanation === 'string' ? item.explanation.trim().slice(0, 4000) : '',
    exampleEnglish: typeof item?.exampleEnglish === 'string' ? item.exampleEnglish.trim().slice(0, 2000) : '',
    exampleVietnamese: typeof item?.exampleVietnamese === 'string' ? item.exampleVietnamese.trim().slice(0, 2000) : '',
    topic: typeof item?.topic === 'string' && item.topic.trim() ? item.topic.trim().slice(0, 120) : 'General',
    order: Number.isInteger(Number(item?.order)) && Number(item.order) > 0 ? Number(item.order) : 0,
  }));
  const cleanTagName = tagId ? '' : normalizeText(tagName, 'Tag', 120);
  const cleanChapterTitle = chapterId ? '' : normalizeText(chapterTitle, 'Chapter', 120);
  const slug = cleanTagName ? createSlug(cleanTagName) : '';
  if (cleanTagName && !slug) throw new Error('Tên Tag không tạo được slug hợp lệ.');

  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      let tag;
      if (tagId) {
        tag = await VocabularyTag.findById(requireId(tagId, 'Tag')).session(session);
        if (!tag) throw new Error('Không tìm thấy Tag đã chọn.');
      } else {
        tag = await VocabularyTag.findOne({ slug }).session(session);
        if (!tag) [tag] = await VocabularyTag.create([{ name: cleanTagName, slug, status: 'published' }], { session });
      }
      if (tag.status === 'archived') throw new Error('Tag đã lưu trữ, hãy chọn Tag khác.');
      tag.status = 'published';
      await tag.save({ session });

      let chapter;
      if (chapterId) {
        chapter = await VocabularyChapter.findById(requireId(chapterId, 'Chapter')).session(session);
        if (!chapter || String(chapter.tagId) !== String(tag._id)) throw new Error('Chapter không thuộc Tag đã chọn.');
        if (chapter.status === 'archived') throw new Error('Chapter đã lưu trữ, hãy chọn Chapter khác.');
      } else {
        const normalizedTitle = normalizeVocabularyChapterTitle(cleanChapterTitle);
        chapter = await VocabularyChapter.findOne({ tagId: tag._id, normalizedTitle }).session(session);
        if (!chapter) {
          const last = await VocabularyChapter.findOne({ tagId: tag._id }).sort({ sortOrder: -1 }).select('sortOrder').session(session);
          [chapter] = await VocabularyChapter.create([{
            tagId: tag._id,
            title: cleanChapterTitle,
            chapterNumber: null,
            sortOrder: last ? last.sortOrder + 10 : 10,
            status: 'published',
          }], { session });
        }
      }
      chapter.status = 'published';
      await chapter.save({ session });

      const lastMembership = await ChapterVocabulary.findOne({ chapterId: chapter._id })
        .sort({ sortOrder: -1, _id: -1 }).select('sortOrder').session(session);
      const startOrder = lastMembership ? lastMembership.sortOrder + 10 : 10;
      const vocabulary = await Vocabulary.insertMany(preparedItems.map((item) => ({
        ...item,
        example: item.exampleEnglish,
        catalogOnly: true,
        catalogStatus: 'published',
        status: 'published',
      })), { session, ordered: true });
      await ChapterVocabulary.insertMany(vocabulary.map((item, index) => ({
        chapterId: chapter._id,
        vocabularyId: item._id,
        sortOrder: startOrder + index * 10,
        sourceIdentity: `quick-docx-${randomUUID()}`,
      })), { session, ordered: true });
      result = { tagId: String(tag._id), chapterId: String(chapter._id), importedCount: vocabulary.length };
    });
  } finally {
    await session.endSession();
  }
  return result;
}

export async function setVocabularyTagVisibility(tagId, isVisible) {
  if (typeof isVisible !== 'boolean') throw new Error('isVisible phải là true hoặc false.');
  const tag = await VocabularyTag.findOne({ _id: requireId(tagId, 'Tag'), status: { $ne: 'archived' } });
  if (!tag) throw new Error('Không tìm thấy Tag.');
  tag.status = isVisible ? 'published' : 'hidden';
  await tag.save();
  return tag;
}

export async function setVocabularyChapterVisibility(chapterId, isVisible) {
  if (typeof isVisible !== 'boolean') throw new Error('isVisible phải là true hoặc false.');
  const chapter = await VocabularyChapter.findOne({ _id: requireId(chapterId, 'Chapter'), status: { $ne: 'archived' } });
  if (!chapter) throw new Error('Không tìm thấy Chapter.');
  chapter.status = isVisible ? 'published' : 'hidden';
  await chapter.save();
  return chapter;
}
