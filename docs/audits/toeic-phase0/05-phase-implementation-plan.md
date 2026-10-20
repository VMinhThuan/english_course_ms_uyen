# 05 — Phase implementation plan

This is an implementation-ready sequence, not permission to change code. Keep each phase scoped by shared root cause, preserve current business rules unless called out below, and release only after its acceptance gates.

## Phase 1 — Authentication and access control

- Goal: close account-state and file/content access risks.
- Defects: TOEIC-DEF-001…004.
- Likely areas: frontend/src/pages/LessonPage.jsx; backend/src/app.js; backend/src/controllers/materialController.js, adminController.js, authController.js; backend/src/middlewares/auth.js; backend/src/routes/lessonRoutes.js, materialRoutes.js, adminRoutes.js; media/upload configuration; User and Material models only if the selected design requires it.
- API contracts: auth refresh; all routes using verifyToken vs requireActiveStudent; GET lesson materials; GET material download; static /uploads URLs.
- Database impact: preferably none for account policy if existing status fields suffice. File storage relocation/signed URL design may need a migration or URL compatibility period; decide before editing.
- Dependencies/decisions: account suspension revocation semantics; treatment of in-progress attempts on suspension; admin vs teacher student/resource permissions; safe rich-text allowlist; accepted file types and per-purpose size ceilings; policy for externally hosted fileUrl values.
- Order: (1) agree policy and regression matrix, (2) close public-file bypass, (3) normalize upload policy, (4) centralize account-state enforcement, (5) sanitize lesson content, (6) integrate client behavior.
- Acceptance: suspended account behavior is consistent on access and refresh routes; published/access/download rules cannot be bypassed by direct URLs; unsafe uploads are rejected; allowed lesson formatting remains while executable markup is inert.
- Required tests: AUTH_03, ADM_U_02, DOC_02, DOC_03, ADM_DOC_01, NON_SEC_01, NON_FILE_01, NON_FILE_02; add route-matrix tests for every authenticated student endpoint.
- Risks: broad middleware changes can affect teacher/admin access, current sessions, and in-flight attempts. Do not silently change role rules.

## Phase 2 — Exam engine and attempt integrity

- Goal: make attempt timing, persistence, scoring and final state deterministic across standard and TOEIC engines.
- Defects: TOEIC-DEF-005…014.
- Likely areas: frontend/src/pages/TestPage.jsx, StudentAssessmentsPage.jsx and TOEIC exam components; frontend/src/api/assessmentApi.js and toeicApi.js; backend/src/controllers/attemptController.js, toeicController.js; attempt routes and Attempt model/index.
- API contracts: start/resume attempt; autosave; normal and TOEIC submit; attempt results; available-assessment list. Document state transitions and idempotency before implementation.
- Database impact: possible Attempt revision/lease fields or a separate tab/lease record; backfill/defaults must preserve existing in-progress records. No schema changes until the chosen concurrency model is approved.
- Dependencies/decisions: timeout grace policy; whether timeout scores last server-persisted answers; attemptLimit=0 semantics; first-tab/last-tab policy; expiry recovery for existing ungraded attempts; TOEIC vs standard engine discriminator; UI state for previous attempts.
- Order: (1) formalize state machine and score contract, (2) reject engine mismatch, (3) implement one atomic expiry/finalize path, (4) harden late submission and idempotency, (5) add concurrency control, (6) add list/modal/control UX.
- Acceptance: one attempt has one engine, one deterministic final score and one terminal state; late request payload cannot replace accepted answers; timeout finalization is scored exactly once; refresh and offline recovery use server-persisted answers; conflicting tabs have deterministic feedback.
- Required tests: EX_VOC_03, EXAM_01…EXAM_06, SEC_EXAM_01…SEC_EXAM_05, HW_02, HW_03, HIST_01. Run normal and TOEIC engine suites separately and in cross-engine rejection cases.
- Risks: historical result changes, attempts left mid-exam, duplicated submissions, autosave order, expiry cutoffs and reporting status compatibility.

## Phase 3 — Admin and reporting

