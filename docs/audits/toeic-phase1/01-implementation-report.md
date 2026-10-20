# 01 — Implementation report

## Baseline and scope

- Baseline commit: `d8b5c49b0e6fb73e7f414798ae077a9ce713f001` (`main`).
- Scope: TOEIC-DEF-001 through TOEIC-DEF-004, plus directly required cleanup and DTO changes that prevent the same file-authorization boundary from being bypassed.
- No database schema changes, migration, seed, or data rewrite.
- Phase 0 reports were already untracked user files and were preserved.

## TOEIC-DEF-001 — Unsafe lesson HTML

**Root cause confirmed.** `LessonPage.jsx` sent stored lesson content to `dangerouslySetInnerHTML` without sanitizing it. Lesson writes and API reads also returned the stored HTML as-is.

**Fix.** Added server `sanitize-html` policy for the observed semantic rich text: headings, paragraphs, lists, tables, links, and images. Scripts, event handlers, style attributes, arbitrary embeds/SVG/MathML, unsafe URL schemes, and new-tab targets are excluded. Content is sanitized on create/update, API read, and again at the React sink so legacy stored content is covered without a database rewrite. Video/audio URLs have a separate HTTPS or app-upload policy; only recognized YouTube hosts produce an iframe.

**Changed source.** `backend/src/security/lessonHtml.js`, `backend/src/controllers/lessonController.js`, `backend/src/controllers/courseController.js`, `backend/src/controllers/testController.js`, `frontend/src/utils/sanitizeLessonHtml.js`, `frontend/src/pages/LessonPage.jsx`, `backend/package.json`, `backend/package-lock.json`, `frontend/package.json`, `frontend/package-lock.json`.

**API/database/backward compatibility.** Response shape is unchanged. Dangerous markup and unsupported attributes are removed when read; supported semantic formatting and text remain. No database writes or bulk lesson conversion occurred. The server dependency requires Node `>=22.12.0`, now declared by the backend package.

**Coverage/result.** Server fixtures verify retained rich text, links/images, stripped script/event/iframe payloads, malformed and empty legacy values, sanitized public lesson discovery, and sanitized lesson content returned through the legacy test API. Student test responses also omit private attachment URLs. The tests pass. Frontend production build passes. No browser execution test was run.

**Residual.** The test suite does not exercise browser DOM mutation behavior. Sanitization is the security boundary; no separate CSP deployment policy was added in this phase.

## TOEIC-DEF-002 — Public material URL authorization bypass

**Root cause confirmed.** `/uploads` was public static middleware; `allowDownload` was enforced only on the material API download handler. A copied `fileUrl` could bypass it. Lesson attachment URLs were also included in public course lesson records.

**Fix.** New lesson/material uploads go under `/uploads/private`; media and TOEIC page images use `/uploads/public`. Private paths are intercepted before static middleware, must map to a database reference, and are streamed only after authentication and authorization. Legacy referenced URLs are retained and gated the same way. Access checks include student state, enrollment, material and parent lesson publication, and `allowDownload`; teachers must own the course and admins retain management access. Files are resolved under the configured upload root and checked by real path. Responses use `private, no-store`, `nosniff`, and attachment disposition. Unreferenced static files are restricted to image/audio extensions and checked against symlinks escaping the upload root. Student material DTOs omit local URLs and filesystem paths; public lesson discovery omits private attachment URLs. Replacement/deletion cleanup preserves files that remain referenced.

**Changed source.** `backend/src/app.js`, `backend/src/middlewares/protectedUploads.js`, `backend/src/security/materialAccessPolicy.js`, `backend/src/controllers/materialController.js`, `backend/src/controllers/lessonController.js`, `backend/src/controllers/courseController.js`, `backend/src/controllers/testController.js`, `backend/src/models/Material.js`, `backend/src/utils/uploadConfig.js`, `frontend/src/pages/LessonPage.jsx`, `frontend/src/pages/admin/AdminMaterialsPage.jsx`.

**API contract.** Existing local material URLs keep their shape and are handled by the auth gate. New uploads return `/uploads/private/<server-generated-name>` to management APIs; students receive no local URL and use `GET /api/v1/materials/:id/download`. `allowDownload=false` returns no file bytes and the student UI has no download action; online preview is not implemented. Unauthorized direct file requests return stable 401/403/404 responses. Files are attachment downloads, not inline previews.

**Database/backward compatibility.** No schema or URL migration. Existing `fileUrl`/`filePath` values are preserved. Legacy root and nested upload paths still work when the target is in the configured upload root and a matching Material/Lesson reference authorizes the request. A reference cannot make an out-of-root or missing file accessible.

**Coverage/result.** Isolated middleware tests cover anonymous, suspended, unenrolled, unpublished, `allowDownload=false`, authorized student download, cache/security headers, public image pass-through, and unknown private-file denial. URL normalization/path containment tests pass. Real Mongoose population, production URL variants, browser download behavior, and deployment storage were not exercised.

**Residual.** External HTTPS links can be copied or remain public at the provider after an authorized student receives them. TOEIC imported page images currently remain public static assets. The Vercel upload directory is OS temporary storage; persistence across serverless invocations is not guaranteed.

