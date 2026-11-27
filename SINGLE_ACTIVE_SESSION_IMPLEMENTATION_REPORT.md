# SINGLE ACTIVE SESSION — IMPLEMENTATION REPORT

**Project:** `english-course-web`  
**Date:** 2026-11-27  
**Branch:** `development`  
**HEAD:** `e8266b9`  
**Working tree:** dirty and preserved; implementation remains uncommitted.  
**Production database / ENV / deploy / push / commit:** not performed.  
**Code-level decision:** **READY WITH CONDITIONS**.  
**Production decision:** **NOT READY TO ENABLE STRICT ENFORCEMENT**.

## Implemented scope

Option A is implemented for students only: MongoDB Active Session ID, Last Login Wins, access-token session fencing, refresh-token rotation, stale-device invalidation, conditional logout, 15-second learning heartbeat protection, cross-tab synchronization, stale-response protection, and a replacement modal.

Admin and teacher accounts are not limited by the policy. No external cache, WebSocket, paid session service, payment feature, production database migration, commit, push, or deploy was added.

## Backend implementation

- `backend/src/models/User.js:4-16,104-110` stores hidden active-session authority and refresh-token verifier fields.
- `backend/src/security/authSession.js:6-40` creates random session/JTI values and HMAC hashes; raw refresh tokens are not stored.
- `backend/src/controllers/authController.js:192-242` atomically replaces the student session on successful login. Wrong credentials do not replace the current session.
- `backend/src/middlewares/auth.js:48-92` re-reads MongoDB for every protected request and rejects stale student access tokens with `SESSION_REPLACED`.
- `backend/src/controllers/authController.js:267-475` performs refresh rotation with atomic current-JTI/HMAC checks and a bounded concurrent-refresh grace period.
- `backend/src/controllers/authController.js:477-521` conditionally logs out only the matching session.
- `backend/src/controllers/authController.js:605-665` and `backend/src/controllers/adminController.js:334-341` revoke auth state after password change or suspension.
- `backend/src/middlewares/protectedUploads.js:76-80` applies the same stale-session boundary to protected file access.
- `backend/src/middlewares/auth.js:95-147` fails closed with `AUTHENTICATION_UNAVAILABLE` when MongoDB auth lookup is unavailable; this was verified by integration tests.

## Learning safety and business-rule preservation

`LearningSession.authSessionId` is nullable for legacy rows (`backend/src/models/LearningSession.js:11-18`). New start/heartbeat/end/pause operations use the authenticated session fence. The transactional path binds learning-session state, idempotency records, progress, streak credit, and activity writes when MongoDB transactions are available (`backend/src/controllers/learningSessionController.js:50-67,159-231,407-472,607-649`).

The partial unique active-session index is declared at `backend/src/models/LearningSession.js:115-121`; its guarded read-only/apply script is `backend/src/scripts/ensureSingleActiveLearningSessionIndex.js:25-63`. Enrollment, lesson progress, Learning Streak, Gamification, quiz, and assessment rules were retained. The 900-second streak target and 15-second client heartbeat cadence remain unchanged.

## Frontend implementation

- Access token remains `localStorage.accessToken`; refresh token remains an `httpOnly` cookie.
- `frontend/src/api/axiosConfig.js:11-42,75-109` uses one refresh promise per tab, Web Locks where available, latest-token checks, safe retry rules, and replacement fencing.
- `frontend/src/utils/authEvents.js` and `frontend/src/store/authStore.js:80-106` synchronize login/logout/replacement across tabs without placing tokens in events.
- `frontend/src/App.jsx:38-52` subscribes to auth events and renders `frontend/src/components/auth/SessionReplacementModal.jsx`.
- `frontend/src/api/learningApi.js:14-20` sends an idempotency key for heartbeat writes.
- `frontend/e2e/single-active-session-local.mjs` verifies two browser contexts and two tabs in one context.

## Environment requirements

Required backend names are `MONGODB_URI`, `JWT_SECRET`, and `JWT_REFRESH_SECRET`. Existing JWT options are `JWT_EXPIRE`, `JWT_REFRESH_EXPIRE`, `JWT_ISSUER`, and `JWT_AUDIENCE`. Student rollout flags are:

