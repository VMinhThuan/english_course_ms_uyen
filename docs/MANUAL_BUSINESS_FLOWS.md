# Quy trình nghiệp vụ cần kiểm thử thủ công

## 1. Mục đích

Tài liệu này hướng dẫn chạy theo quy trình nghiệp vụ từ đầu đến cuối trên giao diện web, thay vì kiểm tra từng ô của [UAT_TEST_CASES.md](UAT_TEST_CASES.md).

Mỗi quy trình cần được ghi một kết quả PASS, FAIL hoặc BLOCKED. Khi FAIL, lưu ảnh màn hình, URL, tài khoản, thời điểm và bước tái hiện. Không dùng lại dữ liệu test sau khi hoàn tất; xóa hoặc đưa về draft các bản ghi được tạo trong lúc test.

Thanh toán không nằm trong phạm vi hiện tại. Dù frontend còn tệp CheckoutPage, router hiện tại không có route checkout.

## 2. Chuẩn bị

| Hạng mục | Giá trị |
|---|---|
| Web local | http://localhost:5173 |
| Backend local | http://localhost:3000 |
| Admin | admin@msuyen.local / Demo@12345 |
| Teacher | teacher1@msuyen.local / Demo@12345 |
| Student active | student001@msuyen.local / Demo@12345 |
| Student pending | pending01@msuyen.local / Demo@12345 |
| Student rejected | rejected01@msuyen.local / Demo@12345 |
| Student suspended | suspended01@msuyen.local / Demo@12345 |

### 2.1. Dữ liệu tạo trong khi test

Dùng tiền tố sau để có thể tìm và dọn dữ liệu sau test:

    UAT-MANUAL-20261015

Ví dụ: UAT-MANUAL-20261015 Course, UAT-MANUAL-20261015 Lesson, UAT-MANUAL-20261015 TOEIC.

### 2.2. Cách ghi nhận

| Cột cần ghi | Nội dung |
|---|---|
| Kết quả | PASS, FAIL hoặc BLOCKED |
| Bằng chứng | Tên ảnh/video; URL; ID course, assessment hoặc attempt |
| Dữ liệu sau bước | Số liệu cần đối chiếu trước/sau, ví dụ enrollment, điểm hoặc số attempt |
| Ticket | Mã lỗi nếu có |

## 3. Danh mục quy trình

| ID | Quy trình | Vai trò chính | Độ ưu tiên |
|---|---|---|---|
| MBF-01 | Khách xem catalog và đăng ký tài khoản | Guest, Student | P0 |
| MBF-02 | Admin duyệt, từ chối, khóa và kích hoạt học viên | Admin, Student | P0 |
| MBF-03 | Phân quyền route và menu | Student, Teacher, Admin | P0 |
| MBF-04 | Admin quản lý vòng đời khóa học | Admin | P0 |
| MBF-05 | Admin quản lý lesson, material, vocabulary | Admin, Student | P0 |
| MBF-06 | Học viên đăng ký khóa học và học lesson | Student | P0 |
| MBF-07 | Học viên học từ vựng và flashcard | Student | P1 |
| MBF-08 | Admin tạo assessment thường và publish | Admin, Student | P0 |
| MBF-09 | Học viên làm assessment thường và xem lịch sử | Student, Admin | P0 |
| MBF-10 | Teacher/Admin xây dựng đề TOEIC | Teacher hoặc Admin | P0 |
| MBF-11 | Học viên thi TOEIC và xem kết quả | Student | P0 |
| MBF-12 | Báo cáo, thống kê và truy vết kết quả | Admin | P1 |
| MBF-13 | Hồ sơ, đổi mật khẩu, đăng xuất và phục hồi phiên | Student | P0 |
| MBF-14 | Xóa dữ liệu, tính toàn vẹn và dọn dữ liệu test | Admin | P1 |
| MBF-15 | Responsive và thao tác trợ năng cơ bản | Guest, Student, Admin | P1 |

## 4. MBF-01 - Khách xem catalog và đăng ký tài khoản

**Vai trò:** Khách, sau đó học viên pending.

