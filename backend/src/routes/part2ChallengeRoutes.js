import express from 'express';
import {
  getStudentPart2ChallengeAnswer,
  listAdminPart2ChallengeQuestions,
  listStudentPart2ChallengeQuestions,
  setPart2ChallengeQuestionVisibility,
} from '../controllers/part2ChallengeController.js';
import { checkRole, requireActiveStudent, verifyToken } from '../middlewares/auth.js';

const adminRouter = express.Router();
adminRouter.use(verifyToken, checkRole('admin'));
adminRouter.get('/', listAdminPart2ChallengeQuestions);
adminRouter.patch('/:number/visibility', setPart2ChallengeQuestionVisibility);

const studentRouter = express.Router();
studentRouter.use(verifyToken, requireActiveStudent);
studentRouter.get('/', listStudentPart2ChallengeQuestions);
studentRouter.get('/:number/answer', getStudentPart2ChallengeAnswer);

export { adminRouter as adminPart2ChallengeRoutes, studentRouter as studentPart2ChallengeRoutes };
