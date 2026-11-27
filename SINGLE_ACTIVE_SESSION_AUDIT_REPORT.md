# SINGLE ACTIVE SESSION — TARGETED AUTHENTICATION RE-AUDIT

**Audit date:** 2026-11-27 (Asia/Ho_Chi_Minh)  
**Repository:** `/Users/vuthuan/english-course-web`  
**Verified branch:** `development`  
**Verified HEAD:** `e8266b9` (`feat: add staging environment configuration, rate limiting, and learning streak updates`)  
**Working tree:** dirty; existing local changes were preserved.  
**Audit decision:** **READY WITH CONDITIONS** for controlled staging implementation; **not a production-readiness approval**.

## Scope

Payment Proof, VietQR, Cloudinary, purchase, renewal, and cancellation reconciliation are outside the `english-course-web` project scope. Their absence is expected and is not a repository, branch, implementation, or release blocker. No payment functionality was added or changed.

This audit covers the current source and the uncommitted Single Active Session implementation. No commit, push, deploy, production database write, production ENV change, or secret-value read was performed.

## Repository and working-tree verification

| Check | Result | Evidence |
|---|---|---|
| Repository | PASS | `/Users/vuthuan/english-course-web` |
| Branch | PASS | `development` |
| HEAD | PASS | `e8266b9`; `origin/development` was aligned during audit |
| Working tree | VERIFIED DIRTY | Auth/session, learning, frontend, tests, and reports contain existing local changes |
| Production mutation | NOT PERFORMED | No production DB/ENV/deploy operation |

## In-scope product-area verification

| Area | Source evidence | Result |
|---|---|---|
| Enrollment | `backend/src/models/Enrollment.js:3-40`; `backend/src/routes/enrollmentRoutes.js:1-10` | PRESENT; business rules retained |
| Lesson progress | `backend/src/models/LearningProgress.js`; `backend/src/controllers/learningSessionController.js:159-231,407-472,607-649` | PRESENT; guarded writes covered by tests |
| Learning Streak | `backend/src/services/learningStreakService.js:97-235`; `backend/src/routes/learningStreakRoutes.js:1-15` | PRESENT; 900-second target retained |
| Gamification | `backend/src/services/gamificationService.js`; `backend/src/routes/gamificationRoutes.js` | PRESENT; backend regression passes |
| Payment-related areas | Not part of this project scope | OUT OF SCOPE; not a blocker |

## Authentication findings reconciled with current source

### User model, JWT, middleware, controllers

- `backend/src/models/User.js:4-16,104-110` defines hidden `authSession` state: session ID, timestamps, current refresh JTI/HMAC verifier, and previous-token grace fields. `toJSON()` removes it at `backend/src/models/User.js:130-136`.
- `backend/src/security/authSession.js:6-40` creates random session/JTI values and stores only an HMAC verifier for refresh tokens.
- `backend/src/configs/jwt.js:3-20` reads `JWT_SECRET`, `JWT_REFRESH_SECRET`, `JWT_EXPIRE`, `JWT_REFRESH_EXPIRE`, optional `JWT_ISSUER`, and optional `JWT_AUDIENCE`. Secret values were not read or disclosed.
- `backend/src/utils/generateToken.js:11-32` adds `sid`, `jti`, and `typ` claims. Student tokens are session-bound; teacher/admin tokens remain outside the single-session policy.
- `backend/src/middlewares/auth.js:48-92` verifies the token, re-reads MongoDB account state, checks status/suspension, and when enabled rejects a student whose `sid` is not the current MongoDB session with `401 SESSION_REPLACED`.
- `backend/src/middlewares/auth.js:95-147` and `backend/src/middlewares/protectedUploads.js:76-80` fail closed on authentication/database lookup failure and do not let stale optional-auth or protected-upload requests continue.
- `backend/src/controllers/authController.js:192-242` performs atomic Last Login Wins for students. Wrong credentials return before the session update.
- `backend/src/controllers/authController.js:267-475` validates refresh claims and performs current-JTI/HMAC compare-and-set rotation with a bounded concurrent-refresh grace period.
- `backend/src/controllers/authController.js:477-521` conditionally clears only the matching session, so stale logout cannot clear a newer device.
- `backend/src/controllers/authController.js:605-665` and `backend/src/controllers/adminController.js:334-341` revoke auth state after password change or suspension.

### Actual token storage

- Access token: `localStorage.accessToken`, written by `frontend/src/api/authApi.js:13-18` and attached by `frontend/src/api/axiosConfig.js:44-52`.
- Refresh token: `httpOnly` `refreshToken` cookie; cookie setup and legacy-path cleanup are in `backend/src/middlewares/auth.js:22-45`.
- Frontend session state: in-memory Zustand in `frontend/src/store/authStore.js:13-20`; restoration uses `/auth/me` and `/auth/refresh`.
- Cross-tab coordination: `frontend/src/utils/authEvents.js`, `frontend/src/api/axiosConfig.js:11-42,75-109`, and `frontend/src/store/authStore.js:80-106`.

### Prior findings

