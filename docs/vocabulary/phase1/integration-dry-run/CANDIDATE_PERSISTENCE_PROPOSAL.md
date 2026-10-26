# Candidate Persistence Proposal

## Scratch prototype

Ba model mới trong scratch:

- `VocabularyImportBatch`: batch identity, schema/parser versions, source-file metadata/counts, duplicate counts và batch status.
- `VocabularyImportCandidate`: immutable source metadata, parsed/raw values, duplicate annotations, parser issues, separate `editedValues`, validation/review/publication states.
- `VocabularyImportAudit`: actor, timestamp, action, field-level before/after và review decision fields.

Persistence service kiểm tra envelope và batch trước khi tạo candidate. `sourceIdentity` là unique; retry cùng batch/evidence trả lại candidate hiện có. Identity trùng với batch hoặc evidence khác bị từ chối. Schema giữ `{}` trong `editedValues` một cách tường minh để retry comparison ổn định.

## Synthetic Mongo proof

Test chạy MongoMemoryServer trên loopback và chỉ ghi một synthetic batch/candidate:

- Hai concurrent retries cùng identity tạo đúng một candidate.
- Retry cùng evidence sau khi đã edit vẫn trả candidate đó và giữ nguyên `editedValues`/review state.
- Cùng identity nhưng payload khác trả `SOURCE_IDENTITY_COLLISION`.
- Validation chuyển thành `VALIDATION_PASSED`, trong khi review vẫn `NEEDS_REVIEW` và publication vẫn `NOT_ELIGIBLE`.
- Chỉnh `editedValues` không đổi `rawValues` hoặc `parsedValues`; audit ghi actor, thời điểm và field delta.

Không có 711 source candidates được persist. Đây là prototype contract, chưa phải quyết định schema rollout. Chưa có edit/review service; V3 cần quyết định transaction/atomicity giữa edit và audit, audit actor identity, retention, batch lifecycle và policy cho approve/reject trước khi mở API.
