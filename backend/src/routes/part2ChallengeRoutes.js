import express from 'express';
import {
  getStudentPart2ChallengeAnswer,
  listStudentPart2ChallengeQuestions,
} from '../controllers/part2ChallengeController.js';
import { requireActiveStudent, verifyToken } from '../middlewares/auth.js';

const studentRouter = express.Router();
studentRouter.use(verifyToken, requireActiveStudent);
studentRouter.get('/', listStudentPart2ChallengeQuestions);
studentRouter.get('/:number/answer', getStudentPart2ChallengeAnswer);

export default studentRouter;
