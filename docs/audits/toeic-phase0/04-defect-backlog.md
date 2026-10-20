# 04 — Consolidated defect backlog

## Counting and status

This backlog contains 24 source-confirmed open gaps or explicit feature gaps. “Confirmed” means the current source statically shows the gap; it does not mean a live exploit or user-visible runtime failure was reproduced. Every record remains untested at runtime. The 8 runtime-only or possible-fix groups at the end are excluded from the 24 count.

Priority preserves the original case priority where available. Source-only issues use a proposed priority and are labeled. Severity and priority are separate. Complexity is a planning estimate and may change after implementation design.

## Open source-confirmed gaps

### TOEIC-DEF-001 — Lesson HTML is rendered without sanitization

- Related cases: NON_SEC_01. Module: lesson content/security.
- Description and expected behavior: saved lesson HTML must be constrained to the approved safe content before rendering to students.
- Actual source gap/root cause: LessonPage renders lesson.content via dangerouslySetInnerHTML with no sanitization on that path. Source: frontend/src/pages/LessonPage.jsx:211-215. No sanitizer was found in the reviewed frontend/backend source.
- Severity: CRITICAL. Priority: P1 (source test plan). Confidence: HIGH for unsanitized sink; exploitability and payload behavior not runtime tested.
- Layers: FE, BE. Complexity: M. Phase: 1.
- Proposed solution: define allowed HTML tags/attributes and URL schemes; sanitize at a trusted boundary and retain defense-in-depth on display; test legacy stored content and editor output.
- Dependencies: product decision on supported rich-text features. Regression risk: removing legitimate lesson formatting or embedded media.
- Verification: malicious markup is inert in student and admin views; approved formatting remains; stored legacy records render safely. Status: OPEN, runtime NOT_RUN.

### TOEIC-DEF-002 — Public upload URLs bypass material download permission

- Related cases: DOC_03. Module: material access control.
- Description and expected behavior: a student must not retrieve a material that is unpublished or has allowDownload=false through a direct URL.
- Actual source gap/root cause: /uploads is served publicly (backend/src/app.js:70-73); the student material response includes fileUrl while omitting only filePath (materialController.js:337-345); allowDownload is checked only in the protected download handler (materialController.js:385-399).
- Severity: CRITICAL. Priority: P1 (source test plan). Confidence: HIGH for the public static route and bypass path; no direct URL was requested during this audit.
- Layers: BE, Infrastructure. Complexity: M. Phase: 1.
- Proposed solution: store restricted materials outside public static root and serve through authorization-aware handlers or short-lived signed URLs; remove direct storage URLs from student DTOs.
- Dependencies: define which externally hosted fileUrl values are permitted. Regression risk: breaking previews, existing material URLs and authorized downloads.
- Verification: anonymous and suspended users cannot retrieve protected files; active students can only retrieve files allowed by the material policy. Status: OPEN, runtime NOT_RUN.

### TOEIC-DEF-003 — General upload paths lack consistent file and size controls

- Related cases: NON_FILE_01, NON_FILE_02. Module: uploads.
- Description and expected behavior: every upload path must have an explicit extension/content policy, file-size ceiling, safe naming and consistent error response.
- Actual source gap/root cause: lesson, material and general admin Multer configurations specify storage without limits or fileFilter (lessonRoutes.js:18-28; materialRoutes.js:17-27; adminRoutes.js:61-71), while media upload has allowlists and a 50 MB limit (mediaController.js:7-54). Controls differ by route.
- Severity: HIGH. Priority: P1 for NON_FILE_01, P2 for NON_FILE_02. Confidence: HIGH for middleware inconsistency; accepted payloads were not tested.
- Layers: BE, Infrastructure. Complexity: M. Phase: 1.
- Proposed solution: centralize upload policy per file purpose, enforce extension plus content signature where feasible, apply route-specific size limits, normalize errors, and keep uploads non-executable.
- Dependencies: inventory valid file types and size limits for lesson content, documents, audio and images. Regression risk: rejecting current legitimate uploads.
- Verification: test valid and invalid types, spoofed MIME, oversized files and cleanup behavior on each upload route. Status: OPEN, runtime NOT_RUN.

