# DEF-022 / DEF-023 / DEF-024 — Notices, enrollment, and difficulty

## DEF-022 — Semantic feedback

Lesson feedback now carries a semantic type (`success`, `error`, or `info` where relevant). CSS maps each type to matching design-system tokens; errors no longer inherit the prior green success style. Errors use `role="alert"` and assertive announcement; other notices use `role="status"` with polite announcement. Download failure decodes JSON error Blobs and reports an actionable Vietnamese message. External links report an informational state.

## DEF-023 — Enrollment dialog

The old full-page route is retained as a redirect to course detail. Student and public course-detail contexts can open a native `<dialog>` showing the course name, explanatory copy, cancel, and confirm actions. Opening and canceling do not call the enrollment API. Confirm is the only submit path; a synchronous ref and disabled controls prevent a second request while pending. Error responses stay in the modal context. Native dialog behavior supplies Escape/focus containment/return, and body scrolling is locked while open.

Guest enrollment retains the course context in the login redirect. Student account-state checks and enrollment authorization remain backend-owned. No enrollment handler, duplicate-enrollment rule, or payment behavior was changed.

## DEF-024 — Lesson difficulty

- Added optional `Lesson.difficulty` with `beginner`, `intermediate`, `advanced`, or `null`.
- No default, data migration, backfill, or new Mongoose index is added. Existing unset documents remain unset.
- Create/update endpoints validate and normalize the field; invalid values return `INVALID_LESSON_DIFFICULTY`.
- Both Admin lesson create/edit and teacher lesson create/edit forms expose an optional Vietnamese selector.
- Student course lesson rows and lesson detail show a localized badge only when a recognized value exists. Legacy unset values are not shown as a fabricated level.
- The scale is a proposed implementation choice, not a difficulty policy confirmed by the Master Test Plan.

## Verification and limits

The Phase 4 integration test verifies omitted legacy value, all key create/update/clear validation paths, and rejected invalid create/update values. Component interactions for modal cancel/confirm/double-click/focus/keyboard/mobile and notice color/announcement still require browser QA. No browser UI test was run.
