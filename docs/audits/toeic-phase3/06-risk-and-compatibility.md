# Phase 3 risk and compatibility

## Production and deployment gates

1. **Mongo index rollout:** no production migration or index build was run. Before release, inspect production MongoDB version/topology and existing data, check duplicate or explicit-null usernames, then build/verify `User.username` sparse unique, `Attempt.assessment_startedAt_report`, `Course.course_students_lookup`, and `Lesson.lesson_course_status_order` in a controlled window. If Mongoose `autoIndex` is disabled, model declarations alone do not create them.
2. **Teacher scope:** `adminRoutes` currently grants admin and teacher roles to all admin routes. Student creation, profiles, progress, history and reports do not enforce teacher ownership. This preserves the existing route-level role contract but may not match a product policy where teachers only manage assigned learners. Confirm before exposing teacher access in production.
3. **Browser validation:** student create modal, result table, detail tables, mobile layout, keyboard behavior and browser console have not been checked in a browser. Build success does not establish visual/runtime correctness.
4. **Runtime compatibility:** integration uses an in-memory MongoDB binary, not the deployed MongoDB server/version or production indexes. Run an isolated staging compatibility check before release.

## Data and behavior compatibility

- `User.username` is optional/lowercase; existing accounts without username continue to authenticate by email/phone. Sparse uniqueness permits missing keys, but preflight duplicate explicit values/nulls before index creation. No backfill ran.
- New admin accounts are immediately `student`, `active`, `isActive=true`; public registration continues to create `pending` accounts. Admin creation does not send email or issue credentials outside the creation request.
- Initial passwords follow the existing six-character minimum and an explicit 72-byte UTF-8 ceiling for bcrypt. There is no first-login reset flag or password delivery workflow in this change.
- Terminal attempts with incomplete or inconsistent historical score evidence remain `LEGACY_UNVERIFIED`; they are not rescored or repaired by report GET. Expired `in_progress` attempts remain pending in reports until an existing Phase 2 lifecycle route finalizes them.
- Course membership combines Enrollment and legacy `Course.students`. Legacy membership without an Enrollment has `enrolledAt: null`. Only published lessons contribute to progress.
- Reports preserve `assessment`/`student`/`status` input aliases and `attempts` response alias. Requiring `assessmentId` changes the old unbounded results call: clients must select an assessment and handle `ASSESSMENT_REQUIRED`.
- Admin profile not-found remains HTTP 404 without a stable code, unlike the new report endpoints. This API consistency gap is left unchanged.

## Performance and pagination

- Student search is server-side, length-limited, Unicode-aware and regex-escaped, and pages at most 100 results. It searches fullName/email/username/phone without a normalized search field/index; a large User collection can require a scan. Benchmark with representative data before relying on it at scale.
- Assessment reports require one assessment, match assessment and optional `startedAt` through a new compound index, and bound result rows to 100. Summary facets still process every matching attempt for the selected assessment. Student-name sort performs identity lookup before pagination. No representative load benchmark was run.
- Student progress avoids per-lesson N+1 lookups for aggregate course stats and fetches only one lesson page for detail rows. It currently loads all matching course documents/stat rows before slicing the course list. Large student course counts need measurement.
- Numeric offset pagination returns deterministic order for a single query, including an attempt-ID tie-break. A new high-ranking result can shift offsets between requests; there is no cross-page snapshot/cursor token. The Mongo test confirms updated totals/order after insertion, not snapshot isolation.

## Security review limits

Implemented checks include admin/teacher middleware, student denial, rechecking suspended account state, ObjectId/query validation, bounded limits, whitelisted sort/state/type/engine, escaped search, duplicate-index race handling, password response redaction and answer/snapshot projection exclusion. Integration tests cover representative IDOR/RBAC and injection-like input; this is not a broad penetration test or production threat-model signoff.

The `safeStudent` and report DTOs include student name/email/username for authorized admin views. Review organizational privacy requirements for teacher access and export before deployment. No sensitive values are added to logs.

## Dependency and build advisories

At the time of the local `npm audit --omit=dev`, the production lockfile reported **10 advisories**: 6 moderate, 3 high and 1 critical. Reported package names were `argparse`, `body-parser`, `express`, `lodash`, `mammoth`, `mongoose`, `path-to-regexp`, `proxy-addr`, `qs`, and `sprintf-js`; `express` and `mongoose` were direct dependencies, others indirect except `mammoth` also direct. No dependency remediation was made in Phase 3 and no prior-lock audit comparison was run, so these cannot be attributed as newly introduced here. Triage/update under a separate dependency change with regression tests.

Vite warns that the main minified JavaScript chunk is 685.80 kB, above its 500 kB advisory. No bundle split or redesign was in Phase 3 scope.

## What remains unverified

- Browser, responsive, actual user interaction, and console checks.
- Production/staging behavior, Mongo version/index creation time, high-volume queries, and load.
- Teacher ownership/assignment policy.
- Data quality of historical attempts missing score metadata and legacy course/user records beyond the test fixtures.
- Security triage of current production dependency advisories.
