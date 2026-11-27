# MONGODB-ONLY ARCHITECTURE REPORT

**Verification date:** 2026-11-27 (Asia/Ho_Chi_Minh)  
**Repository:** `/Users/vuthuan/english-course-web`  
**Branch:** `development`  
**HEAD:** `e8266b9`  
**Runtime:** Node.js `v22.23.4`, npm `10.9.9`  
**Working tree:** dirty and preserved; no reset, checkout, commit, push, deploy, production database access, or production ENV change was performed.  
**Decision:** **READY WITH CONDITIONS**; not production-ready.

## 1. Executive Summary

Redis/Upstash was removed from the runtime architecture. The only runtime Redis consumer found was the old rate limiter in `backend/src/middlewares/rateLimit.js`. It has been replaced with a MongoDB-backed fixed-window bucket using one atomic `findOneAndUpdate` pipeline per request where possible.

The new implementation:

- shares authority across backend instances through the existing Mongoose connection;
- uses `RateLimitBucket` documents with unique identity and TTL cleanup indexes;
- resets expired windows in application logic, independent of delayed TTL deletion;
- handles concurrent upserts and duplicate-key races without read-modify-write logic;
- preserves existing policies, 429 responses, `Retry-After`, rate-limit headers, IP/user identity, and proxy trust behavior;
- returns `503 RATE_LIMIT_STORE_UNAVAILABLE` when MongoDB cannot verify the security-sensitive limiter state;
- requires no Redis/Upstash package or environment variable;
- does not change Single Active Session, Learning Streak, Gamification, Enrollment, lesson progress, or study-time rules.

The local disposable benchmark passed for 10, 50, 100, and 500 concurrent bucket updates. These are local measurements, not production capacity claims.

## 2. Redis Usage Before Audit

### Confirmed runtime usage

| Reference | Before-audit behavior | Current state |
|---|---|---|
| `backend/src/middlewares/rateLimit.js` | `@upstash/redis` `INCR`/`EXPIRE`/`TTL` fixed-window store | Replaced by MongoDB bucket |
| `backend/src/app.js` | Required Upstash variables in staging/production at startup | Startup validation removed; MongoDB is the authority |
| `backend/package.json` / lockfile | `@upstash/redis` and transitive `uncrypto` | Removed |
| `backend/.env.staging.example` | Upstash URL/token and Redis timeout variables | Removed |
| `backend/STAGING_LEARNING_STREAK.md` | Upstash deployment instructions | Rewritten for MongoDB indexes |
| `backend/tests/rateLimiter.test.js` | Asserted Redis configuration | Rewritten for MongoDB-only configuration |

### Confirmed non-usage

Targeted repository search found no Redis client, Upstash client, `ioredis`, Redis cache service, Redis health check, background Redis job, or Redis use in authentication, Single Active Session, Learning Streak, learning heartbeat, Gamification, Enrollment, course access, or frontend code.

The remaining word occurrences in reports describe the removed architecture or audit history; they are not runtime consumers. No payment-related feature was added.

## 3. Root Causes and Dependencies

The previous rate limiter used Redis because its production configuration rejected a local memory store for multi-instance deployments. That made Upstash a hard runtime dependency even though MongoDB was already the shared database used by authentication and learning-session fencing.

The previous local fallback used an in-memory `Map`; that was acceptable only for tests/local development and could not be an authority across instances. The MongoDB implementation removes that production ambiguity. There is now one shared authority and one operational migration requirement: the unique and TTL indexes must be verified before multi-instance rollout.

## 4. MongoDB-Only Architecture

The rate limiter uses the existing Mongoose connection and the `RateLimitBucket` model at `backend/src/models/RateLimitBucket.js:1-48`.

Request path:

1. Existing middleware derives the identity from `req.ip`, authenticated user ID, or user-or-IP policy.
2. `RATE_LIMIT_NAMESPACE` or `APP_ENV`/`NODE_ENV` isolates deployment key spaces.
3. The limiter composes a bucket key from namespace, limiter name, identity, and optional suffix.
4. `MongoRateLimitStore.increment()` atomically updates the bucket.
5. The middleware emits the existing headers and either calls `next()`, returns 429, or returns 503 on storage failure.

No separate MongoDB connection is created per request. No cache, queue, WebSocket, Redis, Upstash, or paid session/rate-limit service is involved.

