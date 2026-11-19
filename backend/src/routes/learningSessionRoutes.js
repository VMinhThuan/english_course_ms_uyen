import express from 'express';
import {
  startSession,
  sendHeartbeat,
  sendStudentActivityHeartbeat,
  endSession,
} from '../controllers/learningSessionController.js';
import { verifyToken, requireActiveStudent } from '../middlewares/auth.js';

const router = express.Router();

router.use(verifyToken, requireActiveStudent);

router.post('/start', startSession);
router.post('/heartbeat', sendHeartbeat);
router.post('/activity-heartbeat', sendStudentActivityHeartbeat);
router.post('/end', endSession);

export default router;
