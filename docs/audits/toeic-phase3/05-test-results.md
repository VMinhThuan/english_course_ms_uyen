# Phase 3 test results

## Environment safety

Phase 3 integration ran against `mongodb-memory-server`, a unique throwaway database on `127.0.0.1`, and an Express harness mounting the real auth, assessment, attempt, TOEIC and admin routers. The setup fails closed if Mongoose is already connected, does not read `MONGODB_URI`, and shuts down the HTTP/Mongo processes after the suite. No production/shared database, seed, migration, or live account was used.

## Executed checks

| Suite/check | Passed | Failed | Blocked | Not run | Result |
|---|---:|---:|---:|---:|---|
| `npm run test:phase1` | 18 | 0 | 0 | 0 | PASS |
| `npm run test:phase2` | 20 | 0 | 0 | 0 | PASS |
| `npm run test:phase3` | 13 | 0 | 0 | 0 | PASS |
| Backend `node --check` | 89 files | 0 | 0 | 0 | PASS |
| Frontend `npm run build` | 251 modules | 0 | 0 | 0 | PASS |
| `git diff --check` | Exit 0 | 0 | 0 | 0 | PASS; Git printed line-ending conversion warnings. |
| Browser/viewport QA | 0 | 0 | 0 | 1 | NOT_RUN |

Three automated suites total 51 passing Node test-runner cases. Phase 3's 13 count includes its parent integration case and nested checks as reported by Node's test runner.

## Phase 3 coverage

- Create student: admin and teacher roles, student denial, input validation, email/username normalization and uniqueness, simultaneous duplicate create, mass-assignment rejection, bcrypt hash, safe DTO, active account and login by email/username.
- Access control: unauthenticated request, student access to admin detail, suspended account denial, and token minted while active then used after concurrent status suspension.
- ADM_U_04: accented/unaccented Vietnamese, uppercase, redundant whitespace, literal regex metacharacter, status filter and bounded page size.
- Student progress: Enrollment + legacy `Course.students`, only published lessons, completed/in-progress/not-started counts, total percentage and course filter.
- Reports: Standard/TOEIC, score zero, invalid/missing score, engine mismatch, expired pending, legacy status, distinct students, ranking tie break, summary counts, date/type/engine/student filter, pagination, safe projection and teacher/student RBAC.
- Concurrency: two CAS saves from one revision (one 200 and one 409), five concurrent expiry finalizers, report reads concurrent with submit and expiry recovery, four simultaneous report reads, pagination after a new attempt insert, account status change during detail access, and duplicate account creation.
- Read-only behavior: report GET leaves expired attempts pending; history GET does not rescore or change terminal attempt timestamps/score.

## Phase 1 and Phase 2 regression

Phase 1's 18 tests cover account status and middleware, token refresh, private material/file access, teacher ownership behavior on existing managed resources, upload validation/cleanup and lesson sanitization. Phase 2's 20 tests cover Standard/TOEIC scoring helpers, expiry and CAS helpers, terminal idempotency, legacy revision, and file download metadata/stream behavior. Phase 3 additionally mounted the real Phase 2 API routes against isolated MongoDB to verify the reporting dependency contracts listed in `00-phase2-data-contract-verification.md`.

## Browser and production checks

Desktop/tablet/mobile viewport checks (1440×900, 1366×768, 768×1024, 375×812, 390×844), modal keyboard behavior, rendered layout, browser console, actual app login flow, staging and production were `NOT_RUN`. No screenshot or browser evidence exists. The frontend build is compilation evidence only.

## Build and audit notes

Vite 5.4.21 built 251 modules. The minified main JavaScript chunk is 685.80 kB, above Vite's 500 kB advisory threshold. `npm audit --omit=dev` reported 10 production dependency advisories at test time (6 moderate, 3 high, 1 critical); exact packages and release gates are recorded in `06-risk-and-compatibility.md`. No lint command is defined in the backend package scripts. No `test:all`, load test, or production performance claim was made.
