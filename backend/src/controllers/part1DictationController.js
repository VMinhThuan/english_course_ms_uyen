import Part1Dictation from '../models/Part1Dictation.js';
import { deleteFromBlob } from '../utils/blobStorage.js';

const normalizeAnswer = (value) => String(value ?? '')
  .normalize('NFKC')
  .trim()
  .replace(/\s+/g, ' ')
  .toLocaleLowerCase();

const parseAnswers = (answers) => {
  if (!Array.isArray(answers) || answers.length === 0) {
    return { error: 'Hãy thêm ít nhất một câu đáp án.' };
  }
  if (answers.length > 50) {
    return { error: 'Mỗi audio chỉ hỗ trợ tối đa 50 câu đáp án.' };
  }

  const normalized = answers.map((answer, index) => ({
    text: typeof answer?.text === 'string' ? answer.text.trim() : '',
    translation: typeof answer?.translation === 'string' ? answer.translation.trim() : '',
    order: index + 1,
  }));
  if (normalized.some((answer) => !answer.text)) {
    return { error: 'Mỗi dòng đáp án cần có nội dung.' };
  }
  return { answers: normalized };
};

const studentDto = (item) => ({
  _id: item._id.toString(),
  title: item.title,
  audioUrl: item.audioUrl,
  answerCount: item.answers.length,
});

export const listAdminPart1Dictations = async (_req, res, next) => {
  try {
    const items = await Part1Dictation.find()
      .populate('createdBy', 'fullName email')
      .lean();
    items.sort((left, right) => left.title.localeCompare(right.title, 'en', { numeric: true, sensitivity: 'base' }));
    res.json({ status: 'success', data: { items } });
  } catch (error) {
    next(error);
  }
};

export const createPart1Dictation = async (req, res, next) => {
  try {
    const title = typeof req.body.title === 'string' ? req.body.title.trim() : '';
    const audioUrl = typeof req.body.audioUrl === 'string' ? req.body.audioUrl.trim() : '';
    const parsed = parseAnswers(req.body.answers);
    if (!title || !audioUrl || parsed.error) {
      return res.status(400).json({ status: 'error', message: parsed.error || 'Tên bài và file audio là bắt buộc.' });
    }

    const item = await Part1Dictation.create({
      title,
      audioUrl,
      answers: parsed.answers,
      isVisible: Boolean(req.body.isVisible),
      createdBy: req.user._id,
    });
    res.status(201).json({ status: 'success', data: { item } });
  } catch (error) {
    next(error);
  }
};

export const updatePart1Dictation = async (req, res, next) => {
  try {
    const item = await Part1Dictation.findById(req.params.id);
    if (!item) return res.status(404).json({ status: 'error', message: 'Không tìm thấy bài chép chính tả Part 1.' });

    const title = typeof req.body.title === 'string' ? req.body.title.trim() : '';
    const audioUrl = typeof req.body.audioUrl === 'string' ? req.body.audioUrl.trim() : '';
    const parsed = parseAnswers(req.body.answers);
    if (!title || !audioUrl || parsed.error) {
      return res.status(400).json({ status: 'error', message: parsed.error || 'Tên bài và file audio là bắt buộc.' });
    }

    item.title = title;
    item.audioUrl = audioUrl;
    item.answers = parsed.answers;
    item.isVisible = Boolean(req.body.isVisible);
    await item.save();
    res.json({ status: 'success', data: { item } });
  } catch (error) {
    next(error);
  }
};

export const setPart1DictationVisibility = async (req, res, next) => {
  try {
    if (typeof req.body.isVisible !== 'boolean') {
      return res.status(400).json({ status: 'error', message: 'isVisible phải là true hoặc false.' });
    }
    const item = await Part1Dictation.findByIdAndUpdate(
      req.params.id,
      { $set: { isVisible: req.body.isVisible } },
      { new: true, runValidators: true }
    );
    if (!item) return res.status(404).json({ status: 'error', message: 'Không tìm thấy bài chép chính tả Part 1.' });
    res.json({ status: 'success', data: { item } });
  } catch (error) {
    next(error);
  }
};

export const deletePart1Dictation = async (req, res, next) => {
  try {
    const item = await Part1Dictation.findByIdAndDelete(req.params.id);
    if (!item) return res.status(404).json({ status: 'error', message: 'Không tìm thấy bài chép chính tả Part 1.' });
    await deleteFromBlob(item.audioUrl).catch(() => {});
    res.json({ status: 'success', message: 'Đã xóa bài chép chính tả Part 1.' });
  } catch (error) {
    next(error);
  }
};

export const listStudentPart1Dictations = async (_req, res, next) => {
  try {
    const items = await Part1Dictation.find({ isVisible: true }).lean();
    items.sort((left, right) => left.title.localeCompare(right.title, 'en', { numeric: true, sensitivity: 'base' }));
    res.json({ status: 'success', data: { items: items.map(studentDto) } });
  } catch (error) {
    next(error);
  }
};

export const getStudentPart1Dictation = async (req, res, next) => {
  try {
    const item = await Part1Dictation.findOne({ _id: req.params.id, isVisible: true });
    if (!item) return res.status(404).json({ status: 'error', message: 'Bài chép chính tả không khả dụng.' });
    res.json({ status: 'success', data: { item: studentDto(item) } });
  } catch (error) {
    next(error);
  }
};

export const submitStudentPart1Dictation = async (req, res, next) => {
  try {
    const item = await Part1Dictation.findOne({ _id: req.params.id, isVisible: true });
    if (!item) return res.status(404).json({ status: 'error', message: 'Bài chép chính tả không khả dụng.' });

    const submissions = Array.isArray(req.body.answers) ? req.body.answers : [];
    const results = item.answers
      .sort((left, right) => left.order - right.order)
      .map((answer, index) => ({
        order: answer.order,
        isCorrect: normalizeAnswer(submissions[index]) === normalizeAnswer(answer.text),
        // Only disclose the reference text after the student has submitted.
        correctAnswer: answer.text,
        correctTranslation: answer.translation || '',
      }));
    const correctCount = results.filter((result) => result.isCorrect).length;
    res.json({
      status: 'success',
      data: {
        results,
        correctCount,
        total: results.length,
      },
    });
  } catch (error) {
    next(error);
  }
};
