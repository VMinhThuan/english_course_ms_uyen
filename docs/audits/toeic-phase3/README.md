# TOEIC Phase 3 — Admin học viên, tiến độ và báo cáo

**Ngày hoàn tất implementation:** 2026-10-20

**Trạng thái:** `IMPLEMENTED_PENDING_VERIFICATION`

## Tóm tắt

Đã triển khai cả ba defect trong phạm vi Phase 3: tạo học viên từ admin, hồ sơ tiến độ/lịch sử học tập theo dữ liệu MongoDB, và báo cáo theo đề với bộ lọc học viên. ADM_U_04 cũng đã được kiểm chứng bằng API: tìm tên có dấu/không dấu, chữ hoa/thường và khoảng trắng thừa đều khớp; ký tự regex được xử lý như văn bản thường.

| Defect | Trạng thái | Bằng chứng chính |
|---|---|---|
| TOEIC-DEF-015 | Implemented | Tạo tài khoản qua API/UI, bcrypt hook, đăng nhập ngay bằng email hoặc username, RBAC và tranh chấp trùng lặp được kiểm thử. |
| TOEIC-DEF-016 | Implemented | Tiến độ từ Enrollment/Course.students và LearningProgress; lịch sử Standard/TOEIC qua bộ diễn giải attempt dùng chung. |
| TOEIC-DEF-017 | Implemented | Bộ chọn đề, lọc, xếp hạng, phân trang phía server và tổng hợp attempt theo trạng thái. |

## Kiểm thử

- Phase 1: 18/18 PASS.
- Phase 2: 20/20 PASS.
- Phase 3: 13/13 PASS, gồm MongoDB memory server cô lập và kiểm thử API thật trên Express.
- Backend syntax: 89 file JavaScript PASS.
- Frontend production build: PASS, 251 module được build.
- `git diff --check`: PASS.
- Browser/viewport QA: `NOT_RUN` theo giới hạn đã thống nhất.

Phase 3 MongoDB test chỉ bind loopback, dùng tên database ngẫu nhiên, xác nhận Mongoose đang disconnected trước khi khởi tạo, và đóng server sau test. Không đọc `MONGODB_URI`, không chạy seed/migration, không ghi dữ liệu shared hoặc production.

## Hạng mục đã triển khai

- Tạo tài khoản student active, chống mass assignment, chuẩn hóa email/username, trả DTO an toàn và xử lý lỗi unique-index race.
- Mở rộng đăng nhập để dùng username trong trường `email` hiện có hoặc trường `username`.
- Tính tiến độ trên bài học đã publish thuộc khóa học được đăng ký hoặc liên kết legacy; hỗ trợ phân trang khóa học và bài học.
- Chuẩn hóa `COMPLETED_SCORED`, `IN_PROGRESS`, `EXPIRED_PENDING_FINALIZATION`, `LEGACY_UNVERIFIED` cho lịch sử/báo cáo. Điểm `0` được coi là hợp lệ khi có đủ bằng chứng finalization.
- Báo cáo theo một đề được chọn; thống kê riêng attempt đã chấm, đang làm, hết hạn chờ xử lý và legacy chưa xác minh.
- Bổ sung index phục vụ lookup username, báo cáo attempt, khóa học legacy và bài học.

## Rủi ro còn lại

- Chưa chạy browser smoke/viewport QA, staging hay production.
- Index MongoDB cần được rà soát và tạo có kiểm soát khi triển khai; không chạy migration/backfill tại đây.
- RBAC admin hiện cho phép mọi tài khoản `teacher` sử dụng các route quản trị; không có ownership/scope học viên ở các route này.
- Student search dùng regex đã escape ở server và không tải toàn bộ danh sách lên trình duyệt, nhưng không có normalized index nên có thể scan nhiều User khi dữ liệu lớn.
- Phân trang offset ổn định trong một lần request; dữ liệu mới có thể làm vị trí các trang thay đổi giữa hai request.
- `npm audit --omit=dev` hiện báo 10 advisory production dependency: 6 moderate, 3 high, 1 critical. Không xác định được advisory nào mới phát sinh từ Phase 3 vì không có baseline audit đối chiếu.
- Vite báo bundle JavaScript lớn nhất khoảng 685.80 kB, vượt ngưỡng advisory 500 kB.

## Sẵn sàng cho Phase 4

Có thể dùng API và các trang này làm nền để lập kế hoạch Learning Experience & UI. Phase 3 chưa được xác nhận production-ready: cần browser QA, rà soát quyền teacher theo policy sản phẩm, kế hoạch index production và xử lý dependency advisory theo quy trình riêng.

## Tài liệu

- [00 — Phase 2 data contract verification](00-phase2-data-contract-verification.md)
- [01 — Admin student creation](01-admin-student-creation.md)
- [02 — Student progress and history](02-student-progress-and-history.md)
- [03 — Reporting API contract](03-reporting-api-contract.md)
- [04 — Implementation report](04-implementation-report.md)
- [05 — Test results](05-test-results.md)
- [06 — Risk and compatibility](06-risk-and-compatibility.md)
- [07 — Defect matrix](07-phase3-defect-matrix.csv)
