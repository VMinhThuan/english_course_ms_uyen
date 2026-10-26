# Phase V3B — Handover

## Kết quả

Đã hoàn thành UI Admin nhập DOCX, preview, biên tập, editorial review, audit và Confirm Draft trong isolated test harness. UI có thể chạy với mock API và đã kết nối thành công tới V3A Express router bằng một DOCX tổng hợp trên MongoMemoryReplSet.

UI đi qua `AdminLayout` thật trong browser fixture nhưng **chưa được nối vào navigation hoặc `AppRoutes`**. V3A router **chưa được mount vào application backend**. Vì vậy kết quả này chứng minh component/harness workflow, không chứng minh production authentication, application database hoặc release readiness.

## Readiness gates

| Gate | Trạng thái | Căn cứ |
|---|---|---|
| `UI_COMPONENT_READY` | **YES — isolated fixture** | Wizard và editor đã chạy qua mock/real browser workflow. Component chưa được đưa vào production bundle/route. |
| `MOCK_E2E_READY` | **YES** | Playwright cover upload limits/retry, filters/pages, edits, validation, conflict, review, duplicate, confirm timeout, recovery và mobile 390px. |
| `ISOLATED_BACKEND_E2E_READY` | **YES — synthetic only** | Express V3A + MongoMemoryReplSet `127.0.0.1/vocabulary_v3b_browser_test`; 1 synthetic DOCX, 1 confirmed candidate; unauthenticated=401, Teacher=403. |
| `ACCESS_POLICY_APPROVED` | **NO** | Production Admin/Teacher access, review authority, CSRF/session, audit retention, upload scanning/rate limit chưa được phê duyệt. |
| `DATABASE_BASELINE_READY` | **NO / BLOCKED** | Không mở kết nối application database hoặc dùng read-only production identity trong Phase V3B. |
| `APPLICATION_INTEGRATION_READY` | **NO** | Chưa có Tag-list/mapping contract, production auth middleware review, route registration, database/migration/index/rollback review. |
| `PRODUCTION_READY` | **NO** | Chưa chạy trên app auth/database/deployment; không có production acceptance. |

## Bằng chứng test

- Frontend unit: 6/6 PASS.
- Mock browser E2E: PASS, gồm 3 upload attempts, 3 PATCH, 4 review và 2 Confirm requests. Lần Confirm response bị ngắt được đối soát bằng reload batch; không có retry tự động.
- Isolated backend browser E2E: PASS; Draft có `importStatus=IMPORTED_AS_DRAFT`, `publicationStatus=NOT_ELIGIBLE`, audit `FIELDS_EDITED → REVIEW_DECISION → CONFIRMED_DRAFT`.
- Vocabulary Catalog V1 regression: 9/9 PASS; Part 5 frontend utility regression: 9/9 PASS; V3A suite: 8/8 PASS.
- V1.1 private-source/golden tests: 2 SKIPPED do không cấu hình evidence paths. Không có test failure.
- Vite production build PASS, kèm warning chunk lớn hơn 500 KiB. Component prototype không được bundle vì không import vào production route.

## Khoảng trống và điều kiện trước application integration

1. Không có batch listing API; Admin cần giữ Batch ID và mở lại bằng ID.
2. Chưa có Tag catalog API. V3A nhận `sourceFolder` label; cần quyết định Tag lookup/creation và source-folder policy.
3. Cần phê duyệt quyền Admin/Teacher, reviewer, publish boundary, CSRF, rate limit, upload scanning và audit retention.
4. Cần xác minh application DB identity/topology/current Catalog counts, duplicate/index conflicts, migration strategy, rollback và runtime Node trước bất kỳ app DB integration.
5. Chỉ sau các gate trên mới đăng ký route/client auth trong bounded change riêng. Phase V4 chưa được bắt đầu.

## Ranh giới worktree

Thay đổi được làm trong `C:\Users\LEGION\.codex\worktrees\vocabulary-v1-1-integration\english_course_ms_uyen`. Các thay đổi V1.1/V3A vốn đã dirty trong worktree được giữ nguyên. Không reset/commit/push/deploy, không sửa primary checkout, Part 1/Part 5, Student Flashcard, app database hoặc 30 DOCX nguồn.
