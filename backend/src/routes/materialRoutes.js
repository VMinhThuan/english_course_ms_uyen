import express from 'express';
import {
  createMaterial,
  getAdminMaterials,
  getAdminMaterialById,
  updateMaterial,
  deleteMaterial,
  getStudentMaterialsByLesson,
  downloadMaterial,
  previewMaterial,
  renderMaterial,
} from '../controllers/materialController.js';
import { verifyToken, checkRole } from '../middlewares/auth.js';
import { getPrivateUploadDir } from '../utils/uploadConfig.js';
import {
  createSafeDiskStorage,
  createUpload,
  GENERAL_UPLOAD_POLICIES,
  MAX_GENERAL_UPLOAD_BYTES,
} from '../utils/uploadValidation.js';

const router = express.Router();

const upload = createUpload({
  storage: createSafeDiskStorage({ directory: getPrivateUploadDir, prefix: 'material' }),
  policies: GENERAL_UPLOAD_POLICIES,
  maxFileSize: MAX_GENERAL_UPLOAD_BYTES,
  maxFiles: 1,
});

// Student routes
router.get('/lesson/:lessonId', verifyToken, getStudentMaterialsByLesson);
router.get('/:id/download', verifyToken, downloadMaterial);
router.get('/:id/preview', verifyToken, previewMaterial);
router.get('/:id/render', verifyToken, renderMaterial);

// Admin / Teacher routes
router.post('/admin', verifyToken, checkRole('teacher', 'admin'), upload.single('file'), createMaterial);
router.get('/admin', verifyToken, checkRole('teacher', 'admin'), getAdminMaterials);
router.get('/admin/:id', verifyToken, checkRole('teacher', 'admin'), getAdminMaterialById);
router.put('/admin/:id', verifyToken, checkRole('teacher', 'admin'), upload.single('file'), updateMaterial);
router.patch('/admin/:id', verifyToken, checkRole('teacher', 'admin'), upload.single('file'), updateMaterial);
router.delete('/admin/:id', verifyToken, checkRole('teacher', 'admin'), deleteMaterial);

export default router;
