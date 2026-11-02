import express from 'express';
import {
  startSession,
  sendHeartbeat,
  endSession,
} from '../controllers/learningSessionController.js';
import { verifyToken, requireActiveStudent } from '../middlewares/auth.js';

const router = express.Router();

router.use(verifyToken, requireActiveStudent);

router.post('/start', startSession);
router.post('/heartbeat', sendHeartbeat);
router.post('/end', endSession);

export default router;
