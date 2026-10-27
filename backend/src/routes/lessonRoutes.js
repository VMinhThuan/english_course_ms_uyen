import express from 'express';
import {
  getLessonsByCourse,
  getLessonById,
  createLesson,
  updateLesson,
  updateLessonStatus,
  deleteLesson,
} from '../controllers/lessonController.js';
import { getStudentMaterialsByLesson } from '../controllers/materialController.js';
import { verifyToken, checkRole, optionalAuth } from '../middlewares/auth.js';

const router = express.Router();

router.get('/course/:courseId', optionalAuth, getLessonsByCourse);
router.get('/:id', verifyToken, getLessonById);
router.get('/:lessonId/materials', verifyToken, getStudentMaterialsByLesson);

router.post(
  '/',
  verifyToken,
  checkRole('teacher', 'admin'),
  createLesson
);

router.put(
  '/:id',
  verifyToken,
  checkRole('teacher', 'admin'),
  updateLesson
);

router.patch(
  '/:id/status',
  verifyToken,
  checkRole('teacher', 'admin'),
  updateLessonStatus
);

router.delete(
  '/:id',
  verifyToken,
  checkRole('teacher', 'admin'),
  deleteLesson
);

export default router;
