# Phase V1 — kết quả kiểm thử

## Môi trường

- Node v22.18.0; npm 10.9.3; backend engine yêu cầu Node 22.x.
- npm ci hoàn tất trong worktree V1: 228 package được thêm, audit khi cài đặt báo 0 vulnerability.
- npm ls --depth=0 thành công; mongodb-memory-server 11.3.0 và Mongoose 8.24.5.
- npm audit --audit-level=low: found 0 vulnerabilities.

## Kiểm thử đã chạy

| Lệnh | Kết quả |
|---|---|
| node --test tests/vocabularyCatalogV1.integration.test.js | PASS — 7/7 checks; MongoMemoryServer chỉ bind 127.0.0.1. |
| node --check cho service, adapter, Vocabulary model, vocabularyController | PASS |
| Parse backend/package.json | PASS |
| npm ls --depth=0 | PASS |
| npm audit --audit-level=low | PASS — 0 vulnerability |

Integration checks gồm schema constraints, Tag/Chapter, nhiều Chapter trên một Vocabulary, uniqueness/indexes, retry idempotency, xung đột identity, tám membership retry đồng thời, Draft visibility, filter/search/pagination/order, archive không cascade, DTO flashcard, Lesson detail và Lesson/Course cascade isolation.

Lần chạy đầu phát hiện race giữa truy vấn membership và retry đồng thời. Service được sửa để trả membership hiện hữu khi cặp và sourceIdentity trùng; lần chạy cuối PASS.

## Chưa chạy

Không chạy full backend regression, browser/UI test, parser acceptance V2.1, DOCX thật, database baseline ứng dụng, migration, import hoặc publish. Do đó kết quả chỉ chứng minh test mới và các static/dependency checks đã nêu; không phải full application regression hay deployment readiness.
