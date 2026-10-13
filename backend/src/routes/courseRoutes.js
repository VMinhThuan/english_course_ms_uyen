import express from 'express';
import {
  getCourses,
  getCourseById,
  createCourse,
  updateCourse,
  updateCourseStatus,
  reorderCourseLessons,
  deleteCourse,
} from '../controllers/courseController.js';
import { verifyToken, checkRole } from '../middlewares/auth.js';

const router = express.Router();

router.get('/', getCourses);
router.get('/:id', getCourseById);
router.post('/', verifyToken, checkRole('teacher', 'admin'), createCourse);
router.put('/:id', verifyToken, checkRole('teacher', 'admin'), updateCourse);
router.patch('/:id/status', verifyToken, checkRole('teacher', 'admin'), updateCourseStatus);
router.put('/:id/reorder-lessons', verifyToken, checkRole('teacher', 'admin'), reorderCourseLessons);
router.delete('/:id', verifyToken, checkRole('teacher', 'admin'), deleteCourse);

export default router;