| Prior finding | Current source status |
|---|---|
| No per-login student authority | Resolved in worktree: MongoDB `User.authSession` |
| No Last Login Wins | Resolved: atomic student login replacement |
| No refresh rotation | Resolved: current JTI/HMAC CAS plus bounded concurrent grace |
| Stale logout could clear current device | Resolved: conditional session filter |
| No replacement UI | Resolved: auth event → Zustand → global modal |
| Learning writes were not session-bound | Resolved in guarded path: `LearningSession.authSessionId` and session-scoped writes |
| Payment/VietQR/Cloudinary absent | Not applicable; explicitly outside scope |

## Option A suitability

**MongoDB Active Session ID + Refresh Token Rotation remains suitable.** The existing backend already reads MongoDB account state for protected requests, so a shared MongoDB authority works across backend instances without an external cache or WebSocket. Admin and teacher behavior remains unrestricted.

The implementation is suitable for controlled staging only after all of the following are verified in that environment:

1. MongoDB is a replica set/Atlas topology supporting transactions.
2. `backend/src/scripts/ensureSingleActiveLearningSessionIndex.js:25-63` is run in read-only mode first, duplicate active rows are reviewed, and the partial unique index is applied only with explicit approval.
3. Existing student re-authentication/legacy-token behavior is tested before enabling strict enforcement and rotation together.
4. Shared two-browser-context E2E and outage recovery are run against staging infrastructure, not only disposable local MongoDB.

## Code-level verification performed

The following passed under Node `v22.23.4` / npm `10.9.9`, using `NODE_ENV=test` where applicable:

- Auth-session unit: **3/3 PASS**.
- Single-session integration: **3/3 PASS**; includes wrong password preservation, stale access/refresh/logout, optional auth, concurrent student login, admin/teacher exemption, old learning requests, raw-refresh non-storage, and Mongo outage fail-closed.
- Replica-set session integration: **1/1 PASS**; topology, partial unique index, two app instances, concurrent heartbeats, outage and recovery.
- Backend Phase 1: **19/19 PASS**.
- Backend Phase 2: **20/20 PASS**.
- Backend Phase 2 import: **6/6 PASS**.
- Backend Phase 3: **14/14 PASS** after correcting stale Standard fixture type from `exam` to the route’s existing `exercise` contract; no expected status was weakened.
- Backend Phase 4: **5/5 PASS** after disposable-fixture setup correction and a real local-file/blob-path classification fix in `backend/src/controllers/materialController.js:509-516`.
- Backend Phase 5 CORS suite: **2/2 PASS** with all legacy external-store variables explicitly unset.
- Learning Streak unit/integration: **3/3 and 14/14 PASS**.
- Round 2 monitoring: **12/12 PASS**.
- Gamification backend: **14/14 PASS**.
- Database readiness: **7/7 PASS**.
- Rate limiter: **4/4 PASS**.
- Frontend unit suite: **20/20 PASS**.
- Frontend production build and artifact check: **PASS** (`dist/index.html`, `.htaccess`, and no legacy Vercel API URL in JS).
- Local Playwright auth E2E: **PASS** with two independent browser contexts, two tabs in one context, replacement modal once, conditional logout, no refresh after `SESSION_REPLACED`, and current-tab continuity.
- Learning Streak browser E2E: **PASS** at 375, 390, 768, 1280, and 1440px.

## Findings not marked PASS

- Backend vocabulary catalog V1: **6 pass, 3 fail** on current worktree and **the same 6 pass, 3 fail on baseline `e8266b9`**. This is pre-existing and unrelated to Single Active Session.
- Vocabulary parser integration: **0 pass, 2 skipped** because private DOCX/golden evidence paths were not supplied. Skipped is not pass.
- Gamification browser E2E: **failed on current worktree and baseline** with a timeout around the “Xem lại 20 từ ngày”/challenge flow. It is pre-existing and unrelated to auth/session.
- Phase 5 real browser harness: setup initially hung at disposable Mongoose model initialization; after a test-only `mongoose.set('autoCreate', false)` guard it reached backend/Vite/browser startup but produced no case result and was manually stopped after extended inactivity. It is not marked PASS and remains a regression condition.
- Shared/staging account E2E, production Mongo topology, production index state, migration, observability, and flag rollout: **NOT VERIFIED**.
- No repository lint/typecheck script was found in the package manifests; therefore lint/typecheck are **NOT RUN**, not PASS.

## Dependency/runtime verification

`.nvmrc`, backend engines, and deployment workflows specify Node `22.23.4`. `npm ci` completed for backend and frontend under that version, with no engine warnings. The earlier frontend install delay was not reproduced under Node 22; the existing SheetJS CDN tarball remains a potential network-sensitive install dependency. Existing `npm audit` output reported dependency findings and is separate from the session design; it requires normal dependency remediation before a production security sign-off.

## Conclusion

**READY WITH CONDITIONS.** The current source is code-level ready for controlled staging validation of Option A, and the targeted session invariants pass locally, including a disposable replica-set test. This is not production readiness: staging must verify the real Mongo topology/index/transaction state, shared browser E2E, migration behavior, and unresolved unrelated regression suites before strict enforcement is enabled.
