import VocabularyDictation from '../models/VocabularyDictation.js';
import { deleteFromBlob } from '../utils/blobStorage.js';

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

export const listAdminVocabularyDictations = async (_req, res, next) => {
  try {
    const items = await VocabularyDictation.find().populate('createdBy', 'fullName email').lean();
    items.sort(sortBySection);
    res.json({ status: 'success', data: { items } });
  } catch (error) { next(error); }
};

export const createVocabularyDictation = async (req, res, next) => {
  try {
    const title = typeof req.body.title === 'string' ? req.body.title.trim() : '';
    const audioUrl = typeof req.body.audioUrl === 'string' ? req.body.audioUrl.trim() : '';
    const parsed = parseAnswers(req.body.answers);
    if (!title || !audioUrl || parsed.error) {
      return res.status(400).json({ status: 'error', message: parsed.error || 'Tên bài và file audio là bắt buộc.' });
    }
    const item = await VocabularyDictation.create({
      title,
      audioUrl,
      answers: parsed.answers,
      isVisible: Boolean(req.body.isVisible),
      createdBy: req.user._id,
    });
    res.status(201).json({ status: 'success', data: { item } });
  } catch (error) { next(error); }
};

export const updateVocabularyDictation = async (req, res, next) => {
  try {
    const item = await VocabularyDictation.findById(req.params.id);
    if (!item) return res.status(404).json({ status: 'error', message: 'Không tìm thấy bài chép chính tả từ vựng.' });

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

export const setVocabularyDictationVisibility = async (req, res, next) => {
  try {
    if (typeof req.body.isVisible !== 'boolean') {
      return res.status(400).json({ status: 'error', message: 'isVisible phải là true hoặc false.' });
    }
    const item = await VocabularyDictation.findById(req.params.id);
    if (!item) return res.status(404).json({ status: 'error', message: 'Không tìm thấy bài chép chính tả từ vựng.' });
    if (req.body.isVisible && !item.audioUrl) {
      return res.status(400).json({ status: 'error', message: 'Cần có file audio trước khi hiển thị bài này.' });
    }
    item.isVisible = req.body.isVisible;
    await item.save();
    res.json({ status: 'success', data: { item } });
  } catch (error) { next(error); }
};

export const deleteVocabularyDictation = async (req, res, next) => {
  try {
    const item = await VocabularyDictation.findByIdAndDelete(req.params.id);
    if (!item) return res.status(404).json({ status: 'error', message: 'Không tìm thấy bài chép chính tả từ vựng.' });
    await deleteFromBlob(item.audioUrl).catch(() => {});
    res.json({ status: 'success', message: 'Đã xóa bài chép chính tả từ vựng.' });
  } catch (error) { next(error); }
};

export const listStudentVocabularyDictations = async (_req, res, next) => {
  try {
    const items = await VocabularyDictation.find({ isVisible: true, audioUrl: { $ne: '' } }).lean();
    items.sort(sortBySection);
    res.json({ status: 'success', data: { items: items.map(studentDto) } });
  } catch (error) { next(error); }
};

export const getStudentVocabularyDictation = async (req, res, next) => {
  try {
    const item = await VocabularyDictation.findOne({ _id: req.params.id, isVisible: true, audioUrl: { $ne: '' } });
    if (!item) return res.status(404).json({ status: 'error', message: 'Bài chép chính tả từ vựng không khả dụng.' });
    res.json({ status: 'success', data: { item: studentDto(item) } });
  } catch (error) { next(error); }
};

export const submitStudentVocabularyDictation = async (req, res, next) => {
  try {
    const item = await VocabularyDictation.findOne({ _id: req.params.id, isVisible: true, audioUrl: { $ne: '' } });
    if (!item) return res.status(404).json({ status: 'error', message: 'Bài chép chính tả từ vựng không khả dụng.' });

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