- `AUTH_SESSION_ENFORCEMENT_STUDENTS`
- `AUTH_REFRESH_ROTATION`
- `AUTH_LEGACY_JWT_MIGRATION`

The staging example keeps strict enforcement and rotation false until validation and keeps legacy migration true (`backend/.env.staging.example:15-17`). No secret values were read or reported. The frontend only needs its existing `VITE_API_URL`; it does not receive session secrets.

Multi-instance rate limiting now uses the shared MongoDB connection and `RateLimitBucket`; no external cache or rate-limit service is required. `RATE_LIMIT_NAMESPACE` remains the only rate-limit-specific deployment setting.

## Migration and rollout strategy

1. Deploy the additive code with `AUTH_SESSION_ENFORCEMENT_STUDENTS=false` and `AUTH_REFRESH_ROTATION=false`.
2. Run `learning-session:index` in read-only mode and inspect duplicate active rows.
3. Apply the partial unique index only after duplicate review, backup, and explicit staging approval. Do not backfill legacy `authSessionId` values.
4. Verify replica-set/Atlas transactions and run the two-instance/session/outage tests in staging.
5. Test legacy student tokens and require controlled re-authentication before strict mode; strict enforcement rejects unbound legacy student tokens.
6. Enable `AUTH_REFRESH_ROTATION=true` and `AUTH_SESSION_ENFORCEMENT_STUDENTS=true` together, then monitor `SESSION_REPLACED`, `REFRESH_REUSE`, authentication 503s, heartbeat failures, and daily-credit anomalies.

Rollback is a controlled configuration/code rollback. Do not drop the unique index or delete learning history as an emergency action.

## Verification matrix

| Check | Result | Evidence / limitation |
|---|---|---|
| Auth-session unit/integration | **PASS** | 3 unit + 3 integration tests |
| Replica-set/two-backend session path | **PASS** | Disposable MongoMemoryReplSet, index, concurrent login/heartbeat, outage/recovery |
| Old-device protected learning API | **PASS** | Old start/heartbeat rejected with `SESSION_REPLACED` |
| Admin/teacher exemption | **PASS** | Concurrent admin/teacher sessions both remain valid |
| Optional auth/protected upload boundary | **PASS** | Targeted integration plus Phase 1/4 coverage |
| Learning Streak/Gamification backend | **PASS** | 14/14 gamification; 14/14 learning-streak integration |
| Phase 3 regression | **PASS** | 14/14 after stale fixture correction; no status/RBAC weakening |
| Phase 4 integration | **PASS** | 5/5 after disposable fixture correction and local-file/blob classification fix |
| Backend CI checks | **PASS** | Phase 1 19/19; rate limiter unit 4/4; Mongo rate limiter 7/7; database readiness 7/7 |
| Frontend unit/build/artifacts | **PASS** | 20/20; build and artifact checks pass |
| Local Playwright session E2E | **PASS** | Two contexts, multi-tab, modal once, no replacement refresh |
| Learning Streak browser E2E | **PASS** | 375/390/768/1280/1440px |
| Shared/staging E2E | **NOT RUN** | No verified staging URL/account was used |
| Production Mongo/index/migration | **NOT VERIFIED** | Requires staging/production read-only operational checks |
| Lint/typecheck | **NOT RUN** | No corresponding repository scripts found |

## Runtime and dependency findings

Node `22.23.4` and npm `10.9.9` were used. Both backend and frontend `npm ci` completed without engine warnings. The earlier frontend install delay was not reproduced under Node 22; the existing SheetJS CDN dependency remains network-sensitive. The frontend build emits existing third-party annotation and large-chunk warnings. Existing npm audit findings remain separate dependency-remediation work and are not hidden by this implementation.

The unrelated vocabulary catalog suite fails identically on current and baseline HEAD, the gamification browser E2E fails identically on current and baseline HEAD, and the broad Phase 5 browser harness remains unverified after a post-startup hang. None is marked PASS or attributed to Single Active Session.

## Release decision

**Code-level:** READY WITH CONDITIONS.  
**Production:** NOT READY TO ENABLE STRICT ENFORCEMENT until real staging proves MongoDB topology/transactions/index state, migration behavior, shared browser contexts, and the remaining regression conditions.
