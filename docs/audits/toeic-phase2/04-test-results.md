# Phase 2 Test Results

## Environment and safety

- Workspace: `D:\SideProject\english_course_ms_uyen`; Windows; Node.js 22.18.0 was reported by the test runtime.
- Backend Phase 2 tests use pure functions, mock Attempt repositories, and an ephemeral loopback HTTP server with a temporary binary fixture. They do not import/start the application server or connect to MongoDB.
- No `MONGODB_URI` value was read and no MongoDB target was verified. No seed, migration, production/staging write, or DB-writing test was run.
- Frontend unit/component test framework is not configured; only production build and Node tests for the isolated filename helper were run.
- Browser/viewport tests and actual protected material endpoint downloads were not run.

## Executed commands

| Command | Result | Evidence |
|---|---|---|
| `npm run test:phase1` in `backend/` | PASS — 18 tests, 0 failed | Node test runner output; account, upload, private-storage, HTML, and material policy fixtures. |
| `npm run test:phase2` in `backend/` | PASS — 20 tests, 0 failed | `tests/phase2ExamEngine.test.js`, `tests/phase2MaterialDownload.test.js`, `tests/phase2FrontendDownload.test.js`. |
| `node --check` on changed backend controllers/models/helpers | PASS | Syntax-only checks; does not prove API/database behavior. |
| `npm run build` in `frontend/` | PASS | Vite 5.4.21 transformed 250 modules and emitted production bundle. |
| `git diff --check` | PASS | Exit code 0; Git printed line-ending conversion warnings only. |

The Phase 2 suite covers Standard scoring, TOEIC scoring/breakdown, engine resolution/fail-closed behavior, exact-deadline finalization ignoring late payload, stale revision rejection, five concurrent finalizer calls with one terminal write, two saves from the same revision, missing legacy revision handling, all six requested example filenames, Unicode/multi-dot/mismatched MIME/extensionless metadata, header sanitation, local streamed-byte equality, frontend RFC 5987 parsing/fallback, and JSON error blobs.

An initial test run exposed that the fallback parser treated `Slide.Part1` as if `.Part1` were the extension. The helper was changed to recognize only supported extensions; the complete Phase 2 suite passed on rerun.

## Required Master Test Plan cases

Status meanings: **PASS** = executed evidence at the stated test layer; **PARTIAL** = helper/mock evidence only; **BLOCKED** = safe integration environment unavailable; **NOT_RUN** = no execution evidence. Passing a helper test does not mean the end-to-end case passed.

| Case | Status | Evidence / actual scope |
|---|---|---|
| `EX_VOC_03` | PARTIAL | Typed scoring unit helper is covered; broad interactive exercise, speech entry, refresh, search, mobile and attempt-limit flow not run. |
| `EXAM_01` | PARTIAL | Attempt summary/search code builds; list API and browser workflow not run. |
| `EXAM_02` | PARTIAL | Exact deadline finalization tested with a mock; countdown/auto-submit browser test not run. |
| `EXAM_03` | PARTIAL | Scoring result counts covered by unit tests; live progress/confirmation dialog not run. |
| `EXAM_04` | PARTIAL | Mock expiry finalization passes; API/browser timeout flow not run. |
| `EXAM_05` | PARTIAL | Score fields tested in helper; real result API/history not run. |
| `EXAM_06` | NOT_RUN | Correct-answer visibility/review UI not changed or browser-checked. |
| `SEC_EXAM_01` | PARTIAL | Two requests using one revision are tested against a mock CAS repository; actual two-browser-tab API test not run. |
| `SEC_EXAM_02` | PARTIAL | Five concurrent finalizer calls against a mock repository produce one write; actual 2/5 HTTP submit race not run. |
| `SEC_EXAM_03` | PARTIAL | Server boundary policy tested at the exact deadline; client OS-clock manipulation/browser test not run. |
| `SEC_EXAM_04` | BLOCKED | Resume/result recovery code is present; persisted refresh/resume test needs MongoDB. |
| `SEC_EXAM_05` | NOT_RUN | Offline browser/network restoration was not tested. |
| `HW_02` | NOT_RUN | Homework integration regression not run. |
| `HW_03` | NOT_RUN | Homework progress integration regression not run. |
| `HIST_01` | PARTIAL | Expiry recovery is invoked by history handlers; actual persisted history/result consistency needs MongoDB. |
| `DOC_02` | PARTIAL | Phase 1 policy tests and download helper tests pass; protected material controller/API not run. |
| `DOC_03` | PARTIAL | UTF-8 filename/header helper and byte-stream fixture pass; cross-origin browser filename not run. |
| `LESS_02` | PARTIAL | Existing access policy regression plus filename helpers pass; lesson-page browser download not run. |

## Required Phase 1 regression cases

The Phase 1 suite passed 18/18 unit/security fixtures. Scenario-level status remains as the prior Phase 1 report records; this run does not promote blocked database/browser cases to PASS.

| Case | Status | Evidence / limitation |
|---|---|---|
| `AUTH_03` | BLOCKED | Middleware/refresh mock tests pass, but locked-account login/admin persistence flow was not run against disposable MongoDB. |
| `ADM_U_02` | BLOCKED | Account state/token policy fixtures pass; admin suspend/reactivate persistence scenario not run against disposable MongoDB. |
| `NON_SEC_01` | BLOCKED | Lesson HTML XSS fixtures pass; broad SQL injection/form-input audit not run. |
| `NON_FILE_01` | BLOCKED | Isolated Multer rejects invalid fixtures; full production route alias/authorization flow not exercised. |
| `NON_FILE_02` | BLOCKED | Small-cap unit fixture passes; production-size upload ceiling request not run. |

## BLOCKED / NOT_RUN checks

- Mongo-backed start/resume, route-level CAS, engine mismatch with database non-mutation, attempt limits, idempotent API submit, material access and MIME/header response: **BLOCKED** pending an identified disposable MongoDB target.
- 1366×768, 1440×900, 768×1024, 375×812, 390×844 responsive verification: **NOT_RUN**.
- Browser countdown, conflict/reload UI, radio/checkbox keyboard path, attempt-limit notice, actual saved download filename, large-file memory behavior, and browser console: **NOT_RUN**.
- Network interruption, large file, absent file route response, and real protected download hash: **NOT_RUN**. Byte equality was verified only for the isolated stream helper fixture.

## Build note

Vite emitted a warning that some minified chunks exceed 500 kB; the main JS chunk was approximately 661 kB in this run. No before/after bundle baseline was recorded, so the warning cannot be attributed to Phase 2. No bundler refactor was made.
