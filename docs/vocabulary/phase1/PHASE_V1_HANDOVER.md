# Phase V1 — handover

## Kết quả

Đã triển khai nền dữ liệu Catalog trong worktree cô lập tại base SHA 6ee5f094870d1dd40884434a9d94f3041128853e. Tag, Chapter, Membership và Catalog-only Vocabulary được kiểm thử trên MongoMemoryServer loopback. Legacy API/DTO được lọc Catalog; adapter thử nghiệm giữ bằng chứng nguồn Parser V2.1.

## Readiness gates

| Gate | Trạng thái | Lý do |
|---|---|---|
| DATA_MODEL_READY | PASS trong cô lập | Model/index/service và lifecycle test thành công; cần review rollout migration. |
| LEGACY_COMPATIBILITY_READY | PASS trong phạm vi đã test | Required refs, list/get/update/delete, Student DTO, import query và Lesson/Course cascade có discriminator guard. |
| DATABASE_BASELINE_READY | BLOCKED | Không có database local identity/read-only access được xác minh; không truy cập database ứng dụng. |
| ACCESS_POLICY_APPROVED | NO | Quyền Catalog, review, Teacher và Student chưa có phê duyệt PO. |
| PARSER_INTEGRATION_READY | PARTIAL | Adapter và synthetic test đã có; chưa tích hợp parser hoặc lưu provenance. |
| V3_IMPORT_READY | NO | Chưa có policy, baseline, persistence/audit, mapping senses và import/review API được duyệt. |

## Deliverables

- DATA_MODEL_IMPLEMENTATION.md
- LEGACY_COMPATIBILITY_REPORT.md
- VOCABULARY_SERVICE_CONTRACT.md
- DATABASE_BASELINE_REPORT.md
- INDEX_AND_IDEMPOTENCY_TESTS.md
- ACCESS_POLICY_GATES.md
- PARSER_INTEGRATION_PLAN.md
- TEST_RESULTS.md
- PHASE_V1_HANDOVER.md

## Trạng thái checkout

Thay đổi chỉ nằm trong worktree Vocabulary V1 mới, detached tại 6ee5f094870d1dd40884434a9d94f3041128853e. Không commit/push. Checkout chính ở cùng SHA nhưng đã có 83 dirty paths khi bắt đầu; worktree Parser V2.1 ở 2b112f2d9c6c769578159428c04454bd441ad3ef cũng đã dirty. Hai checkout đó không bị sửa bởi Phase V1.

Không có app database connection, migration, backfill, DOCX import, publish hoặc deploy.

## Trước khi bắt đầu V2/V3

1. Product Owner chốt quyền truy cập, review/publish và duplicate reuse.
2. Chỉ định database local/test được phép kiểm kê read-only; xác minh host và topology.
3. Duyệt migration/index rollout và rollback; kiểm tra autoIndex trên môi trường đích.
4. Duyệt mapping senses/examples và persistence cho raw source, editor changes, issues, duplicate metadata, actor/timestamp.
5. Hợp nhất Parser V2.1 dependency changes có review; chạy parser goldens và legacy regression trong các checkout đã được chủ sở hữu hòa giải.
6. Chỉ bật import sau khi toàn bộ gate đã PASS; giữ tất cả candidate ở trạng thái review-required trước đó.
