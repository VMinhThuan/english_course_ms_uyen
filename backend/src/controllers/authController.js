import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { generateAccessToken, generateRefreshToken } from '../utils/generateToken.js';
import { jwtConfig } from '../configs/jwt.js';
import {
    clearRefreshTokenCookie,
} from '../middlewares/auth.js';
import {
    getRevokedSessionError,
    getStudentStatusError,
    isTokenIssuedBeforeSuspension,
} from '../security/accountAccessPolicy.js';

// @desc    Register new user
// @route   POST /api/v1/auth/register
// @access  Public
export const register = async(req, res, next) => {
    try {
        const { email, password, fullName, phoneNumber } = req.body;

        // Check if user exists
        const existingUser = await User.findOne({ email: email ? email.toLowerCase() : '' });
        if (existingUser) {
            return res.status(400).json({
                status: 'error',
                message: 'Email already exists',
            });
        }

        // Generate fullName from email if not provided (use part before @)
        const userFullName = fullName || email.split('@')[0] || 'User';

        // Normalize phone number - remove spaces, dashes, and ensure consistent format
        let normalizedPhone = '';
        if (phoneNumber) {
            const cleaned = phoneNumber.replace(/[^\d+]/g, '');
            if (cleaned.startsWith('+84')) {
                normalizedPhone = '0' + cleaned.substring(3);
            } else if (cleaned.startsWith('84')) {
                normalizedPhone = '0' + cleaned.substring(2);
            } else if (cleaned.startsWith('0')) {
                normalizedPhone = cleaned;
            } else {
                normalizedPhone = '0' + cleaned;
            }
        }

        // Create user: Public registration MUST ALWAYS be STUDENT role and PENDING status
        const user = await User.create({
            email,
            password,
            fullName: userFullName,
            phoneNumber: normalizedPhone,
            role: 'student',    // FORCED BY BACKEND
            status: 'pending',  // FORCED BY BACKEND
            isActive: true,
        });

        res.status(201).json({
            status: 'success',
            message: 'User registered successfully and is awaiting admin approval',
            data: {
                user: {
                    id: user._id,
                    email: user.email,
                    fullName: user.fullName,
                    role: user.role,
                    status: user.status,
                },
            },
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Login user
// @route   POST /api/v1/auth/login
// @access  Public
export const login = async(req, res, next) => {
    try {
        const { email, username, password } = req.body;
        const loginIdentifier = typeof email === 'string' ? email : username;

        if (typeof loginIdentifier !== 'string' || !loginIdentifier.trim() || typeof password !== 'string' || !password) {
            return res.status(400).json({
                status: 'error',
                message: 'Please provide email and password',
            });
        }

        const input = loginIdentifier.trim();
        const isEmail = input.includes('@');
        let user;

        if (isEmail) {
            user = await User.findOne({ email: input.toLowerCase() });
        } else {
            user = await User.findOne({ username: input.toLowerCase() });
        }

        if (!user && !isEmail) {
            const cleanedPhone = input.replace(/[^\d+]/g, '');
            let normalizedPhone = '';
            if (cleanedPhone.startsWith('+84')) {
                normalizedPhone = '0' + cleanedPhone.substring(3);
            } else if (cleanedPhone.startsWith('84')) {
                normalizedPhone = '0' + cleanedPhone.substring(2);
            } else if (cleanedPhone.startsWith('0')) {
                normalizedPhone = cleanedPhone;
            } else {
                normalizedPhone = '0' + cleanedPhone;
            }

            user = await User.findOne({
                $or: [
                    { phoneNumber: normalizedPhone },
                    { phoneNumber: input.trim() },
                    { phoneNumber: cleanedPhone }
                ]
            });
        }

        if (!user) {
            return res.status(401).json({
                status: 'error',
                message: 'Invalid credentials',
            });
        }

        // Check password
        const isPasswordValid = await user.comparePassword(password);
        if (!isPasswordValid) {
            return res.status(401).json({
                status: 'error',
                message: 'Invalid credentials',
            });
        }

        const studentStatusError = getStudentStatusError(user);
        if (studentStatusError) {
            if (studentStatusError.code === 'ACCOUNT_SUSPENDED') clearRefreshTokenCookie(res);
            return res.status(studentStatusError.statusCode).json({
                status: 'error',
                code: studentStatusError.code,
                message: studentStatusError.message,
            });
        }

        // Check overall isActive flag for teacher/admin accounts.
        if (!user.isActive) {
            return res.status(401).json({
                status: 'error',
                message: 'Account is deactivated',
            });
        }

        // Generate tokens
        const accessToken = generateAccessToken(user._id);
        const refreshToken = generateRefreshToken(user._id);

        res.cookie('refreshToken', refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            path: '/',
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        });

        res.json({
            status: 'success',
            message: 'Login successful',
            data: {
                user: {
                    id: user._id,
                    email: user.email,
                    fullName: user.fullName,
                    role: user.role,
                    status: user.status,
                },
                accessToken,
            },
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Refresh access token
// @route   POST /api/v1/auth/refresh
// @access  Public
export const refreshToken = async(req, res, next) => {
    try {
        const refreshToken = req.cookies.refreshToken;

        if (!refreshToken) {
            return res.status(401).json({
                status: 'error',
                message: 'No refresh token provided',
            });
        }

        const decoded = jwt.verify(refreshToken, jwtConfig.refreshSecret);
        const user = await User.findById(decoded.userId);

        if (!user) {
            clearRefreshTokenCookie(res);
            return res.status(401).json({
                status: 'error',
                message: 'Invalid refresh token',
            });
        }

        const studentStatusError = getStudentStatusError(user);
        if (studentStatusError) {
            clearRefreshTokenCookie(res);
            return res.status(studentStatusError.statusCode).json({
                status: 'error',
                code: studentStatusError.code,
                message: studentStatusError.message,
            });
        }

        if (isTokenIssuedBeforeSuspension(user, decoded.iat)) {
            clearRefreshTokenCookie(res);
            const revokedError = getRevokedSessionError();
            return res.status(revokedError.statusCode).json({
                status: 'error',
                code: revokedError.code,
                message: revokedError.message,
            });
        }

        if (!user.isActive) {
            clearRefreshTokenCookie(res);
            return res.status(401).json({
                status: 'error',
                message: 'Invalid refresh token',
            });
        }

        const newAccessToken = generateAccessToken(user._id);

        res.json({
            status: 'success',
            message: 'Token refreshed',
            data: {
                accessToken: newAccessToken,
            },
        });
    } catch (error) {
        return res.status(401).json({
            status: 'error',
            message: 'Invalid refresh token',
        });
    }
};

// @desc    Logout user
// @route   POST /api/v1/auth/logout
// @access  Private
export const logout = async(req, res) => {
    clearRefreshTokenCookie(res);
    res.json({
        status: 'success',
        message: 'Logged out successfully',
    });
};

// @desc    Get current user
// @route   GET /api/v1/auth/me
// @access  Private
export const getMe = async(req, res) => {
    res.json({
        status: 'success',
        data: {
            user: req.user,
        },
    });
};

// @desc    Update user profile (safe fields only)
// @route   PUT /api/v1/auth/profile
// @access  Private
export const updateProfile = async (req, res, next) => {
    try {
        const { fullName, phoneNumber } = req.body;
        const user = await User.findById(req.user.id);

        if (!user) {
            return res.status(404).json({
                status: 'error',
                message: 'User not found',
            });
        }

        if (fullName !== undefined) {
            user.fullName = fullName.trim();
        }

        if (phoneNumber !== undefined) {
            let normalizedPhone = '';
            if (phoneNumber) {
                const cleaned = phoneNumber.replace(/[^\d+]/g, '');
                if (cleaned.startsWith('+84')) {
                    normalizedPhone = '0' + cleaned.substring(3);
                } else if (cleaned.startsWith('84')) {
                    normalizedPhone = '0' + cleaned.substring(2);
                } else if (cleaned.startsWith('0')) {
                    normalizedPhone = cleaned;
                } else {
                    normalizedPhone = '0' + cleaned;
                }
            }
            user.phoneNumber = normalizedPhone;
        }

        await user.save();

        res.json({
            status: 'success',
            message: 'Cập nhật thông tin cá nhân thành công',
            data: {
                user: {
                    id: user._id,
                    email: user.email,
                    fullName: user.fullName,
                    phoneNumber: user.phoneNumber,
                    role: user.role,
                    status: user.status,
                },
            },
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Change user password securely
// @route   PUT /api/v1/auth/change-password
// @access  Private
export const changePassword = async (req, res, next) => {
    try {
        const { currentPassword, newPassword, confirmPassword } = req.body;

        if (!currentPassword || !newPassword || !confirmPassword) {
            return res.status(400).json({
                status: 'error',
                message: 'Vui lòng điền đầy đủ các trường thông tin mật khẩu',
            });
        }

        if (newPassword !== confirmPassword) {
            return res.status(400).json({
                status: 'error',
                message: 'Mật khẩu mới và xác nhận mật khẩu không khớp',
            });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({
                status: 'error',
                message: 'Mật khẩu mới phải có ít nhất 6 ký tự',
            });
        }

        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({
                status: 'error',
                message: 'User not found',
            });
        }

        const isMatch = await user.comparePassword(currentPassword);
        if (!isMatch) {
            return res.status(400).json({
                status: 'error',
                message: 'Mật khẩu hiện tại không chính xác',
            });
        }

        user.password = newPassword;
        await user.save();

        res.json({
            status: 'success',
            message: 'Đổi mật khẩu thành công',
        });
    } catch (error) {
        next(error);
    }
};
