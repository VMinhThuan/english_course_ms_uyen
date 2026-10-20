# 00 — System baseline

## Snapshot

- Audit date: 2026-10-19 (Asia/Saigon).
- Repository: D:/SideProject/english_course_ms_uyen.
- Branch: main.
- Commit: d8b5c49b0e6fb73e7f414798ae077a9ce713f001.
- Remote: origin, https://github.com/VMinhThuan/english_course_ms_uyen.git.
- Initial working tree: clean at the audit start. The only files created during Phase 0 are under docs/audits/toeic-phase0/. Temporary frontend build output was removed.
- Source, configuration, database records, and Git history were not changed.

## Architecture

### Frontend

The client is React 18.2 with Vite 5, React Router 6, Zustand 4 and Axios. The application has public, student and teacher/admin routes. Main route declarations are in frontend/src/routes/AppRoutes.jsx:90-127; protected student screens are nested under StudentLayout, while /courses and /courses/:id are public routes. The API client defaults to /api/v1 in frontend/src/api/axiosConfig.js:5-7; Vite proxies /api and /uploads to the local backend. Student learning pages include course catalog/detail, lessons, assessments, TOEIC, vocabulary, flashcards, history and results. Admin pages include students, courses, lessons/materials/vocabulary, assessments/questions, statistics and results.

### Backend

The server is Node.js ES modules, Express 4.18 and Mongoose 8. It starts at backend/src/server.js and builds the app in backend/src/app.js. The configured server port defaults to 3000. API namespaces include auth, courses, instructors, enrollments, lessons, materials, vocabulary, progress, tests, questions, assessments, attempts, admin, TOEIC admin/media and TOEIC student routes (backend/src/app.js:112-127). Uploaded files are served from /uploads by Express static middleware (backend/src/app.js:70-73).

Authentication uses JWT access/refresh tokens and bcryptjs password hashing. Authorization is split between verifyToken, role checks and requireActiveStudent. The account has both isActive and status fields; account-state enforcement is not uniform across all routes (see TOEIC-DEF-004).

### Data model and important relationships

MongoDB is accessed through Mongoose using MONGODB_URI (backend/src/configs/database.js:15-18); the value was not read or copied into this audit. Relevant models include User, Course, Lesson, Enrollment, LearningProgress, Material, Vocabulary, Assessment, Question, QuestionGroup, Attempt and Test.

- Enrollment associates a student with a course and records course progress.
- LearningProgress associates a student, course and lesson; student/lesson is unique.
- Lesson belongs to a course and has draft, published or hidden status.
- Material belongs to a lesson/course and has published status and allowDownload.
- Attempt associates a student with an assessment and stores snapshots, answers, timing, score and status. A partial unique index allows only one in_progress attempt per student/assessment (backend/src/models/Attempt.js:132-137).
- Assessment attemptLimit=0 means unlimited attempts in current application behavior.

The normal assessment engine and TOEIC engine share Attempt storage but use different submit handlers and status conventions. That boundary is not guarded consistently (TOEIC-DEF-008).

## Runtime and scripts

- Root development: npm run dev starts backend and frontend concurrently.
- Backend: npm --prefix backend run dev; defaults to port 3000.
- Frontend: npm --prefix frontend run dev; Vite defaults to port 5173.
- Root build: npm run build delegates to the frontend Vite build.
- Root test:all runs testLearningFlow.js, testAssessmentFlow.js and testFullProductFlow.js. These scripts connect to MongoDB and create/delete test data, so they were not run while the configured database target could not be confirmed safe.
- Existing backend/.env and frontend/.env files were detected by presence only. Their contents were not read. No secrets or credentials are included here.
- Current local read-only GETs: http://localhost:3000/health returned HTTP 200 with development environment; http://localhost:5173/ returned HTTP 200. These checks do not prove database-backed feature behavior.
- Frontend build completed successfully with Vite 5.4.21; bundle warning: the main JavaScript chunk is 616.29 kB, above Vite's 500 kB warning threshold. Build output was temporary and has been removed.
- Node syntax check covered 74 JavaScript files under backend/src; 0 syntax failures.

No deployment hostname, production hosting, SSL state or safe staging database was available for this audit. Runtime feature tests, database-backed integration tests, visual/browser checks, responsive screenshots, security payload tests and load tests were not run.

## Recent and existing evidence

The six most recent commits at baseline include d8b5c49 update, 4711428 fix(mobile): fix responsive layout for admin lesson modal and form grids, 632321f update code, 725c232 refactor UI login register, and two OCR import commits. These commits are context only; their messages do not prove that a test-plan case is fixed.

Existing docs include MANUAL_BUSINESS_FLOWS.md, UAT_TEST_CASES.md, UAT_EXECUTION_REPORT_2026-10-14.md, UI_SOURCE_ANALYSIS_2026-10-16.md and TOEIC_SCAN_AUDIT_2026-10-18.md. The October 14 report's 202 passing tests are historical and do not establish a current pass for the 62 current test-plan IDs.

The October 18 TOEIC scan audit reports that the local Actual Test draft has 198 questions against 200 configured, 92 missing answer keys, 21 incomplete Part 3–7 option sets, duplicate/missing question numbers and no passage images for 15 Part 7 groups. The source PDF was unavailable to that audit. Do not publish that draft until reviewed against its original source.

## Scope and limits

The Google Doc was read through its document text and all 17 tables. It contains 16 test-case tables with 62 unique IDs, plus a sign-off table. The table count conflicts with the document's contents/heading that say 45 cases. There are 31 embedded images. Their existence was counted, but their pixels were not visually reviewed. The 14 non-empty “Lỗi” cells were read as text; blank cells are not passes.

Source line references in this audit refer to commit d8b5c49. Runtime observations apply only to the local development endpoints and only to the read-only GETs listed above.