- Goal: make student management and reports reflect persisted learning/attempt data.
- Defects: TOEIC-DEF-015…017.
- Likely areas: AdminStudentsPage.jsx, AdminStudentDetailPage.jsx, AdminResultsPage.jsx, adminApi.js/assessmentApi.js; adminRoutes.js, adminController.js, progressController.js, attemptController.js; query indexes only if profiling shows need.
- API contracts: create student (if approved); GET student progress/detail; GET admin results filtered by student/assessment/type; pagination and sort contract.
- Database impact: no schema change expected for first pass; indexes may be needed for verified scale. Do not add aggregates until status/scoring semantics from Phase 2 are stable.
- Dependencies/decisions: admin-created account status/password delivery; report semantics for latest vs all attempts, expired attempts, score ties, date range and role access.
- Acceptance: student detail shows actual lesson and attempt activity, empty state only when there is no data, and report filters/ranking match a controlled fixture.
- Required tests: ADM_U_01…ADM_U_04, ADM_L_01 as a role regression, REP_01, REP_02, and attempt result/history tests from Phase 2.
- Risks: leaking student information across roles, expensive unbounded reports, incorrect double counting and breaking approval flows.

## Phase 4 — Learning experience and UI

- Goal: close learning navigation/material/vocabulary UX gaps after Phase 1 access rules are stable.
- Defects: TOEIC-DEF-018…024.
- Likely areas: AppRoutes.jsx, MyCoursesPage.jsx, CourseDetailPage.jsx, EnrollCoursePage.jsx, LessonPage.jsx, CourseLearning.css, StudentVocabularyPage.jsx, FlashcardPage.jsx, Lesson model and admin lesson form.
- API contracts: only extend course/lesson fields after confirming ownership and access; PDF viewer must use the Phase 1 protected-file contract.
- Database impact: difficulty field requires an explicit default/backfill strategy; other items should not need schema changes.
- Dependencies/decisions: two vs three desktop columns and exact viewport; list vs grid on vocabulary; vocabulary sort/search scope; difficulty scale; enrollment confirmation interaction; PDF viewer/CSP/access policy.
- Acceptance: student retains correct navigation shell; download errors are announced as errors; PDFs have a usable preview/fallback; vocabulary search/sort/navigation work for long lists; mobile layout is validated at agreed viewports.
- Required tests: LESS_01…LESS_03, DOC_01…DOC_03, VOC_01…VOC_02, EX_VOC_03 mobile checks, NON_RESP_01.
- Risks: breaking public course discovery, changing legacy lesson data defaults, viewer performance and shared layout regressions.

## Phase 5 — Regression, release and sign-off

- Goal: establish reproducible evidence for all 62 cases and release readiness.
- Scope: all source test-plan rows, all 24 confirmed defects, retests for possible fixes, API/security review, responsive matrix, load test and deployment/sign-off.
- Dependencies: Phase 1–4 accepted; safe disposable test DB; staging URL and user roles; production deployment owner.
- Acceptance: every case has an execution result and evidence, all P1 failures are resolved or explicitly accepted, no critical/high regression remains, performance/security thresholds are agreed and met, and deployment/SSL/handover checks pass.
- Required test suites: all 62 current cases plus automated unit/integration tests. Historical 202-test report may be used as background only after identifying its source revision and case mapping.
- Release guardrails: migration rollback plan, backup and restoration check, exact commit SHA, deployment smoke test and named sign-off owners.

## Dependency graph

1. Phase 1 file-access policy precedes the Phase 4 PDF viewer because preview must not reopen direct-file access.
2. Phase 1 account policy precedes admin workflow changes and any session invalidation.
3. Phase 2 state/scoring contract precedes Phase 3 reports and student attempt summaries.
4. Phase 2 attempt schema change, if any, precedes backfill and must remain compatible with existing attempts.
5. Phase 3 can begin API/UI scaffolding after Phase 2 contract is approved, but must not finalize score aggregation early.
6. Phase 4 layout work can be parallelized after route ownership and file policy are clear; vocabulary work is largely independent.
7. Phase 5 depends on a safe test DB and staging/deployment access, neither of which was available during Phase 0.

## Safe change protocol for all phases

For each defect group: create a focused change set; capture baseline cases; add or update tests at the same boundary as the root cause; run module-local tests with an explicit disposable database; compare API response and persisted state; perform browser checks for visual/mobile claims; inspect diff for unrelated changes; record commit SHA and evidence. Do not run root integration scripts against an unverified MONGODB_URI.
