# SINGLE ACTIVE SESSION — FINAL RELEASE READINESS

**Verification date:** 2026-11-27 (Asia/Ho_Chi_Minh)  
**Repository:** `/Users/vuthuan/english-course-web`  
**Branch:** `development`  
**HEAD:** `e8266b9`  
**Working tree:** dirty; preserved without reset, checkout, overwrite, commit, push, deploy, or production database change.  
**Runtime:** Node `v22.23.4`, npm `10.9.9`  
**Final decision:** **READY WITH CONDITIONS** for controlled staging validation.  
**Production readiness:** **NOT ESTABLISHED**.

## Executive conclusion

The uncommitted Option A implementation is code-level coherent and its targeted Single Active Session security invariants pass locally, including a disposable MongoDB replica-set test with two Express app instances. Students use MongoDB Active Session ID plus refresh-token rotation; Last Login Wins is atomic; admin and teacher sessions are unrestricted.

This is not a production approval. Real staging must still verify MongoDB topology, transaction support, index state/migration, legacy-token rollout, shared browser contexts, and operational observability. Unrelated baseline failures and an unverified broad browser harness are recorded below and are not misreported as PASS.

Payment Proof, VietQR, Cloudinary, purchase, renewal, and cancellation reconciliation are outside this project and are not release conditions.

## Implementation and security invariant matrix

| Invariant | Code evidence | Verification result |
|---|---|---|
| Atomic student Last Login Wins | `backend/src/controllers/authController.js:192-242` | **PASS** in single-session integration and concurrent-login test |
| Stale access token invalid | `backend/src/middlewares/auth.js:48-92` | **PASS**; returns `SESSION_REPLACED` |
| Stale refresh invalid/reuse fenced | `backend/src/controllers/authController.js:322-475` | **PASS**; stale refresh returns replacement/reuse error and clears only stale cookie |
| Wrong password preserves current session | `backend/src/controllers/authController.js:166-185` | **PASS** |
| Stale logout cannot clear current session | `backend/src/controllers/authController.js:477-521` | **PASS**; conditional `authSession.sessionId` filter |
| Concurrent student login has one valid access session | `backend/tests/singleActiveSession.integration.test.js:143-163` | **PASS**; two login responses, one `/me` 200 and one `SESSION_REPLACED` |
| Concurrent refresh does not revoke legitimate session | `backend/src/controllers/authController.js:386-425` | **PASS** in targeted integration |
| Optional auth cannot silently accept stale student token | `backend/src/middlewares/auth.js:116-147` | **PASS** in targeted integration |
| Protected uploads cannot bypass replacement | `backend/src/middlewares/protectedUploads.js:76-80` | **PASS** through existing Phase 1/4 coverage; shared staging upload E2E not run |
| `SESSION_REPLACED` does not auto-refresh | `frontend/src/api/axiosConfig.js:75-109`; `frontend/e2e/single-active-session-local.mjs` | **PASS** local E2E; zero refresh requests after replacement |
| Replacement modal appears once | `frontend/src/App.jsx:38-52`; `frontend/src/components/auth/SessionReplacementModal.jsx` | **PASS** local E2E |
| Cross-tab sync and stale response fencing | `frontend/src/utils/authEvents.js`; `frontend/src/store/authStore.js:80-106`; `frontend/src/api/axiosConfig.js:11-42` | **PASS** local E2E for two tabs/current session; staging not verified |
| Multiple tabs in one browser remain allowed | `frontend/e2e/single-active-session-local.mjs` | **PASS** |
| Admin/teacher are exempt | `backend/src/controllers/authController.js:195-205`; integration test | **PASS**; concurrent admin/teacher `/me` both 200 |
| Mongo outage fails closed | `backend/src/middlewares/auth.js:101-113`; replica/integration tests | **PASS** locally as `503 AUTHENTICATION_UNAVAILABLE`; production outage behavior not verified |
| Raw refresh token is not stored/logged | `backend/src/security/authSession.js:25-40`; integration assertion | **PASS**; DB stores HMAC verifier; logs contain error name/code only |
| Learning session is fenced by auth session | `backend/src/models/LearningSession.js:11-18`; `backend/src/controllers/learningSessionController.js:40-67,407-472,607-649` | **PASS** in targeted and replica tests |
| No old-device study credit after revoke | Targeted old-token start/heartbeat tests | **PASS** locally; staging load/race evidence not run |
| Heartbeat/idempotency prevents double credit | `backend/src/controllers/learningSessionController.js:407-472`; Learning Streak integration | **PASS** locally; 15-second client cadence retained |

## MongoDB and concurrency verification

`backend/tests/singleActiveSession.replica.integration.test.js` passed against a disposable loopback `MongoMemoryReplSet` and verified:

- topology reports `ReplicaSetWithPrimary`;
- `learning_session_one_active_per_student` is unique with partial filter `{ status: 'active' }`;
- two Express app instances share the same MongoDB authority;
- login on the second instance invalidates the first access token;
- old-token learning start is rejected;
- concurrent heartbeats do not create a second active session or unbounded credit;
- Mongo disconnect returns `503 AUTHENTICATION_UNAVAILABLE`, and reconnect restores access.

