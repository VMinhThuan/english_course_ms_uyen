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
import { requireTrustedCredentialedOrigin } from '../middlewares/credentialedOrigin.js';

const router = express.Router();

router.post('/register', registerRateLimiter, register);
router.post('/login', requireTrustedCredentialedOrigin, authRateLimiter, login);
router.post('/refresh', requireTrustedCredentialedOrigin, refreshRateLimiter, refreshToken);
// Logout remains callable with an expired/replaced access token. The controller
// verifies claims and conditionally clears only the matching active session.
router.post('/logout', requireTrustedCredentialedOrigin, logout);
router.get('/me', verifyToken, getMe);
router.put('/profile', verifyToken, updateProfile);
router.put('/change-password', verifyToken, changePassword);

export default router;