1. Mở trang chủ, menu Khóa học và trang chi tiết của ít nhất một khóa published.
2. Kiểm tra title, mô tả, ảnh, thông tin khóa và CTA không bị vỡ ở desktop.
3. Chọn Đăng ký, tạo email mới có dạng uat.manual.20261015+01@example.test, mật khẩu hợp lệ, họ tên và số điện thoại.
4. Sau đăng ký, thử đăng nhập ngay bằng tài khoản này.
5. Mở lại trang Login, nhập email sai định dạng, password trống, password sai và email không tồn tại.

**Kỳ vọng**

- Guest xem được catalog và course published, không xem nội dung lesson restricted.
- Tài khoản mới là student và ở trạng thái pending.
- Pending không vào được khu vực học viên; trang trạng thái/tin nhắn nêu rõ cần chờ duyệt.
- Không đăng nhập được khi sai thông tin. Không xuất hiện lỗi kỹ thuật hoặc lộ dữ liệu tài khoản.

**Ghi bằng chứng:** ảnh catalog, thông báo đăng ký, trang account status và một thông báo login lỗi.

## 5. MBF-02 - Admin duyệt, từ chối, khóa và kích hoạt học viên

**Vai trò:** Admin và các tài khoản test.

1. Login admin, vào Quản lý học viên.
2. Tìm account vừa đăng ký ở MBF-01; mở chi tiết nếu có và approve.
3. Logout admin; login account vừa được approve; kiểm tra vào được Student Dashboard.
4. Login admin; tạo thêm một account pending rồi reject account đó.
5. Đăng nhập thử account rejected.
6. Tại admin, suspend account vừa được approve; mở một tab đang login student và thực hiện thao tác mới hoặc reload.
7. Đăng nhập lại account suspended.
8. Admin activate account; đăng nhập lại account đó.
9. Reload danh sách học viên và dashboard admin sau mỗi lần đổi trạng thái.

**Kỳ vọng**

- Approve chuyển pending sang active; học viên dùng được khu vực học.
- Reject và suspend chặn đăng nhập hoặc các API bảo vệ theo thông báo trạng thái.
- Activate khôi phục quyền truy cập.
- Search/filter hiển thị đúng account và status mới sau reload.
- Tổng pending/active trên dashboard thay đổi phù hợp.

**Không làm:** không suspend tài khoản admin cuối cùng.

## 6. MBF-03 - Phân quyền route và menu

**Vai trò:** Student, Teacher, Admin.

1. Login student; kiểm tra menu không có quản trị; dán URL /admin, /admin/students, /admin/courses và /admin/toeic-tests.
2. Login admin; kiểm tra có các menu quản lý học viên, nội dung, assessment, TOEIC, kết quả và thống kê.
3. Login teacher; kiểm tra các trang course, lesson, material và TOEIC mà teacher được điều hướng tới.
4. Với teacher, thử mở trực tiếp /admin/students, /admin/results và /admin/statistics.
5. Logout và dán lại một route /student hoặc /admin trong tab mới.

**Kỳ vọng**

- Student bị đưa về khu vực học viên khi cố truy cập admin.
- Guest bị đưa về Login khi mở route bảo vệ.
- Admin dùng được tất cả màn hình quản trị.
- Teacher dùng được luồng soạn nội dung/TOEIC.

**Điểm cần xác nhận nghiệp vụ:** Mã hiện tại cho phép role teacher qua guard của toàn bộ route /admin và API admin, bao gồm student management, result và stats. Ghi rõ PASS nếu đó là chính sách mong muốn; nếu teacher chỉ được quản lý nội dung thì ghi FAIL/decision cần chốt.

## 7. MBF-04 - Admin quản lý vòng đời khóa học

**Vai trò:** Admin, Student.

