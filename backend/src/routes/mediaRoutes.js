import express from 'express';
import { completeMediaUpload, uploadMediaMiddleware } from '../controllers/mediaController.js';
import { verifyToken, checkRole } from '../middlewares/auth.js';

const router = express.Router();

router.post('/upload', verifyToken, checkRole('admin', 'teacher'), uploadMediaMiddleware);
router.post('/complete', verifyToken, checkRole('admin', 'teacher'), completeMediaUpload);

export default router;
