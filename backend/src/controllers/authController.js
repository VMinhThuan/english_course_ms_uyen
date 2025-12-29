import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { generateAccessToken, generateRefreshToken } from '../utils/generateToken.js';
import { jwtConfig } from '../configs/jwt.js';

// @desc    Register new user
// @route   POST /api/v1/auth/register
// @access  Public
export const register = async(req, res, next) => {
    try {
        const { email, password, fullName, phoneNumber, role } = req.body;

        // Check if user exists
        const existingUser = await User.findOne({ email });
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
            // Remove all non-digit characters except +
            const cleaned = phoneNumber.replace(/[^\d+]/g, '');
            // Normalize to format starting with 0 (Vietnamese format)
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

        // Create user
        const user = await User.create({
            email,
            password,
            fullName: userFullName,
            phoneNumber: normalizedPhone,
            role: role || 'student',
        });

        // Generate tokens
        const accessToken = generateAccessToken(user._id);
        const refreshToken = generateRefreshToken(user._id);

        // Set refresh token as httpOnly cookie
        res.cookie('refreshToken', refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        });

        res.status(201).json({
            status: 'success',
            message: 'User registered successfully',
            data: {
                user: {
                    id: user._id,
                    email: user.email,
                    fullName: user.fullName,
                    role: user.role,
                },
                accessToken,
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
        const { email, password } = req.body;

        // Check if user exists by email or phone number
        // Determine if input is email (contains @) or phone number
        const input = email.trim();
        const isEmail = input.includes('@');
        let user;

        if (isEmail) {
            // Search by email
            user = await User.findOne({ email: input.toLowerCase() });
        } else {
            // Search by phone number - normalize to match stored format (starts with 0)
            // Remove all non-digit characters except +
            const cleanedPhone = input.replace(/[^\d+]/g, '');

            // Normalize to format starting with 0 (same as registration)
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

            // Search with normalized phone and also try original input (for backward compatibility)
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

        // Debug: Log found user (remove in production)
        if (process.env.NODE_ENV === 'development') {
            console.log(`User found: ${user.email}, Phone: ${user.phoneNumber || 'N/A'}`);
        }

        // Check password
        const isPasswordValid = await user.comparePassword(password);
        if (!isPasswordValid) {
            return res.status(401).json({
                status: 'error',
                message: 'Invalid credentials',
            });
        }

        // Check if user is active
        if (!user.isActive) {
            return res.status(401).json({
                status: 'error',
                message: 'Account is deactivated',
            });
        }

        // Generate tokens
        const accessToken = generateAccessToken(user._id);
        const refreshToken = generateRefreshToken(user._id);

        // Set refresh token as httpOnly cookie
        res.cookie('refreshToken', refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
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

        if (!user || !user.isActive) {
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
    res.clearCookie('refreshToken');
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