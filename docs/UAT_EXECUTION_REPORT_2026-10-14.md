# Báo cáo thực thi test tự động - 2026-10-14

## Kết luận

Các kiểm tra tự động đã chạy xong và không có lỗi test nào:

| Nhóm | PASS | FAIL | Trạng thái |
|---|---:|---:|---|
| Học liệu, trạng thái học viên, phân quyền | 28 | 0 | PASS |
| Assessment thường và chấm tự động | 35 | 0 | PASS |
| Hành trình sản phẩm, profile, dashboard, stats | 14 | 0 | PASS |
| TOEIC simulator, autosave, bảo mật và CSV preview | 35 | 0 | PASS |
| TOEIC Parts 1–7 và chấm điểm | 45 | 0 | PASS |
| Teacher TOEIC Builder, media, CSV và PDF import | 31 | 0 | PASS |
| Kiểm tra API trên database seed local | 14 | 0 | PASS |
| **Tổng test nghiệp vụ tự động** | **202** | **0** | **PASS** |

Frontend build thành công và toàn bộ 66 file JavaScript trong backend qua kiểm tra cú pháp.

## Môi trường đã chạy

| Hạng mục | Giá trị |
|---|---|
| Ngày chạy | 2026-10-14 |
| Ứng dụng | Frontend Vite port 5173; Backend Express port 3000 |
| Database test E2E | mongodb local, database tạm english_course_automation |
| Database seed đối chiếu | english_course |
| Sau test | Database tạm đã được xóa; ứng dụng được khởi động lại với database seed english_course |

Không có dữ liệu seed của bạn bị dùng để chạy các script ghi dữ liệu. Các script E2E được chạy trên database tạm riêng, sau đó database này đã bị drop.

## Phạm vi đã xác nhận

### 1. Xác thực, trạng thái tài khoản và phân quyền

- Đăng ký luôn ép role student và status pending, kể cả khi request cố gửi role/status khác.
- Pending, rejected và suspended bị chặn theo trạng thái.
- Approve, suspend và reactivate hoạt động.
- Student không gọi được API admin.
- Request thiếu token bị trả 401.
- Token student không thể giả mạo studentId khi cập nhật tiến độ hoặc submit attempt.

Liên quan UAT: AUTH-02 đến AUTH-18, RBAC-03 đến RBAC-07, ADM-STU-03 đến ADM-STU-06.

### 2. Khóa học, bài học, material, vocabulary và progress

- Draft/hidden lesson bị ẩn khỏi học viên và bị chặn khi gọi trực tiếp.
- Học viên mở bài học tạo progress in_progress; hoàn thành bài học cập nhật completed.
- Gọi lại access/complete không tạo progress trùng.
- Enrollment progress được tính đúng.
- Material bị cấm download trả 403.
- Vocabulary hidden không hiển thị cho học viên.

Liên quan UAT: LEARN-07 đến LEARN-15, MAT-01 đến MAT-04, VOC-01 đến VOC-04, ADM-CONT-07 đến ADM-CONT-17.

### 3. Assessment thường

- Tạo và publish assessment; assessment draft/hidden không mở được bởi học viên.
- Chấm single choice, multiple choice và fill blank.
- Điểm do server tính; client không thể sửa score, deadline hoặc đáp án đúng.
- Attempt đang làm được tiếp tục thay vì tạo bản ghi trùng.
- Submit lặp lại là idempotent; attempt của người khác bị chặn.
- Lịch sử, kết quả và admin results trả dữ liệu đúng quyền.
- attempt limit, deadline và assessment availability window được server bảo vệ.
- Không thể xóa assessment/question đang có tham chiếu hoặc attempt.

Liên quan UAT: ASM-01 đến ASM-16, ADM-ASM-01 đến ADM-ASM-19.

### 4. TOEIC

- Admin/teacher tạo đề, question group và đủ Parts 1–7.
- Draft/unpublished TOEIC test bị ẩn với học viên; publish mới hiển thị.
- Student không nhận correct answers hoặc explanation trước khi submit.
- Autosave, revision conflict 409, refresh state, flag question, timer và submit lặp lại đã qua test.
- Chấm listening, reading, part breakdown và TOEIC score đã được xác nhận.
- CSV preview phát hiện dòng không hợp lệ; CSV bulk import lưu được dữ liệu.
- Upload media chạy được.
- PDF import tạo draft, yêu cầu review trước publish, và nêu được thiếu audio listening.
- Duplicate test tạo deep copy với ID mới.

Liên quan UAT: TOEIC-ADM-01 đến TOEIC-ADM-15, TOEIC-STU-01 đến TOEIC-STU-14.

### 5. Đối chiếu database seed local

Các API dưới đây trả kết quả đúng trên database english_course hiện tại:

| Kiểm tra | Kết quả |
|---|---|
| API health | HTTP 200 |
| Login student001 và admin | HTTP 200 |
| Login pending/rejected/suspended | Đều bị chặn |
| Student dashboard | 36 lesson available, 3 completed, 3 in progress |
| Assessment khả dụng | 39 |
| TOEIC test đã publish | 3 |
| Admin stats | 142 học viên; 120 active; 12 pending; 36 published lessons; 39 assessment; 108 completed attempts; average score 97 |
| Anonymous gọi admin stats | HTTP 401 |
| Student gọi admin stats | HTTP 403 |
| File tài liệu demo | HTTP 200 |
| Frontend dev server | HTTP 200 |

## Build và kiểm tra tĩnh

| Kiểm tra | Kết quả |
|---|---|
| node --check cho 66 file JavaScript backend | PASS |
| npm run build frontend | PASS |
| Cảnh báo build | File JavaScript bundle chính khoảng 557 kB sau minify, vượt ngưỡng warning 500 kB |

Cảnh báo bundle không làm build thất bại. Đây là hạng mục tối ưu hiệu năng nên theo dõi sau nghiệm thu chức năng.

## Ghi chú về một assertion đã điều chỉnh

Lần kiểm tra seed đầu tiên báo FAIL cho admin stats dù API trả HTTP 200. Nguyên nhân là probe dùng tên field totalPublishedLessons, trong khi contract hiện tại trả publishedLessons. Sau khi đối chiếu payload và dùng đúng field, toàn bộ số liệu seed đều PASS. Đây không phải lỗi sản phẩm.

## Các case còn cần kiểm thử thủ công qua UI

Các case dưới đây không thể chứng minh đầy đủ chỉ bằng API/script:

- Bố cục và thao tác thực tế của form: AUTH-01, AUTH-07, AUTH-08, AUTH-19, AUTH-20.
- Điều hướng, empty state, nội dung hiển thị và trải nghiệm học: LEARN-01 đến LEARN-06, LEARN-13, LEARN-14, LEARN-15, MAT-01 đến MAT-03, VOC-01 đến VOC-05.
- Trình bày kết quả và review trên UI: ASM-01 đến ASM-04, ASM-08 đến ASM-12, PROF-01 đến PROF-08.
- Responsive, keyboard navigation, nhiều trình duyệt và mạng chậm: UX-01 đến UX-08.
- Kiểm tra tải/trải nghiệm thật với TOEIC full 200 câu trên browser: TOEIC-STU-12 và TOEIC-STU-13.

Các case này vẫn nằm trong UAT Master Test Cases và nên được chạy, ghi PASS/FAIL trực tiếp trong checklist.

