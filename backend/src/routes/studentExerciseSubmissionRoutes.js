import express from 'express';
import { getMyExerciseSubmissions } from '../controllers/studentExerciseSubmissionController.js';
import { checkRole, requireActiveStudent, verifyToken } from '../middlewares/auth.js';

const router = express.Router();

router.get('/mine', verifyToken, checkRole('student'), requireActiveStudent, getMyExerciseSubmissions);

export default router;
