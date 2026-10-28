import Part2ChallengeQuestion from '../models/Part2ChallengeQuestion.js';

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
    const number = Number(req.params.number);
    if (!Number.isInteger(number) || number < 1 || number > 110) {
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
