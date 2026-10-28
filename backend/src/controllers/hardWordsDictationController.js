import HardWordsDictation from '../models/HardWordsDictation.js';
import { deleteFromBlob, getPrivateBlobPathname, isPrivateBlobUrl } from '../utils/blobStorage.js';

const SOURCE_WORKBOOK = 'Tu_vung_Test_7_8 (1).xlsx';

const normalizeAnswer = (value) => String(value ?? '')
  .normalize('NFKC')
  .trim()
  .replace(/\s+/g, ' ')
  .toLocaleLowerCase();

const parseAnswers = (answers) => {
  if (!Array.isArray(answers) || answers.length === 0) return { error: 'Hãy thêm ít nhất một từ hoặc cụm từ.' };
  if (answers.length > 50) return { error: 'Mỗi audio chỉ hỗ trợ tối đa 50 đáp án.' };
  const normalized = answers.map((answer, index) => ({
    text: typeof answer?.text === 'string' ? answer.text.trim() : '',
    translation: typeof answer?.translation === 'string' ? answer.translation.trim() : '',
    order: index + 1,
  }));
  if (normalized.some((answer) => !answer.text)) return { error: 'Mỗi dòng cần có từ hoặc cụm từ đáp án.' };
  return { answers: normalized };
};

const studentDto = (item) => ({
  _id: item._id.toString(),
  title: item.title,
  audioUrl: item.audioUrl,
  answerCount: item.answers.length,
});

const sortBySection = (left, right) => (left.testNumber || 0) - (right.testNumber || 0)
  || (left.sectionNumber || 0) - (right.sectionNumber || 0)
  || left.title.localeCompare(right.title, 'en', { numeric: true, sensitivity: 'base' });

const validateSeedItems = (items) => {
  if (!Array.isArray(items) || items.length !== 16) return 'Hard Words Dictation cần đủ 16 mục trong workbook.';
  const sourceKeys = new Set();
  for (const item of items) {
    const audioPath = getPrivateBlobPathname(item?.audioUrl);
    if (!/^hard-words-test-(7|8)-section-(0[1-9]|1[0-6])$/.test(item?.sourceKey || '')
      || sourceKeys.has(item.sourceKey)
      || !/^Muc_\d{2}_Test_(7|8)\.mp3$/i.test(item?.audioFilename || '')
      || !item.title?.trim()
      || ![7, 8].includes(Number(item.testNumber))
      || !Number.isInteger(Number(item.sectionNumber))
      || !Array.isArray(item.answers)
      || item.answers.length !== 10
      || item.answers.some((answer) => !answer?.text?.trim() || !answer?.translation?.trim())
      || !isPrivateBlobUrl(item.audioUrl)
      || !audioPath?.startsWith('audio-voc/')) {
      return 'Dữ liệu Hard Words hoặc audio Blob không hợp lệ.';
    }
    sourceKeys.add(item.sourceKey);
  }
  return null;
};

export const listAdminHardWordsDictations = async (_req, res, next) => {
  try {
    const items = await HardWordsDictation.find().populate('createdBy', 'fullName email').lean();
    items.sort(sortBySection);
    res.json({ status: 'success', data: { items } });
  } catch (error) { next(error); }
};

export const importHardWordsDictationSeed = async (req, res, next) => {
  try {
    const { items = [] } = req.body || {};
    const validationError = validateSeedItems(items);
    if (validationError) return res.status(400).json({ status: 'error', message: validationError });

    const operations = items.map((item) => ({
      updateOne: {
        filter: { sourceKey: item.sourceKey },
        update: {
          $set: {
            title: item.title.trim(),
            sourceWorkbook: SOURCE_WORKBOOK,
            testNumber: Number(item.testNumber),
            sectionNumber: Number(item.sectionNumber),
            firstWord: Number(item.firstWord),
            lastWord: Number(item.lastWord),
            audioFilename: item.audioFilename,
            audioUrl: item.audioUrl.trim(),
            answers: item.answers.map((answer, index) => ({
              text: answer.text.trim(),
              translation: answer.translation.trim(),
              order: index + 1,
            })),
            isVisible: true,
          },
          $setOnInsert: { sourceKey: item.sourceKey, createdBy: req.user._id },
        },
        upsert: true,
      },
    }));
    const result = await HardWordsDictation.bulkWrite(operations, { ordered: true });
    res.json({
      status: 'success',
      data: {
        total: items.length,
        answers: items.reduce((total, item) => total + item.answers.length, 0),
        withAudio: items.length,
        published: items.length,
        created: result.upsertedCount,
        updated: result.modifiedCount,
      },
    });
  } catch (error) { next(error); }
};

