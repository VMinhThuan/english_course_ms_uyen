# 06 — Risk assessment

| Risk area | Impact | Likelihood | Affected modules | Mitigation | Required regression coverage |
|---|---|---|---|---|---|
| Authentication and account status | A shared middleware change can lock out students, teachers or admins, or leave suspended sessions active. | High | Auth, lessons, materials, vocabulary, progress, assessments, attempts, admin | First agree status/session policy; enumerate every route middleware; keep admin/teacher rules explicit; return stable account-state errors and clear client session consistently. | AUTH_01…AUTH_06, ADM_U_02, route-by-route access matrix. |
| Attempt lifecycle and scoring | Timer, autosave, submit and expiry changes can lose answers, double-score, corrupt history or change results. | High | Standard assessment, TOEIC, Attempt model, reports/history | Define one state machine and score contract; server deadline is authoritative; finalization is atomic/idempotent; preserve snapshots; add cross-engine guards; handle legacy ungraded attempts as a separate repair decision. | EXAM_01…EXAM_06, SEC_EXAM_01…SEC_EXAM_05, HW_02/HW_03, HIST_01. |
| Multi-tab and offline recovery | Concurrent tabs or retries can overwrite newer answers or produce inconsistent final state. | High | TestPage, TOEIC exam, autosave APIs, Attempt persistence | Server-side revision/lease policy, visible conflict handling, retry-safe writes and deterministic recovery. | Two-tab conflict, refresh, network loss, stale revision and duplicate submit scenarios. |
| Student progress and reporting | Aggregation changes can omit hidden lessons, include wrong attempts, double-count retakes or expose another learner's data. | Medium-high | Progress API, admin student detail, results, dashboard | Specify denominator/status/time-range rules; use fixture-based API snapshots; apply role and student-ID filters at server boundary; add pagination before scale. | DASH_01/DASH_04, ADM_U_03, REP_01/REP_02, history comparisons. |
| Public static file serving | Restricted course documents may remain retrievable from a direct URL even when UI/API hides the download button. | High | /uploads, material DTOs, PDF viewer, admin upload | Move protected files outside public root or proxy through authorization; verify all stored and external fileUrl forms; plan URL compatibility. | DOC_01…DOC_03, ADM_DOC_01, direct anonymous/student/teacher access matrix. |
| HTML and upload handling | Unsafe lesson HTML or executable uploaded content could affect users or same-origin pages. | High | Lesson editor/rendering, upload routes, static server | Define safe HTML subset, sanitize, unify file validation, limit size, keep stored uploads non-executable, add CSP as defense-in-depth. | NON_SEC_01, NON_FILE_01/02, stored-content fixtures, rejected upload matrix. |
| Schema compatibility | A new difficulty or attempt concurrency field can make older documents render incorrectly or migration defaults ambiguous. | Medium | Lesson, Attempt, admin forms, student cards | Decide enum/defaults before schema; add backward-compatible reads; staged migration/backfill and rollback plan. | Old/new document fixtures, create/edit/read, migration idempotency. |
| Shared UI and route layouts | Global CSS/layout or route changes can regress public, student and admin screens at different viewports. | Medium | AppRoutes, StudentLayout, CourseLearning.css, shared components | Keep route ownership explicit; scope styles; inspect desktop/tablet/mobile in a browser after changes. | LESS_01/02, NON_RESP_01, public course regression, keyboard smoke. |
| Reporting query volume | Unbounded GET /admin/results can become slow and consume memory as attempts grow. | Medium-high | attemptController.getAdminResults, AdminResultsPage | Add pagination/sort and validate filters; profile with staging-scale dataset before indexes. | Report count/ranking correctness, query timing under agreed data volume. |
| Runtime environment uncertainty | Existing local .env may point to a real or shared database; test scripts mutate records. | High | Backend integration scripts, MongoDB | Do not execute data-writing scripts until MONGODB_URI is explicitly confirmed as disposable; use isolated test DB and unique fixtures. | Connection target assertion, cleanup verification, non-production guard. |
| Deployment and load test target | Production checks without an approved target can affect users; no current endpoint was supplied. | Medium-high | Hosting, SSL, concurrency/load | Obtain staging URL, synthetic account and permitted load profile; agree threshold and stop conditions before testing. | DEP_01…DEP_03, NON_LOAD_01, deployment smoke/rollback. |

## Highest regression-risk order

1. Account-state middleware and refresh behavior.
2. Attempt status transitions, scoring and deadline behavior.
3. Shared attempt model/unique index and any migration.
4. File access/storage URL changes.
5. Student progress/report aggregation.
6. Shared route/layout and responsive CSS.

Treat each of these as an API/data contract change with before/after fixtures, not just a visual fix.
