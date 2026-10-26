# Phase V5A — Admin Publication UI

## Prototype

`frontend/src/features/vocabulary-catalog/VocabularyPublicationWorkspace.jsx` là workspace Admin cho trạng thái Publication. UI chỉ chạy trong fixture `frontend/tests/fixtures/vocabulary-publication-v5a.html`; không đăng ký route vào `frontend/src/routes/AppRoutes.jsx`.

`publicationApi.js` gọi các endpoint backend Publication thật. Không có cập nhật status cục bộ để giả lập thành công. Header nêu policy `PENDING_PO` và giới hạn “Prototype cô lập”.

## Nội dung hiển thị

- Tag và Chapter có Draft/Published/Archived cùng Editorial Review Approved/Rejected/Needs Review.
- Số occurrence, reviewed, unreviewed, có thể Publish và blocked.
- Blocker cho Tag/Chapter/Vocabulary; Candidate detail dialog có Candidate/Batch/source file/ordinal/validation/reviewer/time/duplicate decision và lý do chặn.
- Publish đúng thứ tự Tag → Chapter → Vocabulary, mỗi thao tác có confirmation.
- Publication audit với action, entity, actor, reason và timestamp.
- Hide Vocabulary / Archive Chapter/Tag có cảnh báo dữ liệu liên quan không bị xóa.

Mỗi thao tác gửi `expectedVersion`; Publication sử dụng `idempotencyKey`. UI giữ key cho cùng entity/action khi không nhận được response, xóa key khi có kết quả thành công, và tải lại summary sau HTTP 409. Lỗi backend hiển thị rõ, không cập nhật trạng thái lạc quan.

## Kiểm thử UI

`npm run test:vocabulary-publication-v5a:real:e2e` dùng Playwright Chromium, Vite fixture và backend thật trên MongoMemoryReplSet loopback. Kết quả PASS gồm candidate detail, review, publish thứ tự, xác nhận trước Publish, retry sau response thất lạc, Hide/Archive và layout 390px không tràn ngang.

UI này chưa phải application integration: chưa nối session/auth của ứng dụng thật, route thật hoặc API thật ngoài harness.
