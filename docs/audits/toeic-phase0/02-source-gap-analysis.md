# 02 — Source gap analysis

## How to read these conclusions

CONFIRMED_GAP means current source directly lacks or contradicts the stated behavior. It is a static source conclusion, not a runtime reproduction. POSSIBLY_FIXED means the current code contains a relevant guard or implementation, but no matching runtime test was run. NEEDS_RUNTIME means the question depends on rendered UI, data, browser behavior or deployment. NO_OBVIOUS_GAP means this pass found a relevant implementation path but no specific static gap; it does not mean PASS. No case is marked verified fixed.

The primary plan is the Google Doc at https://docs.google.com/document/d/19mooB-jlPZGBWXZkFg6fWwnYFGtbVDojg-aOo8uPCPs/edit?tab=t.0. Inventory source fields are preserved row-by-row in 01-test-case-inventory.csv.

## Module-by-module mapping

### 1. Authentication and RBAC — AUTH_01…AUTH_06

Entry points are frontend/src/routes/AppRoutes.jsx and backend/src/routes/authRoutes.js. JWT verification is in backend/src/middlewares/auth.js:17-30. That middleware rejects missing/inactive users based on isActive only; requireActiveStudent checks status separately at auth.js:85-139. Refresh checks isActive but not status at backend/src/controllers/authController.js:203-224. Several routes use verifyToken without requireActiveStudent. Static gap: see TOEIC-DEF-004. Login, logout, invalid-password and role-denial outcomes still need runtime coverage; NOT_RUN.

The teacher/admin policy is not safely inferable from the test plan. Admin routes accept both admin and teacher at backend/src/routes/adminRoutes.js:97-99, while role policy is broader than the concrete student-management cases. Keep existing access unless the owner confirms a policy change.

### 2. Dashboard and learning progress — DASH_01…DASH_04

Student dashboard and progress APIs exist. This audit did not exercise them with an authenticated account or a safe database fixture. Static source review did not establish that displayed aggregates match persisted course/lesson/attempt data. Mark NEEDS_RUNTIME; do not treat blank error notes in the source document as PASS.

### 3. Lessons and media — LESS_01…LESS_03

Lesson lists/details and published-status checks exist in backend/src/controllers/lessonController.js. A current hidden/unpublished guard appears in lessonController.js:16-24 and 52-58; the old ADM_L_02 observation is POSSIBLY_FIXED and needs a refresh/runtime retest.

Confirmed gaps linked from LESS_02:

- A failed material download writes an error message to notice state in frontend/src/pages/LessonPage.jsx:116-127, but the shared .learning-notice style is always green in frontend/src/pages/CourseLearning.css:1. See TOEIC-DEF-022.
- The enrolled-course card links to /courses/:id from frontend/src/pages/MyCoursesPage.jsx:82-89. That route is public and its detail page links “all courses” to /courses in frontend/src/pages/CourseDetailPage.jsx:87-90; AppRoutes places these routes outside the student layout at AppRoutes.jsx:97-100. This explains the source-level route/layout mismatch; see TOEIC-DEF-018.
- Lesson content is shown as HTML via dangerouslySetInnerHTML at frontend/src/pages/LessonPage.jsx:211-215. No sanitization step was found on this render path. See TOEIC-DEF-001.
- The lesson detail page exposes attached-file metadata and a download button but has no inline PDF viewer at LessonPage.jsx:259-286. See TOEIC-DEF-019.
- Enrollment confirmation is implemented as the standalone EnrollCoursePage, which renders a full-page confirmation section; it navigates to /courses/:id after success. See TOEIC-DEF-023.
- Lesson has no difficulty field in backend/src/models/Lesson.js:3-55. Adding it is a feature/schema request that needs the product's difficulty vocabulary and migration/default decision; see TOEIC-DEF-024.
- The course catalog CSS sets three columns on wide screens, two below 980px and one below 620px in frontend/src/pages/CourseLearning.css:15,30-31. The note asking for two columns does not specify viewport or target page. Keep it NEEDS_RUNTIME/decision until the intended viewport and card page are confirmed.

LESS_01 mobile sidebar clipping, mobile progress visibility, lesson-list aesthetics and footer controls are visual/runtime checks. CSS alone cannot verify clipped content, scrolling or final rendered spacing. No screenshots were captured.

### 4. Learning documents — DOC_01…DOC_03

DOC_01: no integrated PDF preview component was found in the lesson material render path; only a download action appears when allowDownload is true (LessonPage.jsx:259-286). CONFIRMED_GAP, TOEIC-DEF-019.

DOC_02: the protected download endpoint exists at backend/src/controllers/materialController.js:353-399. This is not a runtime pass and its access contract has a bypass described below.

DOC_03: the material API returns fileUrl while excluding only filePath (materialController.js:337-345); /uploads is public static middleware (backend/src/app.js:70-73). The protected download endpoint checks allowDownload at materialController.js:385-392, but a stored direct fileUrl can bypass that controller. CONFIRMED_GAP, TOEIC-DEF-002.

