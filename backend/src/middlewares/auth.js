import jwt from 'jsonwebtoken';
import { jwtConfig } from '../configs/jwt.js';
import User from '../models/User.js';

// Verify access token
export const verifyToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        status: 'error',
        message: 'No token provided',
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    const decoded = jwt.verify(token, jwtConfig.secret);

    const user = await User.findById(decoded.userId).select('-password');
    if (!user || !user.isActive) {
      return res.status(401).json({
        status: 'error',
        message: 'User not found or inactive',
      });
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        status: 'error',
        message: 'Token expired',
      });
    }
    return res.status(401).json({
      status: 'error',
      message: 'Invalid token',
    });
  }
};

// Optional auth middleware (attaches user if valid token present, otherwise continues as guest)
export const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const decoded = jwt.verify(token, jwtConfig.secret);
      const user = await User.findById(decoded.userId).select('-password');
      if (user && user.isActive) {
        req.user = user;
      }
    }
  } catch {
    // Proceed as guest
  }
  next();
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

    next();
  };
};

// Require active student middleware (student role + active status)
export const requireActiveStudent = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      status: 'error',
      message: 'Unauthorized',
    });
  }

  // Admins are always allowed
  if (req.user.role === 'admin') {
    return next();
  }

  if (req.user.role !== 'student') {
    return res.status(403).json({
      status: 'error',
      code: 'FORBIDDEN',
      message: 'Access denied. Student role required.',
    });
  }

  if (req.user.status === 'pending') {
    return res.status(403).json({
      status: 'error',
      code: 'ACCOUNT_PENDING',
      message: 'Tài khoản của bạn đang chờ giáo viên/Admin phê duyệt.',
    });
  }

  if (req.user.status === 'suspended') {
    return res.status(403).json({
      status: 'error',
      code: 'ACCOUNT_SUSPENDED',
      message: 'Tài khoản của bạn đã bị tạm khóa.',
    });
  }

  if (req.user.status === 'rejected') {
    return res.status(403).json({
      status: 'error',
      code: 'ACCOUNT_REJECTED',
      message: 'Tài khoản của bạn đã bị từ chối phê duyệt.',
    });
  }

  if (req.user.status !== 'active') {
    return res.status(403).json({
      status: 'error',
      code: 'ACCOUNT_NOT_ACTIVE',
      message: 'Tài khoản chưa được kích hoạt.',
    });
  }

  next();
};


