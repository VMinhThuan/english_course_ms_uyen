import express from 'express';
import {
  register,
  login,
  refreshToken,
  logout,
  getMe,
} from '../controllers/authController.js';
import { verifyToken } from '../middlewares/auth.js';

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.post('/refresh', refreshToken);
router.post('/logout', verifyToken, logout);
router.get('/me', verifyToken, getMe);

export default router;

