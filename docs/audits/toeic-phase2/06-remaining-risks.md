# Remaining Risks and Release Gates

## Verification gates

1. **Disposable MongoDB integration is pending.** No target was verified, so attempt documents were not created or mutated in a database. Validate the partial unique index, `$or` CAS for missing revision, `findOneAndUpdate` validators, concurrent autosave/submit/expiry, attempt-limit counting, engine-mismatch non-mutation, and history recovery on an isolated database.
2. **Browser/responsive verification is pending.** Verify 1366×768, 1440×900, 768×1024, 375×812, and 390×844. Check countdown/auto-submit, conflict/reload, list search/status, unanswered question numbers, keyboard radio/checkbox controls, attempt-limit notices, and actual saved filename.
3. **Protected download endpoint is not integration-tested.** Unit tests prove filename/header helpers and byte equality through the extracted stream helper only. They do not prove auth/CORS/controller headers, missing-file handling, browser save behavior, large-file memory, or interruption recovery.

## Data and legacy records

- `Attempt.engine`, `Material.originalName`, and lesson attachment `originalName` are additive optional fields; no migration or backfill is necessary for the code path. Review production Mongoose schema/index behavior before release.
- Legacy attempt engine is inferred from the associated Assessment `examFormat`. If assessment/format is absent or contradicts stored engine, the code fails closed. Produce a read-only inventory of unresolved legacy attempts before enabling release; do not auto-correct them.
- Legacy attempt revision missing in Mongo is CAS-matched as revision 1. Validate this `$exists:false` branch against the deployed MongoDB version/index state.
- Existing ungraded expired historical attempts are finalized only when a student invokes a resume/list/history/result path. This avoids bulk migration but does not immediately repair every stale record.
- Terminal historical attempts are not rescored. Their previous scoring fields remain untouched.

## Runtime/API risks

- Updated clients send revision. Older cached/mobile clients that omit revision will receive HTTP 428 for active saves or pre-deadline manual submit. Deploy backend and frontend together and invalidate stale client bundles as appropriate.
- If the last answer change has not reached the server before the deadline, timeout finalization intentionally grades the last accepted server copy. Browser/browser-network timing must be checked in a safe test environment.
- A stale tab receives an explicit conflict and must reload before continuing. No automatic merge is attempted because it could silently restore an older answer.
- No scheduler/cron was added. Expired attempts are finalized on the next relevant request; a student who never returns can leave an expired record marked `in_progress` temporarily.
- A generic/unsupported legacy `fileType` returns `application/octet-stream`. The filename extension is not invented from an unsupported MIME; inspect such legacy files separately if richer MIME fidelity is required.
- Legacy `fileType` metadata is not re-sniffed from file bytes during download. New uploads store the MIME returned by the Phase 1 signature validator; older records rely on their stored metadata and should be inventoried if their MIME provenance is unknown.
- External HTTPS material links still redirect/open through their provider; the provider controls the final filename and response headers.
- The browser download uses Blob/object URL behavior. The URL is revoked after the click; full large-file streaming from browser to disk is not established by current tests.

## Security and phase boundary

- No protected static route was opened. Material access policy and `allowDownload` checks remain in path.
- The Phase 1 route/upload risks retained in its report remain outside Phase 2.
- No Phase 3 admin/reporting features or Phase 4 PDF viewer were implemented.

## Phase 3 readiness

Phase 3 design and implementation can use the current attempt contract: Standard terminal status is `submitted`, TOEIC terminal status is `completed`, and finalized records contain score/count fields plus TOEIC breakdown where applicable. Student list APIs expose attempt count, remaining attempts, active attempt, and latest terminal summary. Reporting must treat only terminal attempts as scored results; an expired record can remain `in_progress` until a resume/list/history/result request triggers catch-up finalization. Validate these queries and status counts against disposable MongoDB before accepting Phase 3 reports as production data.

Recommendation: **ready to begin Phase 3 implementation against the documented API/state contract; not release-ready until Phase 2 database/API and browser gates pass.**

## Release recommendation

Status is **IMPLEMENTED_PENDING_VERIFICATION**, not production-ready. Do not run against production/staging as a substitute for disposable integration testing. Complete the database/API and browser gates, then review any unresolved legacy engine inventory before release.
