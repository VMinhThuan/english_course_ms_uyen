import express from 'express';
import path from 'path';
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

const router = express.Router();

const docxUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext !== '.docx') {
      return cb(new Error('Chỉ chấp nhận file định dạng Word (.docx).'), false);
    }
    cb(null, true);
  },
});

const handleDocxUpload = (req, res, next) => {
  docxUpload.single('file')(req, res, (err) => {
    if (err) {
      return res.status(400).json({
        status: 'error',
        message: err.message || 'Lỗi tải lên file DOCX.',
      });
    }
    next();
  });
};

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
