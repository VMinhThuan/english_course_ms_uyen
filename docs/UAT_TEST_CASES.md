# UAT Master Test Cases - English Course MS Uyen

## 1. Mục đích và phạm vi

Tài liệu này là bộ kiểm thử nghiệm thu thủ công cho hệ thống English Course MS Uyen. Nó được lập từ:

- Phạm vi của tài liệu đề xuất ban đầu: đăng nhập, dashboard, khóa học, bài học, tài liệu, từ vựng, bài tập/đánh giá, lịch sử, hồ sơ, quản trị nội dung, quản trị học viên, báo cáo, phân quyền và responsive.
- FLOW hiện tại và mã nguồn đang chạy local.
- Phần TOEIC Builder/Test là phần mở rộng đã có trong hệ thống, vì vậy được kiểm thử riêng.

Thanh toán không nằm trong phạm vi nghiệm thu vì tài liệu gốc không yêu cầu chức năng này.

Mỗi test case có cột Kết quả để người test ghi PASS, FAIL, BLOCKED hoặc N/A, cùng ghi chú/bằng chứng nếu cần.

## 2. Chuẩn bị môi trường

| Hạng mục | Giá trị |
|---|---|
| Frontend | http://localhost:5173 |
| Backend API | http://localhost:3000/api/v1 |
| MongoDB local | mongodb://127.0.0.1:27017/english_course |
| Mật khẩu chung dữ liệu demo | Demo@12345 |
| Chạy ứng dụng | npm run dev tại thư mục gốc |
| Seed demo, chỉ khi database trống | npm --prefix backend run seed:demo |

### 2.1. Tài khoản seed

| Vai trò/tình trạng | Tài khoản | Mật khẩu | Mục đích |
|---|---|---|---|
| Admin | admin@msuyen.local | Demo@12345 | Quản trị toàn bộ |
| Giáo viên | teacher1@msuyen.local | Demo@12345 | Kiểm tra role teacher |
| Học viên active | student001@msuyen.local | Demo@12345 | Luồng học chính |
| Học viên pending | pending01@msuyen.local | Demo@12345 | Kiểm tra chờ duyệt |
| Học viên rejected | rejected01@msuyen.local | Demo@12345 | Kiểm tra bị từ chối |
| Học viên suspended | suspended01@msuyen.local | Demo@12345 | Kiểm tra bị khóa |

Sau khi seed mới, dữ liệu nền dự kiến có 147 người dùng, 6 khóa học, 48 bài học, 96 tài liệu, 960 từ vựng, 665 câu hỏi, 39 assessment, 3 TOEIC test, 360 enrollment, 1.440 learning progress và 118 attempt.

### 2.2. Dữ liệu đối chiếu sau seed mới

Các số liệu dưới đây dùng để phát hiện thiếu dữ liệu hoặc sai tổng hợp. Chúng sẽ thay đổi sau khi thực hiện các test có tạo/sửa/xóa dữ liệu.

| Màn hình/API | Kỳ vọng ban đầu |
|---|---|
| Admin Dashboard tổng học viên | 142 |
| Admin Dashboard học viên active | 120 |
| Admin Dashboard học viên pending | 12 |
| Admin Dashboard bài học published | 36 |
| Admin Dashboard assessment | 39 |
| Admin Dashboard attempt đã hoàn tất | 108 |
| Danh sách assessment học viên | 39 mục |
| TOEIC test | 3 đề: 35, 70 và 200 câu |
| Dashboard student001 | 36 bài học khả dụng; 3 completed; 3 in progress |

## 3. Quy ước thực hiện

| Mức độ | Ý nghĩa |
|---|---|
| P0 | Luồng cốt lõi, lỗi thì không thể nghiệm thu |
| P1 | Chức năng quan trọng cần hoàn tất trước bàn giao |
| P2 | Biên, trải nghiệm, hoặc trường hợp ít gặp |

Với các case tạo/sửa/xóa, chụp màn hình trước và sau thao tác. Với lỗi hiển thị, ghi lại thông báo, URL, role đang đăng nhập và dữ liệu đầu vào.

## 4. Test case xác thực và phiên đăng nhập

