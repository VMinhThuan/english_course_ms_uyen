import express from 'express';
import {
  getLearningOverview,
  getLearningStudents,
  getLearningStudentDetail,
  getLearningStudentProgress,
  getLearningStudentHistory,
  getCourseStats,
} from '../controllers/adminLearningController.js';
import { verifyToken, checkRole } from '../middlewares/auth.js';

const router = express.Router();

// Require authenticated Admin or Teacher token for all admin learning routes
router.use(verifyToken, checkRole('admin', 'teacher'));

router.get('/overview', getLearningOverview);
router.get('/students', getLearningStudents);
router.get('/students/:studentId', getLearningStudentDetail);
router.get('/students/:studentId/progress', getLearningStudentProgress);
router.get('/students/:studentId/history', getLearningStudentHistory);
router.get('/courses/:courseId/stats', getCourseStats);

export default router;