1. Login admin, vào Quản lý khóa học và tạo course UAT-MANUAL-20261015 Course ở trạng thái draft.
2. Điền các trường bắt buộc, thử một lần bỏ trống title hoặc giá trị số không hợp lệ.
3. Tìm course vừa tạo, sửa mô tả/level/category/thumbnail nếu giao diện hỗ trợ, lưu rồi reload.
4. Login student và tìm course draft trong catalog hoặc thử mở theo URL.
5. Login admin, publish course, reload catalog bằng student.
6. Sửa course đã publish và kiểm tra thay đổi ở trang public/student.
7. Chuyển course về draft, kiểm tra student không còn thấy hoặc không truy cập được theo chính sách.
8. Chỉ xóa course sau khi đã xóa dữ liệu phụ thuộc do bạn tạo ở MBF-05, MBF-06 và MBF-08.

**Kỳ vọng**

- Form chặn dữ liệu thiếu/sai, không tạo course lỗi.
- Draft không hiển thị như khóa học công khai.
- Publish làm course xuất hiện đúng một lần; unpublish ẩn đúng khóa học.
- Dữ liệu sửa còn sau reload.
- Xóa course có liên kết bị chặn rõ ràng hoặc xử lý quan hệ an toàn.

## 8. MBF-05 - Admin quản lý lesson, material và vocabulary

**Vai trò:** Admin, Student.

1. Trong course test, tạo ba lesson: một published, một draft và một hidden. Đặt order phân biệt.
2. Sửa order của hai lesson published; kiểm tra thứ tự lại sau reload.
3. Với lesson published, tạo material link và upload một file nhỏ vô hại. Tạo thêm material đặt không cho download nếu có tùy chọn.
4. Tạo vocabulary có word, meaning, loại từ, ví dụ. Nếu có audio URL thì kiểm tra URL hợp lệ.
5. Login student đã enrollment course test; mở course/lesson.
6. Kiểm tra lesson published, material cho phép và vocabulary hiển thị.
7. Thử mở trực tiếp URL lesson draft, hidden; thử tải material bị cấm download.
8. Sửa material/vocabulary rồi kiểm tra UI student đã đổi; sau đó xóa vocabulary/material test.

**Kỳ vọng**

- Student thấy đúng lesson published theo thứ tự.
- Draft/hidden không xuất hiện và không mở được bằng URL.
- Material mở/tải đúng file/link. Material cấm download bị chặn rõ ràng.
- Vocabulary chỉ xuất hiện trong phạm vi lesson/course phù hợp.
- Update/xóa không làm hỏng lesson hoặc course.

## 9. MBF-06 - Học viên đăng ký khóa học và học lesson

**Vai trò:** Student active.

1. Login học viên active; mở course published hoặc course test đã publish.
2. Bấm Đăng ký học, xác nhận trên trang enroll.
3. Reload trang chi tiết course, My Courses và Dashboard.
4. Bấm đăng ký lại cùng khóa.
5. Mở lesson published thứ nhất, đọc nội dung/mở material rồi đánh dấu hoàn thành.
6. Mở lesson thứ hai nhưng không hoàn thành; quay lại dashboard/course.
7. Reload, đóng/mở lại trình duyệt và vào lại hai lesson.
8. Hoàn thành lesson còn lại; đối chiếu completed, in progress và phần trăm course/dashboard.

**Kỳ vọng**

- Tạo một enrollment duy nhất.
- Course xuất hiện tại My Courses.
- Đăng ký lại không sinh bản ghi/hiển thị trùng.
- Lesson mở tạo progress in_progress; hoàn thành chuyển completed.
- Phần trăm tổng và số lesson cập nhật bền vững sau reload.

## 10. MBF-07 - Học viên học từ vựng và flashcard

**Vai trò:** Student active.

1. Mở Từ vựng, tìm word đã tạo ở MBF-05.
2. Lọc theo topic/lesson nếu giao diện hiển thị bộ lọc.
3. Tìm từ không tồn tại, chuỗi có dấu tiếng Việt và ký tự đặc biệt.
4. Mở Flashcard từ danh sách.
5. Lật thẻ bằng chuột, Enter và Space; chuyển Previous/Next; kiểm tra nút biên bị disabled.
6. Nếu vocabulary có audioUrl, bấm phát âm và xác nhận âm thanh hoặc thông báo browser hợp lý.

**Kỳ vọng**

