# Phase V5A — Regression Test Results

Chạy trong Vocabulary worktree cô lập trên Node `v22.18.0` / npm `10.9.3`. Không dùng database ứng dụng.

| Scope | Command / suite | Kết quả |
|---|---|---|
| Parser V2.1 | `npm run test:vocabulary-parser-v2` | 9 PASS, 1 SKIP (30 DOCX source acceptance) |
| Catalog V1 | `npm run test:vocabulary-catalog-v1` | 9/9 PASS |
| V1.1 integration | `npm run test:vocabulary-integration-v1-1` | 2 SKIP (source root/reference/hash inputs và private golden root chưa cấu hình) |
| Import V3A | `npm run test:vocabulary-import-v3a` | 8/8 PASS |
| Import V3B API/model | `npm run test:vocabulary-import:unit` | 6/6 PASS |
| V3B browser mock | `npm run test:vocabulary-import:mock:e2e` | PASS |
| V3B isolated backend browser | `npm run test:vocabulary-import:real:e2e` | PASS |
| Catalog Admin V4A | `npm run test:vocabulary-catalog-v4a` | 9/9 PASS |
| V4A real backend browser | `npm run test:vocabulary-catalog-v4a:real:e2e` | PASS |
| Student Catalog V4B | `npm run test:vocabulary-student-catalog-v4b` | 9/9 PASS |
| V4B browser mock | `npm run test:vocabulary-catalog-v4b:mock:e2e` | PASS; 390px; 0 progress writes |
| V4B isolated backend browser | `npm run test:vocabulary-catalog-v4b:real:e2e` | PASS; direct hidden statuses 404; 0 progress writes |
| Publication V5A | `npm run test:vocabulary-publication-v5a` | 9/9 PASS |
| Publication Admin→Student browser | `npm run test:vocabulary-publication-v5a:real:e2e` | PASS; synthetic DOCX, idempotent lost-response retry, Hide/Archive, 390px |
| Phase 1 Security | `npm run test:phase1` | 19/19 PASS |
| Phase 2 core | `npm run test:phase2` | 20/20 PASS |
| TOEIC Part 5 backend import | `npm run test:phase2-import` | 6/6 PASS |
| Phase 3 API/progress/reporting | `npm run test:phase3` | 13/13 PASS |
| Phase 4 learning | `npm run test:phase4` | 5/5 PASS |
| Phase 5 backend CORS/Part 5 | `npm run test:phase5` | 2/2 PASS |
| TOEIC Part 5 frontend unit | `npm run test:toeic-part5:unit` | 9/9 PASS |
| TOEIC Part 5 browser mock | `npm run test:toeic-part5:mock:e2e` | PASS |
| TOEIC Part 5 real backend browser | `npm run test:toeic-part5:real:e2e` | PASS |
| TOEIC Part 5 bank browser | `npm run test:toeic-part5:bank:e2e` | PASS |
| Frontend production build | `npm run build` | PASS; Vite warns that one minified chunk is >500 kB |
| Backend `npm audit` | full audit | 0 vulnerabilities |
| Frontend `npm audit` | full audit | 0 vulnerabilities |

## Unresolved regression result

`npm run test:e2e:phase5` **FAIL**: case `DOC_02 — Download authorized PDF material` waits for a browser `download` event at `frontend/e2e/phase5-browser.mjs:606` and times out after 10 seconds. The run reaches Chrome and then exits non-zero. The Vocabulary release selection changes no material-download implementation or TOEIC Part 1/5 files. Cause was not determined, so this is recorded as a failure rather than attributed to environment or declared PASS.

## Source acceptance gate

Real 30-DOCX/711-occurrence acceptance was SKIPPED, not passed. Default `local-assets/vocabulary-source`, Phase 0 locator/hash CSV paths, and private golden root are absent from this checkout; no `VOCABULARY_DOCX_*` variables were set. No real source DOCX was opened, imported, Confirmed or Published. Historical reports under Phase 2 are not a substitute for this run's acceptance.

The suite results prove isolated structural/backend/browser behavior only. They do not prove real DB baseline, production application integration, access-policy approval, deployment or production readiness.