### TOEIC-DEF-004 — Suspension is not enforced consistently across existing sessions and routes

- Related cases: AUTH_03, ADM_U_02. Module: authentication/account state.
- Description and expected behavior: after suspension, existing access and refresh sessions should follow the agreed revocation policy and protected student resources should enforce that policy consistently.
- Actual source gap/root cause: suspendStudent sets status=suspended but does not set isActive=false (adminController.js:159-176). verifyToken and refresh check isActive only (auth.js:21-27; authController.js:203-224); requireActiveStudent checks status on only some routes (auth.js:85-139).
- Severity: HIGH. Priority: P1 (source test plan). Confidence: HIGH for inconsistent enforcement; exact affected route behavior depends on each route's middleware.
- Layers: BE, FE. Complexity: M. Phase: 1.
- Proposed solution: define one account-state authorization policy, apply it to all authenticated student routes and refresh, and make client session handling respond to account-state errors by clearing protected state and routing to the account notice.
- Dependencies: product decision on immediate suspension, in-flight exam handling, teacher/admin role policy and whether suspension invalidates refresh tokens.
- Regression risk: accidental lockout of admins/teachers or interruption of a current attempt contrary to policy.
- Verification: start a session, suspend it, exercise token refresh plus lesson/material/vocabulary/profile/progress/attempt routes and verify the agreed session behavior. Status: OPEN, runtime NOT_RUN.

### TOEIC-DEF-005 — Standard assessment timer reaches zero without submitting

- Related cases: EXAM_02, EXAM_04. Module: standard exam frontend.
- Description and expected behavior: at the server-defined deadline the standard exam should complete the agreed automatic-submission flow and present a result or explicit finalization state.
- Actual source gap/root cause: TestPage only updates timeLeftSeconds and clears its interval at zero; it does not call submit (frontend/src/pages/TestPage.jsx:86-101).
- Severity: HIGH. Priority: P1 (source test plan). Confidence: HIGH for this client path.
- Layers: FE, BE. Complexity: M. Phase: 2.
- Proposed solution: use the server deadline as the source of truth and trigger one guarded submit/finalize action, with retry/recovery for network loss.
- Dependencies: settle timeout semantics and coordinate with TOEIC-DEF-006/007.
- Regression risk: duplicate submissions or lost final answers at boundary conditions.
- Verification: test with answers saved and unsaved, tab backgrounded, clock skew and network loss around deadline. Status: OPEN, runtime NOT_RUN.

### TOEIC-DEF-006 — Expired attempts are marked submitted without grading

- Related cases: EXAM_04. Module: standard and TOEIC attempt lifecycle.
- Description and expected behavior: an attempt finalized as submitted must have deterministic score, unanswered counts and result fields derived from the last server-persisted answers.
- Actual source gap/root cause: expired standard attempts are changed to submitted in startAttempt without scoring (attemptController.js:139-161); TOEIC startAttempt does likewise (toeicController.js:1312-1339); TOEIC autosave expiry also marks submitted and returns 403 without grading (toeicController.js:1493-1505).
- Severity: CRITICAL. Priority: P1 (source test plan). Confidence: HIGH for finalization without a scoring call; resulting displayed score depends on model defaults and result path.
- Layers: BE, DB. Complexity: L. Phase: 2.
- Proposed solution: centralize a server-side finalization transition that grades persisted snapshots/answers exactly once and records timeout metadata atomically.
- Dependencies: scoring contract, attempt status compatibility and handling existing submitted-but-ungraded records.
- Regression risk: regrading old attempts, changing historical scores or counting a timeout twice.
- Verification: expire standard and TOEIC attempts, resume/autosave afterward, and assert status, persisted answers, score fields and report inclusion. Status: OPEN, runtime NOT_RUN.

### TOEIC-DEF-007 — Late submission still grades answers from the request body

