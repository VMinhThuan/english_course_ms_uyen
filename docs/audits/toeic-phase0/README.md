# TOEIC Phase 0 — System audit and baseline

## Executive summary

Phase 0 is complete for the accessible source, Google Doc text and tables, local static checks and safe read-only endpoint checks. No application source, configuration, database record or Git history was changed.

The Master Test Plan has a count conflict: its heading/contents say 45 cases, but its 16 detailed test-case tables contain 62 unique IDs. Fourteen IDs have non-empty text in the “Lỗi” column; the other 48 empty cells are not passes. All 62 current cases remain NOT_RUN or BLOCKED.

Static source review consolidated 24 open source-confirmed gaps/feature gaps. Their severity distribution is 5 CRITICAL, 5 HIGH, 12 MEDIUM and 2 LOW. Three previously reported behaviors have implementation signs that may address them but still need runtime retesting. Eight additional visual/runtime issue groups remain unconfirmed and are not counted as defects.

The highest-risk findings are the unsanitized lesson HTML render sink, public file URLs bypassing material download restrictions, attempt timeout paths that can finalize without scoring or score late request answers, cross-engine attempt re-scoring, inconsistent suspension enforcement, and unguarded multi-tab writes. Do not start a production-affecting change until the decisions in §Blockers are recorded.

## Baseline

- Repository: D:/SideProject/english_course_ms_uyen
- Branch / commit: main / d8b5c49b0e6fb73e7f414798ae077a9ce713f001
- Initial working tree: clean. Only this Phase 0 audit directory is new.
- Architecture: React 18/Vite 5 frontend; Node.js/Express 4 backend; Mongoose 8/MongoDB; JWT access/refresh tokens; student/admin/teacher routes.
- Frontend and backend local root/health GETs returned HTTP 200. Backend syntax check: 74 files, zero syntax failures. Frontend build succeeded with a 616.29 kB main bundle warning.
- Integration tests were not run because the existing database target could not be confirmed disposable. No production/staging endpoint or browser runtime review was available.
- Details: 00-system-baseline.md and 03-verification-report.md.

## Test plan summary

