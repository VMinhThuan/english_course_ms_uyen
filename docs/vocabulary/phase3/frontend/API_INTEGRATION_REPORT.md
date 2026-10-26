# Phase V3B — API integration report

## API client

`frontend/src/features/vocabulary-import/api.js` là client riêng, không import `axiosInstance` hoặc `vocabularyApi` legacy. Mặc định dự kiến prefix `/api/v1/admin/vocabulary-import-batches`; có thể truyền `baseUrl`, `fetchImpl` và header provider khi khởi tạo harness. Request dùng `credentials: include`; client mặc định không gán token, actor hoặc role. Browser fixture mới inject token tổng hợp vào harness test.

| Method | V3A path | UI use |
|---|---|---|
| `POST` | `/admin/vocabulary-import-batches` | Multipart `files` (1–5) + `sourceFolder`. |
| `GET` | `/:batchId` | Mở/refresh batch và version/counts. |
| `GET` | `/:batchId/candidates?page&limit&search&status&reviewStatus&validationStatus` | Preview, filter, page 20. |
| `GET` | `/:batchId/candidates/:candidateId` | Source detail và audit timeline. |
| `PATCH` | `/:batchId/candidates/:candidateId` | `{ expectedVersion, reason, changes }`. |
| `POST` | `/:batchId/candidates/:candidateId/review` | `{ expectedVersion, decision, reason?, duplicateDecision? }`. |
| `POST` | `/:batchId/confirm` | `{ expectedVersion, candidateIds }`. |

Client test xác nhận multipart boundary do `fetch` tạo, query được encode, credentials được gửi, HTTP 409 giữ status/code và network failure được phân biệt. Browser test xác nhận PATCH chỉ mang `expectedVersion`, `reason`, `changes` với allowlist field `word`, `partOfSpeech`, `senses`, `notes`.

## Version và lỗi mạng

- Edit/review dùng `candidate.version` mới nhất trong response. Confirm dùng `batch.version` và đúng tập candidate được chọn.
- Candidate 409 không ghi đè local form; UI lấy detail mới nhất riêng, giữ nguyên bản local để so sánh và chỉ thay thế khi reviewer bấm “Tải bản máy chủ”.
- Confirm timeout/transport failure không hiện thành công. Selection bị khóa; Admin tải lại Batch để thấy imported candidates/version mới và chọn lại tập chưa nhập.
- Retry upload sử dụng lại file và `sourceFolder` còn trong component; backend V3A nhận dạng batch theo hash/path/schema và trả batch cũ khi upload trùng.
- API response thực tế được dùng cho status/count/result IDs. `publicationStatus` vẫn `NOT_ELIGIBLE`.

## Khoảng trống contract

1. V3A chưa có `GET batch list`; giao diện mở lại bằng Batch ID. Không thêm endpoint giả.
2. V3A nhận `sourceFolder` dạng text, chưa có Tag-list endpoint hoặc Tag ID picker. UI yêu cầu Admin xác nhận label; mapping Tag thực tế vẫn phụ thuộc backend prototype.
3. Prefix mặc định trong client chưa hoạt động qua application API vì prototype route chưa được mount. Browser test truyền trực tiếp URL của harness.
4. Quyền Admin, role review, CSRF, upload scanning, retention và production rate limits chưa có policy được duyệt; synthetic bearer chỉ nằm trong harness test.
5. UI không giữ bytes DOCX trong storage sau reload. Admin cần chọn lại file nếu muốn retry một request upload đã mất response sau khi đóng/tải lại trang.

## Database scope

Real browser E2E tạo DOCX trong bộ nhớ và chạy V3A router trên `MongoMemoryReplSet` tại `127.0.0.1`, database `vocabulary_v3b_browser_test`. Không nạp `.env`, không dùng application URI, không mount router vào `backend/src/app.js`, không đọc/ghi Catalog ứng dụng.