- Related cases: EXAM_04, SEC_EXAM_03. Module: deadline enforcement/scoring.
- Description and expected behavior: the server must enforce the deadline and score only the accepted answer snapshot under the chosen timeout policy.
- Actual source gap/root cause: both normal and TOEIC submit handlers set isExpired after deadline plus a 10-second buffer but continue grading rawAnswers from the request (attemptController.js:306-330; toeicController.js:1608-1641).
- Severity: CRITICAL. Priority: P1 (source test plan). Confidence: HIGH for handler flow; exploitability was not tested.
- Layers: BE. Complexity: M. Phase: 2.
- Proposed solution: make deadline enforcement atomic and explicit; reject or finalize from last persisted answers according to the approved policy, never silently accept a late client payload.
- Dependencies: TOEIC-DEF-005/006; define tolerated clock/network grace period.
- Regression risk: legitimate users losing answers saved just before the deadline.
- Verification: submit at deadline−1s, deadline, deadline+grace, and after grace with changed request answers; assert only policy-permitted answers affect score. Status: OPEN, runtime NOT_RUN.

### TOEIC-DEF-008 — Submit endpoint does not guard the assessment engine type

- Related cases: source-only finding; nearest coverage EXAM_05, EXAM_06. Module: attempt integrity/scoring.
- Description and expected behavior: a normal assessment attempt must only be finalized by the normal scorer and a TOEIC attempt only by the TOEIC scorer.
- Actual source gap/root cause: normal submit checks owner and submitted status but not assessment format (attemptController.js:260-304); a TOEIC completed attempt falls through the normal scorer and is rewritten as submitted (attemptController.js:373-390). Separate TOEIC submit has its own status rules (toeicController.js:1577-1605).
- Severity: CRITICAL. Priority: proposed P1. Confidence: HIGH from static handler flow; endpoint misuse was not executed.
- Layers: BE, DB. Complexity: M. Phase: 2.
- Proposed solution: validate attempt assessmentType/examFormat in each route before any mutation; share an explicit engine-dispatch policy and make final states immutable/idempotent.
- Dependencies: reconcile status values and historical TOEIC records.
- Regression risk: breaking old attempts whose assessment format changed after attempt creation.
- Verification: call each submit handler with its own and the opposite engine's attempt; wrong-engine requests must not mutate any field. Status: OPEN, runtime NOT_RUN.

### TOEIC-DEF-009 — Normal exam flow has no cross-tab ownership or stale-write guard

- Related cases: SEC_EXAM_01. Module: attempt concurrency.
- Description and expected behavior: a second tab should be warned/blocked or writes should be safely serialized according to an agreed policy.
- Actual source gap/root cause: the unique partial index only permits one in_progress Attempt per student/assessment; startAttempt resumes that same record. It does not identify a browser tab. Normal TestPage autosave sends no revision token; TOEIC has a revision check. See Attempt.js:132-137 and the attempt controller/client paths.
- Severity: HIGH. Priority: P1 (source test plan). Confidence: HIGH for missing tab lock on normal flow; actual overwrite timing not tested.
- Layers: FE, BE, DB. Complexity: L. Phase: 2.
- Proposed solution: add server-issued attempt lease/tab identity or versioned compare-and-swap writes and a visible conflict state; avoid relying only on client-side tab events.
- Dependencies: choose whether the first tab wins, latest tab wins, or tabs collaborate; coordinate with autosave/recovery.
- Regression risk: rejecting valid autosave after refresh or device recovery.
- Verification: edit different answers in two tabs, submit in both, refresh one tab and go offline/online; assert deterministic persisted answer and single final result. Status: OPEN, runtime NOT_RUN.

### TOEIC-DEF-010 — Student assessment cards do not show prior attempt state

- Related cases: EXAM_01. Module: student assessment list.
- Description and expected behavior: each card should show the relevant prior status/attempt state required by the plan.
- Actual source gap/root cause: StudentAssessmentsPage renders from the available assessment list and does not fetch student attempt state (frontend/src/pages/StudentAssessmentsPage.jsx:8-14). Backend list path is a published assessment list, not a per-student result aggregation.
- Severity: MEDIUM. Priority: P1 (source test plan). Confidence: HIGH for missing UI/data path.
- Layers: FE, BE. Complexity: M. Phase: 2.
- Proposed solution: return a compact per-student attempt summary with the list or fetch it efficiently; define how unlimited attempts and active attempts are labeled.
- Dependencies: settle attemptLimit=0 wording and which attempt is “most recent”.
- Regression risk: N+1 queries or leaking another student's attempt data.
- Verification: cards show never-started, in-progress, submitted, expired and unlimited-retake states using isolated student fixtures. Status: OPEN, runtime NOT_RUN.

