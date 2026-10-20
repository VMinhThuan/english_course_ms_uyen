# 00 — Security decisions

## Status and evidence boundary

- Repository baseline: `d8b5c49b0e6fb73e7f414798ae077a9ce713f001` on `main`.
- Phase 0 audit files are pre-existing untracked user work and are preserved.
- The Phase 0 findings are source-confirmed; no authenticated exploit or database-backed regression was run in Phase 0.
- No production database, production file corpus, or disposable test database was inspected. The workspace `uploads/` directory contains four 38-byte PNG files and no representative lesson/material documents.
- Implementation choices below are conservative defaults needed to make Phase 1 reviewable. Open deployment decisions are listed at the end; they do not authorize changing exam attempts, scoring, roles, or data.

## 1. Account suspension

### Adopted policy

| Account | Access token / protected API | Refresh | Learning endpoints | Role behavior |
|---|---|---|---|---|
| Student, `status=active`, `isActive=true` | Allowed, subject to existing RBAC and endpoint checks | Allowed | Existing active-student checks remain | No change |
| Student, `status=suspended` | Denied immediately on each new authenticated request with HTTP 403, `ACCOUNT_SUSPENDED` | Denied with HTTP 403, `ACCOUNT_SUSPENDED`; refresh cookie cleared | Denied, including requests carrying an access token issued before suspension | No change |
| Student, `isActive=false` | Denied; if also suspended, return `ACCOUNT_SUSPENDED` | Denied; if also suspended, return `ACCOUNT_SUSPENDED` | Denied | Existing inactive-account behavior retained |
| Student, `status=pending` or `rejected` | Denied on every protected request with stable `ACCOUNT_PENDING` or `ACCOUNT_REJECTED` | Denied with the same code; refresh cookie cleared | Denied on all protected routes, including routes that previously used only `verifyToken` | Existing login already denied these states; this closes stale-token access |
| Teacher/admin | Existing `isActive` and role checks remain authoritative | Existing policy retained | Existing RBAC retained | No role is added or removed |

Suspending a student sets both `status=suspended` and `isActive=false`. Reactivating sets `status=active` and `isActive=true`. One shared student-state policy checks both fields on login, refresh, and protected requests. The existing `suspendedAt` timestamp is used as a token issue-time cutoff, so access and refresh tokens created before suspension cannot become valid again after reactivation. A reactivated student must sign in to obtain new tokens.

Suspension does not delete learner data, mutate an Attempt, submit an attempt, or change any score. An already-running request may finish; all subsequent authenticated requests are checked against the current User record. Attempt timeout/scoring behavior remains Phase 2.

### Client response

Only the stable `ACCOUNT_SUSPENDED` code triggers client session cleanup and navigation to the existing Vietnamese account-status screen. A generic 403 does not log the user out. The message is “Tài khoản của bạn hiện đang bị tạm khóa. Vui lòng liên hệ giáo viên hoặc quản trị viên để được hỗ trợ.”

## 2. Lesson HTML and media

### Observed editor and render paths

- `AdminLessonsPage.jsx` labels its textarea as Markdown.
- `CreateLessonPage.jsx` labels its textarea as HTML/text.
- Neither is a WYSIWYG editor. `LessonPage.jsx` renders the stored string as HTML.
- Video and audio use separate `videoUrl` and `audioUrl` fields. The current video helper emits a YouTube iframe or a direct `<video>` source; there is no supported iframe/embed field in lesson content.

### Allowlist

Keep semantic formatting used by lessons: `h1`–`h6`, `p`, `br`, `hr`, `strong`, `b`, `em`, `i`, `u`, `s`, `del`, `blockquote`, `pre`, `code`, `ul`, `ol`, `li`, `table`, `caption`, `thead`, `tbody`, `tfoot`, `tr`, `th`, `td`, `sub`, `sup`, `a`, and `img`.

Allow only the attributes needed for those elements: link `href`/`title`/safe `rel`; image `src`/`alt`/`title`/`width`/`height`; table-cell `colspan`/`rowspan`. No `style`, `class`, `id`, `target`, `srcset`, event attributes, SVG, MathML, `script`, `iframe`, `object`, `embed`, or arbitrary custom tags. Links and images may use HTTP(S), `mailto` for links, fragments and safe relative URLs; protocol-relative and executable/data schemes are rejected. External links remain in the same tab, avoiding reverse-tabnabbing.

Sanitize both on server writes/reads and again at the React HTML sink so legacy database values and future API paths use the same conservative content policy. Preserve existing semantic HTML and text; no database-wide rewrite is performed. Direct media fields accept HTTPS or app-relative `/uploads/...` URLs. YouTube embeds are generated only for recognized YouTube hosts; arbitrary HTML embeds are not supported.

## 3. Material access

### Data classes and access rules

| Data class | Storage/URL | Student access |
|---|---|---|
| New public image/audio assets | `/uploads/public/...`, served as public static assets | Public, as required by current media consumers |
| New lesson attachments and uploaded materials | `/uploads/private/...`; file bodies streamed only after authorization | Active student, enrolled in the owning course, material and parent lesson published, and `allowDownload=true` |
| Legacy `/uploads/...` files referenced by a Material or Lesson attachment | Existing URL is retained; the legacy path checks database references and applies the same authorization before streaming | Same rules as the associated material/lesson; only unreferenced image/audio extensions remain static |
| Published materials with `allowDownload=false` | Metadata may be shown, but no file URL or file bytes are returned to a student | Denied from direct URLs and download endpoint |
| Hidden material or non-published parent lesson | No student file access | Denied |
| HTTPS external `fileUrl` | Not copied or proxied by the application | Exposed only to an authorized enrolled student when published and `allowDownload=true`; the external host controls access after the link is opened |

