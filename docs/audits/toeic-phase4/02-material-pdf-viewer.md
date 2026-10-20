# DEF-019 — Protected PDF preview and material behavior

## Preview policy

Preview uses the Phase 1 `evaluateMaterialAccess` policy by calling the same authorization path as the existing download handler. Students must be active, enrolled, and accessing a published lesson/material with `allowDownload=true`. When `allowDownload=false`, the server returns a denial without file bytes. This follows the established Phase 1 decision; preview does not create a separate “view but not download” entitlement.

Private storage is not re-exposed through the static `/uploads` path. No JWT is placed in a URL, and the preview route does not fetch arbitrary external URLs.

## API and streaming

- Added `GET /api/v1/materials/:id/preview` with `verifyToken`.
- Material and parent lesson/course are loaded and passed through the existing access decision.
- Stored paths must remain under `getUploadDir()` after real-path resolution and point to a regular file.
- Preview accepts only metadata resolving to `application/pdf`, rejects files above 25 MiB, and verifies the `%PDF-` signature before streaming.
- Response is `Content-Type: application/pdf`, `Content-Disposition: inline` with sanitized UTF-8 filename, `Cache-Control: private, no-store`, and `X-Content-Type-Options: nosniff`.
- Safe external HTTPS materials are not proxied or embedded; the preview endpoint returns an unavailable response. UI offers an “Mở tài liệu” link action instead.

## Viewer architecture

`LessonPage` requests the protected endpoint through the authenticated Axios client as a Blob. It verifies MIME and file signature client-side, then creates a local object URL for a browser-native PDF iframe. It revokes object URLs when the preview changes or the lesson unmounts. Request IDs prevent stale requests from replacing the active preview. Loading and error notices are provided; the existing authorized download stays available where permitted.

## Compatibility and test evidence

- Download continues using the existing attachment endpoint and filename helper. Integration assertions cover inline vs attachment disposition, UTF-8 filename suffix, original bytes, and response security headers.
- Phase 4 isolated Mongo/API test covers unauthenticated access, non-enrolled student, `allowDownload=false`, hidden material, hidden lesson, corrupt signature, non-PDF metadata, oversized PDF, external URL non-proxy, successful inline preview, and unchanged attachment download.
- Phase 1 and Phase 2 security/download suites also pass.
- Browser-native PDF display, multi-page scrolling, mobile sizing, viewer reopen/close, interrupted requests, and compatibility with all target browsers: `NOT_RUN`.

## Limits

The 25 MiB ceiling is a Phase 4 implementation bound, not a documented product/storage limit. Blob preview uses client memory. Range requests are not implemented. Some otherwise readable files with a nonstandard header may be rejected by the strict signature check. External materials require their provider's direct link behavior and may not be embeddable.
