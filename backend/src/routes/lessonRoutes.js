import express from 'express';
import {
  getLessonsByCourse,
  createLesson,
  updateLesson,
} from '../controllers/lessonController.js';
import { verifyToken, checkRole } from '../middlewares/auth.js';
import multer from 'multer';

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + '-' + uniqueSuffix + '-' + file.originalname);
  },
});

const upload = multer({ storage });

router.get('/course/:courseId', verifyToken, getLessonsByCourse);
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

export default router;

