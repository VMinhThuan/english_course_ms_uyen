# Exam Engine Baseline

## Scope and evidence

This baseline was taken from the Phase 2 working tree after preserving the existing Phase 1 changes. Repository base: branch `main`, HEAD `d8b5c49b0e6fb73e7f414798ae077a9ce713f001`; the tree already contained uncommitted Phase 1 code and audit documents. A recoverable checkpoint was created outside the repository at `C:\Users\LEGION\AppData\Local\Temp\toeic-phase1-pre-phase2-20261020-933fc2db66b7438cb7ce4e9a508ca95d` before Phase 2 edits. No reset, stash, commit, push, merge, or deploy was performed.

Phase 0/1 documents were read from `docs/audits/toeic-phase0/` and `docs/audits/toeic-phase1/`. The shared Master Test Plan is [the Google Doc](https://docs.google.com/document/d/19mooB-jlPZGBWXZkFg6fWwnYFGtbVDojg-aOo8uPCPs/edit?tab=t.0); its exam, security, history, homework, and document cases are mapped in `04-test-results.md`.

## Architecture

- **Assessment configuration:** `backend/src/models/Assessment.js` stores `examFormat` (`standard` or `toeic`), duration, attempt limit, question references, and availability. `attemptLimit = 0` means unlimited.
- **Shared persistence:** `backend/src/models/Attempt.js` stores owner, assessment, question/group snapshots, answer map, flags, revision, status, score, duration, expiration, and TOEIC breakdown. A partial unique index permits one `in_progress` attempt per student/assessment.
- **Standard routes:** `assessmentRoutes` starts Standard attempts; `attemptRoutes` saves, submits, returns results, and lists history.
- **TOEIC routes:** `toeicRoutes` starts/resumes TOEIC attempts, reads the attempt, saves, submits, and returns TOEIC history.
- **Shared answer save:** the same controller code is bound to route-specific expected engines so a TOEIC attempt cannot be saved through the Standard route or vice versa.
- **Scoring:** Standard applies question snapshot answers, exact multiple-choice matching, normalized typed answers, and pass score. TOEIC preserves the current question/part counts and `calculateEstimatedListeningScore` / `calculateEstimatedReadingScore` mapping.
- **Material access:** Phase 1 private-upload middleware, account checks, enrollment/published/ownership policy, and `allowDownload` continue to gate downloads. The public static route was not reopened.

## Baseline differences and root causes

| Area | Source-observed baseline | Failure mechanism |
|---|---|---|
| Standard timer | `frontend/src/pages/TestPage.jsx` displayed the countdown but only cleared its interval at zero. | No timeout submission/finalization was initiated by the Standard page. |
| Expiry | Standard and TOEIC start/autosave paths could mark an attempt terminal and set `isExpired` without calculating score/counts/breakdown. | A terminal record could be submitted but ungraded. |
| Late submit | Submit paths accepted `req.body.answers` with a ten-second grace window, even after the deadline. | Answers sent after the deadline could replace the saved answer map and affect score. |
| Engine routing | The shared Attempt had no engine discriminator; Standard and TOEIC submit handlers used different scorers and did not check assessment format before scoring. | A wrong-engine route could grade a shared record with the wrong formula. |
| Concurrent edits | TOEIC had a revision check that rejected only lower revisions; equal/missing revisions could still write. Standard autosave had no revision. Both used read/merge/save. | Two tabs could submit writes from stale reads and overwrite newer values. |
| Student list | Standard available assessments had no per-student attempt summary. TOEIC made per-assessment active/last-attempt queries and did not return count/remaining-attempt fields. | Students could not tell whether a test was active, used, or exhausted. |
| Submit confirmation | Standard displayed an unanswered count; TOEIC displayed a count only. | Students were not told which questions were unanswered. |
| Search and choice UI | Assessment lists had mode/type filters only. Standard choice options were clickable divs styled as radio circles; TOEIC rendered radio controls for all choice questions. | No text search; multiple choice lacked a distinct checkbox interaction and accessible native controls. |
| Attempt limit | Backend did return a limit code in some paths, while Standard used an English message; the pages could present a generic full-page error or alert. | The limit state was not a localized, context-preserving result. |
| Download filename | Material metadata contained title, file path/URL, and detected file type, but no original filename. The controller used `res.download(filePath, title)` and LessonPage set `a.download` to `material.title`. | A display title without suffix was used as the saved filename. |

## Current Phase 2 data model additions

- `Attempt.engine` is an optional enum (`standard` / `toeic`) written for new attempts and on finalization/save. It is additive; no backfill or migration was run.
- Attempt `revision` remains the per-attempt optimistic concurrency value. Legacy missing revision is treated as revision 1 and matched with an `$exists:false` alternative.
- `Material.originalName` and `Lesson.attachments[].originalName` are optional metadata. Existing documents remain readable without backfill.
- No new database index or collection was added.

## Source locations

- `backend/src/controllers/attemptController.js`
- `backend/src/controllers/toeicController.js`
- `backend/src/utils/attemptLifecycle.js`
- `backend/src/models/Attempt.js`
- `backend/src/models/Material.js`
- `backend/src/controllers/materialController.js`
- `frontend/src/pages/TestPage.jsx`
- `frontend/src/pages/StudentToeicExamPage.jsx`
- `frontend/src/pages/StudentAssessmentsPage.jsx`
- `frontend/src/utils/materialDownload.js`