## 5. MongoDB Rate Limiting Implementation

`backend/src/middlewares/rateLimit.js:1-84` implements `MongoRateLimitStore`.

The aggregation update pipeline treats a missing/null/expired `expiresAt` as a new window and sets `count=1`. For a live bucket it increments `count`. Both behaviors are part of one atomic single-document update. The returned `expiresAt` drives `RateLimit-Reset` and `Retry-After`.

The current policies are unchanged:

| Limiter | Policy |
|---|---:|
| Login | 10 / 15 minutes / IP |
| Register | 5 / 1 hour / IP |
| Refresh | 30 / 15 minutes / IP |
| Learning session start/end/pause | 60 / minute / user-or-IP |
| Learning heartbeat/activity heartbeat | 120 / minute / user |
| Learning Streak | 60 / minute / user |
| Admin learning | 120 / minute / user |

Route coverage remains in `backend/src/routes/authRoutes.js:17-19`, `backend/src/routes/learningSessionRoutes.js:16-20`, `backend/src/routes/learningStreakRoutes.js:12`, and `backend/src/routes/adminLearningRoutes.js:24`.

## 6. Atomicity and Race Condition Handling

- Live bucket increments are atomic MongoDB document updates.
- Expired bucket reset is performed by the same pipeline, so TTL monitor timing cannot extend a window.
- The unique `key` index prevents duplicate bucket identities across backend instances.
- A concurrent upsert that encounters duplicate key retries the same atomic pipeline against the existing document.
- The limiter does not read a count, modify it in JavaScript, and write it back.
- No transaction is used for the single-document rate-limit operation.
- Duplicate-key, network, timeout, and MongoDB errors are caught by middleware and become 503, never a bypass.
- `Retry-After` remains present for both 429 and store-unavailable responses.

The verified concurrency test uses two `MongoRateLimitStore` instances against the same disposable MongoDB database and confirms counts 1 through 100 with exactly one bucket document.

## 7. Database Schema and Indexes

`RateLimitBucket` fields:

- `key`: bounded bucket identity;
- `scope`: normalized deployment namespace;
- `count`: current fixed-window count;
- `windowStart`: current window start;
- `expiresAt`: application expiry and TTL cleanup timestamp.

Indexes declared in `backend/src/models/RateLimitBucket.js:31-40`:

- `rate_limit_bucket_key_unique`: unique `{ key: 1 }`;
- `rate_limit_bucket_expires_ttl`: TTL `{ expiresAt: 1 }`, `expireAfterSeconds: 0`;
- MongoDB `_id` index.

`backend/src/scripts/ensureRateLimitIndexes.js:1-67` supports read-only check by default and guarded `--apply`. Applying outside staging requires an explicit operational approval variable; no production apply was run.

TTL cleanup is intentionally not a correctness mechanism. The integration test confirms an expired document can still exist after `expiresAt`, while the next application update resets it correctly.

## 8. Performance and Load Testing Results

The test `backend/tests/rateLimiter.mongo.integration.test.js:130-157` ran against a disposable loopback MongoDB instance with driver pool size 100. It performed one atomic bucket update per request and measured store-level latency:

| Concurrent requests | Throughput | p50 | p95 | p99 | Bucket writes |
|---:|---:|---:|---:|---:|---:|
| 10 | 2,136.96 req/s | 3.37 ms | 4.58 ms | 4.58 ms | 10 |
| 50 | 3,908.97 req/s | 8.96 ms | 11.61 ms | 12.36 ms | 50 |
| 100 | 3,669.75 req/s | 19.39 ms | 24.91 ms | 26.16 ms | 100 |
| 500 | 4,960.64 req/s | 69.02 ms | 94.40 ms | 95.10 ms | 500 |

The benchmark created 660 distinct bucket documents in the disposable database and reported pool size 100. Write amplification for the tested path is one bucket update attempt per request; a new identity/window creates a document, while repeated activity reuses the bucket.

These figures do not include the rate-limiter middleware's required index-readiness metadata check and do not prove Atlas or production capacity. A staging test must measure full API latency, MongoDB server counters, CPU, memory, connection pool saturation, write concern, network latency, and real heartbeat mix before capacity is approved.

## 9. Removed Dependencies

