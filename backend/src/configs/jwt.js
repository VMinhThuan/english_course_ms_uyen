export const jwtConfig = {
  secret: process.env.JWT_SECRET,
  refreshSecret: process.env.JWT_REFRESH_SECRET,
  expiresIn: process.env.JWT_EXPIRE || '15m',
  refreshExpiresIn: process.env.JWT_REFRESH_EXPIRE || '7d',
};

