# Phase V1 — trạng thái database baseline

## Kết luận

**DATABASE_BASELINE_BLOCKED.** Không xác minh được database ứng dụng local nào được phép đọc. Cấu hình backend lấy MONGODB_URI, nhưng môi trường hiện tại không có biến tên MONGO/DATABASE và không có file .env trong root/backend của worktree. Không đọc giá trị bí mật, không thử kết nối URI.

## Phạm vi thao tác

Không kết nối, đọc hoặc ghi database ứng dụng. Không chạy migration, backfill, import DOCX hay publish. Không thu thập Vocabulary counts, Lesson-linked records, LearningProgress references, bookmark references, orphan references hoặc duplicate candidates; các số liệu này là UNKNOWN, không phải zero.

Kiểm thử mới dùng riêng MongoMemoryServer với bind 127.0.0.1 và database vocabulary_catalog_v1_test; test kiểm tra host, tự đóng connection/server và chỉ tạo fixture disposable. Đây không phải baseline của ứng dụng.

backend/src/configs/database.js chỉ cho autoIndex trong development/test khi MONGOOSE_AUTO_INDEX=true. Vì vậy khai báo index trong model không chứng minh index đã tồn tại trên database triển khai.

## Điều kiện để mở gate

Cần xác nhận rõ target là database local/test, cung cấp kết nối read-only và xác minh host/database/topology trước khi chạy truy vấn kiểm kê. Chỉ sau đó mới thống kê số lượng, orphan, liên kết và duplicate; tuyệt đối không dùng production.

**Gate:** DATABASE_BASELINE_READY = NO — DATABASE_BASELINE_BLOCKED.
