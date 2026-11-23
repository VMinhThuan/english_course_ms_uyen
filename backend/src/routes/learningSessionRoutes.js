import express from 'express';
import {
  startSession,
  sendHeartbeat,
  sendStudentActivityHeartbeat,
  endSession,
  pauseSession,
} from '../controllers/learningSessionController.js';
import { verifyToken, requireActiveStudent } from '../middlewares/auth.js';
import { heartbeatRateLimiter, sessionRateLimiter } from '../middlewares/rateLimit.js';

const router = express.Router();

router.use(verifyToken, requireActiveStudent);

router.post('/start', sessionRateLimiter, startSession);
router.post('/heartbeat', heartbeatRateLimiter, sendHeartbeat);
router.post('/activity-heartbeat', heartbeatRateLimiter, sendStudentActivityHeartbeat);
router.post('/end', sessionRateLimiter, endSession);
router.post('/pause', sessionRateLimiter, pauseSession);

export default router;
