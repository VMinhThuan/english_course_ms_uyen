# Phase 2 — Exam Engine, Attempt Integrity, UI and Downloads

## Executive summary

Implemented code changes for all 11 Phase 2 defects: TOEIC-DEF-005–014 and TOEIC-DEF-025. Standard Assessment and TOEIC now use an explicit engine-aware finalization contract, deadline-authoritative scoring, revision compare-and-swap for saves, and immutable terminal results. Student lists now include search and attempt summaries; both exam UIs show unanswered question numbers and single/multiple choice controls. Protected material downloads now return a sanitized UTF-8 filename, a supported extension, and the corresponding MIME type recorded by upload validation for new files.

**Implementation status:** 11/11 defects have code changes. **Release status:** `IMPLEMENTED_PENDING_VERIFICATION`; MongoDB integration and browser/responsive checks were not run. No production readiness claim is made.

## Defects

| Status | Defects |
|---|---|
| Implemented, pending integration/browser verification | TOEIC-DEF-005, 006, 007, 008, 009, 010, 011, 012, 013, 014, 025 |
| Remaining implementation | None identified in the requested Phase 2 scope |

## Test summary

- Phase 2 pure/mock and local-stream tests: 20 passed (latest run recorded in `04-test-results.md`).
- Phase 1 security regression suite: 18 passed.
- Backend syntax checks: pass.
- Frontend production build: pass; Vite reports an existing large-chunk warning.
- MongoDB integration/API tests: blocked because no disposable MongoDB target was identified and verified.
- Browser, responsive viewports, real downloaded filename, and runtime console: not run.

## Remaining risks and readiness

The backend requires `revision` for active pre-deadline autosave and manual submit. Deploy the updated frontend and backend together. Legacy attempts infer their engine from the assessment format; missing/contradictory engine data fails closed. Revision 1 handles legacy attempts with no stored revision without a data migration. Expired attempts are finalized on resume, result, assessment-list, or history requests; no scheduler is added, so an untouched expired record remains `in_progress` until one of those requests arrives.

Do not treat this report as release approval. See [06-remaining-risks.md](./06-remaining-risks.md).

## Generated reports

- [00-exam-engine-baseline.md](./00-exam-engine-baseline.md)
- [01-attempt-state-and-scoring-contract.md](./01-attempt-state-and-scoring-contract.md)
- [02-implementation-report.md](./02-implementation-report.md)
- [03-api-contracts.md](./03-api-contracts.md)
- [04-test-results.md](./04-test-results.md)
- [05-regression-report.md](./05-regression-report.md)
- [06-remaining-risks.md](./06-remaining-risks.md)
- [07-phase2-defect-matrix.csv](./07-phase2-defect-matrix.csv)