export const createHardWordsDictation = async (req, res, next) => {
  try {
    const title = typeof req.body.title === 'string' ? req.body.title.trim() : '';
    const audioUrl = typeof req.body.audioUrl === 'string' ? req.body.audioUrl.trim() : '';
    const parsed = parseAnswers(req.body.answers);
    if (!title || !audioUrl || parsed.error) {
      return res.status(400).json({ status: 'error', message: parsed.error || 'Tên bài và file audio là bắt buộc.' });
    }
    const item = await HardWordsDictation.create({
      title,
      audioUrl,
      answers: parsed.answers,
      isVisible: Boolean(req.body.isVisible),
      createdBy: req.user._id,
    });
    res.status(201).json({ status: 'success', data: { item } });
  } catch (error) { next(error); }
};

export const updateHardWordsDictation = async (req, res, next) => {
  try {
    const item = await HardWordsDictation.findById(req.params.id);
    if (!item) return res.status(404).json({ status: 'error', message: 'Không tìm thấy bài Hard Words Dictation.' });

    const title = typeof req.body.title === 'string' ? req.body.title.trim() : '';
    const audioUrl = typeof req.body.audioUrl === 'string' ? req.body.audioUrl.trim() : '';
    const parsed = parseAnswers(req.body.answers);
    if (!title || !audioUrl || parsed.error) {
      return res.status(400).json({ status: 'error', message: parsed.error || 'Tên bài và file audio là bắt buộc.' });
    }

    const previousAudioUrl = item.audioUrl;
    item.title = title;
    item.audioUrl = audioUrl;
    item.answers = parsed.answers;
    item.isVisible = Boolean(req.body.isVisible);
    await item.save();
    if (previousAudioUrl && previousAudioUrl !== audioUrl) await deleteFromBlob(previousAudioUrl).catch(() => {});
    res.json({ status: 'success', data: { item } });
  } catch (error) { next(error); }
};

export const setHardWordsDictationVisibility = async (req, res, next) => {
  try {
    if (typeof req.body.isVisible !== 'boolean') {
      return res.status(400).json({ status: 'error', message: 'isVisible phải là true hoặc false.' });
    }
    const item = await HardWordsDictation.findById(req.params.id);
    if (!item) return res.status(404).json({ status: 'error', message: 'Không tìm thấy bài Hard Words Dictation.' });
    item.isVisible = req.body.isVisible;
    await item.save();
    res.json({ status: 'success', data: { item } });
  } catch (error) { next(error); }
};

export const deleteHardWordsDictation = async (req, res, next) => {
  try {
    const item = await HardWordsDictation.findByIdAndDelete(req.params.id);
    if (!item) return res.status(404).json({ status: 'error', message: 'Không tìm thấy bài Hard Words Dictation.' });
    await deleteFromBlob(item.audioUrl).catch(() => {});
    res.json({ status: 'success', message: 'Đã xóa bài Hard Words Dictation.' });
  } catch (error) { next(error); }
};

export const listStudentHardWordsDictations = async (_req, res, next) => {
  try {
    const items = await HardWordsDictation.find({ isVisible: true }).lean();
    items.sort(sortBySection);
    res.json({ status: 'success', data: { items: items.map(studentDto) } });
  } catch (error) { next(error); }
};

export const getStudentHardWordsDictation = async (req, res, next) => {
  try {
    const item = await HardWordsDictation.findOne({ _id: req.params.id, isVisible: true });
    if (!item) return res.status(404).json({ status: 'error', message: 'Bài Hard Words Dictation không khả dụng.' });
    res.json({ status: 'success', data: { item: studentDto(item) } });
  } catch (error) { next(error); }
};

export const submitStudentHardWordsDictation = async (req, res, next) => {
  try {
    const item = await HardWordsDictation.findOne({ _id: req.params.id, isVisible: true });
    if (!item) return res.status(404).json({ status: 'error', message: 'Bài Hard Words Dictation không khả dụng.' });

    const submissions = Array.isArray(req.body.answers) ? req.body.answers : [];
    const results = item.answers
      .sort((left, right) => left.order - right.order)
      .map((answer, index) => ({
        order: answer.order,
        isCorrect: normalizeAnswer(submissions[index]) === normalizeAnswer(answer.text),
        correctAnswer: answer.text,
        correctTranslation: answer.translation || '',
      }));
    res.json({
      status: 'success',
      data: {
        results,
        correctCount: results.filter((result) => result.isCorrect).length,
        total: results.length,
      },
    });
  } catch (error) { next(error); }
};
