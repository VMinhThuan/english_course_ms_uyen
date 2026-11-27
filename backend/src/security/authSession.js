import { createHmac, randomUUID } from 'node:crypto';
import { jwtConfig } from '../configs/jwt.js';

const isTrue = (value) => String(value || '').toLowerCase() === 'true';

export const isStudentSessionEnforcementEnabled = (env = process.env) =>
  isTrue(env.AUTH_SESSION_ENFORCEMENT_STUDENTS);

export const isRefreshRotationEnabled = (env = process.env) =>
  isTrue(env.AUTH_REFRESH_ROTATION);

// Compatibility window for already-issued legacy JWTs. This flag has no
// authority when strict student session enforcement is enabled: legacy tokens
// are rejected there regardless of its value.
export const isLegacyJwtMigrationEnabled = (env = process.env) => (
  env.AUTH_LEGACY_JWT_MIGRATION === undefined || isTrue(env.AUTH_LEGACY_JWT_MIGRATION)
);

export const createSessionId = () => randomUUID();
export const createTokenJti = () => randomUUID();
export const createRefreshJti = createTokenJti;

// The refresh token has high entropy, but HMAC keeps the stored verifier bound
// to the refresh secret and prevents a database-only hash from being useful if
// the database is copied without the application secret.
export const hashRefreshToken = (token) => {
  if (!token || !jwtConfig.refreshSecret) return null;
  return createHmac('sha256', jwtConfig.refreshSecret).update(String(token)).digest('hex');
};

export const createAuthSessionState = ({ sessionId, refreshJti, refreshTokenHash, now = new Date() }) => ({
  sessionId,
  createdAt: now,
  lastSeenAt: now,
  refreshJti,
  refreshTokenHash,
  previousRefreshJti: null,
  previousRefreshTokenHash: null,
  previousRefreshValidUntil: null,
});

export const getSessionIdFromDecodedToken = (decoded) => (
  typeof decoded?.sid === 'string' && decoded.sid.trim() ? decoded.sid.trim() : null
);

export const getTokenType = (decoded) => (
  typeof decoded?.typ === 'string' && decoded.typ.trim() ? decoded.typ.trim() : null
);

export const getTokenJti = (decoded) => (
  typeof decoded?.jti === 'string' && decoded.jti.trim() ? decoded.jti.trim() : null
);

export const isSessionBoundStudentToken = ({ user, decoded }) => (
  user?.role === 'student'
  && Boolean(getSessionIdFromDecodedToken(decoded))
);
