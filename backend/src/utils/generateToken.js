import jwt from 'jsonwebtoken';
import { jwtConfig } from '../configs/jwt.js';

export const generateAccessToken = (userId) => {
    if (!jwtConfig.secret) {
        throw new Error('JWT_SECRET is not configured. Please check your .env file.');
    }
    return jwt.sign({ userId }, jwtConfig.secret, {
        expiresIn: jwtConfig.expiresIn,
    });
};

export const generateRefreshToken = (userId) => {
    if (!jwtConfig.refreshSecret) {
        throw new Error('JWT_REFRESH_SECRET is not configured. Please check your .env file.');
    }
    return jwt.sign({ userId }, jwtConfig.refreshSecret, {
        expiresIn: jwtConfig.refreshExpiresIn,
    });
};