# Phase 2 data contract verification

**Trạng thái:** PASS trong disposable MongoDB memory server, gồm route integration và đối chiếu persisted documents. Đây không phải xác nhận trên production MongoDB.

## Contract được xác minh

| Thành phần | Contract |
|---|---|
| Standard | Engine `standard`; attempt kết thúc ở `status: submitted`. |
| TOEIC | Engine `toeic`; attempt kết thúc ở `status: completed`; giữ breakdown TOEIC hiện có. |
| Assessment/student | `assessment` và `student` là reference trong Attempt; attempt mới lưu `engine`. Legacy thiếu engine được giải từ `Assessment.examFormat`; engine xung đột bị từ chối. |
| Điểm đã chấm | Status phải khớp engine; `score` là số finite từ 0 đến `maxScore`; `maxScore` finite và lớn hơn 0; `submittedAt` là Date. Điểm 0 có thể hợp lệ. |
| Chưa xác minh | Terminal status sai engine, thiếu score/maxScore/submittedAt, maxScore không dương hoặc score vượt maxScore được gắn `LEGACY_UNVERIFIED`, không hiển thị thành 0 điểm. |
| Đang làm/hết hạn | `in_progress` với deadline còn hiệu lực là `IN_PROGRESS`. `isExpired: true` hoặc `deadlineAt <= now` là `EXPIRED_PENDING_FINALIZATION`. |
| Finalization | Standard/TOEIC dùng lifecycle và scoring hiện hữu. Khi quá hạn, chỉ dữ liệu answers đã lưu được chấm; payload đến muộn bị bỏ qua. Submit lặp không đổi kết quả đã lưu. |
| Autosave | Cần revision hiện tại và compare-and-swap nguyên tử. Thiếu revision trả HTTP 428 `REVISION_REQUIRED`; revision cũ conflict. Legacy không có revision tiếp tục theo compatibility rule của Phase 2. |

Các logical state trên chỉ dùng cho reporting; không đổi enum đang lưu trong MongoDB. Bộ diễn giải nằm tại `backend/src/utils/attemptReporting.js` và pipeline report/history dùng chung cùng quy tắc.

## MongoDB test environment

`backend/tests/phase3Admin.integration.test.js` fail-closed nếu Mongoose không disconnected lúc bắt đầu, khởi tạo `MongoMemoryServer` gắn `127.0.0.1` với database `phase3_integration_<UUID>`, kiểm tra host và database name trước khi connect. JWT secret được sinh ngẫu nhiên cho test. Server Express dùng cổng loopback ngẫu nhiên. Teardown đóng HTTP server, disconnect Mongoose và dừng memory server.

Harness không đọc `MONGODB_URI`, không dùng default URI/database, không gọi seed hay migration, và không chạy `dropDatabase`. Test dùng fixtures riêng; không có secret production được in ra log.

## Bằng chứng integration

Trong nhóm Phase 2 route integration, các API response và persisted state được đối chiếu cho:

1. Standard manual submit → `submitted` và score được lưu.
2. TOEIC manual submit → `completed`, score và breakdown được lưu.
3. Timeout Standard và TOEIC → điểm dựa trên answer map đã lưu.
4. Late answer payload bị bỏ qua ở cả hai engine.
5. Submit trùng trả kết quả lưu sẵn, không ghi đè answers.
6. Năm request finalization đồng thời trả cùng kết quả terminal.
7. Wrong-engine request cho cả hai hướng trả 409 và không đổi status/answers.
8. Hai autosave đồng thời cùng revision cho một request thành công và request còn lại conflict; thiếu revision trả 428, không tăng revision.
9. Attempt limit dương chặn lượt mới; `attemptLimit=0` vẫn cho phép Standard và TOEIC.
10. Legacy attempt thiếu `engine`/`revision` được xử lý theo compatibility contract.
11. Đọc `/api/v1/attempts/history` không đổi score, submittedAt hoặc updatedAt của attempt terminal.

Phase 3 còn kiểm tra báo cáo đồng thời với Standard submit và timeout recovery. Kết quả có thể phản ánh một trong hai trạng thái hợp lệ theo thứ tự commit; request kế tiếp phải thấy trạng thái cuối. GET reporting không tự finalization attempt hết hạn. Không có thay đổi scoring formula hay cách tính điểm mới.

## Giới hạn

Các kết quả này xác nhận route/API và MongoDB behavior trong in-memory server cùng phiên bản dependency hiện tại. Chúng không xác nhận hiệu năng trên dữ liệu lớn, tương thích với MongoDB production đang chạy, hoặc behavior sau deploy.
