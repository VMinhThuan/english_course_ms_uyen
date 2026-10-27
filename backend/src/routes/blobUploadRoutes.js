import express from 'express';
import { createBlobUploadTicket, completeBlobUpload } from '../controllers/blobUploadController.js';
import { checkRole, verifyToken } from '../middlewares/auth.js';

const router = express.Router();
router.use(verifyToken, checkRole('admin', 'teacher'));
router.post('/uploads', createBlobUploadTicket);
router.post('/uploads/complete', completeBlobUpload);

export default router;
