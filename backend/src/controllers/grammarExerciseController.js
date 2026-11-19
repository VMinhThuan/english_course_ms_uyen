import mongoose from 'mongoose';
import GrammarExerciseQuestion, { GRAMMAR_EXERCISE_TYPES } from '../models/GrammarExerciseQuestion.js';

const EXERCISE_DETAILS = {
  'tense-classification': {
    title: 'Phân loại thì và dạng câu',
    instructions: 'Xác định thì hoặc động từ khiếm khuyết, rồi phân biệt câu chủ động và bị động.',
  },
  'active-to-passive': {
    title: 'Chuyển câu chủ động thành câu bị động',
    instructions: 'Viết lại câu ở dạng bị động. Giữ nguyên thì hoặc động từ khiếm khuyết của câu gốc.',
  },
};

const isExerciseType = (value) => GRAMMAR_EXERCISE_TYPES.includes(value);
const parseNumber = (value) => {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 && number <= 9999 ? number : null;
};
const trimString = (value, maxLength = 2000) => (
  typeof value === 'string' && value.length <= maxLength ? value.trim() : null
);

const parseAdminQuestion = (body = {}) => {
  const exerciseType = body.exerciseType;
  const number = parseNumber(body.number);
  const prompt = trimString(body.prompt);
  if (!isExerciseType(exerciseType)) return { error: 'Loại bài tập không hợp lệ.' };
  if (!number) return { error: 'Số câu phải là số nguyên dương.' };
  if (!prompt) return { error: 'Nội dung câu hỏi là bắt buộc.' };

  if (exerciseType === 'tense-classification') {
    const tense = trimString(body.tense, 120);
    const sentenceForm = trimString(body.sentenceForm, 80);
    if (!tense || !sentenceForm) return { error: 'Hãy nhập thì và dạng câu.' };
    return {
      question: {
        exerciseType,
        number,
        prompt,
        tense,
        sentenceForm,
        answer: `${tense} – ${sentenceForm}`,
        translation: '',
        isVisible: body.isVisible === true,
      },
    };
  }

  const answer = trimString(body.answer);
  const translation = trimString(body.translation);
  if (!answer) return { error: 'Đáp án câu bị động là bắt buộc.' };
  if (!translation) return { error: 'Dịch nghĩa là bắt buộc.' };
  return {
    question: {
      exerciseType,
      number,
      prompt,
      tense: '',
      sentenceForm: '',
      answer,
      translation,
      isVisible: body.isVisible === true,
    },
  };
};

const uniqueValues = (items, field) => [...new Set(items
  .map((item) => String(item[field] || '').trim())
  .filter(Boolean))];

export const listStudentGrammarExercise = async (req, res, next) => {
  try {
    const { exerciseType } = req.params;
    if (!isExerciseType(exerciseType)) {
      return res.status(404).json({ status: 'error', message: 'Không tìm thấy dạng bài tập này.' });
    }

    const items = await GrammarExerciseQuestion.find({ exerciseType, isVisible: true })
      .select('number prompt tense sentenceForm')
      .sort({ number: 1 })
      .lean();
    const details = EXERCISE_DETAILS[exerciseType];
    const options = exerciseType === 'tense-classification'
      ? { tenses: uniqueValues(items, 'tense'), sentenceForms: uniqueValues(items, 'sentenceForm') }
      : { tenses: [], sentenceForms: [] };

    res.json({
      status: 'success',
      data: {
        exerciseType,
        ...details,
        options,
        items: items.map(({ number, prompt }) => ({ number, prompt })),
      },
    });
  } catch (error) {
    next(error);
  }
};

const normalizeAnswer = (value) => String(value || '')
  .normalize('NFKC')
  .toLocaleLowerCase('en')
  .replace(/\p{P}/gu, '')
  .replace(/\s+/gu, ' ')
  .trim();

