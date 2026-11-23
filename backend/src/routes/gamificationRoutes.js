import express from 'express';
import { verifyToken, checkRole } from '../middlewares/auth.js';
import {
  answerDaily,
  getDailyHistory,
  getOverview,
  startDaily,
  startQuest,
  submitQuest,
  saveQuestProgress,
} from '../controllers/gamificationController.js';

const router = express.Router();
router.use(verifyToken, checkRole('student'));
router.get('/overview', getOverview);
router.post('/daily-challenge/start', startDaily);
router.get('/daily-challenge/history/:dateKey', getDailyHistory);
router.post('/daily-challenge/:challengeId/answer', answerDaily);
router.post('/quest/levels/:level/start', startQuest);
router.post('/quest/attempts/:attemptId/submit', submitQuest);
router.post('/quest/attempts/:attemptId/progress', saveQuestProgress);

export default router;
