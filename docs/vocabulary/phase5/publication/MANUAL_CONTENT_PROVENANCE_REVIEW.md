# Phase V5A — Manual Content Provenance Review

## Kết quả khảo sát

- V4A tạo Tag/Chapter thủ công dưới dạng Draft và quản lý Membership với Vocabulary Catalog hiện hữu.
- V3A tạo Candidate/Batch/Audit từ DOCX rồi Confirm Draft.
- Không tìm thấy Admin route/UI riêng để tạo một Catalog Vocabulary thủ công kèm provenance editorial tương thích.
- Harness có thể tạo Catalog-only Vocabulary ở service layer và thêm Membership qua Catalog API. Thử nghiệm này không tạo Candidate, Batch hoặc ImportAudit giả; Publish Eligibility trả `IMPORT_PROVENANCE_REQUIRED`.
- Publish gate hiện yêu cầu Candidate + Batch + review/confirm audits cho từng occurrence. Nới gate sẽ mâu thuẫn với V4B Student visibility contract.

Vì vậy, Vocabulary thủ công hiện không thể được Publish qua workflow V5A. Đây là khoảng trống nghiệp vụ cần Product Owner quyết định, không phải lỗi được khắc phục bằng cách giả lập import.

## Đề xuất khi có quyết định Product Owner

Tạo provenance type riêng, ví dụ `MANUAL_EDITORIAL_REVIEW`, với:

- origin `MANUAL`, creator và trusted reviewer IDs/timestamps;
- snapshot/hash nội dung Vocabulary và version được review;
- Chapter/Membership IDs cụ thể, duplicate decision và lý do;
- audit append-only cho tạo, sửa, review approve/reject, publish và archive;
- optimistic concurrency, idempotency và cùng Student content allowlist.

Evaluator chỉ nên chấp nhận nhánh manual khi có đầy đủ manual review evidence và cùng gate relationship/content integrity. Không tạo `VocabularyImportBatch`, `sourceIdentity` hoặc `CONFIRMED_DRAFT` giả.

## Quyết định còn thiếu

Product Owner cần duyệt: quyền tạo/review nội dung thủ công; định nghĩa creator/reviewer độc lập; yêu cầu nguồn/tài liệu tham chiếu; duplicate policy; nội dung được phép xuất bản; và cách sửa/revoke sau Publish. Cho tới lúc đó, V5A tiếp tục chặn manual Vocabulary.
