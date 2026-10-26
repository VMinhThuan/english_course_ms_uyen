# Phase V4B — Publication Visibility Tests

## Điều kiện để trả một Vocabulary

Backend chỉ trả membership nếu tất cả điều kiện sau cùng đúng:

1. Parent Tag có `status: published`.
2. Chapter có `status: published`, và `chapter.tagId` trỏ đúng Tag Published.
3. Vocabulary có `catalogOnly: true` và `catalogStatus: published`.
4. `ChapterVocabulary` nối đúng Chapter/Vocabulary và có `sourceIdentity`.
5. Candidate khớp `sourceIdentity`, `REVIEW_APPROVED`, `IMPORTED_AS_DRAFT`, có `reviewedBy`/`reviewedAt`, và các ID imported trùng membership.
6. Batch của Candidate còn tồn tại.
7. Audit có `REVIEW_DECISION` + `APPROVE` đúng Candidate/Batch/source/reviewer.
8. Audit `CONFIRMED_DRAFT` cùng Candidate/Batch/source ghi đúng Chapter/Vocabulary/Membership.

Candidate status đơn lẻ không đủ chứng minh provenance. Query join `Vocabulary`, `VocabularyImportCandidate`, `VocabularyImportBatch` và hai dạng `VocabularyImportAudit`; thiếu bất kỳ join/evidence nào thì membership bị loại trước khi trả DTO/count.

## Fixture tổng hợp

Fixture tạo 3 Tag Published; Tag Draft/Archived; Chapter Published, Draft, Archived và Chapter rỗng; Vocabulary Published, Draft/Archived, cùng headword khác nghĩa, nhiều sense/examples, một Vocabulary ở hai Chapter. Các negative cases gồm: không membership, sourceIdentity không có Candidate, chưa review, thiếu review audit, thiếu import audit và Candidate sai Chapter reference.

## Kết quả

`npm run test:vocabulary-student-catalog-v4b` PASS 9/9. Kiểm tra gồm direct ID 404, counts 6 occurrence hợp lệ dưới Tag đầu, DTO allowlist, bỏ metadata riêng tư, search regex escaped, page size bị chặn ở 100 và POST không được định nghĩa. Browser real-backend cũng xác nhận trực tiếp Draft/Archived IDs trả 404 và response không chứa các negative fixture.

Đây là kiểm tra prototype trên MongoMemoryReplSet loopback; không chứng minh production permission hoặc baseline dữ liệu thật.
