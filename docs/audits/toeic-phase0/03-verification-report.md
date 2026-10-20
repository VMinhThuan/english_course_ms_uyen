# 03 — Verification report

## Run context

- Commit under review: d8b5c49b0e6fb73e7f414798ae077a9ce713f001 on main.
- Environment: local development only, Windows workspace; backend localhost:3000, frontend localhost:5173.
- No authenticated test account or confirmed disposable test database was used.
- No database writes, seed, migration, reset, destructive API request or production request was made.

## Checks performed

| Check | Result | Evidence and limits |
|---|---|---|
| Git baseline | PASS | Initial tree clean at audit start; branch main and SHA recorded in 00-system-baseline.md. The audit files are the only new untracked files. |
| Backend JavaScript syntax | PASS | 74 files under backend/src parsed; 0 syntax errors. This does not test runtime behavior. |
| Frontend build | PASS with warning | Vite 5.4.21, 247 modules. Main bundle 616.29 kB exceeds the 500 kB warning threshold. Temporary output was removed. |
| Backend health GET | PASS | GET http://localhost:3000/health returned HTTP 200 with status success and development environment. Health route can run without database-backed business flow. |
| Frontend root GET | PASS | GET http://localhost:5173/ returned HTTP 200. This proves the dev server serves the app shell, not that pages render correctly. |
| Google Doc extraction | PASS for text/tables | Read all available document text and 17 tables: 16 test-case tables, one sign-off table. Counted 31 embedded images; image pixels were not visually inspected. |

## Checks not run and why

The root test:all command invokes scripts that connect to MongoDB, insert and delete fixture records, and may use the default english_course database when MONGODB_URI is missing. backend/.env exists, but its contents and target were intentionally not read. The target therefore could not be confirmed as disposable. No integration test, seed, or database-backed test was run.

No browser was used to test authenticated flows, responsive layouts, accessibility, PDF preview, user suspension, refresh/recovery, attempt limit, multi-tab behavior, scoring, reports or hidden lessons. No security payload was submitted. No performance/load test was run. No deployment hostname was available. These are NOT_RUN or BLOCKED, not PASS.

## Execution status for the 62 test-plan cases

- NOT_RUN: 58.
- BLOCKED: 4 — NON_LOAD_01 and DEP_01…DEP_03, because a safe load-test target and production deployment/SSL/handover environment were unavailable.
- PASS: 0.
- FAIL: 0.

The health and build checks are environment/build checks, not executions of the test-plan cases. All 48 blank issue cells remain unexecuted. There are no verified-fixed cases.

## Suggested runtime retest order

1. In a confirmed disposable test database, validate AUTH_03 and ADM_U_02 against existing access and refresh tokens.
2. Validate standard and TOEIC attempt creation, autosave, refresh recovery, timer expiry, submit deadline, attempt limit and results; preserve the same attempt snapshots and scoring fixtures.
3. Open the same attempt in two tabs and test autosave ordering and submit idempotency.
4. Validate published/hidden lesson visibility and material download restrictions, including direct file URL behavior using non-sensitive test files.
5. Validate the student detail and report screens against test learner attempts.
6. Exercise PDF display/download, course navigation, vocabulary interactions and responsive views at the exact viewports listed in the source test plan.
7. Run load and deployment/security checks only in approved staging environments.
