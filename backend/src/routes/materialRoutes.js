import express from 'express';
import {
  createMaterial,
  getAdminMaterials,
  getAdminMaterialById,
  updateMaterial,
  deleteMaterial,
  getStudentMaterialsByLesson,
  downloadMaterial,
} from '../controllers/materialController.js';
import { verifyToken, checkRole, requireActiveStudent } from '../middlewares/auth.js';
import multer from 'multer';
import { getUploadDir } from '../utils/uploadConfig.js';

const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, getUploadDir());
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, 'mat-' + uniqueSuffix + '-' + file.originalname);
  },
});

const upload = multer({ storage });

// Student routes
router.get('/lesson/:lessonId', verifyToken, getStudentMaterialsByLesson);
router.get('/:id/download', verifyToken, requireActiveStudent, downloadMaterial);

// Admin / Teacher routes
router.post('/admin', verifyToken, checkRole('teacher', 'admin'), upload.single('file'), createMaterial);
router.get('/admin', verifyToken, checkRole('teacher', 'admin'), getAdminMaterials);
router.get('/admin/:id', verifyToken, checkRole('teacher', 'admin'), getAdminMaterialById);
router.put('/admin/:id', verifyToken, checkRole('teacher', 'admin'), upload.single('file'), updateMaterial);
router.patch('/admin/:id', verifyToken, checkRole('teacher', 'admin'), upload.single('file'), updateMaterial);
router.delete('/admin/:id', verifyToken, checkRole('teacher', 'admin'), deleteMaterial);

export default router;
