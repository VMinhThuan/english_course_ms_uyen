import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { generateAccessToken, generateRefreshToken } from '../utils/generateToken.js';
import { jwtConfig } from '../configs/jwt.js';
import {
    clearRefreshTokenCookie,
    setRefreshTokenCookie,
} from '../middlewares/auth.js';
import {
    getRevokedSessionError,
    getRefreshReuseError,
    getRefreshTokenExpiredError,
    getSessionReplacedError,
    getStudentStatusError,
    isTokenIssuedBeforeSuspension,
} from '../security/accountAccessPolicy.js';
import {
    createAuthSessionState,
    createRefreshJti,
    createSessionId,
    createTokenJti,
    getSessionIdFromDecodedToken,
    getTokenJti,
    getTokenType,
    hashRefreshToken,
    isLegacyJwtMigrationEnabled,
    isRefreshRotationEnabled,
    isStudentSessionEnforcementEnabled,
} from '../security/authSession.js';
import { isValidStudentGroupName, normalizeStudentGroupName } from '../utils/studentGroupName.js';

const findUserWithAuthSession = async (userId) => {
    const query = User.findById(userId);
    return typeof query?.select === 'function' ? query.select('+authSession') : query;
};

// @desc    Register new user
// @route   POST /api/v1/auth/register
// @access  Public
export const register = async(req, res, next) => {
    try {
        const { email, password, fullName, phoneNumber, groupName } = req.body;
        const normalizedGroupName = groupName === undefined ? '' : normalizeStudentGroupName(groupName);

        if (!isValidStudentGroupName(normalizedGroupName)) {
            return res.status(400).json({
                status: 'error',
                code: 'INVALID_GROUP_NAME',
                message: 'Tên nhóm không được vượt quá 100 ký tự hoặc chứa ký tự không hợp lệ.',
            });
        }

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
            groupName: normalizedGroupName,
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
                    groupName: user.groupName || '',
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

        // Only students participate in the single-active-session policy. The
        // session is committed atomically before the token pair is returned.
        const isStudent = user.role === 'student';
        const sessionId = isStudent ? createSessionId() : null;
        const refreshJti = isStudent ? createRefreshJti() : null;
        const accessJti = isStudent ? createTokenJti() : null;
        const accessToken = generateAccessToken(user._id, {
            ...(sessionId ? { sessionId, jti: accessJti } : {}),
        });
        const refreshToken = generateRefreshToken(user._id, {
            ...(sessionId ? { sessionId, jti: refreshJti } : {}),
        });

        if (sessionId) {
            const now = new Date();
            const committedUser = await User.findOneAndUpdate(
                {
                    _id: user._id,
                    isActive: true,
                    ...(isStudent ? { status: 'active' } : {}),
                },
                {
                    $set: {
                        authSession: createAuthSessionState({
                            sessionId,
                            refreshJti,
                            refreshTokenHash: hashRefreshToken(refreshToken),
                            now,
                        }),
                    },
                },
                { new: true, runValidators: true },
            );
            if (!committedUser) {
                const latestUser = await User.findById(user._id);
                const latestStatusError = getStudentStatusError(latestUser);
                if (latestStatusError) {
                    return res.status(latestStatusError.statusCode).json({
                        status: 'error',
                        code: latestStatusError.code,
                        message: latestStatusError.message,
                    });
                }
                return res.status(401).json({ status: 'error', message: 'Account is deactivated' });
            }
        }

        // Remove cookies from both the current and legacy paths before setting
        // the canonical cookie, preventing an older token from shadowing it.
        clearRefreshTokenCookie(res);
        setRefreshTokenCookie(res, refreshToken);

        res.json({
            status: 'success',
            message: 'Login successful',
            data: {
                user: {
                    id: user._id,
                    email: user.email,
                    fullName: user.fullName,
                    groupName: user.groupName || '',
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
        const refreshToken = req.cookies?.refreshToken;

        if (!refreshToken) {
            clearRefreshTokenCookie(res);
            return res.status(401).json({
                status: 'error',
                message: 'No refresh token provided',
            });
        }

        const decoded = jwt.verify(refreshToken, jwtConfig.refreshSecret, {
            ...(jwtConfig.issuer ? { issuer: jwtConfig.issuer } : {}),
            ...(jwtConfig.audience ? { audience: jwtConfig.audience } : {}),
        });
        const user = await findUserWithAuthSession(decoded.userId);

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

        const isStudent = user.role === 'student';
        const sessionEnforcement = isStudent && isStudentSessionEnforcementEnabled();
        const rotationEnabled = isStudent && isRefreshRotationEnabled();
        const legacyMigrationEnabled = isLegacyJwtMigrationEnabled();
        const sessionId = getSessionIdFromDecodedToken(decoded);
        const tokenType = getTokenType(decoded);

        if (isStudent && sessionEnforcement) {
            if (
                tokenType !== 'refresh'
                || !sessionId
                || sessionId !== user.authSession?.sessionId
            ) {
                clearRefreshTokenCookie(res);
                const replacedError = getSessionReplacedError();
                return res.status(replacedError.statusCode).json({
                    status: 'error',
                    code: replacedError.code,
                    message: replacedError.message,
                });
            }
        } else if (isStudent && !sessionId && !legacyMigrationEnabled) {
            clearRefreshTokenCookie(res);
            const replacedError = getSessionReplacedError();
            return res.status(replacedError.statusCode).json({ status: 'error', code: replacedError.code, message: replacedError.message });
        } else if (tokenType && tokenType !== 'refresh') {
            clearRefreshTokenCookie(res);
            return res.status(401).json({ status: 'error', code: 'INVALID_TOKEN_TYPE', message: 'Invalid token type' });
        }

        let nextRefreshToken = null;
        // A legacy token remains on the compatibility path until strict
        // enforcement is enabled; session-bound tokens use rotation even if
        // the two rollout flags are enabled in separate steps.
        if (rotationEnabled && sessionId && tokenType === 'refresh') {
            const currentHash = hashRefreshToken(refreshToken);
            const nextJti = createRefreshJti();
            nextRefreshToken = generateRefreshToken(user._id, { sessionId, jti: nextJti });
            const nextHash = hashRefreshToken(nextRefreshToken);
            const now = new Date();
            const previousValidUntil = new Date(now.getTime() + 15 * 1000);
            const currentFilter = {
                _id: user._id,
                'authSession.sessionId': sessionId,
                'authSession.refreshJti': getTokenJti(decoded),
                'authSession.refreshTokenHash': currentHash,
            };
            let rotatedUser = await User.findOneAndUpdate(
                currentFilter,
                {
                    $set: {
                        'authSession.lastSeenAt': now,
                        'authSession.previousRefreshJti': getTokenJti(decoded),
                        'authSession.previousRefreshTokenHash': currentHash,
                        'authSession.previousRefreshValidUntil': previousValidUntil,
                        'authSession.refreshJti': nextJti,
                        'authSession.refreshTokenHash': nextHash,
                    },
                },
                { new: true },
            );

            // A second legitimate tab may present the token that the first
            // refresh just moved to the short grace slot. Accept it without
            // revoking the session, then issue another current token. This is
            // the server-side recovery path for concurrent browser refreshes.
            if (!rotatedUser) {
                const activeDuringGrace = await findUserWithAuthSession(user._id);
                rotatedUser = await User.findOneAndUpdate(
                    {
                        _id: user._id,
                        'authSession.sessionId': sessionId,
                        'authSession.previousRefreshJti': getTokenJti(decoded),
                        'authSession.previousRefreshTokenHash': currentHash,
                        'authSession.previousRefreshValidUntil': { $gt: now },
                        'authSession.refreshJti': activeDuringGrace?.authSession?.refreshJti,
                        'authSession.refreshTokenHash': activeDuringGrace?.authSession?.refreshTokenHash,
                    },
                    {
                        $set: {
                            'authSession.lastSeenAt': now,
                            // Preserve the token returned by the first
                            // concurrent refresh as the new grace token. This
                            // prevents response-order races from turning a
                            // legitimate stale Set-Cookie into replay.
                            'authSession.previousRefreshJti': activeDuringGrace?.authSession?.refreshJti,
                            'authSession.previousRefreshTokenHash': activeDuringGrace?.authSession?.refreshTokenHash,
                            'authSession.previousRefreshValidUntil': previousValidUntil,
                            'authSession.refreshJti': nextJti,
                            'authSession.refreshTokenHash': nextHash,
                        },
                    },
                    { new: true },
                );
            }

            if (!rotatedUser) {
                const activeUser = await findUserWithAuthSession(user._id);
                if (activeUser?.authSession?.sessionId !== sessionId) {
                    clearRefreshTokenCookie(res);
                    const replacedError = getSessionReplacedError();
                    return res.status(replacedError.statusCode).json({
                        status: 'error',
                        code: replacedError.code,
                        message: replacedError.message,
                    });
                }
                await User.updateOne(
                    { _id: user._id, 'authSession.sessionId': sessionId },
                    { $set: { authSession: null } },
                );
                clearRefreshTokenCookie(res);
                const reuseError = getRefreshReuseError();
                return res.status(reuseError.statusCode).json({
                    status: 'error',
                    code: reuseError.code,
                    message: reuseError.message,
                });
            }
        }

        const newAccessToken = generateAccessToken(user._id, {
            ...(sessionId ? { sessionId, jti: createTokenJti() } : {}),
        });

        if (nextRefreshToken) setRefreshTokenCookie(res, nextRefreshToken);
        res.json({
            status: 'success',
            message: 'Token refreshed',
            data: {
                accessToken: newAccessToken,
            },
        });
    } catch (error) {
        const invalidRefreshToken = ['JsonWebTokenError', 'NotBeforeError'].includes(error.name);

        if (error.name === 'TokenExpiredError') {
            clearRefreshTokenCookie(res);
            const expiredError = getRefreshTokenExpiredError();
            return res.status(expiredError.statusCode).json({
                status: 'error',
                code: expiredError.code,
                message: expiredError.message,
            });
        }
        if (!invalidRefreshToken) return next(error);

        clearRefreshTokenCookie(res);
        return res.status(401).json({
            status: 'error',
            code: 'INVALID_REFRESH_TOKEN',
            message: 'Invalid refresh token',
        });
    }
};

// @desc    Logout user
// @route   POST /api/v1/auth/logout
// @access  Private
export const logout = async(req, res, next) => {
    try {
        let claims = null;
        const authHeader = req.headers.authorization;
        if (authHeader?.startsWith('Bearer ')) {
            try {
                claims = jwt.verify(authHeader.substring(7), jwtConfig.secret, {
                    ignoreExpiration: true,
                    ...(jwtConfig.issuer ? { issuer: jwtConfig.issuer } : {}),
                    ...(jwtConfig.audience ? { audience: jwtConfig.audience } : {}),
                });
            } catch {
                claims = null;
            }
        }
        if (!claims && req.cookies?.refreshToken) {
            try {
                claims = jwt.verify(req.cookies.refreshToken, jwtConfig.refreshSecret, {
                    ignoreExpiration: true,
                    ...(jwtConfig.issuer ? { issuer: jwtConfig.issuer } : {}),
                    ...(jwtConfig.audience ? { audience: jwtConfig.audience } : {}),
                });
            } catch {
                claims = null;
            }
        }
        const sessionId = getSessionIdFromDecodedToken(claims);
        if (claims?.userId && sessionId) {
            await User.updateOne(
                { _id: claims.userId, 'authSession.sessionId': sessionId },
                { $set: { authSession: null } },
            );
        }
    } catch (error) {
        return next(error);
    }
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
        const { fullName, phoneNumber, groupName } = req.body;
        const user = await findUserWithAuthSession(req.user.id);

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

        if (groupName !== undefined) {
            const normalizedGroupName = normalizeStudentGroupName(groupName);
            if (!isValidStudentGroupName(normalizedGroupName)) {
                return res.status(400).json({
                    status: 'error',
                    code: 'INVALID_GROUP_NAME',
                    message: 'Tên nhóm không được vượt quá 100 ký tự hoặc chứa ký tự không hợp lệ.',
                });
            }
            user.groupName = normalizedGroupName;
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
                    groupName: user.groupName || '',
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
        // Password changes invalidate every existing login. The current
        // browser receives a clean re-authentication requirement as well.
        user.authSession = null;
        await user.save();
        clearRefreshTokenCookie(res);

        res.json({
            status: 'success',
            code: 'SESSION_REAUTH_REQUIRED',
            reauthRequired: true,
            message: 'Đổi mật khẩu thành công',
        });
    } catch (error) {
        next(error);
    }
};
