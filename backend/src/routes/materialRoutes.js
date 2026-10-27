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

const router = express.Router();

// Student routes
router.get('/lesson/:lessonId', verifyToken, getStudentMaterialsByLesson);
router.get('/:id/download', verifyToken, downloadMaterial);
router.get('/:id/preview', verifyToken, previewMaterial);
router.get('/:id/render', verifyToken, renderMaterial);

// Admin / Teacher routes
router.post('/admin', verifyToken, checkRole('teacher', 'admin'), createMaterial);
router.get('/admin', verifyToken, checkRole('teacher', 'admin'), getAdminMaterials);
router.get('/admin/:id', verifyToken, checkRole('teacher', 'admin'), getAdminMaterialById);
router.put('/admin/:id', verifyToken, checkRole('teacher', 'admin'), updateMaterial);
router.patch('/admin/:id', verifyToken, checkRole('teacher', 'admin'), updateMaterial);
router.delete('/admin/:id', verifyToken, checkRole('teacher', 'admin'), deleteMaterial);

export default router;
