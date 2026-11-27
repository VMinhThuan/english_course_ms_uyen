import jwt from 'jsonwebtoken';
import { jwtConfig } from '../configs/jwt.js';

const getJwtOptions = (expiresIn, type) => ({
    expiresIn,
    ...(jwtConfig.issuer ? { issuer: jwtConfig.issuer } : {}),
    ...(jwtConfig.audience ? { audience: jwtConfig.audience } : {}),
    ...(type ? { subject: type } : {}),
});

export const generateAccessToken = (userId, { sessionId, jti } = {}) => {
    if (!jwtConfig.secret) {
        throw new Error('JWT_SECRET is not configured. Please check your .env file.');
    }
    return jwt.sign({
        userId,
        ...(sessionId ? { sid: sessionId } : {}),
        ...(jti ? { jti } : {}),
        ...(sessionId ? { typ: 'access' } : {}),
    }, jwtConfig.secret, getJwtOptions(jwtConfig.expiresIn, sessionId ? 'access' : undefined));
};

export const generateRefreshToken = (userId, { sessionId, jti } = {}) => {
    if (!jwtConfig.refreshSecret) {
        throw new Error('JWT_REFRESH_SECRET is not configured. Please check your .env file.');
    }
    return jwt.sign({
        userId,
        ...(sessionId ? { sid: sessionId } : {}),
        ...(jti ? { jti } : {}),
        ...(sessionId ? { typ: 'refresh' } : {}),
    }, jwtConfig.refreshSecret, getJwtOptions(jwtConfig.refreshExpiresIn, sessionId ? 'refresh' : undefined));
};