- Kết quả tìm/lọc đúng, không mất dữ liệu hoặc treo UI.
- Empty state rõ ràng.
- Flashcard hiển thị word, meaning, examples; thao tác lật/chuyển hoạt động bằng chuột và keyboard.

## 11. MBF-08 - Admin tạo assessment thường và publish

**Vai trò:** Admin, Student.

1. Login admin, tại Ngân hàng câu hỏi tạo tối thiểu: single choice, multiple choice, fill blank và typed answer.
2. Với mỗi dạng, kiểm tra validation thiếu question text, options hoặc correct answer.
3. Tạo assessment UAT-MANUAL-20261015 Assessment, thêm ba câu hỏi, đặt điểm từng câu, time limit, pass score, attempt limit và tùy chọn hiện/ẩn đáp án.
4. Lưu draft; mở danh sách assessment bằng student.
5. Publish assessment; reload danh sách student.
6. Sửa thứ tự và điểm câu hỏi, lưu lại, kiểm tra tổng câu hỏi/tổng điểm.
7. Thử publish assessment rỗng hoặc xóa question đang được assessment tham chiếu.

**Kỳ vọng**

- Chỉ dữ liệu question hợp lệ được tạo.
- Assessment draft không hiện cho student; assessment published hiện một lần.
- Không publish assessment rỗng.
- Assessment phản ánh đúng question, thứ tự, thời gian, điểm, limit và setting review.
- Không thể xóa question tham chiếu mà làm assessment hỏng.

## 12. MBF-09 - Học viên làm assessment thường và xem lịch sử

**Vai trò:** Student active, Admin.

1. Login student, mở assessment UAT-MANUAL-20261015 Assessment.
2. Bắt đầu bài; trả lời đúng một câu, sai một câu, bỏ trống một câu.
3. Với fill blank hoặc typed answer, bấm Phát Âm (TTS). Nếu browser hỗ trợ và microphone sẵn sàng, bấm Nói Để Nhập (STT), nói một câu trả lời rồi dừng ghi âm. Từ chối quyền microphone một lần để kiểm tra thông báo.
4. Di chuyển next/back; đổi đáp án đã chọn; reload trong lúc đang làm.
5. Nộp bài, xác nhận hộp thoại nếu có.
6. Ghi điểm, pass/fail, thời lượng và phần review. Kiểm tra setting show correct answers.
7. Bấm nộp lại hoặc mở lại trang làm bài bằng Back.
8. Mở Lịch sử làm bài, mở chi tiết kết quả.
9. Làm lại đến attempt limit; kiểm tra lần vượt limit.
10. Login admin, mở Kết quả làm bài; tìm attempt vừa tạo và đối chiếu điểm/câu trả lời.

**Kỳ vọng**

- Đáp án giữ đúng qua next/back và reload.
- TTS đọc câu hỏi; STT điền text khi browser hỗ trợ. Khi browser không hỗ trợ hoặc người dùng từ chối microphone, UI báo được nguyên nhân mà không mất câu trả lời.
- Server tính điểm; câu bỏ trống không thành câu đúng.
- Attempt submitted không sửa được và nộp lại không nhân bản kết quả.
- Lịch sử chỉ chứa attempt của chính student.
- Admin xem được attempt, score và thông tin đúng với kết quả học viên.
- Attempt limit và deadline, nếu cấu hình, được thực thi.

## 13. MBF-10 - Teacher/Admin xây dựng đề TOEIC

**Vai trò:** Teacher hoặc Admin, Student.

1. Login teacher; mở Đề thi TOEIC, tạo đề UAT-MANUAL-20261015 TOEIC ở draft.
2. Tạo hoặc sửa overview: title, description, duration và cấu hình show answers.
3. Tạo question group ở Part 1 đến Part 7. Phải có ít nhất:
   - Part 1 group có ảnh và audio nếu có file test.
   - Part 3 hoặc 4 group có nhiều câu.
   - Part 5 question đơn.
   - Part 6/7 có passage.
