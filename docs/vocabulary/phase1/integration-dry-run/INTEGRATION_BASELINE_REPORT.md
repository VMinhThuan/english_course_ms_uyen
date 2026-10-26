# Phase V1.1 — Integration Baseline

**Ngày:** 2026-10-26
**Scope:** Parser V2.1 → Catalog Candidate Adapter V1 → validation/persistence prototype, trong worktree cô lập.

## Checkout evidence

| Checkout | HEAD | Trạng thái trước integration | Xử lý trong Phase V1.1 |
|---|---|---:|---|
| Vocabulary V1 | `6ee5f094870d1dd40884434a9d94f3041128853e` | 11 dirty entries | Chỉ đọc; không sửa/reset/stash/merge |
| Parser V2.1 | `2b112f2d9c6c769578159428c04454bd441ad3ef` | 8 dirty entries | Chỉ đọc; không sửa/reset/stash/merge |
| Integration scratch | `6ee5f094870d1dd40884434a9d94f3041128853e` | Tạo riêng từ baseline V1 | Nhận bản sao các thay đổi V1 và Parser cần cho kiểm chứng |

Hai checkout ban đầu giữ nguyên HEAD và dirty state. Scratch đang detached tại baseline `6ee5f09`, chưa commit.

## Thành phần được ghép

- Catalog V1: Tag, Chapter, Membership, Catalog service, các legacy filters và integration tests.
- Parser V2.1: parser, source oracle, acceptance runner và unit tests.
- V1.1: adapter, source identity, candidate/batch/audit models, persistence validator/service, integration tests và inventory script chỉ đọc.

Không có route/API, migration, deployment, app-database write hay nội dung DOCX nguồn được thêm vào scratch. Acceptance CSV chỉ chứa tên file nguồn và số liệu kiểm đếm.

## Kết quả kỹ thuật

- 30 DOCX, 711 occurrences, 3 folders và 30 Chapter candidates được phân tích trong bộ nhớ.
- Adapter tạo 711 envelope có identity riêng; cả 711 qua structural validation.
- 90 independent expanded goldens: 1.254 field exact, 6 field ambiguous theo source annotation.
- Synthetic persistence dùng MongoMemoryServer bind `127.0.0.1`; không lưu 711 source candidates.
- `npm ci`, dependency resolution, audit và các regression suite được ghi trong handover.

Đây là bằng chứng integration trong scratch, không phải kết quả review biên tập, database baseline hay production readiness.