### TOEIC-DEF-011 — Submit confirmation does not identify unanswered question numbers

- Related cases: EXAM_01. Module: standard exam UI.
- Description and expected behavior: when unanswered questions remain, confirmation should identify their question numbers before submit.
- Actual source gap/root cause: TestPage displays only answered count and number unanswered (frontend/src/pages/TestPage.jsx:550-559).
- Severity: MEDIUM. Priority: P1 (source test plan). Confidence: HIGH.
- Layers: FE. Complexity: S. Phase: 2.
- Proposed solution: derive unanswered indices from the displayed snapshot and list them in the confirmation modal with links to those questions.
- Dependencies: none beyond the final question-order contract.
- Regression risk: displaying stale indices after filtering/reordering questions.
- Verification: leave non-contiguous questions blank; confirm the exact numbers and navigation targets. Status: OPEN, runtime NOT_RUN.

### TOEIC-DEF-012 — Assessment list has no search control

- Related cases: EX_VOC_03. Module: student assessment discovery.
- Description and expected behavior: allow a student to find an assessment by its title as recorded in the issue note.
- Actual source gap/root cause: StudentAssessmentsPage only offers type tabs and renders the list; no search state/input exists (StudentAssessmentsPage.jsx:8-14).
- Severity: MEDIUM. Priority: P1 (source test plan). Confidence: HIGH.
- Layers: FE, possibly BE at scale. Complexity: S. Phase: 2.
- Proposed solution: add debounced or local title search; if server-side, reuse bounded query validation and pagination.
- Dependencies: decide whether search covers title only or description too.
- Regression risk: search state conflicting with type tabs or empty states.
- Verification: case-insensitive title search, no-result state, clear search and combined type filters. Status: OPEN, runtime NOT_RUN.

### TOEIC-DEF-013 — Single-choice and multiple-choice options have the same visual marker

- Related cases: EX_VOC_03. Module: question UI.
- Description and expected behavior: distinguish one-answer and multiple-answer interactions in the rendered controls.
- Actual source gap/root cause: TestPage renders the same option-radio-circle marker for both question types (frontend/src/pages/TestPage.jsx:354-371).
- Severity: MEDIUM. Priority: P1 (source test plan). Confidence: HIGH.
- Layers: FE. Complexity: S. Phase: 2.
- Proposed solution: use radio semantics for single-select and checkbox semantics for multiple-select, with matching keyboard and selected states.
- Dependencies: confirm accessibility and visual design tokens.
- Regression risk: changing selection semantics or answer payload shape.
- Verification: keyboard and pointer selection for both types; persisted answers retain expected string/array structure. Status: OPEN, runtime NOT_RUN.

### TOEIC-DEF-014 — Attempt-limit rejection is an English full-page error

- Related cases: EX_VOC_03. Module: student assessment feedback.
- Description and expected behavior: show a localized Vietnamese popup/message when the attempt limit is reached.
- Actual source gap/root cause: normal controller responds with English text (attemptController.js:172-177); TestPage converts it into a full-page error state (TestPage.jsx:252-263).
- Severity: MEDIUM. Priority: P1 (source test plan). Confidence: HIGH for this path.
- Layers: BE, FE. Complexity: S. Phase: 2.
- Proposed solution: return a stable error code and localize it in the client; show the agreed modal/notice without losing page context.
- Dependencies: preserve unlimited-attempt semantics for attemptLimit=0.
- Regression risk: mislabeling unrelated 403 errors as attempt-limit errors.
- Verification: limited and unlimited assessments; assert localized copy and no navigation/page replacement. Status: OPEN, runtime NOT_RUN.

### TOEIC-DEF-015 — Admin has no direct student-creation flow

