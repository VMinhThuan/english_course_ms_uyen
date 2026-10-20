import express from 'express';
import { handleMediaUpload, uploadMediaMiddleware } from '../controllers/mediaController.js';
import { verifyToken, checkRole } from '../middlewares/auth.js';

const router = express.Router();

router.post('/upload', verifyToken, checkRole('admin', 'teacher'), uploadMediaMiddleware, handleMediaUpload);

export default router;
