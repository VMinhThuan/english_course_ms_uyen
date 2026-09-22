import express from 'express';
import {
  createToeicTest,
  getAdminToeicTests,
  getAdminToeicTestById,
  updateToeicTest,
  upsertQuestionGroup,
  duplicateToeicTest,
  publishToeicTest,
  deleteToeicTest,
  importToeicCsv,
  getStudentToeicTests,
  getStudentToeicTestOverview,
  startToeicAttempt,
  getStudentToeicAttempt,
  autosaveAttemptAnswers,
  submitToeicAttempt,
} from '../controllers/toeicController.js';
import { verifyToken, checkRole, requireActiveStudent } from '../middlewares/auth.js';

const router = express.Router();

// ==================================================
// ADMIN ROUTES (/api/v1/admin/toeic-tests)
// ==================================================
const adminRouter = express.Router();
adminRouter.use(verifyToken, checkRole('admin'));

adminRouter.get('/toeic-tests', getAdminToeicTests);
adminRouter.post('/toeic-tests', createToeicTest);
adminRouter.post('/toeic-tests/template', createToeicTest);
adminRouter.get('/toeic-tests/:id', getAdminToeicTestById);
adminRouter.put('/toeic-tests/:id', updateToeicTest);
adminRouter.post('/toeic-tests/:id/groups', upsertQuestionGroup);
adminRouter.post('/toeic-tests/:id/duplicate', duplicateToeicTest);
adminRouter.post('/toeic-tests/:id/publish', publishToeicTest);
adminRouter.delete('/toeic-tests/:id', deleteToeicTest);
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
studentRouter.get('/attempts/:attemptId', getStudentToeicAttempt);
studentRouter.patch('/attempts/:attemptId/answers', autosaveAttemptAnswers);
studentRouter.post('/attempts/:attemptId/submit', submitToeicAttempt);

export { adminRouter as adminToeicRoutes, studentRouter as studentToeicRoutes };
