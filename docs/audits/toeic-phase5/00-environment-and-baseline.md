# 00 — Environment and baseline

## Repository preflight

- Repository: D:\SideProject\english_course_ms_uyen
- Branch: main
- HEAD: d8b5c49b0e6fb73e7f414798ae077a9ce713f001
- Working tree đã dirty từ Phase 1–4 trước khi kiểm thử. Checkpoint ngoài repository tại D:\SideProject\_checkpoints\english-course-phase5-preflight-20261020-120624 lưu patch tracked và bản sao untracked, không sửa working tree.
- Không reset, clean, checkout, commit, push, merge hay deploy. Các thay đổi trước đó được giữ nguyên.
- Artifact Phase 5 và sửa lỗi vẫn uncommitted.

## Runtime và công cụ

| Thành phần | Giá trị ghi nhận |
|---|---|
| OS | Microsoft Windows 11 Home Single Language |
| Node.js / npm | v22.18.0 / 10.9.3 |
| Backend | Express 4, Mongoose 8, MongoMemoryServer 11.3.0 |
| Frontend | React 18.2, Vite 6.4.4, React Router 7.18.4 |
| Browser automation | Playwright 1.64.1, Chrome channel, headless |
| PDF | docs/test-plans/master-test-plan.pdf, 22 trang, 4,141,087 bytes |
| PDF SHA-256 | 695433AD3D6D74B5249A19A816B56C745A383607A4877299169BA6CB92F26224 |

Prompt mô tả Vite 5; package hiện tại thực tế build bằng Vite 6.4.4.

## Môi trường cách ly

- MongoMemoryServer bind 127.0.0.1, tên DB sinh ngẫu nhiên.
- API và Vite bind loopback trên cổng động; API URL của frontend được đặt về test backend.
- Dùng tài khoản, khóa ký JWT, nội dung bài học/thi, PDF fixture và thư mục upload tạm được sinh cho lượt chạy.
- Playwright chỉ cho loopback, data: và blob:; các request ngoài bị abort.
- E2E đi qua React → HTTP API → Express → MongoDB cách ly, không chỉ mock Axios.
- Harness dọn DB/process/thư mục tạm khi kết thúc. Không đọc MONGODB_URI production, không dùng account thật, không gửi thông báo ngoài.

## Nguồn Master Test Plan

PDF có 31 ảnh nhúng và 16 phần/bảng chi tiết. PDF tables và CSV Phase 0 có 62 ID duy nhất. Tiêu đề/mục lục ghi 45; đây là mâu thuẫn nguồn đã được lưu lại. Ảnh trên mọi trang có ảnh đã được render và xem; liên kết test/UI và phần không chắc được mô tả tại 02-pdf-visual-reference-map.md.

Google Docs URL không đọc được bằng web channel; không đăng nhập hoặc chỉnh tài liệu.

## Suite baseline và lượt chạy Phase 5

| Suite | Baseline Phase 4 | Phase 5 |
|---|---:|---:|
| Phase 1 Security | 18 | 18 pass |
| Phase 2 Exam/Downloads | 20 | 20 pass |
| Phase 3 Admin/Reporting | 13 | 13 pass |
| Phase 4 Learning API | 5 | 5 pass |
| **Tổng** | **56** | **56 pass** |

