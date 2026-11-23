import express from 'express';
import {
  register,
  login,
  refreshToken,
  logout,
  getMe,
  updateProfile,
  changePassword,
} from '../controllers/authController.js';
import { verifyToken } from '../middlewares/auth.js';
import { authRateLimiter, refreshRateLimiter, registerRateLimiter } from '../middlewares/rateLimit.js';

const router = express.Router();

router.post('/register', registerRateLimiter, register);
router.post('/login', authRateLimiter, login);
router.post('/refresh', refreshRateLimiter, refreshToken);
router.post('/logout', verifyToken, logout);
router.get('/me', verifyToken, getMe);
router.put('/profile', verifyToken, updateProfile);
router.put('/change-password', verifyToken, changePassword);

export default router;