| ID | Pri | Tiền điều kiện | Bước thực hiện | Kỳ vọng | Kết quả/Ghi chú |
|---|---|---|---|---|---|
| AUTH-01 | P0 | Chưa đăng nhập | Mở trang login | Form email, password, nút đăng nhập và link đăng ký hiển thị | |
| AUTH-02 | P0 | Chưa đăng nhập | Đăng nhập student001@msuyen.local với mật khẩu đúng | Đăng nhập thành công và vào khu vực học viên | |
| AUTH-03 | P0 | Chưa đăng nhập | Đăng nhập admin@msuyen.local với mật khẩu đúng | Đăng nhập thành công và vào dashboard quản trị | |
| AUTH-04 | P1 | Chưa đăng nhập | Đăng nhập teacher1@msuyen.local | Được xác thực; không có quyền admin nếu không phải admin | |
| AUTH-05 | P0 | Chưa đăng nhập | Nhập email đúng, mật khẩu sai | Không đăng nhập; thông báo lỗi rõ ràng; không lộ chi tiết hệ thống | |
| AUTH-06 | P1 | Chưa đăng nhập | Nhập email không tồn tại | Không đăng nhập; thông báo không phân biệt hữu ích cho việc dò tài khoản | |
| AUTH-07 | P1 | Chưa đăng nhập | Bỏ trống email hoặc mật khẩu rồi gửi form | Client validation hoặc API validation báo trường bắt buộc | |
| AUTH-08 | P1 | Chưa đăng nhập | Nhập email sai định dạng | Không gửi thành công; thông báo định dạng email | |
| AUTH-09 | P0 | Chưa đăng nhập | Đăng nhập pending01@msuyen.local | Không vào luồng học bình thường; trạng thái chờ duyệt được thông báo đúng | |
| AUTH-10 | P0 | Chưa đăng nhập | Đăng nhập rejected01@msuyen.local | Bị từ chối theo đúng trạng thái; không nhận token dùng được | |
| AUTH-11 | P0 | Chưa đăng nhập | Đăng nhập suspended01@msuyen.local | Bị chặn; không vào được khu vực học hoặc admin | |
| AUTH-12 | P1 | Chưa đăng nhập | Đăng ký học viên mới với email hợp lệ | Tạo tài khoản theo trạng thái nghiệp vụ và hiển thị hướng dẫn đúng | |
| AUTH-13 | P1 | Chưa đăng nhập | Đăng ký lại bằng email đã tồn tại | Không tạo trùng; thông báo email đã dùng | |
| AUTH-14 | P1 | Đã login | Reload trang bất kỳ | Phiên hợp lệ vẫn được khôi phục hoặc điều hướng đăng nhập rõ ràng khi hết phiên | |
| AUTH-15 | P0 | Đã login | Đăng xuất rồi mở lại route bảo vệ bằng URL | Token bị xóa; không truy cập được dữ liệu riêng tư | |
| AUTH-16 | P1 | Đã login | Để phiên access token hết hạn, tiếp tục gọi thao tác cần login | Refresh token làm mới phiên hợp lệ hoặc đưa về login rõ ràng | |
| AUTH-17 | P0 | Chưa login | Mở trực tiếp route học viên, admin và TOEIC bằng URL | Route bảo vệ không hiển thị dữ liệu khi thiếu token | |
| AUTH-18 | P1 | Đã login student | Sửa token trong local storage thành chuỗi bất kỳ, reload | Hệ thống từ chối token và quay lại login | |
| AUTH-19 | P2 | Chưa login | Gửi nhiều lần nút login khi mạng chậm | Không tạo nhiều phiên hoặc thông báo chồng chéo khó hiểu | |
| AUTH-20 | P2 | Chưa login | Dùng khoảng trắng đầu/cuối email và password | Hành vi nhất quán; email được xử lý hợp lý, password không tự thay đổi sai | |

## 5. Phân quyền và điều hướng

| ID | Pri | Tiền điều kiện | Bước thực hiện | Kỳ vọng | Kết quả/Ghi chú |
|---|---|---|---|---|---|
| RBAC-01 | P0 | Login student | Quan sát menu | Chỉ thấy các mục học viên được cấp quyền | |
| RBAC-02 | P0 | Login admin | Quan sát menu | Thấy các khu vực quản trị cần thiết | |
| RBAC-03 | P0 | Login student | Dán URL trang admin | Bị chặn hoặc điều hướng khỏi admin | |
| RBAC-04 | P0 | Login teacher | Dán URL admin quản lý người dùng | Bị chặn nếu teacher không được quyền | |
| RBAC-05 | P0 | Login student | Thử gọi API admin bằng token học viên qua Postman/devtools | Nhận 401/403; dữ liệu không bị thay đổi | |
| RBAC-06 | P0 | Login không hợp lệ | Gọi API có Authorization sai | Nhận 401; không có dữ liệu nhạy cảm | |
| RBAC-07 | P1 | Login admin | Tạo nội dung, logout, login student | Student chỉ thấy nội dung đủ điều kiện published/visible | |
| RBAC-08 | P1 | Login student | Đi theo tất cả menu và Back/Forward trình duyệt | URL, tiêu đề, trang hiển thị và quyền luôn nhất quán | |

## 6. Dashboard, khóa học và tiến độ học viên

