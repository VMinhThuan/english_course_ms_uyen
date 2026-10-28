import Part2ChallengeQuestion from '../models/Part2ChallengeQuestion.js';

const parseQuestionNumber = (value) => {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 && number <= 9999 ? number : null;
};

const parseQuestionPayload = (body = {}) => {
  const questionText = typeof body.questionText === 'string' ? body.questionText.trim() : '';
  const choices = ['A', 'B', 'C'].map((letter) => ({
    letter,
    text: typeof body.choices?.find?.((choice) => choice?.letter === letter)?.text === 'string'
      ? body.choices.find((choice) => choice?.letter === letter).text.trim()
      : typeof body.choices?.[letter] === 'string' ? body.choices[letter].trim() : '',
  }));
  const correctAnswer = typeof body.correctAnswer === 'string' ? body.correctAnswer.trim().toUpperCase() : '';
  const script = typeof body.script === 'string' ? body.script.trim() : '';
  const translation = typeof body.translation === 'string' ? body.translation.trim() : '';
  const audioUrl = typeof body.audioUrl === 'string' ? body.audioUrl.trim() : '';
  const audioFilename = typeof body.audioFilename === 'string' ? body.audioFilename.trim() : '';

  if (!questionText) return { error: 'Nội dung câu hỏi là bắt buộc.' };
  if (choices.some((choice) => !choice.text)) return { error: 'Hãy nhập đủ nội dung đáp án A, B và C.' };
  if (!['A', 'B', 'C'].includes(correctAnswer)) return { error: 'Đáp án đúng phải là A, B hoặc C.' };
  if (!script) return { error: 'Script là bắt buộc.' };
  if (!translation) return { error: 'Dịch nghĩa là bắt buộc.' };
  if (audioUrl && !audioUrl.startsWith('/') && !/^https:\/\//i.test(audioUrl)) {
    return { error: 'Đường dẫn audio phải là URL HTTPS hợp lệ.' };
  }
  return {
    question: {
      questionText,
      choices,
      correctAnswer,
      script,
      translation,
      audioFilename,
      audioUrl,
      isVisible: typeof body.isVisible === 'boolean' ? body.isVisible : false,
    },
  };
};

export const createAdminPart2ChallengeQuestion = async (req, res, next) => {
  try {
    const number = parseQuestionNumber(req.body.number);
    if (!number) return res.status(400).json({ status: 'error', message: 'Số câu phải là số nguyên dương.' });
    const parsed = parseQuestionPayload(req.body);
    if (parsed.error) return res.status(400).json({ status: 'error', message: parsed.error });

    const item = await Part2ChallengeQuestion.create({ number, ...parsed.question });
    res.status(201).json({ status: 'success', data: { item } });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ status: 'error', message: 'Số câu này đã tồn tại.' });
    next(error);
  }
};

export const updateAdminPart2ChallengeQuestion = async (req, res, next) => {
  try {
    const number = parseQuestionNumber(req.params.number);
    if (!number) return res.status(400).json({ status: 'error', message: 'Số câu không hợp lệ.' });
    const parsed = parseQuestionPayload(req.body);
    if (parsed.error) return res.status(400).json({ status: 'error', message: parsed.error });

    const item = await Part2ChallengeQuestion.findOneAndUpdate(
      { number },
      { $set: parsed.question },
      { new: true, runValidators: true },
    ).lean();
    if (!item) return res.status(404).json({ status: 'error', message: 'Không tìm thấy câu hỏi Part 2.' });
    res.json({ status: 'success', data: { item } });
  } catch (error) {
    next(error);
  }
};

export const deleteAdminPart2ChallengeQuestion = async (req, res, next) => {
  try {
    const number = parseQuestionNumber(req.params.number);
    if (!number) return res.status(400).json({ status: 'error', message: 'Số câu không hợp lệ.' });
    const item = await Part2ChallengeQuestion.findOneAndDelete({ number });
    if (!item) return res.status(404).json({ status: 'error', message: 'Không tìm thấy câu hỏi Part 2.' });
    res.json({ status: 'success', message: 'Đã xóa câu hỏi Part 2.', data: { number } });
  } catch (error) {
    next(error);
  }
};

export const listAdminPart2ChallengeQuestions = async (_req, res, next) => {
  try {
    const items = await Part2ChallengeQuestion.find().sort({ number: 1 }).lean();
    res.json({ status: 'success', data: { items } });
  } catch (error) {
    next(error);
  }
};

export const setPart2ChallengeQuestionVisibility = async (req, res, next) => {
  try {
    const number = parseQuestionNumber(req.params.number);
    if (!number) {
      return res.status(400).json({ status: 'error', message: 'Số câu không hợp lệ.' });
    }
    if (typeof req.body.isVisible !== 'boolean') {
      return res.status(400).json({ status: 'error', message: 'isVisible phải là true hoặc false.' });
    }

    const item = await Part2ChallengeQuestion.findOneAndUpdate(
      { number },
      { $set: { isVisible: req.body.isVisible } },
      { new: true, runValidators: true },
    ).lean();
    if (!item) return res.status(404).json({ status: 'error', message: 'Không tìm thấy câu hỏi Part 2.' });
    res.json({ status: 'success', data: { item } });
  } catch (error) {
    next(error);
  }
};

const toStudentQuestion = (item) => ({
  number: item.number,
  questionText: item.questionText,
  choices: item.choices.map(({ letter, text }) => ({ letter, text })),
  audioUrl: item.audioUrl || '',
});

export const listStudentPart2ChallengeQuestions = async (_req, res, next) => {
  try {
    const items = await Part2ChallengeQuestion.find({ isVisible: true })
      .select('number questionText choices audioUrl')
      .sort({ number: 1 })
      .lean();
    res.json({ status: 'success', data: { items: items.map(toStudentQuestion) } });
  } catch (error) {
    next(error);
  }
};

export const getStudentPart2ChallengeAnswer = async (req, res, next) => {
  try {
    const number = parseQuestionNumber(req.params.number);
    if (!number) {
      return res.status(400).json({ status: 'error', message: 'Số câu không hợp lệ.' });
    }

    const item = await Part2ChallengeQuestion.findOne({ number, isVisible: true })
      .select('number choices correctAnswer script translation')
      .lean();
    if (!item) return res.status(404).json({ status: 'error', message: 'Không tìm thấy câu hỏi Part 2.' });

    const correctChoice = item.choices.find(({ letter }) => letter === item.correctAnswer);
    res.json({
      status: 'success',
      data: {
        number: item.number,
        correctAnswer: item.correctAnswer,
        correctChoice: correctChoice?.text || '',
        script: item.script,
        translation: item.translation,
      },
    });
  } catch (error) {
    next(error);
  }
};
