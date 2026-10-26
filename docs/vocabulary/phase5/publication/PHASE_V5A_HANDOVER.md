# Phase V5A — Handover

## Readiness

| Gate | Result | Cơ sở |
|---|---|---|
| `PUBLICATION_PROTOTYPE_READY` | PASS — isolated | Eligibility, trusted Admin, audit, expectedVersion, idempotency, transaction và concurrency qua backend tests |
| `ADMIN_PUBLICATION_UI_READY` | PASS — fixture | UI gọi backend thật, confirmation, blockers, candidate detail, audit, error/retry và responsive browser E2E |
| `STUDENT_VISIBILITY_READY` | PASS — prototype | V4B/V5A API tests và browser checks published-only, privacy, archive/hide, direct-ID denial |
| `FULL_SYNTHETIC_E2E_READY` | PASS — isolated | DOCX tổng hợp → import review/confirm → publish → Student → hide/archive |
| `LEGACY_COMPATIBILITY_READY` | PARTIAL | Legacy/model/progress/bookmark regressions trong test suites PASS; real app DB and production route interaction chưa xác minh; Phase 5 browser test có một failure riêng |
| `SOURCE_ACCEPTANCE_READY` | NO / SKIPPED | DOCX/reference/hash/golden roots không cấu hình trong checkout |
| `ACCESS_POLICY_APPROVED` | NO | `PENDING_PO` |
| `DATABASE_BASELINE_READY` | NO | Không xác minh identity/topology/data/index trên DB ứng dụng |
| `APPLICATION_INTEGRATION_READY` | NO | Prototype routers và Publication UI chưa đăng ký vào app |
| `PRODUCTION_READY` | NO | Các gate trên còn mở; không có deploy/migration |

## Manual Vocabulary

Manual Catalog Vocabulary thiếu provenance tương thích V4B nên bị chặn với `IMPORT_PROVENANCE_REQUIRED`. Không sinh fake import evidence. Manual editorial provenance cần Product Owner chọn semantics trước khi phát triển.

## Release boundary

Base hiện hành sau fetch: `6ee5f094870d1dd40884434a9d94f3041128853e`, trùng `origin/main` tại thời điểm kiểm tra. Branch làm việc `codex/vocabulary-phase-v5a`. Prototype API không mount vào `backend/src/app.js`; UI chỉ có isolated fixture. Database ứng dụng không được kết nối.

Giữ ngoài phạm vi Vocabulary commit: `docs/toeic-part5/`, mọi `docs/audits/toeic-phase5/evidence/` thay đổi, và thay đổi khác trong primary checkout. Các regression failures/skips được ghi trong `REGRESSION_TEST_RESULTS.md`.

## Việc cần quyết định trước V5B/application integration

1. Product Owner phê duyệt access policy và manual-content provenance.
2. Operator xác nhận staging Mongo identity/topology/backup; chạy approved read-only inventory và duplicate/index analysis.
3. Hoàn tất 30 DOCX + 711 locator/hash source acceptance và private goldens trên source được mount an toàn; tuyệt đối không Confirm/Publish nguồn thật trong bước đó.
4. Chốt migration/index/rollback plan và ánh xạ `req.user` Admin/Student từ middleware thực.
5. Tích hợp routes và UI trong staging, chạy lại toàn regression trên target commit; điều tra `test:e2e:phase5` download timeout.
6. Chỉ đánh giá Production readiness sau staging verification, policy approval và migration sign-off.
