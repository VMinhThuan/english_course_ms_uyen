# Phase 4 regression and verification report

## Automated suites

| Test suite | Passed | Failed | Blocked | Not run |
|---|---:|---:|---:|---:|
| Phase 1 security (`npm run test:phase1`) | 18 | 0 | 0 | 0 |
| Phase 2 exam/download (`npm run test:phase2`) | 20 | 0 | 0 | 0 |
| Phase 3 integration/report (`npm run test:phase3`) | 13 | 0 | 0 | 0 |
| Phase 4 learning API (`npm run test:phase4`) | 5 | 0 | 0 | 0 |
| Backend syntax (`node --check` on `src` and `tests`) | 90 files checked | 0 | 0 | 0 |
| Frontend production build | PASS; 253 modules transformed | 0 | 0 | 0 |
| Browser/responsive QA | 0 | 0 | 0 | NOT_RUN by user preference |

Phase 3 and Phase 4 integration suites used unique `MongoMemoryServer` databases bound to `127.0.0.1`. Phase 4 PDF fixtures were written under a unique test-owned private-upload subfolder and individually removed during cleanup. No production or shared database was contacted.

## Phase 4 integration coverage

- Difficulty create accepts/normalizes supported enum; update and null clear work; invalid create/update rejected; legacy unset stays unset.
- Preview requires authentication, enrollment, published material/lesson and `allowDownload`; restricted/unpublished requests return no file.
- PDF preview returns inline PDF/security headers; downloads remain attachment, preserve UTF-8 filename extension, and preserve bytes.
- Corrupt signature, non-PDF MIME, oversize, and external HTTPS preview are rejected without proxying.
- Vocabulary search supports Vietnamese accent-insensitive match, topic combination, escaped regex input, stable asc/desc ordering, pagination, invalid sort rejection, hidden-word exclusion, and legacy unbounded response compatibility.

## Security and API compatibility

- Phase 1 security suite passes without changes to its policy.
- Phase 2 download/filename suite passes; download route contract is unchanged.
- New preview response is private/no-store, inline, nosniff, and never exposes a storage path.
- Vocabulary pagination is opt-in via new query parameters; calls without them retain the previous full-list response/order. The UI now opts in explicitly.
- Difficulty adds an optional API field; no existing response is removed.
- No production dependency was added for the native PDF iframe. Phase 4 added only a backend test script and API tests.
- No new Mongoose index was introduced.

## Build/performance

Vite build completed with 253 transformed modules. Current main JS is 699.87 kB minified compared with the Phase 3 report's approximately 685.80 kB, a roughly 14.07 kB increase. Vite still reports a chunk over 500 kB; PDF.js worker/chunks are already present for existing assessment functionality and were not added for Phase 4 preview.

## Dependency audit snapshot

`npm audit --omit=dev --json` on 2026-10-20 reported:

- Backend: 10 production advisories — 6 moderate, 3 high, 1 critical.
- Frontend: 7 production advisories — 1 moderate, 6 high, 0 critical.

No automated or broad dependency upgrade was applied. Package changes visible relative to Git HEAD include earlier Phase 1–3 setup; the Phase 4 checkpoint confirms the Phase 4 change added no production dependency. Track advisories in `08-remaining-risks.md`.
