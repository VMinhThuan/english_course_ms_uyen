# 02 — API security matrix

## Account state decision

Every middleware-protected request loads the current User record. For students, `status` and `isActive` must agree with an active state. For teachers/admins, the existing `isActive` and role checks remain authoritative.

| Role/account state | Access token / protected API | Refresh | Result |
|---|---|---|---|
| Student, active + `isActive=true` | Allowed, subject to route authorization | Allowed | Existing enrollment, publication, ownership, and role rules continue to apply |
| Student, suspended | Denied, HTTP 403 `ACCOUNT_SUSPENDED` | Denied, HTTP 403; refresh cookies cleared | Applies to all routes using `verifyToken` and recognized sessions on `optionalAuth` |
| Student, active status + `isActive=false` | Denied, HTTP 403 `ACCOUNT_NOT_ACTIVE` | Denied, HTTP 403; cookie cleared | Contradictory flags resolve to deny |
| Student, pending | Denied, HTTP 403 `ACCOUNT_PENDING` | Denied, HTTP 403; cookie cleared | Stale token cannot use routes that previously relied only on `verifyToken` |
| Student, rejected | Denied, HTTP 403 `ACCOUNT_REJECTED` | Denied, HTTP 403; cookie cleared | Same shared state policy |
| Teacher/admin, `isActive=true` | Existing RBAC/ownership | Existing policy | No role expansion |
| Teacher/admin, `isActive=false` | Existing denial | Existing denial | Existing behavior retained |
| Anonymous | Public endpoints only | No refresh token | Protected endpoints deny |

An access/refresh token with `iat` at or before the account's `suspendedAt` second is rejected after reactivation with `SESSION_REVOKED`. An already-running request can complete; each later request checks current account state.

## Route groups reviewed

| Route group | Existing middleware / access | Phase 1 behavior |
|---|---|---|
| `POST /api/v1/auth/register`, `/login`, `/refresh` | Public handlers | Login/refresh use the shared student-state policy; no credentials or DB data were used in tests |
| `POST /api/v1/auth/logout`, `GET /me`, `PUT /profile`, `PUT /change-password` | `verifyToken` | Suspended/inactive/pending/rejected student sessions are rejected consistently |
| `GET /api/v1/courses`, `GET /:id`; instructor discovery | Public | Public discovery remains public |
| Course mutations | `verifyToken` + teacher/admin role check | Current RBAC retained |
| Enrollment | `verifyToken` + `requireActiveStudent` | Account state checked by middleware and endpoint gate |
| `GET /api/v1/lessons/course/:courseId` | `optionalAuth`; published lessons visible to guests/students | Recognized non-active student tokens return state error; local attachments are omitted for guests/students |
| Lesson detail/materials | `verifyToken`; controller checks enrollment/publication for students and ownership for teachers | Student lesson detail requires enrollment; student materials omit local URL/path; download requires active, enrolled, published, and `allowDownload` |
| Lesson writes/admin lesson CRUD | `verifyToken` + teacher/admin role check | Uploads validated; lesson content sanitized on write/read |
| Student vocabulary, legacy test routes | `verifyToken` with existing route checks | Shared middleware denies non-active student states even where `requireActiveStudent` was absent; test responses sanitize populated lesson HTML and omit student attachment URLs |
| Progress | `verifyToken` + `requireActiveStudent` for student actions; admin inspection role checks | Existing route access retained; status is checked consistently |
| Assessments/attempts | Student routes use `verifyToken` + `requireActiveStudent`; admin routes use teacher/admin checks | No attempt/scoring behavior changed |
| TOEIC student/admin routes | Student router uses `verifyToken` + `requireActiveStudent`; admin router uses teacher/admin checks | No TOEIC attempt, scoring, or lifecycle logic changed |
| Admin management routes | Router-wide `verifyToken` + admin/teacher role check | Existing roles retained; account management updates student status fields |
| Admin media upload | `verifyToken` + admin/teacher check | Image/audio allowlist, shared validation, separate public storage |

The route inventory is based on current `backend/src/app.js` mounts and `backend/src/routes/*.js`. It is a source review, not a database-backed request sweep.

## File URL access

| URL class | Anonymous | Active enrolled student | Suspended/non-active student | Owning teacher | Admin |
|---|---|---|---|---|---|
| `/uploads/private/...` referenced Material | Denied | Allowed only if Material and Lesson are published and `allowDownload=true` | Denied | Allowed for own course | Allowed |
| `/uploads/private/...` Lesson attachment | Denied | Allowed only for published lesson and enrolled course | Denied | Allowed for own course | Allowed |
| Legacy `/uploads/...` URL referenced by Material/Lesson | Same as associated record; URL format retained | Same as associated record | Denied | Same ownership rule | Allowed |
| Unreferenced public image/audio asset | Public static | Public static | Public static | Public static | Public static |
| Public/legacy image/audio URL that resolves to a Material/Lesson reference | Protected as the referenced record | Same material policy | Denied | Same ownership rule | Allowed |
| Unsupported unreferenced file extension, private orphan, traversal, or out-of-root target | 404/denied | 404/denied | 404/denied | 404/denied | 404/denied |
| HTTPS third-party material link | Not disclosed by student API | Disclosed only for published/enrolled/allowed material | Not disclosed | Existing management access | Existing management access |

Protected local file responses are sent as attachments with `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff`, and `Content-Type: application/octet-stream`. `allowDownload=false` supplies no file bytes; inline preview is intentionally not implemented.

## Important scope boundary

TOEIC PDF import page images use public URLs and are not references in Material/Lesson. They remain public static assets, including before an assessment is published. Assessment-specific image authorization is an explicit residual follow-up, not claimed as fixed by this matrix.
