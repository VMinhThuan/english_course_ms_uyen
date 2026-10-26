# Phase V3A — Import API Prototype

## Phạm vi

Đây là router prototype tách rời tại `backend/src/routes/vocabularyImportPrototypeRoutes.js`. Router không được import hoặc đăng ký trong `backend/src/app.js`, `vocabularyRoutes.js` hay route index của ứng dụng. Router cần được tạo cùng middleware `authenticateAdmin` do caller cung cấp; middleware phải xác thực principal phía server và đặt `req.user`. Request body, query, form field hoặc header role không được dùng để tạo identity.

Service từ chối mọi thao tác ngoài MongoDB loopback có tên database kết thúc bằng `_test`. Hành vi này giới hạn cả read và write cho prototype. Confirm/edit/review dùng transaction; database không hỗ trợ transaction trả lỗi `TRANSACTION_REQUIRED` và không ghi từng phần.

## API surface

Prefix được dùng trong harness: `/admin/vocabulary-import-batches`.

| Method | Path | Hành vi |
|---|---|---|
| POST | `/` | Nhận 1–5 DOCX multipart field `files` và metadata tùy chọn `sourceFolder`; parse, tạo/reuse Batch idempotent và lưu Candidates. |
| GET | `/:batchId` | Trả metadata, trạng thái và counts của Batch. |
| GET | `/:batchId/candidates` | Preview có phân trang, search, lọc status/review/validation và row errors. |
| GET | `/:batchId/candidates/:candidateId` | Trả Candidate cùng audit timeline. |
| PATCH | `/:batchId/candidates/:candidateId` | Sửa các trường biên tập được, validate lại và ghi field audit. |
| POST | `/:batchId/candidates/:candidateId/review` | Approve hoặc reject một Candidate. |
| POST | `/:batchId/confirm` | Confirm các Candidate đã approve thành Catalog Draft. Có thể truyền `candidateIds` để chọn tập con. |

Batch upload giới hạn 10 MiB mỗi file, tối đa 5 file và tổng 25 MiB. Path lưu trong response chỉ là relative path được dựng từ nhãn `sourceFolder` và basename của filename; không nhận hoặc trả absolute path.

## Hợp đồng edit/review

PATCH yêu cầu `{ expectedVersion, reason, changes }`. `changes` chỉ nhận `word`, `partOfSpeech`, `senses`, `notes`. Sense nhận `partOfSpeech`, `meaning`, `examples`; example nhận `english`, `vietnamese`. Cấm mọi trường identity, source, parser, status, import reference hoặc audit do client tự gán. `expectedVersion` phải bằng Mongoose `__v` hiện tại.

Review nhận `{ expectedVersion, decision, reason?, duplicateDecision? }`. `decision` chỉ là `APPROVE` hoặc `REJECT`; reject bắt buộc có lý do. Approve chỉ nhận Candidate validation hợp lệ. Khi Candidate có duplicate/source-revision annotation, reviewer phải chọn `duplicateDecision: "KEEP_SEPARATE"`; prototype không có tùy chọn reuse/merge. Approval không tạo Published content.

Confirm nhận `{ expectedVersion, candidateIds? }`. Nếu không truyền IDs, service chọn các Candidate đã approve. Candidate chưa hợp lệ/chưa approve được trả trong `rowErrors`; mọi Draft được tạo trong một transaction. Retry Candidate đã import trả lại các IDs cũ, không tạo Vocabulary hoặc audit lặp.

## Pagination và response states

`page` bắt đầu từ 1; `limit` từ 1 đến 100; `search` tối đa 80 ký tự và được escape trước khi dùng regex. Có thể lọc bằng `status`, `reviewStatus` hoặc `validationStatus`.

Candidate trả các facet riêng:

- `parseStatus`: `PARSED`.
- `validationStatus`: `NOT_RUN`, `VALIDATION_PASSED` hoặc `VALIDATION_FAILED`.
- `reviewStatus`: `NEEDS_REVIEW`, `EDITED`, `REVIEW_APPROVED` hoặc `REVIEW_REJECTED`.
- `importStatus`: `NOT_IMPORTED` hoặc `IMPORTED_AS_DRAFT`.
- `publicationStatus`: luôn `NOT_ELIGIBLE` trong V3A.
- `status`: trạng thái tổng hợp cho UI: `PARSED`, `VALID`, `INVALID`, `REVIEW_APPROVED`, `REVIEW_REJECTED` hoặc `IMPORTED_AS_DRAFT`.

Batch status phản ánh `PARSED`, `NEEDS_REVIEW`, `REVIEW_COMPLETE`, `PARTIALLY_CONFIRMED_DRAFT` hoặc `CONFIRMED_DRAFT`.

Lỗi API dùng mã ổn định, status HTTP và thông báo đã lược bỏ stack, MongoDB URI, parser internals và raw source. Các mã thường gặp gồm `INVALID_DOCX`, `DOCX_RESOURCE_LIMIT`, `INVALID_PAYLOAD`, `MASS_ASSIGNMENT_REJECTED`, `CONCURRENT_MODIFICATION`, `DUPLICATE_DECISION_REQUIRED`, `TRANSACTION_REQUIRED` và `PROTOTYPE_DATABASE_ONLY`.

## Hạn chế tích hợp

Đây là API trong isolated harness, chưa có production authentication policy, không đăng ký router vào ứng dụng và không phải contract public. Max 5 files/batch là giới hạn của prototype; có thể tăng sau review resource budget và upload policy. Parser version được ghi trong Batch; cùng schema/path/hash sẽ trả Batch hiện có để giữ edit/review state khi retry.
