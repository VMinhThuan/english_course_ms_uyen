import express from 'express';
import {
  createQuestion,
  getQuestions,
  getQuestionById,
  updateQuestion,
  deleteQuestion,
  getStudentPart5Questions,
  submitStudentPart5Answer,
} from '../controllers/questionController.js';
import { verifyToken, checkRole, requireActiveStudent } from '../middlewares/auth.js';

const router = express.Router();

router.get('/part-5', verifyToken, requireActiveStudent, getStudentPart5Questions);
router.post('/part-5/:id/submit', verifyToken, requireActiveStudent, submitStudentPart5Answer);

router.use(verifyToken, checkRole('teacher', 'admin'));

router.post('/', createQuestion);
router.get('/', getQuestions);
router.get('/:id', getQuestionById);
router.put('/:id', updateQuestion);
router.patch('/:id', updateQuestion);
router.delete('/:id', deleteQuestion);

export default router;