- Related cases: ADM_U_01. Module: student administration.
- Description and expected behavior: authorized admin/teacher creates a student through the specified form and can use the resulting account.
- Actual source gap/root cause: adminRoutes has no student-create POST route (adminRoutes.js:103-109) and AdminStudentsPage has no create action (AdminStudentsPage.jsx:87-95).
- Severity: MEDIUM. Priority: P1 (source test plan). Confidence: HIGH for absence in the reviewed route/page.
- Layers: FE, BE, DB. Complexity: M. Phase: 3.
- Proposed solution: decide whether admin creation is required in addition to public registration; if yes, define required fields, initial status, password delivery and audit trail before implementing.
- Dependencies: security/business decision on role, initial status and password reset process.
- Regression risk: bypassing approval controls or creating duplicate usernames/emails.
- Verification: create valid and invalid accounts, duplicate values, initial account state and first-login password reset. Status: OPEN, runtime NOT_RUN.

### TOEIC-DEF-016 — Student detail always shows empty progress and omits attempt results

- Related cases: ADM_U_03, REP_02. Module: admin student reporting.
- Description and expected behavior: student detail should reflect actual lesson activity and attempts for that student.
- Actual source gap/root cause: AdminStudentDetailPage hardcodes “Chưa có hoạt động học tập” and does not call progressApi (AdminStudentDetailPage.jsx:26,55-56). Existing progress endpoint calculates published lesson progress only and has no attempt aggregation (progressController.js:153-239).
- Severity: HIGH. Priority: P2 (source test plan). Confidence: HIGH for the UI placeholder and lesson-only API scope.
- Layers: FE, BE, DB. Complexity: L. Phase: 3.
- Proposed solution: design a per-student summary contract covering course/lesson progress, attempt history and latest activity; wire a detail view to it with empty/loading/error states.
- Dependencies: score/status definitions from Phase 2 and agreed filters/time range.
- Regression risk: incorrect aggregation across hidden lessons, deleted assessments or multiple attempts.
- Verification: compare API and UI against fixtures containing no activity, lesson progress, multiple attempts and expired attempts. Status: OPEN, runtime NOT_RUN.

### TOEIC-DEF-017 — No by-assessment report/summary UI

- Related cases: REP_01. Module: reports.
- Description and expected behavior: authorized staff can inspect the plan's score summary for a selected assessment.
- Actual source gap/root cause: a generic results page exists, but it only filters by type (AdminResultsPage.jsx:7-26). API accepts student, assessment and type filters but UI does not expose assessment selection and the endpoint has no pagination (attemptController.js:569-610).
- Severity: MEDIUM. Priority: P2 (source test plan). Confidence: HIGH for the missing UI filter/summary; source document's claim that no report page exists is broader than current source.
- Layers: FE, BE, DB. Complexity: M. Phase: 3.
- Proposed solution: add assessment selection and the requested ranking/summary, with server-side pagination and stable sort.
- Dependencies: decide ties, attempt selection (all vs latest), expired attempts and score column definitions.
- Regression risk: expensive unbounded result queries and inconsistent summary totals.
- Verification: compare ranked output and counts with a controlled dataset, including tied scores and repeat attempts. Status: OPEN, runtime NOT_RUN.

### TOEIC-DEF-018 — My Courses navigates into the public course shell

- Related cases: LESS_02. Module: course navigation/layout.
- Description and expected behavior: the student can return to My Courses and retain the student shell when continuing from an enrolled course.
- Actual source gap/root cause: MyCoursesPage links to /courses/:id (MyCoursesPage.jsx:82-89); AppRoutes declares that path as public outside StudentLayout (AppRoutes.jsx:97-109); CourseDetailPage returns to /courses (CourseDetailPage.jsx:87-90).
- Severity: MEDIUM. Priority: P2 (source test plan). Confidence: HIGH for route declarations and links; rendered sidebar not browser verified.
- Layers: FE. Complexity: M. Phase: 4.
- Proposed solution: add student-aware course detail/navigation or preserve route context and provide clear links between enrolled courses and catalog.
- Dependencies: none; do not change public course browsing behavior.
- Regression risk: breaking public enrollment and anonymous course discovery.
- Verification: navigate from My Courses to detail, lesson and back at desktop/mobile while checking the correct shell and return destination. Status: OPEN, runtime NOT_RUN.