4. Upload image/audio bằng UI nếu có file; mở preview để kiểm tra media, passage, instruction, order và số câu.
5. Thử xóa một question và một group vừa tạo; sau đó tạo lại để xác nhận dữ liệu/preview nhất quán.
6. Thử duplicate đề và xác nhận bản sao có ID/tên riêng, không làm thay đổi đề gốc.
7. Import CSV hợp lệ bằng Preview rồi Confirm Import. Thử CSV sai để xem từng lỗi.
8. Import PDF hợp lệ. Xác nhận đề import còn draft và kiểm tra cảnh báo listening thiếu audio nếu có.
9. Login student trước khi publish: đề draft/import chưa publish không xuất hiện.
10. Publish đề manual hoặc PDF đã review; login student kiểm tra xuất hiện. Unpublish và kiểm tra bị ẩn lại.

**Kỳ vọng**

- Group thuộc đúng Part 1 đến 7; câu hỏi, thứ tự và media bám đúng group.
- Preview cho phép phát hiện lỗi nội dung trước publish.
- CSV/PDF invalid không tạo đề publish sai; PDF import luôn cần review.
- Student chỉ nhìn thấy đề published.
- Duplicate là bản sao độc lập.

## 14. MBF-11 - Học viên thi TOEIC và xem kết quả

**Vai trò:** Student active.

1. Mở Luyện thi TOEIC, kiểm tra 3 đề seed 35, 70, 200 câu.
2. Chọn đề Practice 35 câu; kiểm tra overview, số câu, thời lượng và nút bắt đầu.
3. Bắt đầu đề. Ở từng Part có dữ liệu, mở image/audio/passage, chọn đáp án, bỏ trống ít nhất một câu và đánh dấu một câu.
4. Đổi đáp án một câu, chuyển Part/câu, reload trang giữa bài làm.
5. Mở tab hai hoặc quay lại library rồi vào lại cùng đề; xác nhận attempt đang làm được tiếp tục, không tạo attempt thứ hai.
6. Nộp bài, ghi listening/reading/total score, correct/incorrect/unanswered và breakdown theo part.
7. Thử submit lại, thử sửa đáp án sau submit và mở lại attempt.
8. Mở History, kiểm tra TOEIC attempt xuất hiện; mở kết quả/review.
9. Chạy lại tối thiểu mỗi part một câu trên đề Full 200 câu để kiểm tra điều hướng, hiệu năng và footer submit.

**Kỳ vọng**

- Draft/unpublished không lộ trong thư viện.
- Đề đang làm tự lưu, giữ revision/timer/flag/answer sau refresh.
- Không lộ correct answers hoặc explanation trước submit.
- Submit tính điểm đúng và chỉ có một kết quả cho một attempt.
- Kết quả/historical breakdown đồng nhất với câu trả lời.
- Đề Full 200 câu vẫn điều hướng, autosave và submit ổn định.

## 15. MBF-12 - Báo cáo, thống kê và truy vết kết quả

**Vai trò:** Admin.

1. Login admin, mở Dashboard và Statistics.
2. Đối chiếu số seed nếu chưa làm thay đổi dữ liệu: 142 students, 120 active, 12 pending, 36 published lessons, 39 assessments và 108 completed attempts.
3. Sau MBF-02, MBF-06, MBF-09 và MBF-11, reload dashboard/statistics.
4. Mở Admin Results, tìm attempt assessment thường và TOEIC vừa tạo; mở chi tiết.
5. Vào học viên vừa test, mở tiến độ course nếu màn hình có.

**Kỳ vọng**

- Tổng số thay đổi cùng dữ liệu thật, không phải số cache cũ.
- average score hiển thị là số hợp lệ, không 0/NaN khi đã có attempt.
- Kết quả admin khớp lịch sử của student về assessment, score, status và thời gian.
- Tiến độ hiển thị đúng lesson completed/in progress của học viên.

## 16. MBF-13 - Hồ sơ, đổi mật khẩu, đăng xuất và phiên

**Vai trò:** Student active.

