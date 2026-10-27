import express from 'express';
import {
  createPart1Dictation,
  deletePart1Dictation,
  getStudentPart1Dictation,
  listAdminPart1Dictations,
  listStudentPart1Dictations,
  setPart1DictationVisibility,
  submitStudentPart1Dictation,
  updatePart1Dictation,
} from '../controllers/part1DictationController.js';
import { checkRole, requireActiveStudent, verifyToken } from '../middlewares/auth.js';

const adminRouter = express.Router();
adminRouter.use(verifyToken, checkRole('admin'));
adminRouter.get('/', listAdminPart1Dictations);
adminRouter.post('/', createPart1Dictation);
adminRouter.put('/:id', updatePart1Dictation);
adminRouter.patch('/:id/visibility', setPart1DictationVisibility);
adminRouter.delete('/:id', deletePart1Dictation);

const studentRouter = express.Router();
studentRouter.use(verifyToken, requireActiveStudent);
studentRouter.get('/', listStudentPart1Dictations);
studentRouter.get('/:id', getStudentPart1Dictation);
studentRouter.post('/:id/submit', submitStudentPart1Dictation);

export { adminRouter as adminPart1DictationRoutes, studentRouter as studentPart1DictationRoutes };