### TOEIC-DEF-019 — No inline PDF viewer in lesson materials

- Related cases: DOC_01, LESS_02. Module: learning materials.
- Description and expected behavior: student can view supported PDFs in the lesson page as required by the plan.
- Actual source gap/root cause: lesson materials render metadata and a download button only; no PDF preview is rendered (LessonPage.jsx:259-286).
- Severity: MEDIUM. Priority: P2 (source test plan). Confidence: HIGH for current page path.
- Layers: FE, possibly Infrastructure. Complexity: M. Phase: 4.
- Proposed solution: choose an approved PDF viewer or browser-native embed, define access control, loading/error state, mobile behavior and fallback download.
- Dependencies: TOEIC-DEF-002 and product decision for third-party viewer/CSP.
- Regression risk: large files, mobile performance, inaccessible viewer controls and leaking restricted URLs.
- Verification: preview valid, corrupt, large and restricted PDFs with keyboard/mobile and authorized download fallback. Status: OPEN, runtime NOT_RUN.

### TOEIC-DEF-020 — Vocabulary list lacks required discovery/navigation controls

- Related cases: VOC_01, VOC_02. Module: student vocabulary.
- Description and expected behavior: support lookup and navigation for long vocabulary lists; requested controls include search, sorting and back-to-top, and a grid layout was requested.
- Actual source gap/root cause: StudentVocabularyPage renders topic tabs and one list with no search/sort/back-to-top/grid controls (StudentVocabularyPage.jsx:6).
- Severity: MEDIUM. Priority: P2 for VOC_01, P3 for VOC_02. Confidence: HIGH for missing controls; grid is a design request that needs UX confirmation.
- Layers: FE. Complexity: M. Phase: 4.
- Proposed solution: confirm list vs grid at mobile/desktop, then add search, stable sorting and long-list navigation without changing vocabulary content.
- Dependencies: decide default sort and whether search spans all topics or selected topic.
- Regression risk: topic filter/search mismatch and slower rendering for large lists.
- Verification: long dataset, accent/word search, sort order, topic filter, empty state and mobile layout. Status: OPEN, runtime NOT_RUN.

### TOEIC-DEF-021 — Flashcard navigation labels are English

- Related cases: VOC_01. Module: flashcards/localization.
- Description and expected behavior: Previous and Next labels should be Vietnamese as requested.
- Actual source gap/root cause: FlashcardPage renders “Previous” and “Next” at frontend/src/pages/FlashcardPage.jsx:24.
- Severity: LOW. Priority: P2 (source test plan). Confidence: HIGH.
- Layers: FE. Complexity: S. Phase: 4.
- Proposed solution: localize the two labels and retain arrow/disabled states.
- Dependencies: none. Regression risk: minimal; ensure screen-reader labels remain clear.
- Verification: first, middle and last card labels/states. Status: OPEN, runtime NOT_RUN.

### TOEIC-DEF-022 — Download failures are styled as success

- Related cases: LESS_02. Module: lesson feedback.
- Description and expected behavior: failed downloads should be visually and accessibly presented as errors.
- Actual source gap/root cause: download catch sets an error message (LessonPage.jsx:116-127), but .learning-notice always uses success colors (CourseLearning.css:1).
- Severity: LOW. Priority: P2 (source test plan). Confidence: HIGH for state-to-style mismatch.
- Layers: FE. Complexity: S. Phase: 4.
- Proposed solution: model notice type explicitly and use success/error styling plus aria-live/role semantics.
- Dependencies: none. Regression risk: callers of the shared notice class may expect current success treatment.
- Verification: successful completion, failed download and failed progress update each render distinct states. Status: OPEN, runtime NOT_RUN.

### TOEIC-DEF-023 — Enrollment confirmation is a full page instead of a popup

