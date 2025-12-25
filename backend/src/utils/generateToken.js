import jwt from 'jsonwebtoken';
import { jwtConfig } from '../configs/jwt.js';

export const generateAccessToken = (userId) => {
    return jwt.sign({ userId }, jwtConfig.secret, {
        expiresIn: jwtConfig.expiresIn,
    });
};

export const generateRefreshToken = (userId) => {
    return jwt.sign({ userId }, jwtConfig.refreshSecret, {
        expiresIn: jwtConfig.refreshExpiresIn,
    });
};