| ID | Pri | Tiền điều kiện | Bước thực hiện | Kỳ vọng | Kết quả/Ghi chú |
|---|---|---|---|---|---|
| LEARN-01 | P0 | Login student001 | Mở dashboard | Thấy thống kê học tập, tiến độ và kết quả gần đây | |
| LEARN-02 | P1 | Seed mới, login student001 | Đối chiếu dashboard với dữ liệu nền | Hiện 36 bài khả dụng, 3 completed, 3 in progress, progress 8 phần trăm | |
| LEARN-03 | P0 | Login student | Mở danh sách khóa học | Các khóa published hiển thị thông tin cơ bản, ảnh/nội dung và trạng thái phù hợp | |
| LEARN-04 | P0 | Login student | Mở chi tiết một khóa đã publish | Hiển thị mô tả, lesson, metadata và nút học/đăng ký phù hợp | |
| LEARN-05 | P0 | Login student chưa enrollment vào khóa mục tiêu | Thực hiện đăng ký khóa học | Tạo enrollment một lần, thông báo thành công và cập nhật trạng thái UI | |
| LEARN-06 | P1 | Đã enrollment | Bấm đăng ký lại cùng khóa | Không tạo enrollment trùng; UI báo/giữ trạng thái đã đăng ký | |
| LEARN-07 | P0 | Login student, đã enrollment | Mở lesson published | Nội dung lesson tải đúng và chỉ hiện tài liệu được phép | |
| LEARN-08 | P0 | Login student | Mở lesson draft hoặc hidden bằng URL nếu biết id | Không được xem nội dung không công khai | |
| LEARN-09 | P0 | Login student, lesson mở được | Đánh dấu lesson hoàn thành | LearningProgress chuyển completed; dashboard/course progress cập nhật | |
| LEARN-10 | P1 | Login student, lesson mở được | Mở lesson nhưng chưa hoàn tất rồi thoát | Progress in_progress được ghi nhận theo hành vi hệ thống | |
| LEARN-11 | P1 | Đã completed lesson | Đánh dấu hoàn thành lại/reload | Không nhân đôi progress hoặc làm sai tỷ lệ khóa học | |
| LEARN-12 | P1 | Login student | Hoàn tất nhiều lesson của một course | Tổng completed, tỷ lệ phần trăm và danh sách course đồng bộ | |
| LEARN-13 | P1 | Login student | Mở recent results từ dashboard | Đi đến attempt/assessment tương ứng hoặc hiển thị kết quả đúng | |
| LEARN-14 | P2 | Login student | Mở course/lesson không tồn tại bằng URL | Trang lỗi/empty state rõ ràng, không vỡ giao diện | |
| LEARN-15 | P2 | Login student | Chuyển nhanh giữa 2 khóa và reload | Không chảy dữ liệu lesson/progress giữa các khóa | |

## 7. Tài liệu học và từ vựng

| ID | Pri | Tiền điều kiện | Bước thực hiện | Kỳ vọng | Kết quả/Ghi chú |
|---|---|---|---|---|---|
| MAT-01 | P0 | Login student, mở lesson có material | Quan sát danh sách tài liệu | Tên, loại, mô tả và link hợp lệ hiển thị đúng | |
| MAT-02 | P0 | Login student | Mở tài liệu file demo | File tải/mở được; URL không trả 404; nội dung đúng tệp chọn | |
| MAT-03 | P1 | Login student | Mở material dạng external link | Link điều hướng an toàn và không làm mất trạng thái sai | |
| MAT-04 | P1 | Login student | Mở material không thuộc lesson/course được cấp | Bị chặn nếu truy cập không hợp lệ | |
| VOC-01 | P0 | Login student | Mở trang từ vựng | Danh sách vocabulary hiển thị word, meaning và thông tin liên quan | |
| VOC-02 | P1 | Login student | Tìm một từ có tồn tại | Kết quả lọc đúng, không mất từ khóa khi điều hướng hợp lý | |
| VOC-03 | P1 | Login student | Tìm từ không tồn tại | Empty state rõ ràng, giao diện không lỗi | |
| VOC-04 | P1 | Login student | Lọc theo lesson/course nếu UI hỗ trợ | Chỉ trả vocabulary thuộc phạm vi đã chọn | |
| VOC-05 | P2 | Login student | Dùng ký tự tiếng Việt, dấu nháy, emoji trong ô tìm kiếm | Không lỗi front end/API và không trả kết quả bất thường | |

## 8. Hồ sơ và lịch sử học tập

| ID | Pri | Tiền điều kiện | Bước thực hiện | Kỳ vọng | Kết quả/Ghi chú |
|---|---|---|---|---|---|
| PROF-01 | P0 | Login student | Mở Profile | Hiện đúng email, tên, role và thông tin tài khoản hiện tại | |
| PROF-02 | P0 | Login student | Cập nhật họ tên hợp lệ | Lưu thành công, reload vẫn còn dữ liệu mới | |
| PROF-03 | P1 | Login student | Cập nhật với tên trống/quá dài/ký tự đặc biệt | Validation rõ ràng, không ghi dữ liệu lỗi | |
| PROF-04 | P1 | Login student | Thử sửa email sang email đã tồn tại nếu UI/API cho phép | Không tạo email trùng; báo lỗi hợp lệ | |
| PROF-05 | P0 | Login student | Mở lịch sử assessment | Thấy các attempt của chính mình, không thấy attempt người khác | |
| PROF-06 | P1 | Login student | Mở một attempt trong lịch sử | Điểm, số câu, ngày làm và chi tiết khớp với kết quả lúc nộp bài | |
| PROF-07 | P1 | Login student | Thử mở attempt id của student khác bằng URL/API | Bị chặn hoặc không tìm thấy | |
| PROF-08 | P2 | Login student | Cập nhật profile ở hai tab liên tiếp | Ứng dụng xử lý kết quả cuối nhất quán; không crash | |

