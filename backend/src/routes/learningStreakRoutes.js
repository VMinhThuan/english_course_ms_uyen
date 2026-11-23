import express from 'express';
import {
  getMyLearningStreak,
  getMyLearningStreakCalendar,
  getMyLearningStreakMilestones,
} from '../controllers/learningStreakController.js';
import { verifyToken, requireActiveStudent } from '../middlewares/auth.js';

const router = express.Router();
router.use(verifyToken, requireActiveStudent);
router.get('/overview', getMyLearningStreak);
router.get('/calendar', getMyLearningStreakCalendar);
router.get('/milestones', getMyLearningStreakMilestones);

export default router;