1. Login student, mở Hồ sơ; đối chiếu tên, email, role và status.
2. Đổi full name hợp lệ, reload và login lại.
3. Thử lưu tên trống/dữ liệu biên nếu form cho phép.
4. Đổi password: trước tiên nhập sai current password; sau đó dùng password mới mạnh.
5. Logout. Thử login bằng password cũ rồi password mới.
6. Khi đã login, reload dashboard. Mở route student ở tab mới.
7. Logout lần nữa; dán URL student/admin và kiểm tra điều hướng.

**Kỳ vọng**

- Profile update còn sau reload.
- Password sai không đổi được; password cũ bị vô hiệu sau đổi thành công.
- Phiên hợp lệ sống qua reload; logout chặn route bảo vệ.

## 17. MBF-14 - Xóa dữ liệu, toàn vẹn và dọn dữ liệu test

**Vai trò:** Admin.

Chạy cuối cùng để tránh phá dữ liệu đang cần cho flow khác.

1. Thử xóa question đang nằm trong assessment có attempt, assessment đã có attempt, lesson/material có liên kết và course có enrollment.
2. Ghi nhận thông báo chặn hoặc hành vi cascade. Không chấp nhận giao diện báo thành công nhưng để student có route lỗi.
3. Xóa theo thứ tự an toàn dữ liệu do test tạo: attempt nếu UI cho phép, TOEIC draft/test, assessment không còn attempt, questions, vocabulary, materials, lessons, course, account test.
4. Reload student catalog, My Courses, assessment list, TOEIC library và admin dashboard.
5. Search tiền tố UAT-MANUAL-20261015 để chắc không còn dữ liệu test không chủ đích.

**Kỳ vọng**

- Hệ thống chặn xóa tạo orphan hoặc nêu rõ dependency.
- Sau cleanup không còn link 404, course rỗng hoặc số liệu sai.

## 18. MBF-15 - Responsive và thao tác trợ năng cơ bản

**Vai trò:** Guest, Student, Admin.

Chạy MBF-01, MBF-06, MBF-09, MBF-10 và MBF-11 rút gọn ở các viewport sau:

| Kích thước | Mục tiêu |
|---|---|
| 360 x 800 | Mobile Android/iPhone |
| 768 x 1024 | Tablet |
| 1024 x 768 | Laptop nhỏ |
| 1440 x 900 | Desktop |

1. Kiểm tra menu hamburger, đóng menu bằng backdrop, scroll body và không che nút logout.
2. Ở assessment và TOEIC, kiểm tra chọn đáp án, next/back, submit, timer và review không cần scroll ngang.
3. Dùng Tab, Shift+Tab, Enter và Space với Login, Register, Flashcard, form admin và các nút submit.
4. Kiểm tra Chrome, Edge và Firefox nếu có.
5. Giả lập mạng chậm khi tải list hoặc nộp bài; kiểm tra loading/error/retry.

**Kỳ vọng**

- Không có text/nút bị che hoặc không bấm được.
- Focus nhìn thấy được, keyboard thao tác form và flashcard.
- Không mất đáp án khi mạng chậm; lỗi hiển thị rõ ràng.

## 19. Điều kiện hoàn thành kiểm thử thủ công

- Tất cả MBF P0 PASS.
- Không còn FAIL về quyền, truy cập dữ liệu người khác, mất attempt/progress, chấm điểm sai, hoặc publish nội dung không hợp lệ.
- Mọi FAIL P1 được tạo ticket có bước tái hiện và bằng chứng.
- Dữ liệu có tiền tố UAT-MANUAL-20261015 được dọn hoặc được ghi nhận lý do giữ lại.

## 20. Nhật ký quy trình

| ID | Người test | Ngày | Kết quả | Bằng chứng/ticket | Ghi chú |
|---|---|---|---|---|---|
| MBF-01 | | | | | |
| MBF-02 | | | | | |
| MBF-03 | | | | | |
| MBF-04 | | | | | |
| MBF-05 | | | | | |
| MBF-06 | | | | | |
| MBF-07 | | | | | |
| MBF-08 | | | | | |
| MBF-09 | | | | | |
| MBF-10 | | | | | |
| MBF-11 | | | | | |
| MBF-12 | | | | | |
| MBF-13 | | | | | |
| MBF-14 | | | | | |
| MBF-15 | | | | | |

