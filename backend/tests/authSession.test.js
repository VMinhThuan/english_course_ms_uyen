import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import {
  createAuthSessionState,
  createRefreshJti,
  createSessionId,
  createTokenJti,
  hashRefreshToken,
  isRefreshRotationEnabled,
  isLegacyJwtMigrationEnabled,
  isStudentSessionEnforcementEnabled,
} from '../src/security/authSession.js';
import { generateAccessToken, generateRefreshToken } from '../src/utils/generateToken.js';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'auth-session-test-access-secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'auth-session-test-refresh-secret';

test('session state contains independent session and refresh-token identity', () => {
  const sessionId = createSessionId();
  const refreshJti = createRefreshJti();
  const state = createAuthSessionState({ sessionId, refreshJti, refreshTokenHash: hashRefreshToken('refresh-token') });
  assert.equal(state.sessionId, sessionId);
  assert.equal(state.refreshJti, refreshJti);
  assert.equal(state.previousRefreshJti, null);
  assert.equal(hashRefreshToken('refresh-token'), hashRefreshToken('refresh-token'));
  assert.notEqual(hashRefreshToken('refresh-token'), hashRefreshToken('other-token'));
});

test('student token pair carries session, type, and unique JTI claims', () => {
  const sessionId = createSessionId();
  const access = generateAccessToken('student-id', { sessionId, jti: createTokenJti() });
  const refresh = generateRefreshToken('student-id', { sessionId, jti: createRefreshJti() });
  const accessClaims = jwt.decode(access);
  const refreshClaims = jwt.decode(refresh);
  assert.equal(accessClaims.sid, sessionId);
  assert.equal(accessClaims.typ, 'access');
  assert.equal(refreshClaims.sid, sessionId);
  assert.equal(refreshClaims.typ, 'refresh');
  assert.notEqual(accessClaims.jti, refreshClaims.jti);
});

test('session enforcement flags are opt-in and independently controlled', () => {
  assert.equal(isStudentSessionEnforcementEnabled({ AUTH_SESSION_ENFORCEMENT_STUDENTS: 'true' }), true);
  assert.equal(isStudentSessionEnforcementEnabled({ AUTH_SESSION_ENFORCEMENT_STUDENTS: 'false' }), false);
  assert.equal(isRefreshRotationEnabled({ AUTH_REFRESH_ROTATION: 'true' }), true);
  assert.equal(isRefreshRotationEnabled({ AUTH_REFRESH_ROTATION: 'false' }), false);
  assert.equal(isLegacyJwtMigrationEnabled({}), true);
  assert.equal(isLegacyJwtMigrationEnabled({ AUTH_LEGACY_JWT_MIGRATION: 'false' }), false);
});