### 5. Vocabulary and lookup — VOC_01, VOC_02

frontend/src/pages/StudentVocabularyPage.jsx:6 renders topic tabs and a single list; the screen has no search, sort, grid toggle or back-to-top action. The accompanying vocabulary styles use list/card presentation. CONFIRMED_GAP for the controls requested in the notes, TOEIC-DEF-020. The “grid” choice is a UX direction and should be confirmed against the intended responsive design.

frontend/src/pages/FlashcardPage.jsx:24 labels navigation buttons Previous and Next. CONFIRMED_GAP, TOEIC-DEF-021.

### 6. Interactive vocabulary — EX_VOC_01…EX_VOC_05

The source document does not identify the exact URL/component for this exercise section. The assessment-taking implementation was inspected as the closest question-type path; verify the mapping with the product owner before treating it as the only implementation.

For the assessed TestPage path:

- Speech transcription writes only to the keyed qId in frontend/src/pages/TestPage.jsx:161-179; the reported cross-question behavior is POSSIBLY_FIXED, not runtime verified.
- The assessment list has only type tabs and no search control in frontend/src/pages/StudentAssessmentsPage.jsx:8-14. TOEIC-DEF-012.
- Single and multiple-choice questions render the same option-radio-circle marker in TestPage.jsx:354-371. TOEIC-DEF-013.
- An attempt-limit error is rendered as a full error page in TestPage.jsx:252-263; the normal controller response text is English at backend/src/controllers/attemptController.js:172-177. TOEIC-DEF-014.
- The mobile question sheet/navigation exists in TestPage.jsx and TestPage.css. This is POSSIBLY_FIXED for the reported missing controls; browser scroll and bottom-sheet behavior remain unverified.
- The refresh/retake report is NEEDS_RUNTIME. Current attempt resumption/autosave behavior and attemptLimit=0 unlimited semantics do not prove a defect or determine which “interactive vocabulary” screen was tested.

### 7. Homework — HW_01…HW_03

Assessment and attempt routes provide list, attempt, submit and result operations. No safe seeded account/data was available, and no case was executed. NEEDS_RUNTIME; retain all three rows as NOT_RUN.

### 8. Exams — EXAM_01…EXAM_06

The standard assessment UI is frontend/src/pages/TestPage.jsx; its backend is backend/src/controllers/attemptController.js.

- EXAM_01: student assessment cards are built from the published assessment list and do not include per-student prior attempt status; the submit confirmation shows answered count and unanswered count but not the question numbers (StudentAssessmentsPage.jsx:11-14; TestPage.jsx:550-559). TOEIC-DEF-010 and TOEIC-DEF-011.
- EXAM_02 and EXAM_04: standard TestPage timer only updates the countdown and clears its interval at zero (TestPage.jsx:86-101); it does not submit. TOEIC-DEF-005.
- EXAM_04: expired active attempts can be marked submitted without running scoring when they are resumed (attemptController.js:139-161); TOEIC attempts do likewise at toeicController.js:1312-1339. Autosave expiry also marks a TOEIC attempt submitted without grading at toeicController.js:1493-1505. TOEIC-DEF-006.
- EXAM_04/SEC_EXAM_03: the normal submit handler marks an attempt expired after deadline but still grades req.body.answers (attemptController.js:306-330). The TOEIC submit path also continues to score rawAnswers after setting isExpired (toeicController.js:1608-1641). TOEIC-DEF-007.
- The normal attempt submit handler treats submitted as idempotent, but does not check assessment format. A completed TOEIC attempt is not returned as already submitted by that handler and can be re-scored as a normal assessment (attemptController.js:260-304, 373-390; TOEIC submit has separate status handling at toeicController.js:1577-1605). TOEIC-DEF-008. This is an additional integrity finding, not a verified failure of the EXAM_06 answer-visibility requirement.
- The assessment API does not aggregate per-student attempt state into the student card (StudentAssessmentsPage.jsx:11-14). TOEIC-DEF-010.
- Existing client countdown, server deadline, and separate scoring/status paths need a single acceptance contract before Phase 2. Preserve scoring rules and existing attempt history.

EXAM_03, EXAM_05 and EXAM_06 still need data-backed runtime verification beyond the identified cross-engine risk.

### 9. Anti-cheat and exceptions — SEC_EXAM_01…SEC_EXAM_05

SEC_EXAM_01: both tabs can resume the same in_progress attempt. The unique DB index prevents two active attempt records but does not identify or lock one browser tab. Normal assessment autosave has no revision token path in TestPage, while TOEIC autosave has a revision check. This leaves multi-tab last-writer behavior unguarded in the normal flow. TOEIC-DEF-009.

SEC_EXAM_02: normal submit has an already-submitted response (attemptController.js:281-304), so sequential duplicate submit is POSSIBLY_FIXED. Concurrent double-submit has not been tested.

