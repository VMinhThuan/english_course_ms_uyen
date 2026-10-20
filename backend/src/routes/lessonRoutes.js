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
import { getPrivateUploadDir } from '../utils/uploadConfig.js';
import {
  createSafeDiskStorage,
  createUpload,
  GENERAL_UPLOAD_POLICIES,
  MAX_GENERAL_UPLOAD_BYTES,
  MAX_LESSON_ATTACHMENTS,
} from '../utils/uploadValidation.js';

const router = express.Router();

const upload = createUpload({
  storage: createSafeDiskStorage({ directory: getPrivateUploadDir, prefix: 'lesson' }),
  policies: GENERAL_UPLOAD_POLICIES,
  maxFileSize: MAX_GENERAL_UPLOAD_BYTES,
  maxFiles: MAX_LESSON_ATTACHMENTS,
});

router.get('/course/:courseId', optionalAuth, getLessonsByCourse);
router.get('/:id', verifyToken, getLessonById);
router.get('/:lessonId/materials', verifyToken, getStudentMaterialsByLesson);

router.post(
  '/',
  verifyToken,
  checkRole('teacher', 'admin'),
  upload.array('attachments', MAX_LESSON_ATTACHMENTS),
  createLesson
);

router.put(
  '/:id',
  verifyToken,
  checkRole('teacher', 'admin'),
  upload.array('attachments', MAX_LESSON_ATTACHMENTS),
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
