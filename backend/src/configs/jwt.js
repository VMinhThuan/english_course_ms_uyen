// Use getter functions to ensure env vars are loaded
export const jwtConfig = {
    get secret() {
        return process.env.JWT_SECRET;
    },
    get refreshSecret() {
        return process.env.JWT_REFRESH_SECRET;
    },
    get expiresIn() {
        return process.env.JWT_EXPIRE || '15m';
    },
    get refreshExpiresIn() {
        return process.env.JWT_REFRESH_EXPIRE || '7d';
    },
};