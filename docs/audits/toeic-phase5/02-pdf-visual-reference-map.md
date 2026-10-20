# 02 — PDF visual reference map

## Cách kiểm tra

Đã render và xem trực tiếp toàn bộ trang PDF có ảnh nhúng. 31 ảnh nằm trong các trang 4–6, 8–16 và 18–20. Page rendering giữ được bố cục tổng thể; chữ nhỏ trong nhiều ảnh không đủ rõ để đọc. Liên kết test case dùng bảng gần ảnh và phần tiếp nối; nơi không có mã ảnh gắn case riêng được đánh dấu là gần đúng.

## Bản đồ ảnh

| Trang PDF | Ảnh nhúng | Case/UI liên quan | So sánh với browser evidence |
|---:|---|---|---|
| 4 | img_p3_1 (360×646) | LESS_01, sidebar/module trên mobile | Có dashboard/course captures; chưa kiểm thử sắp xếp module/sidebar mobile. NOT_RUN. |
| 5 | img_p4_1–img_p4_5 | LESS_02, lesson/course content và layout | lesson-desktop.png kiểm tra nội dung/sanitization một phần; chưa xác minh toàn bộ text/image/link/responsive. NOT_RUN tổng thể. |
| 6 | img_p5_1–img_p5_2 | LESS_02, ghi chú tiếp nối về layout, tài liệu, navigation | Chưa có đủ navigation/mobile E2E tương đương. |
| 8 | img_p7_1–img_p7_2 | LESS_02, tiếp nối màn hình mobile/navigation | Chưa có so sánh trạng thái tương ứng. |
| 9 | img_p8_1–img_p8_2 | LESS_02, tiếp nối progress/navigation mobile | Dashboard mobile không thay thế lesson-specific checks. |
| 10 | img_p9_1 | VOC_01, vocabulary detail | flashcard-desktop.png; E2E kiểm tra IPA/meaning/example và flashcard; phần loại từ/full layout chưa đủ assertion. NOT_RUN tổng thể. |
| 11 | img_p10_1 | VOC_02, vocabulary list/search | Search interaction pass; không có pixel/layout comparison riêng. |
| 12 | img_p11_1–img_p11_4 | EX_VOC_03, fill-in exercise | Không có exercise E2E. NOT_RUN. |
| 13 | img_p12_1 | EX_VOC_03, continuation/mobile | Không có mobile exercise E2E. NOT_RUN. |
| 14 | img_p13_1 | EX_VOC_04, free-typing exercise | Không có exercise E2E. NOT_RUN. |
| 15 | img_p14_1–img_p14_2 | EXAM_01, pre-test và màn hình thi | Functional assertions chạy; có assessment desktop/result screenshots, chưa pixel-compare. |
| 16 | img_p15_1 | SEC_EXAM_01, multi-tab integrity | Multi-tab chưa chạy. NOT_RUN. |
| 18 | img_p17_1–img_p17_3 | ADM_U_01/02/03, student create/status/profile | Có admin-student-created, suspended-active-session, admin-student-detail captures. ADM_U_03 chỉ partial. |
| 19 | img_p18_1–img_p18_3 | ADM_L_02 / ADM_EX_01, ảnh tại hàng kề/tiếp nối | Chưa chạy đầy đủ lesson/exam-bank admin CRUD; ánh xạ ảnh gần đúng. |
| 20 | img_p19_1–img_p19_2 | ADM_EX_01/02, REP_02, ảnh tiếp nối | admin-results.png xác nhận một attempt; chưa kiểm tra nhiều học viên/sắp xếp. |

Trang 6, 8, 9, 13 và 20 là phần tiếp nối bảng trước đó. Bản PDF không định danh test case cho từng ảnh; không khẳng định ánh xạ chính xác hơn nguồn.

## Browser captures đã xem

Dashboard desktop 1920, tablet 768 và mobile 412/375; course list; lesson; PDF preview; flashcard; exam result/unanswered/auto-submit; mobile question sheet; admin profile; suspension; results. Ảnh trong evidence là ứng dụng chạy local với dữ liệu tổng hợp. Đây là bằng chứng hành vi/viewport, chưa phải sign-off so sánh đủ 31 ảnh.

