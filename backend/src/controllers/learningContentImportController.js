import VocabularyDictation from '../models/VocabularyDictation.js';
import RoadToPart7Reading from '../models/RoadToPart7Reading.js';
import { isPrivateBlobUrl } from '../utils/blobStorage.js';

const VOCABULARY_WORKBOOK = 'Tu_vung_Test_7_8.xlsx';
const READING_WORKBOOK = 'Bai_doc_song_ngu_cap_nhat.xlsx';

const isString = (value) => typeof value === 'string' && Boolean(value.trim());

const validateVocabularyItems = (items) => {
  if (!Array.isArray(items) || items.length !== 16) return 'Bộ từ vựng cần có đủ 16 mục trong file Excel.';
  for (const item of items) {
    if (!/^test-(7|8)-section-\d{2}$/.test(item.sourceKey || '')
      || !isString(item.title)
      || !Number.isInteger(item.testNumber)
      || !Number.isInteger(item.sectionNumber)
      || !Array.isArray(item.answers)
      || item.answers.length !== 10
      || item.answers.some((answer) => !isString(answer.text) || !isString(answer.translation))) {
      return 'Dữ liệu từ vựng không đúng cấu trúc đã đọc từ Excel.';
    }
    if (item.audioUrl && !isPrivateBlobUrl(item.audioUrl)) {
      return 'Audio từ vựng phải được tải lên Blob private trước khi nhập.';
    }
  }
  return null;
};

const validateReadings = (readings) => {
  if (!Array.isArray(readings) || readings.length !== 26) return 'Road to Part 7 cần có đủ 26 bài đọc trong file Excel.';
  for (const reading of readings) {
    if (!/^reading-\d{2}$/.test(reading.sourceKey || '')
      || !isString(reading.title)
      || !Number.isInteger(reading.order)
      || !isString(reading.englishText)
      || !Array.isArray(reading.bilingualPairs)
      || reading.bilingualPairs.length === 0
      || reading.bilingualPairs.some((pair) => !isString(pair.english) || !isString(pair.vietnamese))) {
      return 'Dữ liệu bài đọc song ngữ không đúng cấu trúc đã đọc từ Excel.';
    }
  }
  return null;
};

export const importLearningContentSeed = async (req, res, next) => {
  try {
    const { vocabularyItems = [], readings = [] } = req.body || {};
    const vocabularyError = validateVocabularyItems(vocabularyItems);
    if (vocabularyError) return res.status(400).json({ status: 'error', message: vocabularyError });
    const readingError = validateReadings(readings);
    if (readingError) return res.status(400).json({ status: 'error', message: readingError });

    const vocabularyOperations = vocabularyItems.map((item) => {
      const answers = item.answers.map((answer, index) => ({
        text: answer.text.trim(),
        translation: answer.translation.trim(),
        order: index + 1,
      }));
      const update = {
        $set: {
          title: item.title.trim(),
          sourceWorkbook: VOCABULARY_WORKBOOK,
          testNumber: item.testNumber,
          sectionNumber: item.sectionNumber,
          firstWord: item.firstWord,
          lastWord: item.lastWord,
          audioFilename: item.audioFilename,
          answers,
        },
        $setOnInsert: {
          sourceKey: item.sourceKey,
          audioUrl: '',
          isVisible: false,
          createdBy: req.user._id,
        },
      };
      if (isString(item.audioUrl)) {
        update.$set.audioUrl = item.audioUrl.trim();
        update.$set.isVisible = true;
      }
      return { updateOne: { filter: { sourceKey: item.sourceKey }, update, upsert: true } };
    });

    const readingOperations = readings.map((reading, index) => ({
      updateOne: {
        filter: { sourceKey: reading.sourceKey },
        update: {
          $set: {
            sourceWorkbook: READING_WORKBOOK,
            sourceRow: reading.sourceRow,
            order: index + 1,
            title: reading.title.trim(),
            englishText: reading.englishText.trim(),
            bilingualPairs: reading.bilingualPairs.map((pair, pairIndex) => ({
              english: pair.english.trim(),
              vietnamese: pair.vietnamese.trim(),
              order: pairIndex + 1,
            })),
            isPublished: true,
          },
          $setOnInsert: { sourceKey: reading.sourceKey, createdBy: req.user._id },
        },
        upsert: true,
      },
    }));

    const [vocabularyResult, readingResult] = await Promise.all([
      VocabularyDictation.bulkWrite(vocabularyOperations, { ordered: true }),
      RoadToPart7Reading.bulkWrite(readingOperations, { ordered: true }),
    ]);

    res.json({
      status: 'success',
      data: {
        vocabulary: {
          total: vocabularyItems.length,
          withAudio: vocabularyItems.filter((item) => isString(item.audioUrl)).length,
          hiddenWithoutAudio: vocabularyItems.filter((item) => !isString(item.audioUrl)).length,
          created: vocabularyResult.upsertedCount,
          updated: vocabularyResult.modifiedCount,
        },
        roadToPart7: {
          total: readings.length,
          bilingualPairs: readings.reduce((total, item) => total + item.bilingualPairs.length, 0),
          created: readingResult.upsertedCount,
          updated: readingResult.modifiedCount,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};
