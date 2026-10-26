import express from 'express';
import {
  getStudents,
  createStudent,
  getStudent,
  approveStudent,
  rejectStudent,
  suspendStudent,
  activateStudent,
  getAdminStats,
} from '../controllers/adminController.js';
import {
  getAdminStudentAttempts,
  getAdminReportAssessments,
  getAdminResults,
} from '../controllers/adminReportingController.js';
import {
  createQuestion,
  getQuestions,
  getQuestionById,
  updateQuestion,
  deleteQuestion,
} from '../controllers/questionController.js';
import {
  createAssessment,
  getAdminAssessments,
  getAdminAssessmentById,
  updateAssessment,
  updateAssessmentStatus,
  deleteAssessment,
} from '../controllers/assessmentController.js';
import { verifyToken, checkRole } from '../middlewares/auth.js';

const router = express.Router();

// Require authenticated Admin or Teacher token for admin endpoints
router.use(verifyToken, checkRole('admin', 'teacher'));

// System stats
router.get('/stats', getAdminStats);

// Student management
router.get('/students', getStudents);
router.post('/students', createStudent);
router.get('/students/:id', getStudent);
router.patch('/students/:id/approve', approveStudent);
router.patch('/students/:id/reject', rejectStudent);
router.patch('/students/:id/suspend', suspendStudent);
router.patch('/students/:id/activate', activateStudent);

router.get('/students/:studentId/attempts', getAdminStudentAttempts);

// Question Bank admin endpoints
router.post('/questions', createQuestion);
router.get('/questions', getQuestions);
router.get('/questions/:id', getQuestionById);
router.put('/questions/:id', updateQuestion);
router.patch('/questions/:id', updateQuestion);
router.delete('/questions/:id', deleteQuestion);

// Assessment (Exercise & Exam) admin endpoints
router.post('/assessments', createAssessment);
router.get('/assessments', getAdminAssessments);
router.get('/assessments/:id', getAdminAssessmentById);
router.put('/assessments/:id', updateAssessment);
router.patch('/assessments/:id', updateAssessment);
router.patch('/assessments/:id/status', updateAssessmentStatus);
router.delete('/assessments/:id', deleteAssessment);

// Admin Results inspector
router.get('/report-assessments', getAdminReportAssessments);
router.get('/results', getAdminResults);

export default router;