The admin UI checkbox currently says “only view online,” but the student page has no inline PDF/file viewer. Phase 1 therefore treats `allowDownload=false` as “do not provide file bytes.” It does not silently introduce a preview endpoint. A separate preview policy, including PDF viewer behavior and browser caching, is `DECISION_REQUIRED` before Phase 4.

Admin retains access to their materials. A teacher can access materials belonging to a course they teach; this preserves the existing admin material-management workflow without granting access to other teachers’ files. Anonymous access to any file referenced as a material or lesson attachment is denied. Local file resolution is confined to the configured upload root. Protected responses use `private, no-store`, `nosniff`, and attachment disposition; filesystem paths are not returned in JSON.

External materials are accepted only as HTTPS URLs (or app-local `/uploads/...` paths). The app does not proxy third-party URLs, which avoids introducing an SSRF-capable fetcher. An external URL can remain publicly accessible at its provider or be copied after an authorized user receives it; full revocation requires provider-side permissions or a future approved proxy/allowlist design. Existing database URLs are not rewritten.

## 4. Upload policy

### Route inventory and adopted policy

| Purpose / routes | Current product evidence | Accepted content | Per-file ceiling |
|---|---|---|---:|
| Lesson attachments: `/api/v1/lessons`, `/api/v1/admin/lessons` | UI says PDF, Word, image; both routes allow up to 10 files | PDF, DOC/DOCX, XLS/XLSX, PPT/PPTX, TXT/CSV, ZIP, JPEG/PNG/WebP, MP3/M4A/WAV | 50 MiB, provisional common cap |
| Materials: `/api/v1/materials/admin` and `/api/v1/admin/materials` | UI says PDF, Word, MP3, ZIP; material APIs also support image/audio MIME values | Same explicit document/image/audio allowlist as lesson attachments | 50 MiB, provisional common cap |
| Admin media: `/api/v1/admin/media/upload` | Existing code accepts JPEG/PNG/WebP and MP3/M4A/WAV | JPEG/PNG/WebP, MP3/M4A/WAV | 50 MiB, unchanged |
| TOEIC PDF import: `/api/v1/admin/toeic-tests/.../import-pdf` | Existing route allows PDF plus numbered JPEG page images, 101 files total, 5 MiB text fields | PDF in `file`; JPEG in `pageImages` | 30 MiB, unchanged |
| Vocabulary DOCX import: `/api/v1/vocabulary/.../import-docx` and admin alias | Existing route accepts `.docx` and has a 10 MiB limit | DOCX only | 10 MiB, unchanged |

All file routes check extension, a compatible declared MIME (allowing `application/octet-stream` for clients that omit a specific type), and the file signature where a signature exists. The MIME sent by the client is never accepted as proof by itself. Filenames are server-generated and storage is split between private materials and public image/audio assets. Rejected or failed uploads are cleaned up. Error codes are stable: `FILE_TYPE_NOT_ALLOWED`, `FILE_TOO_LARGE`, `FILE_CONTENT_INVALID`, `FILE_REQUIRED`, and `UPLOAD_FAILED`.

The 50 MiB general attachment/material ceiling reuses the strongest existing application-wide file ceiling (media upload), because no representative production material corpus was available. This is a conservative implementation default, not a verified maximum of existing production files. `DECISION_REQUIRED`: before deployment, confirm no legitimate lesson/material file exceeds 50 MiB; raise the per-purpose cap if the actual corpus requires it. Existing TOEIC and DOCX import ceilings are not changed.

`sanitize-html@2.18.1` is used at the server boundary; its changelog fixes a recursive iframe-fallback denial of service introduced in 2.18.0. This release requires Node.js `>=22.12.0`, so `backend/package.json` declares that minimum. Local verification used Node `22.18.0`. Confirm the deployment build/runtime before rollout; the backend package engine can override a Vercel project-selected major runtime ([Vercel runtime selection](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions), [sanitize-html changelog](https://github.com/apostrophecms/apostrophe/blob/main/packages/sanitize-html/CHANGELOG.md)).

## 5. Database, compatibility, and non-goals

- No schema migration, seed, bulk file relocation, or data-writing test is part of this phase.
- Existing `Material.fileUrl` and `filePath` records are preserved. Legacy local URLs remain readable through the authorization gate when their files are under the configured upload root.
- Teacher/admin role checks are not broadened. Teacher file access is limited to their own course; admin retains its existing wider management access.
- Attempts, answers, scores, grading, progress, assessment lifecycle, and reports are not read-modify-written by suspension handling.
- `NON_SEC_01` includes SQL injection as a broad test-plan phrase, but this phase only addresses the confirmed unsafe lesson HTML sink; it does not claim a general SQL-injection audit.

## Open decisions before rollout / Phase 4

1. **DECISION_REQUIRED — upload compatibility:** confirm whether any existing production lesson/material file exceeds the provisional 50 MiB ceiling. No production file corpus was accessible in this audit.
2. **DECISION_REQUIRED — online preview:** define which file types may be previewed when `allowDownload=false`, and the viewer/cache policy. Until then, no student file bytes are supplied for that state.
3. **Residual external-host control:** decide whether third-party materials must be restricted to an approved host list or moved to controlled storage. Phase 1 only accepts HTTPS and gates link disclosure; the provider remains authoritative after disclosure.
4. **Deployment check — Node runtime:** confirm the target backend runtime is Node `>=22.12.0` after the package engine change.
