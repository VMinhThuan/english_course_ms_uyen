import express from 'express';
import {
  createToeicTest,
  getAdminToeicTests,
  getAdminToeicTestById,
  getEligibleToeicPart5BankQuestions,
  addToeicPart5BankQuestions,
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
  autosaveToeicAttemptAnswers,
  submitToeicAttempt,
  getStudentToeicHistory,
} from '../controllers/toeicController.js';
import { verifyToken, checkRole, requireActiveStudent } from '../middlewares/auth.js';
import { getPrivateUploadDir, getPublicUploadDir } from '../utils/uploadConfig.js';
import {
  createSafeDiskStorage,
  createUpload,
  MAX_TOEIC_IMPORT_BYTES,
  MiB,
  TOEIC_UPLOAD_POLICIES,
} from '../utils/uploadValidation.js';

const pdfUpload = createUpload({
  storage: createSafeDiskStorage({
    directory: (_req, file) => file.fieldname === 'pageImages' ? getPublicUploadDir() : getPrivateUploadDir(),
    prefix: 'toeic',
  }),
  policies: TOEIC_UPLOAD_POLICIES,
  maxFileSize: MAX_TOEIC_IMPORT_BYTES,
  maxFiles: 101,
  maxFieldSize: 5 * MiB,
});

// ==================================================
// ADMIN / TEACHER ROUTES (/api/v1/admin/toeic-tests)
// ==================================================
const adminRouter = express.Router();
adminRouter.use(verifyToken, checkRole('admin', 'teacher'));

adminRouter.get('/toeic-tests', getAdminToeicTests);
adminRouter.post('/toeic-tests', createToeicTest);
adminRouter.post('/toeic-tests/template', createToeicTest);
adminRouter.get('/toeic-tests/:id', getAdminToeicTestById);
// The general TOEIC builder remains Admin/Teacher; this new bank picker is Admin-only.
adminRouter.get('/toeic-tests/:id/question-bank/part5', checkRole('admin'), getEligibleToeicPart5BankQuestions);
adminRouter.post('/toeic-tests/:id/question-bank/part5/selections', checkRole('admin'), addToeicPart5BankQuestions);
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
studentRouter.patch('/attempts/:attemptId/answers', autosaveToeicAttemptAnswers);
studentRouter.post('/attempts/:attemptId/submit', submitToeicAttempt);

export { adminRouter as adminToeicRoutes, studentRouter as studentToeicRoutes };
