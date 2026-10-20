# 03 — API integration results

## Môi trường và phạm vi

Phase 1–4 suites và Phase 5 browser flow dùng Express cục bộ với MongoMemoryServer bind 127.0.0.1. Tài khoản và nội dung đều synthetic. Không gọi API/database production hoặc shared.

## Kết quả

| Nhóm | Kết quả thực tế | Bằng chứng |
|---|---|---|
| Auth/status | Login synthetic hợp lệ 200; sai mật khẩu 401; tài khoản suspended 403; session đang mở bị từ chối ở auth/me và sau activate có thể login lại. | Phase 1/3 logs; E2E AUTH_01–03, ADM_U_02 |
| Protected routes/RBAC | Route dashboard/test/lesson chưa đăng nhập về login; student bị chuyển khỏi admin route. | E2E AUTH_04/05 |
| Dashboard/progress | API trả 200; recent content không lộ filePath/fileUrl; bài thi chưa đến ngày mở hoặc hết hạn bị loại khỏi task list; result DTO có maximum score sau fix. | E2E DASH_01–04 |
| Lesson/progress | Lesson access/progress 200 cho student đã đăng ký; script/event handler không còn và marker XSS tổng hợp không chạy. | E2E LESS_02/03 |
| Materials | PDF preview/download được phép trả 200; kiểm tra byte/header/hash; tài liệu cấm tải trả 403; direct private URL không xác thực bị từ chối 401/403/404. | E2E DOC_01–03, E2E_PRIVATE_FILE_DIRECT_URL |
| Vocabulary | API vocabulary trả 200; search khớp English uppercase và tiếng Việt không dấu. | E2E VOC_01/02 |
| Exam lifecycle | Start trả 201/200; autosave tồn tại sau refresh; submit/result và attempt state/score được kiểm tra trong DB; timeout kết thúc attempt; config ẩn đáp án được tôn trọng. | Phase 2 logs; E2E EXAM_01–06 |
| Admin/student | List/detail/create/report/suspend/activate trả kết quả mong đợi; user mới được đăng nhập, password là bcrypt; search tên xử lý dấu/hoa thường. | Phase 3 logs; E2E ADM_U_01–04 |
| Reporting | Admin UI/API hiển thị attempt đã nộp; chưa xác minh bảng nhiều học viên, sort điểm giảm dần hoặc report tổng hợp theo từng học viên. | E2E REP_01 một phần; REP_02 NOT_RUN |

## Backend suites

| Suite | Tests | Pass | Fail |
|---|---:|---:|---:|
| Phase 1 Security | 18 | 18 | 0 |
| Phase 2 Exam/Downloads | 20 | 20 | 0 |
| Phase 3 Admin/Reporting | 13 | 13 | 0 |
| Phase 4 Learning API | 5 | 5 | 0 |
| **Total** | **56** | **56** | **0** |

Những assertion unit/integration này không thay thế các Master cases chưa chạy như exercise variants, hostile uploads qua mọi route, SQL injection, multi-tab/offline recovery hay toàn bộ admin/report acceptance.