## TOEIC-DEF-003 — Inconsistent upload validation

**Root cause confirmed.** Lesson, material, and general admin Multer routes previously had no shared file filter/size limit, while media and DOCX imports had separate controls.

**Fix.** Added a common upload wrapper for lesson, material, admin, media, TOEIC PDF/page-image, and DOCX routes. It applies route/field allowlists, MIME compatibility, content signatures where defined, per-route size/file/field limits, UUID-based server filenames, private/public storage selection, stable error codes, and cleanup after rejected/failed uploads. Executable file extensions and SVG are not accepted. Protected files are served as octet-stream attachments with `nosniff`.

**Changed source.** `backend/src/utils/uploadValidation.js`, `backend/src/utils/uploadConfig.js`, `backend/src/routes/lessonRoutes.js`, `backend/src/routes/materialRoutes.js`, `backend/src/routes/adminRoutes.js`, `backend/src/routes/vocabularyRoutes.js`, `backend/src/routes/toeicRoutes.js`, `backend/src/routes/mediaRoutes.js`, `backend/src/controllers/mediaController.js`, `backend/src/controllers/toeicController.js`.

**API contract.** Validation errors return JSON `{status:"error", code, message}`. Expected codes include `FILE_TYPE_NOT_ALLOWED`, `FILE_TOO_LARGE`, `FILE_CONTENT_INVALID`, `FILE_REQUIRED`, and `UPLOAD_FAILED`. Limits: lesson/material/admin uploads 50 MiB each; lesson attachments max 10; admin media 50 MiB; TOEIC PDF/page images max 30 MiB each, 101 files and 5 MiB text fields; DOCX import 10 MiB.

**Database/backward compatibility.** No schema migration. Existing uploaded files are not moved or bulk rewritten. New lesson/material files use private storage; new public media use a separate public subdirectory. The existing TOEIC and DOCX size ceilings are retained. The 50 MiB general lesson/material cap is a provisional decision based on the existing media ceiling, not on production corpus evidence.

**Coverage/result.** Tests cover extension allowlists, incompatible MIME, mismatched signatures, accepted PDF/JPEG signatures, size-policy values, and safe names. An isolated local Express/Multer HTTP harness also verifies unsupported extension, fake MIME, content mismatch, over-limit response code, missing file, random filename generation, and cleanup after validation/controller failure. Tests pass. The production route aliases, 50 MiB request boundary, disk-full behavior, and legacy valid-file corpus acceptance remain unverified.

**Residual.** Deployment approval must confirm the actual lesson/material corpus fits 50 MiB. ZIP-based formats are signature-checked but are not malware-scanned or deeply validated as Office documents. No disposable database was available for route integration tests.

## TOEIC-DEF-004 — Account suspension enforcement

**Root cause confirmed.** Suspension changed `status` but left `isActive` true. `verifyToken` and refresh checked `isActive`, while `requireActiveStudent` checked `status`; this allowed an existing token to reach routes that did not call `requireActiveStudent`.

**Fix.** A shared policy now checks student `status` and `isActive` on login, refresh, and every authenticated request. Suspended, inactive, pending, and rejected accounts receive stable state codes. Existing access/refresh tokens issued no later than `suspendedAt` remain revoked after reactivation; the user must sign in again. Admin suspend/approve/reactivate writes the existing fields consistently. The frontend handles only `ACCOUNT_SUSPENDED` by clearing the access token and navigating to the Vietnamese status screen; generic 403 responses do not log out the user. No Attempt, score, progress, or reporting data is changed.

**Changed source.** `backend/src/security/accountAccessPolicy.js`, `backend/src/middlewares/auth.js`, `backend/src/controllers/authController.js`, `backend/src/controllers/adminController.js`, `frontend/src/api/axiosConfig.js`, `frontend/src/pages/AccountStatusPage.jsx`.

**API contract.** Protected requests for a suspended student return HTTP 403 `ACCOUNT_SUSPENDED`; pre-suspension token after reactivation returns 401 `SESSION_REVOKED`. Pending/rejected/inactive students also receive stable 403 account-state codes. Suspended and otherwise non-active student refresh attempts are denied and both the new root-scoped and legacy auth-scoped refresh cookies are cleared. Teacher/admin behavior continues to use existing `isActive` and RBAC checks.

**Database/backward compatibility.** Existing User fields only; no schema change. Suspend now sets `isActive=false`; reactivation sets it true and preserves `suspendedAt` to revoke old tokens. No learner data or attempts are deleted or mutated.

**Coverage/result.** Mocked middleware tests verify active access, pending/rejected/suspended denial, denial of a pre-suspension token after reactivation, refresh denial, and clearing both cookie paths. The policy suite passes. Admin state-transition controllers, real login credentials, and all database-backed student endpoints were not run.

**Residual.** An authenticated request already executing when suspension is written may finish; subsequent requests re-read account state and are denied. Production DB/API behavior and client routing still need integration/browser confirmation.

## Overall result

The source fixes are implemented, but Phase 1 is **PARTIAL** pending safe database-backed regression, actual upload-route exercise, production corpus confirmation, and deployment runtime/storage checks. Do not infer functional acceptance from the passing unit suite or frontend build alone.
