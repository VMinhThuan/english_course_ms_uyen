import express from 'express';
import { verifyToken, checkRole } from '../middlewares/auth.js';
import {
  answerDaily,
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
router.post('/daily-challenge/:challengeId/answer', answerDaily);
router.post('/quest/levels/:level/start', startQuest);
router.post('/quest/attempts/:attemptId/submit', submitQuest);
router.post('/quest/attempts/:attemptId/progress', saveQuestProgress);

export default router;
