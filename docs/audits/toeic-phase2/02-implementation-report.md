# Phase 2 Implementation Report

## Overall

Code changes cover all 11 requested defects. The shared lifecycle/scoring logic lives in `backend/src/utils/attemptLifecycle.js`; student APIs now enforce it. The implementation has only been unit/mock validated. Database-backed API flows and browser behavior remain pending.

## Defect-by-defect

### TOEIC-DEF-005 — Standard timer reaches zero without submit

- **Root cause:** `TestPage.jsx` updated the display and cleared the timer but did not submit.
- **Fix:** Zero countdown invokes the submit flow once. Server receives the attempt ID/revision; the backend finalizes according to its own deadline and stored answers.
- **Changed files:** `frontend/src/pages/TestPage.jsx`, `frontend/src/api/assessmentApi.js`, `backend/src/controllers/attemptController.js`, `backend/src/utils/attemptLifecycle.js`.
- **API/compatibility:** start response now includes `serverTime` and `revision`; submit sends `revision`. The UI uses server/client offset only for display.
- **Tests:** lifecycle unit tests pass; browser countdown/auto-submit not run.
- **Remaining:** Verify in a disposable DB and browser at the exact deadline.

### TOEIC-DEF-006 — Expired attempts terminal but ungraded

- **Root cause:** expiry branches directly changed status/expiry fields without scoring.
- **Fix:** Shared atomic finalizer grades snapshot answers and writes result fields plus terminal state in one compare-and-swap update. Resume, list, attempt/result, and history paths recover expired attempts.
- **Changed files:** both controllers, `attemptLifecycle.js`, `Attempt.js`.
- **Compatibility:** Standard remains `submitted`; TOEIC remains `completed`. No attempt backfill.
- **Tests:** Standard/TOEIC scorer tests, expiry test, concurrent five-finalizer test pass. Database integration blocked.
- **Remaining:** Verify deployed index behavior and requests against isolated MongoDB.

### TOEIC-DEF-007 — Late answer payload can be scored

- **Root cause:** submit accepted client answers after deadline and used a ten-second grace period.
- **Fix:** `now >= deadlineAt` selects only stored answers. Late autosave is rejected and triggers finalization. At the boundary, the attempt is expired.
- **Changed files:** both controllers, `attemptLifecycle.js`.
- **Tests:** mocked exact-deadline test proves late payload is ignored; actual API race test blocked.
- **Remaining:** Exercise autosave-vs-timeout race in isolated MongoDB.

### TOEIC-DEF-008 — Wrong scorer can submit shared Attempt

- **Root cause:** Attempt stored no engine and submit endpoints did not check Assessment `examFormat`.
- **Fix:** New `Attempt.engine`; engine-specific submit/autosave/result routes check it. Legacy attempts resolve from the associated Assessment; unresolved/conflicting engine data fails closed.
- **Changed files:** `Attempt.js`, `attemptLifecycle.js`, both controllers and route bindings.
- **API/compatibility:** wrong route returns `ATTEMPT_ENGINE_MISMATCH`; no mutation before the check. Existing attempt records are not rewritten.
- **Tests:** engine resolver unit test passes; API mutation test blocked.
- **Remaining:** Confirm legacy Assessment format coverage against a safe snapshot.

### TOEIC-DEF-009 — Multiple tabs overwrite answers

- **Root cause:** Standard had no revision; TOEIC accepted missing/equal revisions; both used read/merge/save.
- **Fix:** Exact revision CAS on atomic updates for both engines. Client save queues serialize writes; conflicts freeze answer controls and offer reload.
- **Changed files:** lifecycle helper, shared autosave controller, route bindings, both exam pages, both API clients.
- **Tests:** two-tab stale-revision helper test and five-way finalizer race test pass. Actual Mongoose/API concurrency blocked.
- **Remaining:** Test with MongoDB's real unique index and atomic update semantics.

### TOEIC-DEF-010 — Student list omits attempt state

- **Root cause:** Standard list returned assessments only; TOEIC list did N+1 active/latest lookups without counts/remaining attempts.
- **Fix:** Both endpoints aggregate the student's attempts in one query and return active state, count, remaining attempts, and latest score/time. Expired attempts are finalized before summary.
- **Changed files:** both controllers, both student list pages.
- **Tests:** frontend build pass; list API integration not run.
- **Remaining:** Verify response shape against existing assessment data and legacy format records.

### TOEIC-DEF-011 — Confirmation omits unanswered question numbers