Source: [Master Test Plan Google Doc](https://docs.google.com/document/d/19mooB-jlPZGBWXZkFg6fWwnYFGtbVDojg-aOo8uPCPs/edit?tab=t.0).

| Module | Cases | IDs |
|---|---:|---|
| Authentication & RBAC | 6 | AUTH_01…AUTH_06 |
| Dashboard and learning progress | 4 | DASH_01…DASH_04 |
| Lessons and media | 3 | LESS_01…LESS_03 |
| Learning documents | 3 | DOC_01…DOC_03 |
| Vocabulary and lookup | 2 | VOC_01…VOC_02 |
| Interactive vocabulary exercises | 5 | EX_VOC_01…EX_VOC_05 |
| Regular homework | 3 | HW_01…HW_03 |
| Periodic exams | 6 | EXAM_01…EXAM_06 |
| Anti-cheat and exceptions | 5 | SEC_EXAM_01…SEC_EXAM_05 |
| Learning history and profile | 3 | HIST_01, PROF_01, PROF_02 |
| Admin students | 4 | ADM_U_01…ADM_U_04 |
| Admin lessons, documents and vocabulary | 4 | ADM_L_01, ADM_L_02, ADM_DOC_01, ADM_VOC_01 |
| Exam bank and scoring settings | 3 | ADM_EX_01…ADM_EX_03 |
| Reports | 2 | REP_01…REP_02 |
| Non-functional, responsive, load and security | 6 | NON_RESP_01, NON_LOAD_01, NON_SEC_01, NON_SEC_02, NON_FILE_01, NON_FILE_02 |
| Deployment and sign-off | 3 | DEP_01…DEP_03 |
| **Total** | **62** | **62 unique IDs** |

| Current execution status | Count |
|---|---:|
| NOT_RUN | 58 |
| BLOCKED | 4 — NON_LOAD_01 and DEP_01…DEP_03 |
| PASS | 0 |
| FAIL | 0 |

Source assessment across cases: 21 CONFIRMED_GAP, 38 NEEDS_RUNTIME, 3 POSSIBLY_FIXED. Defect status across cases: 21 OPEN, 3 FIXED_NEED_RETEST, 34 UNCONFIRMED and 4 BLOCKED. No case is VERIFIED_FIXED.

## Confirmed defect backlog

| Severity | Count | Defect IDs |
|---|---:|---|
| CRITICAL | 5 | TOEIC-DEF-001, 002, 006, 007, 008 |
| HIGH | 5 | TOEIC-DEF-003, 004, 005, 009, 016 |
| MEDIUM | 12 | TOEIC-DEF-010…015, TOEIC-DEF-017…020, TOEIC-DEF-023…024 |
| LOW | 2 | TOEIC-DEF-021…022 |
| **Total** | **24** | **Source-confirmed open gaps or feature gaps** |

Severity and source priority are separate. Original priorities are kept in the CSV and each backlog record. Two source-only findings (cross-engine submit and lesson difficulty) are explicitly marked with proposed priority.

## Top 10 priority issues

| Rank | Defect | Risk |
|---:|---|---|
| 1 | TOEIC-DEF-001 | Lesson HTML reaches an unsanitized render sink. |
| 2 | TOEIC-DEF-002 | Public static file URLs can bypass download restrictions. |
| 3 | TOEIC-DEF-006 | Expired attempts can be marked submitted without scoring. |
| 4 | TOEIC-DEF-007 | Late request answers can still be scored after deadline. |
| 5 | TOEIC-DEF-008 | A submit handler can re-score an attempt from the other exam engine. |
| 6 | TOEIC-DEF-004 | Suspension is not enforced consistently on existing/refresh sessions. |
| 7 | TOEIC-DEF-003 | General upload routes lack consistent size/type controls. |
| 8 | TOEIC-DEF-005 | Standard exam timer reaches zero without submitting. |
| 9 | TOEIC-DEF-009 | The normal exam flow has no cross-tab write guard. |
| 10 | TOEIC-DEF-016 | Admin student detail always reports empty learning activity and omits attempts. |

## Proposed phases

| Phase | Defects | Count | Focus |
|---|---|---:|---|
| 1 — Authentication & access control | TOEIC-DEF-001…004 | 4 | HTML/file access, uploads, account-state enforcement. |
| 2 — Exam engine & attempt integrity | TOEIC-DEF-005…014 | 10 | Timer, expiry, scoring, cross-engine calls, tabs and exam UI state. |
| 3 — Admin & reporting | TOEIC-DEF-015…017 | 3 | Student creation, detail/activity and by-assessment reporting. |
| 4 — Learning experience & UI | TOEIC-DEF-018…024 | 7 | Course navigation, PDF, vocabulary, messaging, enrollment and lesson metadata. |
| 5 — Regression & release | all | — | Execute all cases in safe test/staging environments; no new defect count. |

See 05-phase-implementation-plan.md for dependencies, likely modules, acceptance criteria and test cases.

## Possible fixes and unverified issues

Three recorded behaviors have source signs that they may already be addressed: hidden lessons are filtered/blocked, speech transcription targets a question ID, and sequential duplicate submit has an idempotent response. They remain FIXED_NEED_RETEST. Mobile question-sheet behavior also exists in source but requires browser verification.

Nine runtime-only or possible-fix issue groups are listed in 04-defect-backlog.md: mobile sidebar clipping; exact course/card column and progress rendering; refresh/retake behavior in the interactive exercise; mobile question-sheet scrolling; speech input scope; hidden lesson refresh; admin question-form alignment; network/concurrency/timing behavior; and general responsive/load behavior.

The source document has 31 embedded images. Their count was captured, but image pixels were not visually reviewed. The audit does not claim visual issues are fixed from CSS alone.

## Blockers and decisions

1. Resolve the source count discrepancy (45 in the contents vs 62 detailed IDs). The CSV preserves all 62 table rows without merging.
2. Confirm a disposable MongoDB target before running scripts that insert/delete records.
3. Before Phase 1, decide immediate suspension semantics, refresh-token revocation, treatment of in-progress exams and teacher-vs-admin permissions.
4. Before Phase 1, define safe lesson HTML features, upload file types/size ceilings and whether external material URLs are allowed.
5. Before Phase 2, define deadline grace, timeout grading, attemptLimit=0, cross-tab policy and how old ungraded attempts should be treated.
6. Before Phase 3, define report scope: latest attempt vs all attempts, ties, expired attempts, date range and role visibility.
7. Before Phase 4, confirm grid/column breakpoints, lesson difficulty values, PDF viewer policy and enrollment confirmation interaction.
8. Obtain a staging URL, test accounts, representative data, device/browser access and an approved load profile for verification/release.

## Recommendation and Phase 1 readiness

The source investigation is sufficient to begin Phase 1 planning and threat modeling. Implementation should start after decisions 3 and 4 are recorded and a disposable test database is confirmed. First map every authenticated route to its status/role middleware, then agree file/content policy, and only then change shared auth or file-serving paths. Do not change teacher permissions by inference.

## Sources

- Google Doc test plan: linked above; text and all table cells were extracted.
- Current source at commit d8b5c49; line evidence in 02-source-gap-analysis.md and 04-defect-backlog.md.
- Historical UAT and TOEIC scan audit documents listed in 00-system-baseline.md; historical results are not current case executions.