## 9. Assessment thường - làm bài, nộp bài và kết quả

| ID | Pri | Tiền điều kiện | Bước thực hiện | Kỳ vọng | Kết quả/Ghi chú |
|---|---|---|---|---|---|
| ASM-01 | P0 | Login student | Mở danh sách assessment | Chỉ assessment khả dụng/published hiển thị, có tiêu đề và thông tin cần thiết | |
| ASM-02 | P0 | Login student | Bắt đầu một assessment có câu trắc nghiệm | Tạo/mở attempt cho đúng assessment và student hiện tại | |
| ASM-03 | P0 | Đang làm bài | Chọn đáp án, sang câu kế tiếp/quay lại | Câu trả lời đã chọn được giữ lại chính xác | |
| ASM-04 | P0 | Đang làm bài | Bỏ trống một câu rồi nộp | Có cảnh báo/hành vi đã thiết kế; điểm chỉ tính các câu trả lời | |
| ASM-05 | P0 | Đang làm bài | Chọn toàn bộ đáp án đúng rồi nộp | Attempt submitted, điểm tuyệt đối hoặc theo tổng điểm question | |
| ASM-06 | P0 | Đang làm bài | Chọn toàn bộ đáp án sai rồi nộp | Điểm 0/đúng theo scoring; không lỗi chia cho 0 | |
| ASM-07 | P0 | Đang làm bài | Nộp một bộ đáp án hỗn hợp | Điểm, scorePercentage và số câu đúng khớp đáp án | |
| ASM-08 | P0 | Đang làm bài | Reload trang trước khi nộp | Attempt in_progress/answers được khôi phục hoặc thông báo theo thiết kế, không tạo attempt sai | |
| ASM-09 | P0 | Đang làm bài | Mở assessment trên tab hai rồi nộp ở tab một | Không ghi đè hoặc tạo kết quả mâu thuẫn | |
| ASM-10 | P1 | Assessment có time limit | Để hết thời gian | Tự nộp/chặn nộp trễ theo thiết kế; thời gian và score nhất quán | |
| ASM-11 | P1 | Assessment không time limit | Làm bài lâu hơn vài phút | Không tự hết hạn sai | |
| ASM-12 | P1 | Đã nộp | Mở trang kết quả | Hiện điểm, phần trăm, đáp án/giải thích theo quyền cấu hình | |
| ASM-13 | P1 | Đã nộp | Thử sửa câu trả lời bằng back hoặc gọi API submit lần nữa | Không sửa attempt submitted ngoài chính sách cho phép | |
| ASM-14 | P1 | Assessment có maxAttempts | Làm đến giới hạn attempt | Không thể bắt đầu attempt vượt giới hạn; thông báo rõ ràng | |
| ASM-15 | P1 | Assessment có maxAttempts lớn/rỗng | Làm lại nhiều lần | Số lần và lịch sử hiển thị đúng; attempt cũ không mất | |
| ASM-16 | P2 | Login student | Dán assessment id không tồn tại, malformed hoặc không published | Không lộ stack trace; nhận trạng thái lỗi hợp lệ | |

### 9.1. Ma trận loại câu hỏi assessment

Thực hiện ASM-02 đến ASM-13 cho từng loại câu hỏi mà admin tạo được. Mỗi ô là một test cần có kết quả riêng.

| Nhóm test | multiple_choice | true_false | fill_blank | matching | ordering | short_answer |
|---|---:|---:|---:|---:|---:|---:|
| Chọn/trả lời đáp án hợp lệ | | | | | | |
| Không trả lời | | | | | | |
| Nhập ký tự biên/Unicode | | | | | | |
| Nộp đáp án đúng | | | | | | |
| Nộp đáp án sai | | | | | | |
| Reload khi đang làm | | | | | | |
| Hiển thị review/kết quả | | | | | | |

## 10. Quản trị học viên

| ID | Pri | Tiền điều kiện | Bước thực hiện | Kỳ vọng | Kết quả/Ghi chú |
|---|---|---|---|---|---|
| ADM-STU-01 | P0 | Login admin | Mở danh sách học viên | Danh sách có phân trang/tìm kiếm/lọc theo UI hiện có; không lỗi với 142 học viên | |
| ADM-STU-02 | P0 | Login admin | Lọc pending | Thấy 12 học viên pending sau seed mới | |
| ADM-STU-03 | P0 | Login admin | Approve một pending user | Status thành active; user đăng nhập được | |
| ADM-STU-04 | P0 | Login admin | Reject một pending user | Status thành rejected; user không vào luồng học | |
| ADM-STU-05 | P0 | Login admin | Suspend một active user | Status thành suspended; phiên/tác vụ mới bị chặn theo thiết kế | |
| ADM-STU-06 | P1 | Login admin | Reactivate một suspended user nếu UI hỗ trợ | User có thể đăng nhập/học lại đúng trạng thái active | |
| ADM-STU-07 | P1 | Login admin | Tìm theo email/tên có tồn tại | Trả đúng user, không lọc nhầm role/status | |
| ADM-STU-08 | P1 | Login admin | Tìm chuỗi không tồn tại | Empty state rõ ràng | |
| ADM-STU-09 | P0 | Login admin | Thử cập nhật status cho admin khác hoặc chính mình | Hệ thống áp dụng quy tắc an toàn, không tự khóa mất quyền quản trị ngoài ý muốn | |
| ADM-STU-10 | P1 | Login admin | Reload sau approve/reject/suspend | Status mới được lưu bền vững và số liệu dashboard cập nhật | |

