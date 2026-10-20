# TOEIC Phase 1 — Security & Access Control

## Executive summary

Phase 1 implements the four in-scope controls: safe lesson HTML, authorization-aware material file delivery, shared upload validation, and consistent student account-state enforcement. Source-level fixes and isolated automated tests are in place. No database migration, seed, live database test, attempt/scoring change, deployment, or commit was performed.

**Overall status: PARTIAL — not deployment-ready.** The Phase 1 unit suite and frontend build pass, but database-backed API compatibility remains blocked because no disposable MongoDB target was verified. The 50 MiB lesson/material cap also needs confirmation against the production file corpus. Vercel storage persistence and public TOEIC page-image exposure need explicit follow-up.

## Defect status

| Phase 0 defect | Implementation status | Evidence / remaining gate |
|---|---|---|
| TOEIC-DEF-001 — unsafe lesson HTML | Implemented | Server write/read and React render sanitizers; rich-text and active-payload unit fixtures pass. Browser rendering was not run. |
| TOEIC-DEF-002 — public material URL bypass | Implemented | Private and legacy referenced URLs are authorization-gated; direct-middleware access fixtures pass. Real MongoDB records and deploy storage remain unverified. |
| TOEIC-DEF-003 — inconsistent uploads | Implemented with a policy decision pending | Shared extension/MIME/signature/size/filename/error handling is wired to all inventoried upload routes. The isolated Multer/HTTP harness passes; production route aliases and the real 50 MiB corpus boundary remain unverified. |
| TOEIC-DEF-004 — suspension enforcement | Implemented | Shared student-state checks cover access and refresh; suspended legacy sessions and refresh denial pass mocked middleware tests. Database-backed suspend/reactivate flow is unverified. |

## Read these reports

1. [Security decisions](00-security-decisions.md)
2. [Implementation report](01-implementation-report.md)
3. [API security matrix](02-api-security-matrix.md)
4. [Regression test report](03-regression-test-report.md)
5. [Remaining risks and follow-up](04-remaining-risks.md)

## Phase boundary

No Phase 2 Exam Engine or Attempt Integrity work was started. Attempt lifecycle, answers, scoring, learner progress, and reporting were not changed. Phase 1 should not be marked fully accepted until the blocked checks and deployment decisions in the remaining-risk report are resolved.
