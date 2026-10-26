# Phase V3A — Legacy compatibility

## Route và data boundaries

- Prototype route tồn tại trong `vocabularyImportPrototypeRoutes.js` nhưng không import/mount trong `backend/src/app.js` hoặc `vocabularyRoutes.js`.
- Legacy Vocabulary CRUD, Student vocabulary/flashcard route và DOCX preview/confirm không được chuyển sang Parser V2.1 hoặc V3A workflow.
- Candidate Confirm tạo Catalog-only Vocabulary Draft, không gắn Lesson/Course, không tạo Lesson/Course giả và không thay legacy Vocabulary.
- Multi-sense/example arrays nằm trong Catalog-only `catalogSenses`/`catalogNotes`; legacy JSON transform ẩn các field Catalog khỏi legacy DTO.
- Student API cũ tiếp tục dùng lesson/topic semantics; LearningProgress không được ghi hoặc đổi schema.
- Không sửa Part 1/Part 5 source hoặc test. Không đăng ký Catalog Tag/Chapter cho Student API.

## Regression evidence

`npm run test:vocabulary-catalog-v1` PASS 9/9 trên MongoMemoryServer loopback. Suite xác nhận Catalog lifecycle/indexes, candidate persistence, membership retry/concurrency, legacy CRUD/Student DTO/flashcard, Lesson/Course cascade và LearningProgress retention.

Các suite liên quan cũng PASS: Phase 1 security 19/19; Phase 2 20/20; Phase 3 13/13; Phase 4 5/5; legacy Part 5 import 6/6; CORS + Part 5 selection + Phase 6 index checks 12/12. Các test mới V3A chạy riêng trên MongoMemoryReplSet.

`npm run test:phase5` không chạy vì script hiện tham chiếu `tests/phase5ToeicPart1.test.js` không có trong worktree. Các file CORS và Part 5 selection tồn tại được chạy trực tiếp; đây không phải Part 1 validation. Không có Part 1/5 code hoặc fixtures nào bị sửa.

## Readiness boundary

Đây là regression evidence cho các test scopes đã liệt kê, không phải browser test, full production route test, app database baseline hoặc deployment proof. `Legacy compatibility` được giữ trong phạm vi test; không tuyên bố mọi workflow runtime đều đã được xác minh.