## 11. Quản trị course, lesson, material và vocabulary

| ID | Pri | Tiền điều kiện | Bước thực hiện | Kỳ vọng | Kết quả/Ghi chú |
|---|---|---|---|---|---|
| ADM-CONT-01 | P0 | Login admin | Tạo course với dữ liệu hợp lệ | Tạo thành công; xuất hiện trong admin | |
| ADM-CONT-02 | P1 | Login admin | Tạo course thiếu title/field bắt buộc | Không tạo; validation rõ ràng | |
| ADM-CONT-03 | P0 | Login admin | Publish course mới rồi login student | Course xuất hiện cho student theo điều kiện hiện hành | |
| ADM-CONT-04 | P0 | Login admin | Chuyển course về draft/unpublish | Student không còn thấy/course không mở được theo chính sách | |
| ADM-CONT-05 | P1 | Login admin | Sửa title, description, level, category hoặc thumbnail | Lưu đúng; reload và UI student phản ánh dữ liệu mới | |
| ADM-CONT-06 | P1 | Login admin | Xóa course chưa có dữ liệu phụ thuộc hoặc thực hiện thao tác được UI cho phép | Kết quả thành công rõ ràng; không để liên kết mồ côi | |
| ADM-CONT-07 | P0 | Login admin, có course | Tạo lesson published hợp lệ | Lesson gắn đúng course, đúng order, student thấy khi đủ điều kiện | |
| ADM-CONT-08 | P0 | Login admin | Tạo lesson draft | Admin thấy; student không thấy/mở được | |
| ADM-CONT-09 | P0 | Login admin | Tạo lesson hidden | Admin thấy; student không thấy/mở được | |
| ADM-CONT-10 | P1 | Login admin | Sửa thứ tự 2 lesson | Thứ tự student xem khớp giá trị order, không trùng/sai lạc | |
| ADM-CONT-11 | P1 | Login admin | Nhập duration/order âm, chữ vào trường số hoặc giá trị biên | Validation chặn dữ liệu sai | |
| ADM-CONT-12 | P0 | Login admin, có lesson | Tạo material external link hợp lệ | Material gắn đúng lesson và mở được ở student | |
| ADM-CONT-13 | P0 | Login admin | Upload/khai báo material file hợp lệ | File được phục vụ được; metadata đúng | |
| ADM-CONT-14 | P1 | Login admin | Material URL rỗng/sai định dạng/không tồn tại | Không lưu sai hoặc hiển thị lỗi có thể xử lý | |
| ADM-CONT-15 | P0 | Login admin, có lesson | Tạo vocabulary hợp lệ | Vocabulary hiện trong lesson/danh sách student đúng phạm vi | |
| ADM-CONT-16 | P1 | Login admin | Tạo vocabulary thiếu word/meaning | Validation báo trường bắt buộc | |
| ADM-CONT-17 | P1 | Login admin | Sửa/xóa vocabulary | Thay đổi phản ánh chính xác; không xóa nhầm vocabulary khác | |
| ADM-CONT-18 | P2 | Login admin | Nhập title/description chứa HTML/script | Nội dung hiển thị an toàn; không thực thi script | |

## 12. Quản trị question và assessment thường

