# Legacy Regression Results

## Passed in isolated scope

`test:vocabulary-catalog-v1` — 9 tests passed trên MongoMemoryServer loopback. Bao gồm Catalog Draft/query filters, Catalog-only exclusion, legacy Vocabulary CRUD/required Lesson-Course references, Student Vocabulary GET và flashcard DTO fields, Course/Lesson deletion, LearningProgress retention khi archive, indexes và membership retry/concurrency.

Thêm synthetic legacy DOCX preview/confirm test: bộ nhớ tạo DOCX tổng hợp, preview loại Catalog-only same-headword record khỏi legacy duplicate lookup, confirm tạo legacy Vocabulary gắn Lesson/Course; Catalog record ban đầu vẫn tồn tại. Không dùng source DOCX thật cho bước này.

Các suite khác đã chạy: Phase 1 security (19), Phase 2 backend (20), Phase 3 (13), Phase 4 learning (5), Phase 2 import (6), Phase 5 CORS (2), Phase 5 Part 5 selection (8) và Phase 6 index readiness (2). Tổng regression scope hiện tại gồm 96 passing tests khi cộng Parser V2.1 (10), Catalog/persistence (9) và pipeline/goldens (2).

## Giới hạn

- `src/scripts/testVocabDocxImportApi.js` không chạy: script nạp `.env`, đọc `MONGODB_URI` và có thể ghi Vocabulary vào database được cấu hình. Thay vào đó, controller preview/confirm được kiểm thử bằng DOCX tổng hợp trong MongoMemoryServer.
- Không chạy browser/live-server smoke test hoặc app database.
- `npm run test:phase5` chưa chạy vì manifest tham chiếu `tests/phase5ToeicPart1.test.js`, file không có trong checkout. Các file Phase 5 CORS và Part 5 selection hiện có đã chạy trực tiếp. Không có Part 1/Part 5 source file nào được sửa.
- Backend không có build script. Kết quả này không được gọi là full-application runtime acceptance.