Removed from backend manifest and lockfile:

- `@upstash/redis`;
- transitive `uncrypto` used only by that package.

`npm ci --ignore-scripts` under Node 22 completed after removal. The remaining audit output reports six high-severity dependency findings; those are separate remediation work and are not hidden by this change.

## 10. Removed Environment Variables

Removed from application configuration and staging example:

- `UPSTASH_REDIS_REST_URL`;
- `UPSTASH_REDIS_REST_TOKEN`;
- `RATE_LIMIT_REDIS_TIMEOUT_MS`.

No production environment variable was deleted or changed. Deployment operators should remove old variables only after verifying the new application version and MongoDB indexes in the target environment.

## 11. Required Environment Variables

Required existing backend values remain:

- `MONGODB_URI`;
- `JWT_SECRET`;
- `JWT_REFRESH_SECRET`.

Existing optional/runtime values remain as applicable:

- `JWT_EXPIRE`, `JWT_REFRESH_EXPIRE`, `JWT_ISSUER`, `JWT_AUDIENCE`;
- `APP_ENV`, `NODE_ENV`, `RATE_LIMIT_NAMESPACE`, `TRUST_PROXY_HOPS`;
- `FRONTEND_URL`, `FRONTEND_ORIGINS`;
- Single Active Session flags `AUTH_SESSION_ENFORCEMENT_STUDENTS`, `AUTH_REFRESH_ROTATION`, `AUTH_LEGACY_JWT_MIGRATION`;
- `VITE_API_URL` for the frontend.

No new secret is required. No secret value was read or disclosed.

## 12. Single Active Session Regression

The MongoDB rate-limit change does not alter authentication authority or token behavior. Targeted checks remain:

- Last Login Wins and wrong-password preservation: PASS;
- stale access/refresh rejection and conditional logout: PASS;
- refresh rotation and concurrent refresh: PASS;
- two-instance replica-set session fencing: PASS;
- admin/teacher exemption: PASS;
- cross-tab synchronization and replacement modal: PASS in local Playwright E2E;
- Mongo auth outage fail-closed: PASS.

No Redis code path is involved in Single Active Session.

## 13. Learning Streak Regression

Learning Streak and heartbeat routes retain their existing policies and business logic. The rate-limit policy remains 120 heartbeat requests per user per minute, which is compatible with a 15-second heartbeat cadence. Existing local results after the previous authentication implementation were 14/14 Learning Streak integration tests and 14/14 Gamification backend tests; the rate-limit regression was rerun after migration as part of the backend suite.

The rate limiter does not write learning documents, study seconds, streak rows, progress, enrollment, or gamification state. MongoDB transaction fencing for learning remains unchanged.

## 14. Security Verification

| Security condition | Result |
|---|---|
| No raw password/JWT/credential in rate-limit bucket | PASS by schema/source inspection |
| IP identity does not trust spoofed forwarding headers without configured proxy hops | PASS in existing rateLimiter test |
| Authenticated limiter uses user identity | PASS in existing rateLimiter test |
| Brute-force login/register/refresh policies retained | PASS by route/source audit |
| Database failure does not bypass limiter | PASS; 503 integration test |
| Rate-limit exceeded remains distinct from database unavailable | PASS; 429 vs 503 contract tests |
| No infinite retry | PASS; one duplicate-key retry, no network retry loop |
| TTL deletion timing cannot extend a window | PASS integration test |
| Multi-instance bucket authority | PASS disposable two-store test; staging not verified |

## 15. Full Test Results

### Newly executed for MongoDB-only migration

