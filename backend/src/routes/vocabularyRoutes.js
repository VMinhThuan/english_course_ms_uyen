import express from 'express';
import {
  createVocabulary,
  getAdminVocabulary,
  getAdminVocabularyById,
  updateVocabulary,
  deleteVocabulary,
  getStudentVocabularyByLesson,
} from '../controllers/vocabularyController.js';
import { verifyToken, checkRole } from '../middlewares/auth.js';

const router = express.Router();

// Student routes
router.get('/lesson/:lessonId', verifyToken, getStudentVocabularyByLesson);

// Admin routes
router.post('/admin', verifyToken, checkRole('teacher', 'admin'), createVocabulary);
router.get('/admin', verifyToken, checkRole('teacher', 'admin'), getAdminVocabulary);
router.get('/admin/:id', verifyToken, checkRole('teacher', 'admin'), getAdminVocabularyById);
router.put('/admin/:id', verifyToken, checkRole('teacher', 'admin'), updateVocabulary);
router.patch('/admin/:id', verifyToken, checkRole('teacher', 'admin'), updateVocabulary);
router.delete('/admin/:id', verifyToken, checkRole('teacher', 'admin'), deleteVocabulary);

export default router;
