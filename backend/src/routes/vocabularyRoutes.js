import express from 'express';
import multer from 'multer';
import {
  createVocabulary,
  getAdminVocabulary,
  getAdminVocabularyById,
  updateVocabulary,
  deleteVocabulary,
  getStudentVocabularyByLesson,
  previewDocxVocabulary,
  confirmDocxVocabularyImport,
} from '../controllers/vocabularyController.js';
import { verifyToken, checkRole } from '../middlewares/auth.js';
import {
  createUpload,
  DOCX_UPLOAD_POLICIES,
  MAX_DOCX_IMPORT_BYTES,
} from '../utils/uploadValidation.js';

const router = express.Router();

const docxUpload = createUpload({
  storage: multer.memoryStorage(),
  policies: DOCX_UPLOAD_POLICIES,
  maxFileSize: MAX_DOCX_IMPORT_BYTES,
  maxFiles: 1,
});
const handleDocxUpload = docxUpload.single('file', { required: true });

// Student routes
router.get('/', verifyToken, getStudentVocabularyByLesson);
router.get('/lesson/:lessonId', verifyToken, getStudentVocabularyByLesson);

// Admin / Teacher DOCX Import
router.post('/admin/import-docx/preview', verifyToken, checkRole('teacher', 'admin'), handleDocxUpload, previewDocxVocabulary);
router.post('/admin/import-docx/confirm', verifyToken, checkRole('teacher', 'admin'), confirmDocxVocabularyImport);
router.post('/import-docx/preview', verifyToken, checkRole('teacher', 'admin'), handleDocxUpload, previewDocxVocabulary);
router.post('/import-docx/confirm', verifyToken, checkRole('teacher', 'admin'), confirmDocxVocabularyImport);

// Admin CRUD routes
router.post('/admin', verifyToken, checkRole('teacher', 'admin'), createVocabulary);
router.get('/admin', verifyToken, checkRole('teacher', 'admin'), getAdminVocabulary);
router.get('/admin/:id', verifyToken, checkRole('teacher', 'admin'), getAdminVocabularyById);
router.put('/admin/:id', verifyToken, checkRole('teacher', 'admin'), updateVocabulary);
router.patch('/admin/:id', verifyToken, checkRole('teacher', 'admin'), updateVocabulary);
router.delete('/admin/:id', verifyToken, checkRole('teacher', 'admin'), deleteVocabulary);

export default router;