- `npm ci --ignore-scripts` backend on Node 22: **PASS**.
- App import with `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, and `RATE_LIMIT_REDIS_TIMEOUT_MS` explicitly unset: **PASS**.
- `NODE_ENV=test npm run test:rate-limiter`: **4/4 PASS**.
- `NODE_ENV=test npm run test:rate-limiter-mongo`: **7/7 PASS**, including fail-closed behavior when required indexes are missing.
- `env -u UPSTASH_REDIS_REST_URL -u UPSTASH_REDIS_REST_TOKEN -u RATE_LIMIT_REDIS_TIMEOUT_MS NODE_ENV=test npm run test:phase5`: **2/2 PASS**.

### Existing regression evidence retained

- Backend Phase 1: 19/19 PASS.
- Backend Phase 2: 20/20 PASS.
- Backend Phase 3: 14/14 PASS.
- Backend Phase 4: 5/5 PASS.
- Auth-session and Single Active Session integration: PASS.
- Replica-set session integration: PASS.
- Learning Streak integration: 14/14 PASS.
- Gamification backend: 14/14 PASS.
- Frontend unit: 20/20 PASS.
- Frontend build/artifact checks and local two-context session E2E: PASS.

Not marked PASS: baseline vocabulary catalog failures, baseline Gamification browser timeout, broad Phase 5 browser harness post-startup hang, staging E2E, production Mongo/index verification, and lint/typecheck because no scripts exist.

## 16. Files Modified

Primary MongoDB-only files:

- `backend/src/models/RateLimitBucket.js` — new bucket schema and indexes;
- `backend/src/middlewares/rateLimit.js` — MongoDB atomic store and unchanged policies;
- `backend/src/scripts/ensureRateLimitIndexes.js` — read-only/apply index tool;
- `backend/tests/rateLimiter.test.js` — Redis assumptions removed;
- `backend/tests/rateLimiter.mongo.integration.test.js` — atomicity, outage, TTL, concurrency, and load tests;
- `backend/package.json` and `backend/package-lock.json` — script/dependency update;
- `backend/.env.staging.example` — Redis variables removed;
- `backend/STAGING_LEARNING_STREAK.md` and `ENV_GUIDE.md` — MongoDB-only deployment guidance;
- `backend/src/app.js` — external rate-store startup assertion removed;
- Single Active Session reports — rate-limit architecture references updated.

Existing authentication/session and unrelated working-tree changes were preserved. No payment code was added.

## 17. Deployment Instructions

1. In staging, deploy the code and run locked `npm ci` with Node 22.23.4.
2. Keep existing MongoDB/JWT/CORS/session configuration. Do not add Redis/Upstash values.
3. Run `APP_ENV=staging npm --prefix backend run rate-limit:index` in read-only mode.
4. Review the unique and TTL indexes, database permissions, and existing bucket data.
5. Run `APP_ENV=staging npm --prefix backend run rate-limit:index -- --apply` after backup/approval.
6. Start two backend instances against the same staging MongoDB and run auth, rate-limit, heartbeat, outage-recovery, and two-context E2E checks.
7. Remove old Redis/Upstash variables from the staging deployment only after the new version is serving and verified. Production variables are not changed by this work.

No Vercel-specific frontend configuration is required for rate limiting. Backend hosting only needs its existing MongoDB connectivity and connection-pool settings.

## 18. Migration and Rollback Strategy

The migration is additive and does not modify users, sessions, learning history, or business data. `rate_limit_buckets` may be created empty. The unique and TTL indexes are operational prerequisites for multi-instance correctness and must be applied through the guarded script.

No student re-login is required solely because Redis was removed; authentication token/session state is unchanged. If Single Active Session flags are enabled separately, its existing re-authentication rules still apply.

Rollback order:

1. Stop the new application rollout and revert application code/configuration.
2. Keep the MongoDB rate-limit collection/indexes; they are additive and harmless to existing business data.
3. Do not restore Redis variables or package dependencies unless an explicitly approved temporary rollback build requires them.
4. Do not drop indexes or delete bucket/learning/session history as an emergency action.

## 19. Remaining Risks

- Production/staging MongoDB topology, latency, write concern, index state, and pool capacity were not verified.
- The local benchmark uses loopback MongoDB and is not a production capacity guarantee.
- TTL cleanup is delayed by MongoDB design; expired bucket retention can temporarily increase collection size, while application reset remains correct.
- One atomic MongoDB write is performed per rate-limited request; heartbeat traffic must be monitored in staging.
- Existing npm audit reports six high-severity dependency findings.
- Existing unrelated vocabulary/Gamification browser/Phase 5 harness findings remain open.
- No lint/typecheck scripts were present.

## 20. Production Readiness

**READY WITH CONDITIONS.** The application is MongoDB-only at code/config/package level and passes the new local atomicity/outage/load verification. It is not production-ready until staging confirms indexes, two-instance behavior, real MongoDB performance, outage recovery, and deployment observability. No production database or environment was accessed or changed.