export const checkStudentGrammarExercise = async (req, res, next) => {
  try {
    const { exerciseType } = req.params;
    if (!isExerciseType(exerciseType)) {
      return res.status(404).json({ status: 'error', message: 'Không tìm thấy dạng bài tập này.' });
    }
    if (!Array.isArray(req.body?.answers) || req.body.answers.length === 0 || req.body.answers.length > 200) {
      return res.status(400).json({ status: 'error', message: 'Danh sách câu trả lời không hợp lệ.' });
    }

    const submittedByNumber = new Map();
    for (const entry of req.body.answers) {
      const number = parseNumber(entry?.number);
      if (!number || submittedByNumber.has(number)) {
        return res.status(400).json({ status: 'error', message: 'Có câu trả lời không hợp lệ hoặc bị trùng.' });
      }

      if (exerciseType === 'tense-classification') {
        const tense = trimString(entry?.tense, 120);
        const sentenceForm = trimString(entry?.sentenceForm, 80);
        if (tense === null || sentenceForm === null) {
          return res.status(400).json({ status: 'error', message: 'Câu trả lời phân loại không hợp lệ.' });
        }
        submittedByNumber.set(number, { tense, sentenceForm });
      } else {
        const answer = trimString(entry?.answer, 2000);
        if (answer === null) {
          return res.status(400).json({ status: 'error', message: 'Câu trả lời không hợp lệ.' });
        }
        submittedByNumber.set(number, { answer });
      }
    }

    const items = await GrammarExerciseQuestion.find({
      exerciseType,
      isVisible: true,
      number: { $in: [...submittedByNumber.keys()] },
    })
      .select('number prompt tense sentenceForm answer translation')
      .sort({ number: 1 })
      .lean();

    if (items.length !== submittedByNumber.size) {
      return res.status(404).json({ status: 'error', message: 'Một số câu hỏi không còn khả dụng.' });
    }

    if (exerciseType === 'tense-classification') {
      let correctFieldCount = 0;
      const results = items.map((item) => {
        const submitted = submittedByNumber.get(item.number);
        const tenseCorrect = Boolean(submitted.tense) && submitted.tense === item.tense;
        const sentenceFormCorrect = Boolean(submitted.sentenceForm) && submitted.sentenceForm === item.sentenceForm;
        correctFieldCount += Number(tenseCorrect) + Number(sentenceFormCorrect);
        const answered = Boolean(submitted.tense || submitted.sentenceForm);
        const status = tenseCorrect && sentenceFormCorrect ? 'correct'
          : !answered ? 'unanswered'
            : tenseCorrect || sentenceFormCorrect ? 'partial' : 'incorrect';
        return {
          number: item.number,
          prompt: item.prompt,
          submittedTense: submitted.tense,
          submittedSentenceForm: submitted.sentenceForm,
          correctTense: item.tense,
          correctSentenceForm: item.sentenceForm,
          answer: item.answer,
          tenseCorrect,
          sentenceFormCorrect,
          status,
        };
      });
      return res.json({
        status: 'success',
        data: {
          items: results,
          total: results.length,
          correctCount: results.filter(({ status }) => status === 'correct').length,
          incorrectCount: results.filter(({ status }) => status === 'incorrect').length,
          partialCount: results.filter(({ status }) => status === 'partial').length,
          unansweredCount: results.filter(({ status }) => status === 'unanswered').length,
          correctFieldCount,
          totalFieldCount: results.length * 2,
        },
      });
    }

    const results = items.map((item) => {
      const submittedAnswer = submittedByNumber.get(item.number).answer;
      const answered = Boolean(submittedAnswer);
      const correct = answered && normalizeAnswer(submittedAnswer) === normalizeAnswer(item.answer);
      return {
        number: item.number,
        prompt: item.prompt,
        submittedAnswer,
        answer: item.answer,
        translation: item.translation,
        status: !answered ? 'unanswered' : correct ? 'correct' : 'incorrect',
      };
    });

    res.json({
      status: 'success',
      data: {
        items: results,
        total: results.length,
        correctCount: results.filter(({ status }) => status === 'correct').length,
        incorrectCount: results.filter(({ status }) => status === 'incorrect').length,
        unansweredCount: results.filter(({ status }) => status === 'unanswered').length,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const listAdminGrammarExercises = async (req, res, next) => {
  try {
    const exerciseType = req.query.exerciseType;
    if (exerciseType && !isExerciseType(exerciseType)) {
      return res.status(400).json({ status: 'error', message: 'Loại bài tập không hợp lệ.' });
    }
    const filter = exerciseType ? { exerciseType } : {};
    const items = await GrammarExerciseQuestion.find(filter).sort({ exerciseType: 1, number: 1 }).lean();
    res.json({ status: 'success', data: { items } });
  } catch (error) {
    next(error);
  }
};

export const createAdminGrammarExercise = async (req, res, next) => {
  try {
    const parsed = parseAdminQuestion(req.body);
    if (parsed.error) return res.status(400).json({ status: 'error', message: parsed.error });
    const item = await GrammarExerciseQuestion.create(parsed.question);
    res.status(201).json({ status: 'success', data: { item } });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ status: 'error', message: 'Số câu này đã tồn tại trong dạng bài tập.' });
    next(error);
  }
};

export const updateAdminGrammarExercise = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ status: 'error', message: 'Mã câu hỏi không hợp lệ.' });
    }
    const parsed = parseAdminQuestion(req.body);
    if (parsed.error) return res.status(400).json({ status: 'error', message: parsed.error });
    const item = await GrammarExerciseQuestion.findByIdAndUpdate(
      req.params.id,
      { $set: parsed.question },
      { new: true, runValidators: true },
    ).lean();
    if (!item) return res.status(404).json({ status: 'error', message: 'Không tìm thấy câu hỏi.' });
    res.json({ status: 'success', data: { item } });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ status: 'error', message: 'Số câu này đã tồn tại trong dạng bài tập.' });
    next(error);
  }
};

export const setAdminGrammarExerciseVisibility = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ status: 'error', message: 'Mã câu hỏi không hợp lệ.' });
    }
    if (typeof req.body?.isVisible !== 'boolean') {
      return res.status(400).json({ status: 'error', message: 'isVisible phải là true hoặc false.' });
    }
    const item = await GrammarExerciseQuestion.findByIdAndUpdate(
      req.params.id,
      { $set: { isVisible: req.body.isVisible } },
      { new: true, runValidators: true },
    ).lean();
    if (!item) return res.status(404).json({ status: 'error', message: 'Không tìm thấy câu hỏi.' });
    res.json({ status: 'success', data: { item } });
  } catch (error) {
    next(error);
  }
};

export const deleteAdminGrammarExercise = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ status: 'error', message: 'Mã câu hỏi không hợp lệ.' });
    }
    const item = await GrammarExerciseQuestion.findByIdAndDelete(req.params.id).lean();
    if (!item) return res.status(404).json({ status: 'error', message: 'Không tìm thấy câu hỏi.' });
    res.json({ status: 'success', message: 'Đã xóa câu hỏi.', data: { id: item._id } });
  } catch (error) {
    next(error);
  }
};