| ID | Pri | Tiền điều kiện | Bước thực hiện | Kỳ vọng | Kết quả/Ghi chú |
|---|---|---|---|---|---|
| ADM-ASM-01 | P0 | Login admin | Mở Question Management | Danh sách question tải được ở dữ liệu lớn; filter/search hoạt động nếu có | |
| ADM-ASM-02 | P0 | Login admin | Tạo multiple choice đủ questionText, options, correctAnswer | Lưu thành công và có thể dùng trong assessment | |
| ADM-ASM-03 | P0 | Login admin | Tạo true/false hợp lệ | Lưu và chấm đúng | |
| ADM-ASM-04 | P0 | Login admin | Tạo fill blank hợp lệ | Lưu và chấm/đánh giá theo rule hiện hành | |
| ADM-ASM-05 | P0 | Login admin | Tạo matching hợp lệ | Lưu được cấu trúc match và student làm bài đúng | |
| ADM-ASM-06 | P0 | Login admin | Tạo ordering hợp lệ | Lưu thứ tự và chấm đúng | |
| ADM-ASM-07 | P0 | Login admin | Tạo short answer hợp lệ | Lưu được; trạng thái chấm được xác định đúng | |
| ADM-ASM-08 | P1 | Login admin | Tạo question thiếu correct answer/options không hợp lệ | Validation chặn, nêu rõ field cần sửa | |
| ADM-ASM-09 | P1 | Login admin | Sửa question đang được assessment sử dụng | Hành vi snapshot/reference đúng; dữ liệu attempt cũ không bị hỏng | |
| ADM-ASM-10 | P1 | Login admin | Xóa question đang được assessment sử dụng | Không để assessment lỗi; bị chặn hoặc xử lý liên kết theo thiết kế | |
| ADM-ASM-11 | P0 | Login admin | Tạo assessment mới và thêm question | Assessment lưu được; tổng số câu và điểm hiển thị đúng | |
| ADM-ASM-12 | P1 | Login admin | Tạo assessment không có question/thiếu title | Validation chặn; không publish assessment rỗng | |
| ADM-ASM-13 | P0 | Login admin | Publish assessment mới, login student và mở danh sách | Assessment xuất hiện và làm bài được | |
| ADM-ASM-14 | P0 | Login admin | Unpublish assessment đã có attempt | Student không bắt đầu attempt mới; lịch sử cũ vẫn truy cập đúng nếu được phép | |
| ADM-ASM-15 | P1 | Login admin | Đặt timeLimit, passingScore, maxAttempts ở 0/âm/rất lớn | Validation và semantics nhất quán | |
| ADM-ASM-16 | P1 | Login admin | Sửa/xóa assessment đã có attempt | Không hỏng report/attempt/history; thông báo rủi ro nếu có | |
| ADM-ASM-17 | P0 | Login admin | Mở Result Management | Danh sách attempt, học viên, assessment, điểm và ngày hiển thị đúng | |
| ADM-ASM-18 | P1 | Login admin | Lọc/tìm attempt theo student, assessment hoặc trạng thái | Kết quả khớp bộ lọc; không rò dữ liệu sai | |
| ADM-ASM-19 | P1 | Login admin | Mở chi tiết kết quả một attempt | Câu trả lời, điểm, snapshot và metadata khớp attempt đã nộp | |

## 13. TOEIC Builder và quản trị đề TOEIC

| ID | Pri | Tiền điều kiện | Bước thực hiện | Kỳ vọng | Kết quả/Ghi chú |
|---|---|---|---|---|---|
| TOEIC-ADM-01 | P0 | Login admin | Mở TOEIC test management | Thấy 3 đề seed: 35, 70, 200 câu; trạng thái hiển thị đúng | |
| TOEIC-ADM-02 | P0 | Login admin | Tạo đề TOEIC với title, type và cấu hình hợp lệ | Lưu đề thành công, xuất hiện trong danh sách admin | |
| TOEIC-ADM-03 | P0 | Login admin | Thêm question group cho Part 1 | Group có partNumber, passage/instruction/audio/image theo dữ liệu nhập | |
| TOEIC-ADM-04 | P0 | Login admin | Thêm group/câu cho đủ Parts 1 đến 7 | Part, group order, question order và tổng số câu đúng | |
| TOEIC-ADM-05 | P1 | Login admin | Tạo group với partNumber ngoài 1..7 | Validation chặn | |
| TOEIC-ADM-06 | P1 | Login admin | Tạo TOEIC question thiếu options/correctAnswer với dạng cần lựa chọn | Validation chặn và không tạo đề lỗi | |
| TOEIC-ADM-07 | P0 | Login admin | Publish đề TOEIC mới | Student thấy đề và bắt đầu làm được | |
| TOEIC-ADM-08 | P0 | Login admin | Unpublish đề TOEIC | Student không thấy/không bắt đầu đề mới | |
| TOEIC-ADM-09 | P1 | Login admin | Sửa group/question đã xuất bản | Hành vi snapshot/revision không làm sai kết quả attempt cũ | |
| TOEIC-ADM-10 | P1 | Login admin | Xóa question group đang được test sử dụng | Không để test publish bị hỏng; có chặn hoặc xử lý liên kết rõ ràng | |
| TOEIC-ADM-11 | P1 | Login admin | Nhập CSV hợp lệ theo template hệ thống | Import thành công; số group/câu đúng; báo cáo dòng lỗi nếu có | |
| TOEIC-ADM-12 | P1 | Login admin | Import CSV thiếu cột bắt buộc | Không import một phần mơ hồ; thông báo cột/dòng sai | |
| TOEIC-ADM-13 | P1 | Login admin | Import CSV có part không hợp lệ, order trùng, đáp án không tồn tại | Validation nêu được lỗi có thể sửa | |
| TOEIC-ADM-14 | P1 | Login admin | Upload audio/image hợp lệ nếu UI hỗ trợ | File được liên kết đúng group/question và tải được | |
| TOEIC-ADM-15 | P2 | Login admin | Upload tệp sai loại/quá lớn/link file hỏng | Bị chặn hoặc thông báo lỗi thân thiện; không tạo bản ghi hỏng | |

## 14. TOEIC - luồng học viên

