# 06 — Full regression results

| Check | Result | Evidence |
|---|---|---|
| Backend Phase 1 Security | 18/18 passed | evidence/test-phase1.log |
| Backend Phase 2 Exam/Downloads | 20/20 passed | evidence/test-phase2.log |
| Backend Phase 3 Admin/Reporting | 13/13 passed | evidence/test-phase3.log |
| Backend Phase 4 Learning API | 5/5 passed | evidence/test-phase4.log |
| Phase 5 Playwright E2E | 36/36 passed | evidence/browser-e2e-results.json + screenshots |
| Frontend production build | Passed with chunk-size warning | evidence/frontend-build.log |
| JavaScript syntax | 90 backend/E2E files; no syntax errors | Phase 5 terminal check |
| git diff --check | Passed | evidence/git-diff-check.log |
| npm audit frontend full/production | 0 vulnerabilities | evidence/frontend-audit-*.json |
| npm audit backend full/production | 3 Moderate; 0 High/Critical | evidence/backend-audit-*.json |

The four backend suites were rerun after the final backend controller edit. The browser E2E run followed the UI/API fixes. Master Test Plan status remains separate from suite totals in 10-final-master-test-matrix.csv.

The browser exercised auth/status, dashboard, lesson/material/PDF, vocabulary, exam lifecycle, student admin, reporting, and viewport flows. PDF download bytes, size and SHA-256 were verified. No production-like data was used.

Vite build succeeded in 4.86 s. Main minified JS is 756.59 kB (205.73 kB gzip); PDF worker is 1,264.34 kB. Vite warned that chunks exceed 500 kB. The working tree is intentionally dirty; passing whitespace checks do not imply review or release.

