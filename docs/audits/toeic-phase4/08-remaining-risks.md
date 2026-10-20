# Phase 4 remaining risks and Phase 5 prerequisites

## Unverified behavior

- Product browser QA remains `NOT_RUN`: student/public route refresh and browser back, drawer touch/keyboard, modal focus/escape/cancel/double-submit, notice appearance, difficulty form UX, vocabulary/flashcard keyboard use, and PDF rendering/mobile scroll.
- The Master Test Plan's text/table content was read; all 31 embedded images remain `VISUAL_REFERENCE_UNAVAILABLE`. Re-open them through an authorized document export/viewer before visual sign-off.
- No screenshots, device matrix, console inspection, or screen-reader result exists.
- The backend test harness verifies endpoints and bytes, not native browser PDF rendering, object-URL lifetime under real navigation, or browser download behavior.
- The final Vite build has a main chunk at 699.87 kB and an existing chunk-size warning. The initial bundle rose approximately 14.07 kB from the Phase 3 report; no full performance benchmark was run.

## Product/security policy

- `allowDownload=false` yields no bytes under the current Phase 1 policy. If product requires “view but not download,” define a separate permission before changing the endpoint.
- Lesson difficulty `beginner/intermediate/advanced` is a suggested scale from the Phase 4 task. Confirm terminology with the product owner before treating it as the canonical curriculum taxonomy.
- PDF preview's 25 MiB limit is a bounded implementation choice, not a confirmed storage business limit. Range requests, large-document memory behavior, interrupted requests, and browser-native renderer support remain untested.
- External HTTPS material URLs are opened directly and are not proxied. Provider CSP/X-Frame-Options may preclude inline viewing.

## Data and compatibility

- `Lesson.difficulty` is optional; legacy records remain unset/null, with no backfill, migration, or index.
- New vocabulary UI sends explicit pagination/search/sort parameters. Legacy API requests with none keep the old full-list ordering. Very large legacy requests remain unbounded for contract compatibility; Phase 5 may evaluate a versioned/paged contract.
- Enrollment route and handlers are unchanged. The modal control path itself has no automated component/browser test; double-submit prevention is source-verified only.
- No real/staging DB migration, upload, enrollment transaction, or deployment was performed.

## Dependency advisories

As of the audit run on 2026-10-20, backend production dependencies have 10 advisories (6 moderate, 3 high, 1 critical), including direct `mongoose` and `express` entries and transitive packages. Frontend production dependencies have 7 (1 moderate, 6 high), including `axios`, `react-router-dom`, and `pdfjs-dist`. These advisories were already present in the Phase 4 pre-implementation package snapshot; Phase 4 preview introduced no new runtime dependency. Triage by advisory reachability and upgrade compatibility before release. Do not treat test/build success as advisory remediation.

## Phase 5 regression/release prerequisites

1. Perform browser smoke tests for Phase 4 at agreed desktop, tablet, and mobile viewports; capture before/after screenshots and console output.
2. Review the 31 embedded Master Test Plan images via an authorized export and confirm the two-column/catalog breakpoint and lesson-footer behavior.
3. Run the full 62-case Master Test Plan, recording each case as PASS/FAIL/BLOCKED/NOT_RUN with evidence; Phase 1–4 suites are not a substitute for it.
4. Exercise student role/status/enrollment and legacy material records in a disposable staging-like environment; do not use production for test writes.
5. Verify target browser PDF rendering, download bytes/name, network loss, large-file UX, and supported mobile browsers.
6. Triage production dependency advisories, especially the critical backend finding and high frontend findings, with focused regression tests.
7. Run agreed performance/load checks and complete deployment, rollback, backup, and release sign-off controls.

**Readiness:** ready to enter Phase 5 regression with explicit pending items above; not release-ready.