| ID | Pri | Tiền điều kiện | Bước thực hiện | Kỳ vọng | Kết quả/Ghi chú |
|---|---|---|---|---|---|
| TOEIC-STU-01 | P0 | Login student | Mở danh sách TOEIC | Thấy 3 đề đã publish; thông tin số câu/thời lượng đúng | |
| TOEIC-STU-02 | P0 | Login student | Bắt đầu đề Practice 35 câu | Mở đúng đề, tạo attempt phù hợp, câu theo group/part | |
| TOEIC-STU-03 | P0 | Đang làm TOEIC | Làm Part 1 có media nếu có | Image/audio/instruction liên kết với group hiển thị/phát được | |
| TOEIC-STU-04 | P0 | Đang làm TOEIC | Chuyển giữa Part 1 đến Part 7 | Không mất đáp án; điều hướng đúng nhóm và số thứ tự câu | |
| TOEIC-STU-05 | P0 | Đang làm TOEIC | Bấm chọn đáp án, đổi đáp án, quay lại | Chỉ đáp án cuối được lưu và hiển thị đúng | |
| TOEIC-STU-06 | P0 | Đang làm TOEIC | Nộp đề 35 câu với đáp án hỗn hợp | Điểm đúng số câu; kết quả theo part nếu có hiển thị đúng | |
| TOEIC-STU-07 | P1 | Đang làm TOEIC | Bỏ trống nhiều câu rồi nộp | Hệ thống cảnh báo/cho nộp theo thiết kế; không tự tính câu bỏ trống là đúng | |
| TOEIC-STU-08 | P0 | Đang làm TOEIC | Reload tab/trở lại danh sách rồi vào lại | Attempt đang làm và đáp án được khôi phục theo thiết kế | |
| TOEIC-STU-09 | P0 | Đang làm TOEIC có time limit | Để đồng hồ hết giờ | Đề tự nộp/khóa đúng; không tiếp tục sửa đáp án sau hạn | |
| TOEIC-STU-10 | P1 | Đã nộp TOEIC | Mở kết quả | Thấy tổng điểm, câu đúng/sai, part breakdown/review theo cấu hình | |
| TOEIC-STU-11 | P1 | Đã nộp TOEIC | Mở lại URL làm bài của attempt submitted | Không thể thay đổi đáp án của attempt đã nộp | |
| TOEIC-STU-12 | P1 | Login student | Làm Mini 70 câu | Hiệu năng điều hướng, scroll, lưu đáp án ổn định | |
| TOEIC-STU-13 | P0 | Login student | Làm Full 200 câu, tối thiểu mỗi Part 1 câu và nộp | Không timeout request, không mất state, tổng số câu đúng 200 | |
| TOEIC-STU-14 | P2 | Login student | Mở đề đã unpublish bằng URL/id cũ | Bị chặn/không tìm thấy, không lộ nội dung đề | |

## 15. Báo cáo, thống kê và tính đúng dữ liệu

| ID | Pri | Tiền điều kiện | Bước thực hiện | Kỳ vọng | Kết quả/Ghi chú |
|---|---|---|---|---|---|
| STAT-01 | P0 | Seed mới, login admin | Mở Admin Dashboard | Hiện được tổng user/student/course/lesson/assessment/attempt mà không lỗi | |
| STAT-02 | P0 | Seed mới | Đối chiếu student, active, pending với bảng dữ liệu nền | 142, 120, 12 tương ứng | |
| STAT-03 | P0 | Seed mới | Đối chiếu published lesson và assessment | 36 lesson published, 39 assessment | |
| STAT-04 | P0 | Seed mới | Đối chiếu completed attempt | 108 submitted attempt được tính đúng | |
| STAT-05 | P1 | Có một attempt vừa submit | Reload admin dashboard/result management | Attempt mới được tính vào thống kê/danh sách phù hợp | |
| STAT-06 | P1 | Có pending vừa approve | Reload admin dashboard | Pending giảm 1, active tăng 1 và total student ổn định | |
| STAT-07 | P1 | Login admin | Kiểm tra average score khi có attempt scorePercentage | Giá trị có nghĩa, không luôn 0, NaN hoặc Infinity | |
| STAT-08 | P2 | Có lọc thời gian nếu UI hỗ trợ | Chọn khoảng ngày rỗng và khoảng ngày có dữ liệu | Tổng/biểu đồ phản ánh filter và empty state rõ ràng | |

## 16. API, validation và bảo mật cơ bản

Các case này chạy bằng Postman/Insomnia hoặc tab Network; không cần UI riêng.