This is code-level disposable evidence, not proof of the production Atlas topology or index state.

## Verification results

### PASS

- Auth-session unit: 3/3.
- Single-session integration: 3/3.
- Replica-set session integration: 1/1.
- Backend Phase 1: 19/19.
- Backend Phase 2: 20/20.
- Backend Phase 2 import: 6/6.
- Backend Phase 3: 14/14 after correcting stale test fixtures from `type: 'exam'` to the existing Standard route contract `type: 'exercise'`; no expected status or RBAC rule was weakened.
- Backend Phase 4: 5/5 after making the disposable fixture deterministic and correcting a real local-file/blob-path classification bug in `backend/src/controllers/materialController.js:509-516`.
- Backend Phase 5 CORS: 2/2 with all legacy external-store variables explicitly unset.
- Learning Streak unit/integration: 3/3 and 14/14.
- Round 2 monitoring: 12/12.
- Gamification backend: 14/14.
- Database readiness: 7/7.
- Rate limiter: 4/4.
- Frontend unit: 20/20.
- Frontend production build and artifact checks: PASS.
- Local two-context/two-tab Single Active Session Playwright E2E: PASS.
- Learning Streak browser E2E: PASS at 375/390/768/1280/1440px.

### Not PASS

- Vocabulary catalog V1: 6 pass, 3 fail on current worktree and the same 6 pass, 3 fail on baseline `e8266b9`; pre-existing and unrelated to this implementation.
- Vocabulary parser integration: 2 skipped because private DOCX/golden evidence paths were not supplied; skipped is not pass.
- Gamification browser E2E: failed on current worktree and baseline with challenge-flow timeout; pre-existing and unrelated to auth/session.
- Broad Phase 5 browser harness: its fixture initially hung during Mongoose initialization. A test-only `mongoose.set('autoCreate', false)` guard allowed startup through backend/Vite/browser launch, but no case result was emitted before extended inactivity and the run was stopped. It remains unverified.
- Shared/staging E2E, production Mongo topology/index/transaction state, production migration, and monitoring: not verified.
- Lint/typecheck: no repository scripts found; not run.

## Runtime, install, and warning findings

The repository’s `.nvmrc`, backend engine declaration, and deployment workflows specify Node `22.23.4`. Backend and frontend `npm ci` completed under that runtime with no engine warnings. The earlier frontend install delay was not reproduced; the existing SheetJS CDN tarball is still a network-sensitive dependency.

Frontend build completed with existing third-party annotation warnings and large-chunk warnings. Existing `npm audit` output reported dependency findings; dependency remediation is separate from this session implementation and must be handled before a general production security sign-off.

## Required production ENV names

Secret values were not read or disclosed.

Backend:

- `MONGODB_URI`
- `JWT_SECRET`
- `JWT_REFRESH_SECRET`
- Optional existing JWT settings: `JWT_EXPIRE`, `JWT_REFRESH_EXPIRE`, `JWT_ISSUER`, `JWT_AUDIENCE`
- Session rollout flags: `AUTH_SESSION_ENFORCEMENT_STUDENTS`, `AUTH_REFRESH_ROTATION`, `AUTH_LEGACY_JWT_MIGRATION`
- Existing MongoDB rate-limit setting: `RATE_LIMIT_NAMESPACE`

Frontend:

- Existing `VITE_API_URL`; no session secret belongs in frontend ENV.

The checked-in staging example keeps strict enforcement and rotation false, and legacy migration true. Do not change production values based only on this local verification.

## Migration, deployment, and rollback conditions

1. Deploy additive backend/frontend code to staging with strict student enforcement and rotation disabled.
2. Run `backend/src/scripts/ensureSingleActiveLearningSessionIndex.js` in read-only mode; resolve duplicate active rows before applying the partial unique index.
3. Confirm Atlas/replica-set transactions and test two backend instances sharing the same database.
4. Test existing legacy student tokens and planned re-authentication. Strict mode rejects unbound legacy student tokens; existing students may need to sign in again.
5. Apply the index only after backup and explicit approval; do not backfill old learning rows or delete history.
6. Run two independent browser contexts, concurrent login/refresh, stale logout, protected learning, upload, optional-auth, suspension, password-change, and outage recovery scenarios.
7. Enable `AUTH_REFRESH_ROTATION=true` and `AUTH_SESSION_ENFORCEMENT_STUDENTS=true` together, then monitor replacement/reuse/503/heartbeat/daily-credit metrics.

Rollback is a controlled code/config rollback. Do not drop the index or erase session/learning history as a first response.

## Final release status

**READY WITH CONDITIONS** for controlled staging validation.  
**NOT PRODUCTION READY / NOT AUTHORIZED FOR STRICT ENABLEMENT** until the unverified staging and operational conditions above are completed and the remaining regression/test-harness findings are dispositioned.
