import express from 'express';
import {
  getTestByLesson,
  submitTest,
  getTestResult,
} from '../controllers/testController.js';
import { verifyToken, checkRole } from '../middlewares/auth.js';

const router = express.Router();

router.get('/lesson/:lessonId', verifyToken, getTestByLesson);
router.post('/:testId/submit', verifyToken, checkRole('student'), submitTest);
router.get('/:testId/result', verifyToken, checkRole('student'), getTestResult);

export default router;

