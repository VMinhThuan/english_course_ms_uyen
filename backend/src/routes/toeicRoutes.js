import express from 'express';
import multer from 'multer';
import fs from 'fs';
import {
  createToeicTest,
  getAdminToeicTests,
  getAdminToeicTestById,
  updateToeicTest,
  upsertQuestionGroup,
  duplicateToeicTest,
  publishToeicTest,
  unpublishToeicTest,
  deleteToeicTest,
  deleteQuestionGroupFromTest,
  deleteQuestionFromTest,
  importToeicCsv,
  importToeicPdf,
  getStudentToeicTests,
  getStudentToeicTestOverview,
  startToeicAttempt,
  getStudentToeicAttempt,
  autosaveAttemptAnswers,
  submitToeicAttempt,
  getStudentToeicHistory,
} from '../controllers/toeicController.js';
import { verifyToken, checkRole, requireActiveStudent } from '../middlewares/auth.js';
import { getUploadDir } from '../utils/uploadConfig.js';

const pdfStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, getUploadDir());
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    if (file.fieldname === 'pageImages') {
      const pageNumber = file.originalname.match(/^page-(\d+)\.jpg$/i)?.[1];
      return cb(null, `toeic-page-${uniqueSuffix}-${pageNumber}.jpg`);
    }
    cb(null, 'pdf-' + uniqueSuffix + '-' + file.originalname.replace(/[^a-zA-Z0-9_.-]/g, '_'));
  },
});

const pdfUpload = multer({
  storage: pdfStorage,
  fileFilter: (req, file, cb) => {
    if (file.fieldname === 'file' && (file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf'))) {
      cb(null, true);
    } else if (file.fieldname === 'pageImages' && file.mimetype === 'image/jpeg' && /^page-\d+\.jpg$/i.test(file.originalname)) {
      cb(null, true);
    } else {
      cb(new Error('PDF chỉ nhận file PDF và ảnh trang JPEG được đánh số.'), false);
    }
  },
  limits: { fileSize: 30 * 1024 * 1024, fieldSize: 5 * 1024 * 1024, files: 101 }, // PDF, browser OCR text, and rendered visual pages
});

const router = express.Router();

// ==================================================
// ADMIN / TEACHER ROUTES (/api/v1/admin/toeic-tests)
// ==================================================
const adminRouter = express.Router();
adminRouter.use(verifyToken, checkRole('admin', 'teacher'));

adminRouter.get('/toeic-tests', getAdminToeicTests);
adminRouter.post('/toeic-tests', createToeicTest);
adminRouter.post('/toeic-tests/template', createToeicTest);
adminRouter.get('/toeic-tests/:id', getAdminToeicTestById);
adminRouter.put('/toeic-tests/:id', updateToeicTest);
adminRouter.post('/toeic-tests/:id/groups', upsertQuestionGroup);
adminRouter.post('/toeic-tests/:id/duplicate', duplicateToeicTest);
adminRouter.post('/toeic-tests/:id/publish', publishToeicTest);
adminRouter.post('/toeic-tests/:id/unpublish', unpublishToeicTest);
adminRouter.delete('/toeic-tests/:id', deleteToeicTest);
adminRouter.delete('/toeic-tests/:id/groups/:groupId', deleteQuestionGroupFromTest);
adminRouter.delete('/toeic-tests/:id/questions/:questionId', deleteQuestionFromTest);
const pdfImportUpload = pdfUpload.fields([
  { name: 'file', maxCount: 1 },
  { name: 'pageImages', maxCount: 100 },
]);
adminRouter.post('/toeic-tests/import-pdf', pdfImportUpload, importToeicPdf);
adminRouter.post('/toeic-tests/:id/import-pdf', pdfImportUpload, importToeicPdf);
adminRouter.post('/toeic-tests/:id/import-csv', importToeicCsv);
adminRouter.post('/toeic-tests/:id/import-preview', (req, res, next) => {
  req.body.previewOnly = true;
  return importToeicCsv(req, res, next);
});

// ==================================================
// STUDENT ROUTES (/api/v1/toeic)
// ==================================================
const studentRouter = express.Router();
studentRouter.use(verifyToken, requireActiveStudent);

studentRouter.get('/available', getStudentToeicTests);
studentRouter.get('/tests', getStudentToeicTests);
studentRouter.get('/tests/:id', getStudentToeicTestOverview);
studentRouter.post('/tests/:id/start', startToeicAttempt);
studentRouter.get('/history', getStudentToeicHistory);
studentRouter.get('/attempts/:attemptId', getStudentToeicAttempt);
studentRouter.patch('/attempts/:attemptId/answers', autosaveAttemptAnswers);
studentRouter.post('/attempts/:attemptId/submit', submitToeicAttempt);

export { adminRouter as adminToeicRoutes, studentRouter as studentToeicRoutes };
