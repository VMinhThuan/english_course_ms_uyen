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
import multer from 'multer';

import { getUploadDir } from '../utils/uploadConfig.js';

const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, getUploadDir());
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + '-' + uniqueSuffix + '-' + file.originalname);
  },
});

const upload = multer({ storage });

router.get('/course/:courseId', optionalAuth, getLessonsByCourse);
router.get('/:id', verifyToken, getLessonById);
router.get('/:lessonId/materials', verifyToken, getStudentMaterialsByLesson);

router.post(
  '/',
  verifyToken,
  checkRole('teacher', 'admin'),
  upload.array('attachments', 10),
  createLesson
);

router.put(
  '/:id',
  verifyToken,
  checkRole('teacher', 'admin'),
  upload.array('attachments', 10),
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
