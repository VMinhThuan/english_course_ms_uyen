import express from 'express';
import {
  submitAttempt,
  getAttemptResult,
  getStudentHistory,
  getAdminResults,
} from '../controllers/attemptController.js';
import { verifyToken, checkRole, requireActiveStudent } from '../middlewares/auth.js';
import { autosaveAttemptAnswers } from '../controllers/toeicController.js';

const router = express.Router();

// Static routes MUST be declared before parameterized routes (/:attemptId)
router.get('/history', verifyToken, requireActiveStudent, getStudentHistory);
router.get('/admin/results', verifyToken, checkRole('teacher', 'admin'), getAdminResults);

// Parameterized student attempt routes
router.patch('/:attemptId/answers', verifyToken, requireActiveStudent, autosaveAttemptAnswers);
router.post('/:attemptId/submit', verifyToken, requireActiveStudent, submitAttempt);
router.get('/:attemptId/result', verifyToken, requireActiveStudent, getAttemptResult);

export default router;
