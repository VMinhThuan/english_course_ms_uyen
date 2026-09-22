import express from 'express';
import {
  accessLesson,
  completeLesson,
  getAdminStudentProgress,
  getStudentDashboard,
} from '../controllers/progressController.js';
import { verifyToken, checkRole, requireActiveStudent } from '../middlewares/auth.js';

const router = express.Router();

// Student progress tracking
router.post('/access', verifyToken, requireActiveStudent, accessLesson);
router.post('/complete', verifyToken, requireActiveStudent, completeLesson);
router.get('/student-dashboard', verifyToken, requireActiveStudent, getStudentDashboard);

// Admin student progress inspector
router.get('/students/:studentId/progress', verifyToken, checkRole('teacher', 'admin'), getAdminStudentProgress);

export default router;