SEC_EXAM_03 and SEC_EXAM_04: server time/deadline and resumable attempts exist, but the expired-answer path remains a confirmed gap; client clock manipulation and refresh behavior still need runtime/integration checks.

SEC_EXAM_05: offline recovery depends on browser state, API retry and persistence; NOT_RUN.

### 10. History and profile — HIST_01, PROF_01, PROF_02

History and profile routes/pages exist. These flows depend on authenticated account data and were not executed. NEEDS_RUNTIME.

### 11. Admin students — ADM_U_01…ADM_U_04

- ADM_U_01: adminRoutes exposes GET students/details and status PATCH operations, but no create-student POST route (backend/src/routes/adminRoutes.js:103-109). AdminStudentsPage has search/status/action UI but no create action (frontend/src/pages/admin/AdminStudentsPage.jsx:87-95). CONFIRMED_GAP, TOEIC-DEF-015.
- ADM_U_02: suspendStudent changes status to suspended but leaves isActive unchanged (backend/src/controllers/adminController.js:159-176). verifyToken and refresh check isActive only; only requireActiveStudent enforces status. Existing tokens and token-only routes are therefore not consistently revoked. CONFIRMED_GAP, TOEIC-DEF-004.
- ADM_U_03: AdminStudentDetailPage displays a hardcoded “Chưa có hoạt động học tập” block at frontend/src/pages/admin/AdminStudentDetailPage.jsx:55-56 and never calls the progress API. A progress API exists, but aggregates lesson progress only, not assessment attempts (backend/src/controllers/progressController.js:153-239; frontend/src/api/progressApi.js:16-20). CONFIRMED_GAP, TOEIC-DEF-016.
- ADM_U_04: search UI/API existence does not prove accent-insensitive matching, so NEEDS_RUNTIME.

### 12. Admin lesson, document and vocabulary — ADM_L_01, ADM_L_02, ADM_DOC_01, ADM_VOC_01

CRUD routes exist. ADM_L_02 is POSSIBLY_FIXED because student list/detail paths filter or reject non-published lessons (lessonController.js:16-24,52-58); refresh test still required. General lesson/material upload routes use Multer with storage only and no limits or fileFilter (lessonRoutes.js:18-28; materialRoutes.js:17-27; adminRoutes.js:61-71). A separate media middleware has allowlists and a 50 MB limit (backend/src/controllers/mediaController.js:7-54), and a DOCX import route has its own limit. This inconsistency is a CONFIRMED_GAP for the general upload paths; see TOEIC-DEF-003. File type/size payloads were not submitted.

### 13. Admin exam bank and scoring settings — ADM_EX_01…ADM_EX_03

Admin assessment/question pages and APIs exist. The reported choice-format and action-column alignment are visual claims; without a browser viewport and representative data they remain NEEDS_RUNTIME. No source-only alignment conclusion is made.

### 14. Reports — REP_01, REP_02

- REP_01 wording says no report page, but a general results page exists. AdminResultsPage fetches all results and only filters by type (frontend/src/pages/admin/AdminResultsPage.jsx:7-26). The API accepts student, assessment and type filters but does not paginate (backend/src/controllers/attemptController.js:569-610). The narrower gap is the missing by-assessment report/summary and filter UI, not absence of every report. CONFIRMED_GAP, TOEIC-DEF-017.
- REP_02: student detail uses a hardcoded empty progress panel and no result history; progress API is lesson-only. CONFIRMED_GAP, TOEIC-DEF-016.

### 15. Non-functional — NON_RESP_01, NON_LOAD_01, NON_SEC_01, NON_SEC_02, NON_FILE_01, NON_FILE_02

- Responsive rendering and 100+ learner load require target devices, safe dataset and a staging environment; BLOCKED/NOT_RUN.
- NON_SEC_01: the unsanitized lesson HTML sink is a confirmed source security gap (TOEIC-DEF-001). No exploit payload was executed. Mongo/Mongoose use is not SQL, but regex/query input validation and broader security checks still require separate review.
- NON_SEC_02: User model bcrypt password hashing is present (backend/src/models/User.js:76-89); source indication only, not a runtime database inspection. POSSIBLY_FIXED.
- NON_FILE_01/02: upload middleware configuration is inconsistent as above (TOEIC-DEF-003).

### 16. Deployment and sign-off — DEP_01…DEP_03

No production URL, hosting account, SSL endpoint or handover credentials were provided. BLOCKED; no deployment or account access was attempted.

## Cross-cutting source-only risks

1. Static uploaded files are public and material DTOs return fileUrl; allowDownload is enforced only by the protected controller. TOEIC-DEF-002.
2. Account status is distinct from isActive and is enforced only on some routes. TOEIC-DEF-004.
3. Attempt timeout and scoring paths differ between normal and TOEIC controllers, including ungraded finalization, late answer scoring and cross-engine handler access. TOEIC-DEF-006…008.
4. Existing route/data/API presence is not equivalent to a working end-to-end UI. Keep those cases NOT_RUN until the target flow is exercised.