- Related cases: LESS_02. Module: enrollment UX.
- Description and expected behavior: the plan note requests a popup confirmation rather than a standalone confirmation page.
- Actual source gap/root cause: EnrollCoursePage renders a standalone learning-confirm page and navigates after success (frontend/src/pages/EnrollCoursePage.jsx:6).
- Severity: MEDIUM. Priority: P2 (source test plan). Confidence: HIGH for current implementation and recorded expected UX.
- Layers: FE. Complexity: M. Phase: 4.
- Proposed solution: align the enrollment confirmation interaction with the product flow, preserving loading, validation, duplicate-enrollment handling and successful navigation.
- Dependencies: confirm whether enrollment should be modal, inline confirmation or full page for accessibility/mobile.
- Regression risk: trapping keyboard focus or losing the enrollment result on navigation.
- Verification: keyboard, screen-reader, mobile, API error and already-enrolled cases. Status: OPEN, runtime NOT_RUN.

### TOEIC-DEF-024 — Lesson difficulty is an explicit feature/schema gap

- Related cases: LESS_02. Module: lesson metadata.
- Description and expected behavior: lesson cards should show difficulty as requested in the note.
- Actual source gap/root cause: Lesson model contains title/content/topic/status/order/duration but no difficulty field (backend/src/models/Lesson.js:3-55).
- Severity: MEDIUM. Priority: proposed P2 based on LESS_02. Confidence: HIGH that the current schema lacks the field; vocabulary and migration semantics are undecided.
- Layers: FE, BE, DB. Complexity: M. Phase: 4.
- Proposed solution: agree allowed levels, optional/default behavior, existing-record backfill and admin editing before adding schema/API/UI support.
- Dependencies: product decision on difficulty scale and whether levels are relative to course or system-wide.
- Regression risk: misleading labels on legacy lessons and inconsistent filters.
- Verification: create/edit/read old and new lessons with each allowed level; check card rendering and migration defaults. Status: OPEN, runtime NOT_RUN.

## Runtime-only and possible-fix candidates (not counted as confirmed defects)

| Candidate | Case(s) | Current evidence | Next action |
|---|---|---|---|
| Mobile lesson sidebar clips vertically | LESS_01 | No browser screenshot or viewport run. | Retest on documented phone/tablet sizes and inspect scroll container. |
| Three-column/course-card parity, mobile progress percentage, lesson list and navigation visuals | LESS_02 | CSS defines responsive grid breakpoints; visual notes lack target viewport/page precision. | Confirm intended page and viewport, then inspect live layout. |
| Interactive exercise appears incomplete after refresh and permits another attempt | EX_VOC_03 | Exact component/URL is not clear; autosave/resume and attemptLimit=0 semantics exist in some flows. | Identify exact route, account fixture and intended attempt limit; reproduce with network traces. |
| Mobile question list loses controls or scrolling | EX_VOC_03 | Current TestPage has a mobile sheet; browser scroll behavior is unverified. | Verify at 375x812 and 412x915, including bottom of a long test. |
| Speech input affects every question | EX_VOC_03 | Current handler writes transcript only to qId (TestPage.jsx:161-179). | Mark FIXED_NEED_RETEST only after a multi-question speech test. |
| Hidden lesson remains visible after refresh | ADM_L_02 | Current list/detail source filters or blocks non-published lessons. | Retest list and direct URL after publish→hidden transition; until then POSSIBLY_FIXED. |
| Admin question type formatting/action-column alignment | ADM_EX_01 | Visual outcome is not statically verifiable. | Inspect representative data on desktop and mobile. |
| Concurrent double-submit, clock changes, refresh recovery and offline resume | SEC_EXAM_02…SEC_EXAM_05 | Some server guards/autosave paths exist; timing/data behavior is untested. | Run controlled integration tests in disposable DB. |
| General responsive quality and load at 100+ students | NON_RESP_01, NON_LOAD_01 | No browser matrix or safe staging/load target. | BLOCKED pending device/staging access. |

## Not reproduced / verified fixed

No case is NOT_REPRODUCED or VERIFIED_FIXED because no matching test-plan case was executed. The source-only hints above are not completion evidence.
