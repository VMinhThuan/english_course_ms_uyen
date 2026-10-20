import jwt from 'jsonwebtoken';
import { jwtConfig } from '../configs/jwt.js';
import User from '../models/User.js';
import {
  getRevokedSessionError,
  getStudentStatusError,
  isTokenIssuedBeforeSuspension,
} from '../security/accountAccessPolicy.js';

const sendFailure = (res, failure) => res.status(failure.statusCode).json({
  status: 'error',
  ...(failure.code ? { code: failure.code } : {}),
  message: failure.message,
});

export const clearRefreshTokenCookie = (res) => {
  const options = {
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
  };
  res.clearCookie('refreshToken', options);
  // Older cookies were set without a Path on /api/v1/auth/login, so browsers
  // may have scoped them to /api/v1/auth instead of /.
  res.clearCookie('refreshToken', { ...options, path: '/api/v1/auth' });
};

export const authenticateRequest = async (req) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { error: { statusCode: 401, message: 'No token provided' } };
  }

  try {
    const decoded = jwt.verify(authHeader.substring(7), jwtConfig.secret);
    const user = await User.findById(decoded.userId).select('-password');
    if (!user) return { error: { statusCode: 401, message: 'User not found or inactive' } };

    const studentStatusError = getStudentStatusError(user);
    if (studentStatusError) return { error: studentStatusError, user, decoded };

    if (!user.isActive) {
      return { error: { statusCode: 401, message: 'User not found or inactive' }, user, decoded };
    }

    if (isTokenIssuedBeforeSuspension(user, decoded.iat)) {
      return { error: getRevokedSessionError(), user, decoded };
    }

    return { user, decoded };
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return { error: { statusCode: 401, message: 'Token expired' } };
    }
    return { error: { statusCode: 401, message: 'Invalid token' } };
  }
};

// Account state is re-read from MongoDB for every protected request, so suspension takes effect
// for already-issued access tokens without touching attempts or learner data.
export const verifyToken = async (req, res, next) => {
  const result = await authenticateRequest(req);
  if (result.error) {
    if (result.error.code?.startsWith('ACCOUNT_')) clearRefreshTokenCookie(res);
    return sendFailure(res, result.error);
  }
  req.user = result.user;
  return next();
};

// Optional auth keeps anonymous public discovery working, but a recognized suspended/revoked
// session receives its account-state response instead of silently continuing as a guest.
export const optionalAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return next();

  const result = await authenticateRequest(req);
  if (result.error) {
    if (result.error.code?.startsWith('ACCOUNT_') || result.error.code === 'SESSION_REVOKED') {
      if (result.error.code?.startsWith('ACCOUNT_')) clearRefreshTokenCookie(res);
      return sendFailure(res, result.error);
    }
    return next();
  }

  req.user = result.user;
  return next();
};

// Check role middleware
export const checkRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        status: 'error',
        message: 'Unauthorized',
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        status: 'error',
        code: 'FORBIDDEN',
        message: 'Access denied. Insufficient permissions.',
      });
    }

    return next();
  };
};

// Require active student middleware. Existing admin bypass and teacher denial remain unchanged.
export const requireActiveStudent = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      status: 'error',
      message: 'Unauthorized',
    });
  }

  if (req.user.role === 'admin') return next();

  if (req.user.role !== 'student') {
    return res.status(403).json({
      status: 'error',
      code: 'FORBIDDEN',
      message: 'Access denied. Student role required.',
    });
  }

  const statusError = getStudentStatusError(req.user);
  if (statusError) {
    return res.status(statusError.statusCode).json({
      status: 'error',
      code: statusError.code,
      message: statusError.message,
    });
  }

  return next();
};
