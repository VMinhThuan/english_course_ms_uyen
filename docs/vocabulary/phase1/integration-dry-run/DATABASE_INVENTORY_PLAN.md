# Database Inventory Plan

## Baseline status

`DATABASE_BASELINE_READY=BLOCKED`. Process không có `MONGODB_URI`, `MONGO_URI` hay `DATABASE_URL`. Checkout chính có `.env`, nhưng nội dung không được đọc/nạp; host, database identity và quyền read-only chưa được xác minh. Không kết nối database ứng dụng và không suy đoán số Vocabulary/LearningProgress.

## Read-only utility

Scratch thêm `npm run vocabulary:inventory:readonly`. Utility chỉ chạy khi có đủ:

- `VOCABULARY_INVENTORY_MONGODB_URI`
- `VOCABULARY_INVENTORY_EXPECTED_HOST` (host seed, gồm port nếu URI có port)
- `VOCABULARY_INVENTORY_EXPECTED_DATABASE`
- `VOCABULARY_INVENTORY_READ_ONLY_ACK=I_HAVE_VERIFIED_READ_ONLY_DB_USER`

Trước khi connect, utility so khớp host/database với URI và từ chối mismatch hoặc multi-host URI chưa được xác minh. Nó tắt auto-create/index, dùng `secondaryPreferred`, chỉ chạy `countDocuments` cho tổng Vocabulary, Catalog-only Vocabulary, legacy Vocabulary và LearningProgress; không seed, update, delete hay migrate. URI/credentials không được in ra. Chạy thử không có target đã dừng ở `INVENTORY_TARGET_CONFIRMATION_REQUIRED`, trước khi mở connection.

## Thao tác khi được cấp quyền

1. Nhận URI từ secret store và tài khoản MongoDB chỉ có quyền đọc; xác minh host/database qua nguồn triển khai có thẩm quyền.
2. Đặt bốn biến môi trường trên trong terminal riêng, không dán URI hoặc password vào chat/log.
3. Chạy `npm run vocabulary:inventory:readonly`.
4. Lưu thời điểm, commit ứng dụng, host/database đã xác minh và bốn counts.
5. Nếu URI dùng nhiều seed hosts, dừng và xác minh topology/identity trước khi mở rộng utility.

MongoMemoryServer chỉ chứng minh test isolation; không phải baseline ứng dụng.
