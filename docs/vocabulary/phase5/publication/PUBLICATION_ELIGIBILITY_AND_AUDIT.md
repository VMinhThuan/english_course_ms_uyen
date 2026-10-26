# Phase V5A — Publication Eligibility và Audit

## Eligibility fail-closed

Eligibility endpoint trả `eligible` cùng danh sách blocker mã hóa. Publish tự chạy evaluator lại trong transaction; kết quả summary trên UI không được coi là quyền xuất bản.

Các điều kiện được kiểm tra:

1. Actor là Admin đã được middleware tin cậy trong harness.
2. Entity tồn tại và đúng loại Catalog; Vocabulary phải có `catalogOnly=true`.
3. Chapter phải thuộc Tag đang tham chiếu; Tag cha phải Published trước Chapter.
4. Vocabulary phải có Membership hiện hữu, Membership phải trỏ đúng Vocabulary và Chapter.
5. Vocabulary phải nối đúng Candidate → Batch → source identity → Vocabulary/Chapter/Membership đã Confirm Draft.
6. Candidate phải qua structural validation, có review `APPROVE`, người duyệt/thời điểm, `KEEP_SEPARATE` khi cần và audit review khớp snapshot.
7. Phải có audit `CONFIRMED_DRAFT` khớp batch, source identity và entity IDs.
8. Nội dung Candidate khi review, Catalog Vocabulary hiện tại và content hash phải khớp; sửa nội dung sau review làm mất eligibility.
9. Entity không được Archived, Rejected hoặc đã Published; version phải đúng.
10. Client không thể truyền status hoặc field ngoài allowlist để bỏ qua các gate.

Blockers mẫu gồm `TAG_NOT_PUBLISHED`, `CHAPTER_TAG_MISMATCH`, `MEMBERSHIP_VOCABULARY_MISMATCH`, `EDITORIAL_REVIEW_REQUIRED`, `EDITORIAL_REVIEW_REJECTED`, `EDITORIAL_REVIEW_STALE`, `REVIEW_AUDIT_REQUIRED`, `CONFIRM_AUDIT_REQUIRED`, `IMPORTED_REFERENCE_MISMATCH`, `REVIEW_CONTENT_CHANGED`, `IMPORTED_CONTENT_CHANGED`, `IMPORT_PROVENANCE_REQUIRED` và `CONCURRENT_MODIFICATION`.

API hiện trả blocker cấp entity (mảng `details.blockers`); giao diện hiển thị từng mã với giải thích thân thiện. Các field validation từ import/review vẫn giữ lỗi theo Candidate.

## Audit

`VocabularyPublicationAudit` là append-only ở contract của model. Event lưu `entityType`, `entityId`, action, decision, `actorId`, `previousVersion`, `entityVersion`, `contentHash`, `idempotencyKey`, reason/details và `occurredAt`. Actions gồm editorial decision, `PUBLISHED`, `ARCHIVED`, `HIDDEN`.

Import evidence tiếp tục ở `VocabularyImportAudit`; Publication không tạo Batch/Audit import giả. Confirm audit và Publication audit khác mục đích, không thay thế nhau.

## Student boundary

Student Catalog response chỉ chiếu allowlist nội dung đã publish. Không trả `sourceIdentity`, raw/parsed values, Candidate, actor/reviewer IDs, Batch hoặc audit. Tag/Chapter archived hoặc draft bị chặn cả ở collection lẫn direct-ID API.

## Bằng chứng kiểm thử

- Role/allowlist: Teacher, Student, unauthenticated và client mass assignment bị từ chối.
- Review reject, thiếu audit, Candidate tamper, sai imported reference và membership provenance bị chặn.
- Hai Publish cạnh tranh cho cùng version tạo một thành công và một conflict.
- Retry cùng idempotency key trả đúng transition trước đó; browser E2E chủ động bỏ response đầu tiên sau khi server commit rồi retry thành công.
- Student privacy, hidden Vocabulary direct access, archived Chapter/Tag direct access và non-cascade preservation đều được kiểm tra trong isolated database.
