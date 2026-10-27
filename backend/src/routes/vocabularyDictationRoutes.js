import express from 'express';
import {
  createVocabularyDictation,
  deleteVocabularyDictation,
  getStudentVocabularyDictation,
  listAdminVocabularyDictations,
  listStudentVocabularyDictations,
  setVocabularyDictationVisibility,
  submitStudentVocabularyDictation,
  updateVocabularyDictation,
} from '../controllers/vocabularyDictationController.js';
import { checkRole, requireActiveStudent, verifyToken } from '../middlewares/auth.js';

const adminRouter = express.Router();
adminRouter.use(verifyToken, checkRole('admin'));
adminRouter.get('/', listAdminVocabularyDictations);
adminRouter.post('/', createVocabularyDictation);
adminRouter.put('/:id', updateVocabularyDictation);
adminRouter.patch('/:id/visibility', setVocabularyDictationVisibility);
adminRouter.delete('/:id', deleteVocabularyDictation);

const studentRouter = express.Router();
studentRouter.use(verifyToken, requireActiveStudent);
studentRouter.get('/', listStudentVocabularyDictations);
studentRouter.get('/:id', getStudentVocabularyDictation);
studentRouter.post('/:id/submit', submitStudentVocabularyDictation);

export { adminRouter as adminVocabularyDictationRoutes, studentRouter as studentVocabularyDictationRoutes };
