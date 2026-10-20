# Regression Report

## Summary

The existing Phase 1 changes were preserved. The pre-Phase 2 checkpoint includes the original working-tree patch and copies of Phase 1 files/docs. No reset, stash, checkout to the Phase 0 commit, or history rewrite was performed. Phase 2 edits were applied on top of the existing working tree.

## Executed regression evidence

- `npm run test:phase1`: **18/18 PASS** after the Phase 2 download changes.
- These fixtures cover student status/session policy, refresh/token cutoff policy, material enrollment/publication/download policy, private upload URL access, static private-file denial, upload policy/signature/size behavior, lesson HTML sanitization, media URL sanitization, and upload rejection cleanup.
- `npm run test:phase2`: **20/20 PASS**, including filename and binary-stream helper checks and the new engine/lifecycle mock tests.
- Backend syntax checks, frontend production build, and `git diff --check`: PASS.

## Phase 1 protection review

- Material download continues through `verifyToken` and `evaluateMaterialAccess`; no static public route was added or widened.
- Account status, enrollment, lesson/material publication, ownership, and `allowDownload` policy code was not replaced by a download shortcut.
- `Content-Disposition` is the only CORS exposed-header addition. Existing origin and credentials policy was not widened.
- Lesson attachments remain in private uploads; `originalName` is optional metadata only.
- Earlier `AUTH_03`, `ADM_U_02`, `NON_SEC_01`, `NON_FILE_01`, and `NON_FILE_02` scenario statuses remain **BLOCKED** as in the Phase 1 report; their unit fixtures do not establish full database/browser scenarios.

## Exam regression review

- Standard status remains `submitted`; TOEIC remains `completed`.
- Question snapshots and the existing TOEIC score mapping are preserved.
- Existing terminal attempts are returned idempotently and are not regraded.
- A positive attempt limit counts both `submitted` and `completed`; zero remains unlimited.
- Student history endpoints retain their response shape and now also finalize due expired active attempts before returning history.
- Student/owner authorization remains before attempt mutation. Wrong-engine paths reject before scoring/writes.

## Not established by this report

No database-backed API test or browser test was run. Therefore actual MongoDB index behavior, cross-request races, visible responsive layout, browser clock/countdown behavior, and protected endpoint download headers remain pending. See `04-test-results.md` and `06-remaining-risks.md`.
