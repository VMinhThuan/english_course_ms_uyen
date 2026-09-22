import express from 'express';
import {
  createAssessment,
  getAdminAssessments,
  getAdminAssessmentById,
  updateAssessment,
  updateAssessmentStatus,
  deleteAssessment,
} from '../controllers/assessmentController.js';
import {
  getAvailableAssessments,
  getStudentAssessmentById,
  startAttempt,
} from '../controllers/attemptController.js';
import { verifyToken, checkRole, requireActiveStudent } from '../middlewares/auth.js';

const router = express.Router();

// Student routes
router.get('/available', verifyToken, requireActiveStudent, getAvailableAssessments);
router.get('/:id', verifyToken, requireActiveStudent, getStudentAssessmentById);
router.post('/:id/start', verifyToken, requireActiveStudent, startAttempt);

// Admin routes
router.post('/admin', verifyToken, checkRole('teacher', 'admin'), createAssessment);
router.get('/admin', verifyToken, checkRole('teacher', 'admin'), getAdminAssessments);
router.get('/admin/:id', verifyToken, checkRole('teacher', 'admin'), getAdminAssessmentById);
router.put('/admin/:id', verifyToken, checkRole('teacher', 'admin'), updateAssessment);
router.patch('/admin/:id', verifyToken, checkRole('teacher', 'admin'), updateAssessment);
router.patch('/admin/:id/status', verifyToken, checkRole('teacher', 'admin'), updateAssessmentStatus);
router.delete('/admin/:id', verifyToken, checkRole('teacher', 'admin'), deleteAssessment);

export default router;
