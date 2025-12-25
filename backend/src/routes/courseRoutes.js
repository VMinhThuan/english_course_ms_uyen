import express from 'express';
import {
  getCourses,
  getCourseById,
  createCourse,
  updateCourse,
  deleteCourse,
} from '../controllers/courseController.js';
import { verifyToken, checkRole } from '../middlewares/auth.js';

const router = express.Router();

router.get('/', getCourses);
router.get('/:id', getCourseById);
router.post('/', verifyToken, checkRole('teacher', 'admin'), createCourse);
router.put('/:id', verifyToken, checkRole('teacher', 'admin'), updateCourse);
router.delete('/:id', verifyToken, checkRole('admin'), deleteCourse);

export default router;

