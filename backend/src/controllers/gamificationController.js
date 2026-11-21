import {
  answerDailyChallenge,
  getGamificationOverview,
  startDailyChallenge,
  startQuestAssessment,
  submitQuestAssessment,
  saveQuestAnswer,
} from '../services/gamificationService.js';

const studentId = (req) => req.user._id || req.user.id;

export async function getOverview(req, res, next) {
  try {
    const result = await getGamificationOverview(studentId(req), req.headers['x-timezone']);
    return res.json({ status: 'success', data: result });
  } catch (error) { return next(error); }
}

export async function startDaily(req, res, next) {
  try {
    const result = await startDailyChallenge(studentId(req), req.headers['x-timezone']);
    return res.json({ status: 'success', data: { challenge: result } });
  } catch (error) { return next(error); }
}

export async function answerDaily(req, res, next) {
  try {
    const { questionId, answer } = req.body || {};
    if (!questionId || answer === undefined || answer === null) {
      return res.status(400).json({ status: 'error', code: 'ANSWER_REQUIRED', message: 'Vui lòng chọn một đáp án.' });
    }
    const result = await answerDailyChallenge(studentId(req), req.params.challengeId, questionId, answer);
    return res.json({ status: 'success', data: result });
  } catch (error) { return next(error); }
}

export async function startQuest(req, res, next) {
  try {
    const result = await startQuestAssessment(studentId(req), req.params.level, req.body?.stage || req.query.stage || 1);
    return res.json({ status: 'success', data: { attempt: result } });
  } catch (error) { return next(error); }
}

export async function submitQuest(req, res, next) {
  try {
    const result = await submitQuestAssessment(studentId(req), req.params.attemptId, req.body?.answers);
    return res.json({ status: 'success', data: { attempt: result } });
  } catch (error) { return next(error); }
}

export async function saveQuestProgress(req, res, next) {
  try {
    const { questionId, answer } = req.body || {};
    if (!questionId || answer === undefined || answer === null) {
      return res.status(400).json({ status: 'error', code: 'ANSWER_REQUIRED', message: 'Vui lòng chọn một đáp án.' });
    }
    const result = await saveQuestAnswer(studentId(req), req.params.attemptId, questionId, answer);
    return res.json({ status: 'success', data: { attempt: result } });
  } catch (error) { return next(error); }
}