- **Root cause:** Confirmation showed only unanswered count.
- **Fix:** Standard and TOEIC dialogs list the exact question numbers displayed in the exam UI.
- **Changed files:** `TestPage.jsx`, `StudentToeicExamPage.jsx`.
- **Tests:** frontend build pass; browser/dialog behavior not run.
- **Remaining:** Confirm wrapping/scrolling for a full 200-question exam on mobile.

### TOEIC-DEF-012 — No exam search

- **Root cause:** Student lists only had type/mode tabs.
- **Fix:** Added client-side title/description search to Standard assessment and TOEIC library lists while retaining existing filters.
- **Changed files:** `StudentAssessmentsPage.jsx/.css`, `StudentToeicLibraryPage.jsx`, `StudentToeic.css`.
- **Tests:** frontend build pass; browser interaction not run.
- **Remaining:** No dedicated frontend component test framework is configured.

### TOEIC-DEF-013 — Single/multiple choice look the same

- **Root cause:** Standard used radio-circle divs; TOEIC rendered radio controls for every choice type.
- **Fix:** Native radio for single choice and checkbox for multiple choice, fieldset/legend labels, keyboard focus, array toggling, and preserved answer-map shape.
- **Changed files:** both exam pages and `TestPage.css`/`assessment-screens.css`.
- **Tests:** frontend build pass; keyboard and screen-reader/browser checks not run.
- **Remaining:** Accessibility verification in browser.

### TOEIC-DEF-014 — Attempt limit is not localized/contextual

- **Root cause:** Limit handling could surface an English/general error or an alert/full-page message.
- **Fix:** Both start paths return `ATTEMPT_LIMIT_REACHED` with Vietnamese copy. Standard offers a return to the assessment list; TOEIC overview displays an inline notice and return-to-library action. Exhausted cards are disabled. Zero remains unlimited.
- **Changed files:** both controllers, Standard list/exam, TOEIC library/overview.
- **Tests:** syntax/build pass; limit API/browser paths not run.
- **Remaining:** Verify no authentication interceptor treats 403 as logout in the deployed client.

### TOEIC-DEF-025 — Downloaded filename loses extension

- **Root cause:** Original filename was not stored on Material; controller/frontend used display title as download name.
- **Fix:** Optional `originalName`; extension chosen from a supported MIME recorded after signature validation on new uploads, MIME mismatch corrected, safe basename and RFC 5987 UTF-8 `Content-Disposition`, ASCII fallback, streamed bytes, `Content-Disposition` exposed through existing CORS policy. Frontend prefers the header, parses errors instead of saving JSON blobs, uses metadata fallback, and revokes object URLs.
- **Changed files:** `Material.js`, `Lesson.js`, material/lesson controllers, `materialDownload.js` helpers, CORS config, LessonPage and AdminMaterialsPage.
- **Phase 1 security:** same authenticated route and existing access policy; no public file route added, and `allowDownload=false` is unchanged.
- **Tests:** six requested filename examples, multiple dots, Unicode, mismatch/extensionless fallback, header sanitation, local HTTP byte comparison, and frontend error-blob tests pass. Phase 1 material access tests pass.
- **Remaining:** Existing legacy `fileType` values are trusted as metadata at download time and are not re-sniffed; unsupported values fall back to `application/octet-stream`. Real protected controller/browser download, large file, interruption, and actual browser-saved filename were not run.

## Database impact and migration

Additive optional schema paths only: `Attempt.engine`, `Material.originalName`, and `Lesson.attachments[].originalName`. Existing fields and indexes are unchanged. No migration, backfill, attempt rewrite, or database test was run. Legacy missing Attempt revision is CAS-compatible at revision 1.

## Files touched by Phase 2

- Backend: `src/app.js`, `controllers/attemptController.js`, `controllers/toeicController.js`, `controllers/materialController.js`, `controllers/lessonController.js`, `models/Attempt.js`, `models/Material.js`, `models/Lesson.js`, `routes/attemptRoutes.js`, `routes/toeicRoutes.js`, `utils/attemptLifecycle.js`, `utils/materialDownload.js`, `package.json`, and new `tests/phase2*.test.js`.
- Frontend: `api/assessmentApi.js`, `api/toeicApi.js`, `pages/TestPage.jsx/.css`, `pages/StudentAssessmentsPage.jsx/.css`, `pages/StudentToeicExamPage.jsx`, `pages/StudentToeicLibraryPage.jsx`, `pages/StudentToeicOverviewPage.jsx`, `pages/StudentToeic.css`, `pages/LessonPage.jsx`, `pages/admin/AdminMaterialsPage.jsx`, `styles/assessment-screens.css`, and `utils/materialDownload.js`.

Other modified/untracked Phase 1 files remain preserved; see [05-regression-report.md](./05-regression-report.md).
