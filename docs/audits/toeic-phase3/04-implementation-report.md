# Phase 3 implementation report

**Implementation status:** `IMPLEMENTED_PENDING_VERIFICATION`

**Scope:** TOEIC-DEF-015, TOEIC-DEF-016, TOEIC-DEF-017; ADM_U_04 verification. No Phase 4, production deployment, scoring redesign or unrelated UI redesign.

## TOEIC-DEF-015 — Admin has no student creation flow

### Root cause

Phase 0 source review confirmed that admin routes had list/detail/status operations but no student-create POST, and the student list UI had no create action.

### Solution

Added `POST /api/v1/admin/students`, validation and safe DTO mapping. It creates only a student, sets active/login-ready state, relies on the existing User bcrypt save hook, handles duplicate unique-key races and supports login by username. Added the modal and refresh behavior to the student list.

### Files

- Backend: `adminController.js`, `authController.js`, `adminRoutes.js`, `User.js`.
- Frontend: `adminApi.js`, `AdminStudentsPage.jsx`, `AdminStudentsPage.css`, `LoginPage.jsx`.
- Tests: `phase3Admin.integration.test.js`.

### Database / compatibility

Added optional lowercase username with a sparse unique index. Legacy documents without `username` remain valid. No backfill or migration ran. Existing public registration remains student/pending. The login handler accepts email, username, or phone according to its existing lookup flow.

### Evidence and limitation

Mongo route integration verified hash-at-rest, active status, response redaction, email/username login, duplicate collision behavior, validation and role denial. Browser modal/keyboard/viewport behavior remains `NOT_RUN`. Teacher authorization follows current route-wide admin/teacher role policy; per-student ownership is not enforced.

## TOEIC-DEF-016 — Student detail lacks real progress and history

### Root cause

Phase 0 found a hardcoded empty-activity panel and no progress API call from Student Detail. Existing progress data did not include attempt history.

### Solution

Expanded the admin progress endpoint to aggregate published lessons for courses found through Enrollment or legacy `Course.students`, with separate bounded course/lesson pages and an optional course filter. Added read-only admin attempt history using the shared attempt reporting interpretation. Replaced the placeholder with real profile, course, lesson and attempt sections including filters, pagination, empty/loading/error handling and clear expired/unverified/zero-score states.

### Files

- Backend: `progressController.js`, `adminReportingController.js`, `attemptReporting.js`, `adminRoutes.js`, `Attempt.js`, `Course.js`, `Lesson.js`.
- Frontend: `adminApi.js`, `AdminStudentDetailPage.jsx`.
- Tests: `phase3AttemptReporting.test.js`, `phase3Admin.integration.test.js`.

### Database / compatibility

Added indexes on `Course.students`, `Lesson(course,status,order,_id)`, and `Attempt(assessment,startedAt)`. Existing Enrollment and unique LearningProgress keys remain the data source. No progress rows are inserted, rewritten, or recalculated.

### Evidence and limitation

Mongo fixtures verified current and legacy course membership, published-only totals, lesson states and completion percentage. Integration checks exercise the admin history state mapping and data redaction. Visual/browser behavior and large course/student datasets are unverified.

## TOEIC-DEF-017 — No bounded report by assessment

### Root cause

Phase 0 found a general results page with type filtering, but requests could query all attempts and there was no by-assessment report summary, server pagination or full filter UI.

### Solution

Added a paginated report-assessment selector and a single-assessment aggregation API. The shared reporting pipeline normalizes engines/statuses, recognizes valid zero scores, excludes unverified attempts from scoring, separates expired-pending attempts, produces distinct-student/score/state summaries and keeps answers/snapshots out of the result projection. Added by-student filtering and student history through the same interpretation. Added sortable, filterable server-paginated report UI.

### Files

- Backend: `adminReportingController.js`, `attemptReporting.js`, `attemptController.js`, `attemptRoutes.js`, `adminRoutes.js`, `Attempt.js`.
- Frontend: `assessmentApi.js`, `adminApi.js`, `AdminResultsPage.jsx`, `AdminResultsPage.css`.
- Tests: `phase3AttemptReporting.test.js`, `phase3Admin.integration.test.js`.

### Database / compatibility

Added the named `assessment_startedAt_report` index. Old query alias `assessment`/`student` and response alias `attempts` remain. An assessment is now required to prevent unbounded report aggregation; no scoring formula changed and GET reporting does not finalize expired attempts.

### Evidence and limitation

Mongo integration fixtures verify Standard and TOEIC results, score zero, expired/legacy states, mixed-engine rejection, stable ties, summary counts, student de-duplication, filters, pagination, sensitive-field exclusion, read-only behavior, concurrent submit/report, timeout/report, concurrent reads and insertion between page refreshes. Production-scale performance and browser behavior remain unverified.

## Additional verification — ADM_U_04

API integration verified `Nguyễn Văn`, `nguyen van`, uppercase, extra whitespace and literal `.*`. The tests confirm filtering composes with status and page limits. No normalized-field migration was needed; server-side escaped Unicode-aware matching was implemented. Large-dataset search cost remains a risk.

## Phase 2 dependency changes

No Standard or TOEIC scoring formula was changed. The new read model consumes Phase 2 engine/status/deadline/score fields and the Phase 3 Mongo route fixture verifies lifecycle compatibility. Username lookup in auth is the only adjacent login behavior added for the student-creation acceptance flow.
