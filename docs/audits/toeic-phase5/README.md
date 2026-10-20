# TOEIC Phase 5 — Full regression, UI validation and release readiness

**Ngày chạy:** 2026-10-20
**Trạng thái kiểm thử cục bộ:** hoàn tất trong phạm vi môi trường khả dụng
**Khuyến nghị phát hành:** **NO-GO**

## Tóm tắt

56 assertion của các suite backend Phase 1–4 và 36 ca Playwright E2E đều PASS. Frontend build, syntax check và Git whitespace check cũng PASS. Đã sửa và kiểm tra lại năm lỗi tìm thấy khi chuyển yêu cầu Master Test Plan thành assertion chạy được.

PDF và CSV Phase 0 có 62 ID chi tiết duy nhất. Tiêu đề/mục lục PDF vẫn ghi 45 ca; discrepancy được giữ nguyên. Ma trận cuối ghi **28 PASS, 0 FAIL, 4 BLOCKED, 30 NOT_RUN**. Chỉ 17/38 ca P1 được PASS đầy đủ nên chưa đạt nghiệm thu.

| Kết quả | Số lượng |
|---|---:|
| Master cases | 62 |
| PASS / FAIL / BLOCKED / NOT_RUN | 28 / 0 / 4 / 30 |
| Phase 1–4 backend assertions | 56/56 PASS |
| Phase 5 Playwright E2E | 36/36 PASS |

E2E dùng tài khoản và dữ liệu tổng hợp trong MongoMemoryServer tạm, bind 127.0.0.1. Browser egress bị chặn theo test policy. Không dùng database production/shared, không gửi email, không migrate, deploy, commit hay push.

## Các sửa lỗi Phase 5

- Thêm avatar/initials fallback và metadata hồ sơ trên dashboard.
- Lọc bài kiểm tra chưa đến ngày mở hoặc đã hết hạn khỏi danh sách việc cần làm.
- Trả maximum score cho kết quả gần đây để dashboard hiện điểm dạng earned / maximum.
- Hiển thị phần trăm tiến độ bài thi với progressbar có accessibility state.
- Hiển thị thời lượng làm bài theo phút/giây.

Chi tiết: [05-bug-fix-log.md](05-bug-fix-log.md).

## Gates còn mở

- P1 mới PASS 17/38; còn NOT_RUN/BLOCKED.
- Chưa có staging target được duyệt cho load test 100–120 học viên.
- Chưa có hosting/domain/SSL hoặc tài khoản Super Admin được bàn giao.
- Upload trên serverless hiện dùng thư mục tạm; chưa xác minh lưu trữ bền vững.
- Chưa chạy preflight/migration index trên staging/production.
- Backend npm audit còn ba mục Moderate trong mammoth → argparse → sprintf-js.
- Responsive chạy Chrome viewport emulation, chưa phải kiểm thử thiết bị thật/trình duyệt thứ hai.

## Deliverables

- [Environment and baseline](00-environment-and-baseline.md)
- [62-case inventory](01-master-test-case-inventory.csv)
- [PDF visual reference map](02-pdf-visual-reference-map.md)
- [API integration results](03-api-integration-results.md)
- [Browser E2E results](04-browser-e2e-results.md)
- [Bug-fix log](05-bug-fix-log.md)
- [Full regression results](06-full-regression-results.md)
- [Security and dependency review](07-security-dependency-review.md)
- [Performance and infrastructure](08-performance-and-infrastructure.md)
- [Release readiness](09-release-readiness.md)
- [Final master test matrix](10-final-master-test-matrix.csv)
- [Remaining risks](11-remaining-risks.md)
- [Evidence](evidence/)

Google Docs URL trong prompt không truy cập được qua kênh đọc hiện có. Tôi dùng PDF trong repository, đã render/đọc và đối chiếu với CSV Phase 0.

