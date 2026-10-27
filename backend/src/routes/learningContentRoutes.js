import express from 'express';
import { importLearningContentSeed } from '../controllers/learningContentImportController.js';
import { checkRole, verifyToken } from '../middlewares/auth.js';

const router = express.Router();
router.post('/import-excel-seed', verifyToken, checkRole('admin'), importLearningContentSeed);

export default router;
