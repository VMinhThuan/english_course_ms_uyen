# 03 — Regression test report

## Safe checks executed

| Check | Status | Evidence |
|---|---|---|
| Phase 1 backend unit/mock suite | PASS | `cd backend; npm run test:phase1` — 18 tests passed, 0 failed. Uses mocked User/Mongo access, temporary files, and an isolated local Express/Multer harness. |
| Backend JavaScript syntax | PASS | `node --check` on all 80 JavaScript files under `backend/src` and `backend/tests`. |
| Frontend production build | PASS | `cd frontend; npm run build` — Vite 5.4.21 completed. Warning: main JS chunk 650.49 kB exceeds Vite's 500 kB advisory threshold. |
| Lint | NOT_RUN | No lint script is defined in the backend or frontend package scripts. |
| Database/API integration | BLOCKED | No disposable MongoDB target was verified. `MONGODB_URI` and `.env` were not read; no data-writing test was run. |
| Isolated multipart middleware harness | PASS | Real Multer/Express request fixtures verify extension, MIME, signature, small configured size cap, missing-file error, random filename, and cleanup after validation/controller failure. |
| Production upload-route/API integration | BLOCKED | The harness does not mount every production route alias or use MongoDB/production-size bodies. No isolated DB was verified. |
| Browser smoke / UI behavior | NOT_RUN | No browser/computer-use smoke test was run. |
| Production deployment | NOT_RUN | No deploy or remote project runtime check was performed. |

No `npm run test:all`, seed, migration, live DB test, or database-writing test was executed.

## Phase 1 unit coverage

1. Student status codes for active, suspended, inactive, pending, rejected, and non-student roles.
2. Existing access-token middleware re-reads mocked user state and denies pending/rejected/suspended users.
3. Refresh handler rejects suspended/pending state and clears root-scoped plus legacy auth-scoped cookie paths.
4. Tokens issued before/during suspension remain invalid after reactivation.
5. Material policy requires active account, enrollment, publication, and download permission.
6. Direct private URL middleware denies anonymous, suspended, unenrolled, unpublished, and download-disabled requests; allows an authorized enrolled user with private/no-store and nosniff headers.
7. Public image pass-through and unknown private-file denial.
8. Admin and owning-teacher access retained; other teacher denied.
9. Upload path normalization and root containment reject traversal.
10. External material links require HTTPS and reject credentials/unsafe whitespace.
11. Server lesson sanitizer keeps supported rich text and strips active content.
12. Malformed, empty, and non-string legacy lesson content is handled safely.
13. Lesson media URL sanitizer accepts only HTTPS or safe app upload paths.
14. Public lesson discovery sanitizes content and hides local attachment URLs.
15. Legacy test API sanitizes populated lesson content and hides local student attachment URLs.
16. Upload extension/MIME/signature rules, stable limit configuration, and representative PDF/JPEG samples.
17. Isolated multipart errors, size mapping, required-file handling, server-generated names, and cleanup.
18. User filenames/path components do not become disk filenames or display paths.

## Required Phase 0 regression cases

The statuses below are for the complete Phase 0 scenario. `Unit evidence` identifies narrower tests that passed; it does not upgrade an unrun integration scenario to PASS.

| Case | Complete scenario status | Unit/source evidence |
|---|---|---|
| AUTH_01 — active student login | BLOCKED | No database-backed login/password flow run |
| AUTH_02 — invalid login | NOT_RUN | Login behavior is unchanged; no credential test run |
| AUTH_03 — locked-account login | BLOCKED | Access middleware and refresh mock denial pass; real login/admin data flow not run |
| AUTH_04 — protected API guard | BLOCKED | Mocked `verifyToken` checks active, suspended, pending/rejected, and stale-token states; no full API request sweep |
| AUTH_05 — student access to admin path | BLOCKED | Role middleware/source reviewed; no route integration run |
| AUTH_06 — logout/back behavior | BLOCKED | Cookie-clearing code reviewed and refresh cookie paths unit-tested; logout/browser history not exercised |
| ADM_U_02 — suspend and reactivate | BLOCKED | Account policy/token cutoff tests pass; admin persistence transition not run against a disposable DB |
| DOC_01 — online PDF preview | NOT_RUN / DECISION_REQUIRED | Preview remains disabled pending its policy; no bytes are returned when `allowDownload=false` |
| DOC_02 — permitted download | BLOCKED | Protected URL middleware with fake reference allows authorized enrolled student; real Material/Enrollment DB records not tested |
| DOC_03 — deny restricted download | BLOCKED | Middleware tests deny no enrollment, unpublished, `allowDownload=false`, and suspended account; real DB/API integration not tested |
| ADM_DOC_01 — admin upload/document permissions | BLOCKED | Route policy/source reviewed; multipart and database-backed permissions not exercised |
| NON_SEC_01 — SQL injection and XSS | BLOCKED | Lesson XSS fixtures pass; broad SQLi/form-input security case is outside the four Phase 1 defects and was not tested |
| NON_FILE_01 — malicious upload | BLOCKED | Isolated real Multer fixtures reject `.exe`, spoofed MIME, and fake PDF content with cleanup; production route aliases/authorization not exercised |
| NON_FILE_02 — upload size ceiling | BLOCKED | Isolated Multer test with a 16-byte cap verifies `FILE_TOO_LARGE`; configured caps asserted, but a production 50 MiB request/corpus is not exercised |

## Interpretation

The passing unit suite establishes the tested policy/helper/middleware behavior with fake records and local temporary files. It does not establish that real legacy records, MongoDB population, Vercel storage, browser downloads, or every route behave correctly in the deployed system. Phase 1 remains partial until those boundaries are verified safely.
