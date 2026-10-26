# Phase V3A — Security và permissions

## Quyền

Router không tự xác thực token và không đăng ký vào application router. Factory bắt buộc nhận trusted `authenticateAdmin` middleware; sau đó kiểm tra principal `req.user` có ObjectId và role Admin. Body/query/multipart `role` hoặc `actorId` không cấp quyền. Test chỉ dùng synthetic Admin/Teacher identity.

Đây không phải quyết định policy production. Ai được quản trị Tag/Chapter, Admin/Teacher boundary, route production, review authority và publication policy vẫn cần PO phê duyệt.

## Upload và DOCX package

- Chỉ nhận `.docx`; MIME phải nằm trong allowlist; signature phải là ZIP và Parser V2.1 xác thực package/OOXML thật.
- Mỗi file tối đa 10 MiB; Batch tối đa 5 file và tổng 25 MiB; multipart giới hạn field, metadata và file count.
- Parser mặc định giới hạn input 20 MiB, entry 16 MiB, XML part 8 MiB, tổng uncompressed 64 MiB, 2.000 entries và compression ratio 1.000:1.
- ZIP entry path, duplicate entries, compression, streamed size và CRC được kiểm tra; yêu cầu đủ OOXML parts.
- DTD/entity bị từ chối. Internal relationship phải trỏ tới part tồn tại. External relationships chỉ được ghi warning, không fetch/network access.
- Candidate count tối đa 2.500 mỗi batch prototype.

## Payload và dữ liệu

- Edit/review/confirm dùng body field allowlist và nested allowlist; client không thể set identity, actor, source, statuses, import refs hoặc audit.
- Edit bắt buộc optimistic version và reason; validate lại values trước review.
- Text edit được chuẩn hóa Unicode NFC; markup HTML và control characters bị từ chối; độ dài, số senses/examples/notes bị giới hạn. Frontend vẫn phải render text theo escaping mặc định.
- Search giới hạn 80 ký tự, regex được escape. API lỗi không trả stack, MongoDB details, credentials, absolute path hoặc parser raw error.
- File path lưu từ source-folder label và basename; không lưu path client tuyệt đối.

## Atomicity và database isolation

Edit + audit, review + audit, Confirm Draft + audit/Membership đều dùng transaction. Replica-set support là điều kiện chạy; không có fallback báo thành công khi ghi một phần.

Service áp dụng guard cho mọi API read/write: MongoDB host phải là `127.0.0.1`, DB name phải kết thúc `_test`. Test dùng MongoMemoryReplSet loopback. Không nạp `.env`, không đọc `MONGODB_URI`, không connect database ứng dụng và không chạy migration/index trên app database.

Audit ghi actor ObjectId, timestamp, field before/after, reason, decision và Confirm refs. Candidate source/parsed/raw fields dùng immutable schema fields; API không cho mass assignment.

## Trạng thái security

Prototype tests bao gồm unauthenticated/client-role/Teacher rejection, MIME/signature/invalid OOXML/size limit, nested mass assignment, HTML payload, optimistic concurrency và loopback test DB. Production threat model, secret-backed Admin auth, CSRF/rate limiting, retention/immutability policy cho audit và upload malware/content scanning chưa được phê duyệt hoặc kiểm chứng.