| ID | Pri | Bước thực hiện | Kỳ vọng | Kết quả/Ghi chú |
|---|---|---|---|---|
| API-01 | P0 | Gọi GET /health | HTTP 200 và trạng thái service hợp lệ | |
| API-02 | P0 | Gọi endpoint private không Authorization | HTTP 401, không trả dữ liệu private | |
| API-03 | P0 | Gọi endpoint admin bằng token student | HTTP 403/401, không thay đổi dữ liệu | |
| API-04 | P1 | Gửi JSON body sai kiểu cho endpoint tạo/sửa | HTTP 400/422 và thông báo field lỗi, không 500 | |
| API-05 | P1 | Gửi ObjectId sai định dạng trong URL/body | HTTP 400/404 có kiểm soát, không stack trace | |
| API-06 | P1 | Gửi id hợp lệ nhưng không tồn tại | HTTP 404 có thông báo rõ ràng | |
| API-07 | P0 | Gọi POST submit attempt hai lần gần như đồng thời | Không nhân đôi điểm/kết quả sai; kết quả cuối nhất quán | |
| API-08 | P1 | Đổi studentId/courseId/attemptId trong body request | Server lấy quyền sở hữu từ token hoặc chặn thao tác trái quyền | |
| API-09 | P1 | Gửi query search chứa ký tự regex/JSON đặc biệt | Không crash, không trả vượt phạm vi và không có injection | |
| API-10 | P1 | Chèn thẻ script trong text content qua admin | Khi student mở trang, script không thực thi | |
| API-11 | P1 | Mở URL file upload không tồn tại | Nhận 404 phù hợp, không lộ đường dẫn máy chủ | |
| API-12 | P2 | Gửi request nhanh liên tiếp cho search/list | Service không lỗi 500, UI không render lẫn dữ liệu | |

## 17. Responsive, trình duyệt và trải nghiệm

| ID | Pri | Tiền điều kiện | Bước thực hiện | Kỳ vọng | Kết quả/Ghi chú |
|---|---|---|---|---|---|
| UX-01 | P1 | Chưa login | Kiểm tra login/register tại 360px, 768px, 1024px, 1440px | Không che form/nút; có thể hoàn tất đăng nhập | |
| UX-02 | P1 | Login student | Kiểm tra dashboard, course list, lesson, vocabulary ở 4 kích thước | Menu, card, bảng, text và nút không tràn khó dùng | |
| UX-03 | P0 | Login student | Kiểm tra assessment/TOEIC trên mobile 360px | Chọn đáp án, next/back, submit thực hiện được không cần zoom ngang | |
| UX-04 | P1 | Login admin | Kiểm tra bảng admin ở mobile/tablet | Có scroll/thu gọn hợp lý; action không bị mất | |
| UX-05 | P1 | Bất kỳ | Dùng bàn phím Tab, Shift+Tab, Enter, Escape qua form chính | Focus nhìn thấy; thứ tự hợp lý; có thể submit bằng keyboard | |
| UX-06 | P2 | Bất kỳ | Kiểm tra Chrome, Edge, Firefox phiên bản hiện hành | Luồng P0 không khác biệt đáng kể | |
| UX-07 | P2 | Bất kỳ | Giả lập mạng chậm/offline khi tải list và submit | Có loading/error state rõ ràng; không mất dữ liệu âm thầm | |
| UX-08 | P2 | Bất kỳ | Refresh trang 404/route sâu | Server/Vite trả ứng dụng và route được render hoặc lỗi rõ ràng | |

## 18. Kiểm thử tải dữ liệu seed

| ID | Pri | Tiền điều kiện | Bước thực hiện | Kỳ vọng | Kết quả/Ghi chú |
|---|---|---|---|---|---|
| DATA-01 | P1 | Seed mới | Mở list user/admin với 142 học viên | UI không trắng/trì hoãn bất thường; tìm/lọc dùng được | |
| DATA-02 | P1 | Seed mới | Mở vocabulary với 960 bản ghi, tìm 10 từ khác nhau | Kết quả đúng, không lặp/thiếu rõ rệt | |
| DATA-03 | P1 | Seed mới | Mở question management với 665 question | Danh sách tải được, filter/search không lỗi | |
| DATA-04 | P1 | Seed mới | Mở một course với 8 lesson và material/vocabulary liên quan | Quan hệ course-lesson-material-vocabulary đúng | |
| DATA-05 | P1 | Seed mới | Mở result management với 118 attempt | Pagination/list/detail ổn định; attempt in_progress và submitted được phân biệt | |
| DATA-06 | P0 | Seed mới | Làm TOEIC Full 200 câu, có thể theo từng part | Không mất đáp án hoặc crash do số lượng câu lớn | |

## 19. Tiêu chí nghiệm thu

- Toàn bộ case P0 phải PASS.
- Không còn lỗi blocker/critical: đăng nhập sai quyền, mất dữ liệu attempt, xem/sửa dữ liệu người khác, assessment/TOEIC không nộp được, hoặc admin không quản trị được nội dung.
- Các case P1 FAIL phải có ticket, mức độ ảnh hưởng, cách tái hiện và kế hoạch xử lý được thống nhất.
- Sau các case tạo/sửa/xóa, chạy lại các case đối chiếu ở mục 2.2 và mục 15 để xác nhận dữ liệu không bị hỏng.
- Lưu ảnh/video và request-response của mọi case FAIL/BLOCKED cùng ID test case.

## 20. Nhật ký chạy test

| Ngày | Người test | Build/commit | Môi trường | Tổng PASS | Tổng FAIL | Tổng BLOCKED | Ghi chú |
|---|---|---|---|---:|---:|---:|---|
| | | | Local | | | | |

