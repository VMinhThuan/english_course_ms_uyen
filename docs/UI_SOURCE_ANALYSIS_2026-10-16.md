# Phân tích hiện trạng UI và source - 2026-10-16

## 1. Kết luận

Checklist UI phản ánh đúng hiện trạng chung: sản phẩm có luồng backend và nghiệp vụ tương đối hoàn chỉnh, nhưng frontend đang được ghép từ nhiều đợt phát triển với ba hệ giao diện khác nhau. Vì vậy các màn hình có thể hoạt động nhưng trông không cùng một sản phẩm.

Có bốn điểm cần xử lý như lỗi/chênh lệch chức năng trước khi polish giao diện:

| Mức | Vấn đề | Kết luận |
|---|---|---|
| P0 | Filter chủ đề ở quản lý từ vựng làm mất các lựa chọn khác | Xác nhận được từ source |
| P0 | Route course detail là route public, nằm ngoài StudentLayout | Xác nhận được từ source; gây mất sidebar |
| P1 | Trang kết quả không có search, sort, pagination; API cũng chưa hỗ trợ đủ | Xác nhận được từ source |
| P1 | Teacher được phép vào toàn bộ /admin, gồm học viên và thống kê | Cần xác nhận lại chính sách nghiệp vụ |

Những nhận xét về typography, button, card, bảng và badge không phải là các lỗi rời lẻ. Chúng có cùng nguyên nhân: chưa có một design system dùng chung và nhiều page dùng CSS inline.

## 2. Bằng chứng từ source

### 2.1. Ba ngôn ngữ giao diện đang cùng tồn tại

| Lớp | Bằng chứng | Hệ quả nhìn thấy |
|---|---|---|
| Global | frontend/src/index.css: biến màu slate/yellow, font mặc định Segoe UI | Khung ứng dụng mới mang phong cách dashboard hiện đại |
| Trang chủ | frontend/src/pages/HomePage.css: import Playfair Display và Plus Jakarta Sans, sử dụng font serif/sans riêng | Trang chủ có phong cách editorial/ấm |
| Student learning và admin student | CourseLearning.css, Vocabulary.css, AdminStudentsPage.css: nhiều màu brown/gold và Playfair Display | Các màn hình học và nhiều màn quản trị khác kiểu trang chủ nhưng không dùng cùng token |
| TOEIC và một phần admin | StudentToeicExamPage.jsx, AdminResultsPage.jsx, AdminToeicListPage.jsx: nhiều style inline với slate/blue | TOEIC, kết quả, quản lý đề có palette khác và khó đồng bộ |

Ví dụ rõ ràng: index.css dùng primary yellow và secondary slate, HomePage.css định nghĩa font riêng, còn AdminStudentsPage.css dùng #302A25, #4B4035, #F3C74F. Các màn TOEIC lại hardcode #0F172A, #0284C7 và #E2E8F0.

### 2.2. Một CSS chung chỉ bao phủ một phần

AdminStudentsPage.css có các pattern tốt: admin-page-container, admin-page-title, admin-data-table, status-badge, admin-toast, modal và pagination. Nhưng các page khác dùng lẫn:

- AdminCoursesPage, AdminLessonsPage, AdminMaterialsPage và AdminResultsPage dùng class admin-table hoặc table-responsive cũ.
- AdminAssessmentsPage, AdminVocabularyPage và AdminQuestionsPage dùng admin-data-table nhưng còn code JSX một dòng, thiếu các biến thể layout.
- AdminToeicListPage và AdminToeicBuilderPage dùng lượng lớn style inline.

Hệ quả: cùng là table, badge hoặc button nhưng chiều cao, màu, padding, border, typography và responsive không giống nhau.

## 3. Các vấn đề xác nhận được và hướng sửa

### UI-01 - Filter chủ đề từ vựng mất các lựa chọn

**Mức:** P0  
**Source:** frontend/src/pages/admin/AdminVocabularyPage.jsx, hàm load ở dòng 11.

Khi topic có giá trị, page gọi getAdminVocabulary với topic hiện tại. Sau đó nó lại tạo topics từ list đã lọc:

    setTopics([...new Set(list.map(v => v.topic).filter(Boolean))])

Vì list chỉ còn bản ghi của topic đang chọn, select chỉ còn Tất cả và topic đó. Đây khớp hoàn toàn với lỗi trong checklist.

**Hướng sửa**

1. Tách danh sách topic ra khỏi dữ liệu list đang lọc.
2. Khi page mở, gọi một request không lọc topic để lấy toàn bộ topics; lưu riêng vào allTopics.
3. Khi search/filter thay đổi, chỉ cập nhật items và pagination, không ghi đè allTopics.
4. Về dài hạn, backend nên có endpoint metadata hoặc aggregate distinct topic theo quyền truy cập.
5. Thêm test UI: chọn topic A, chọn topic B, quay lại Tất cả, search text, reload URL có topic.

### UI-02 - Sidebar mất khi vào danh sách/chi tiết khóa học

**Mức:** P0  
**Source:** frontend/src/routes/AppRoutes.jsx.

CourseListPage và CourseDetailPage đang là public routes:

    courses
    courses/:id

Chúng nằm ngoài nhánh /student render StudentLayout. LessonPage thì nằm trong /student/courses/:courseId/lessons/:lessonId. Vì vậy người dùng đi từ course detail public vào luồng học sẽ thấy layout thay đổi và sidebar biến mất.

**Hướng sửa**

1. Giữ public catalog cho guest tại /courses và /courses/:id.
2. Thêm course detail dành cho học viên trong StudentLayout, ví dụ /student/courses/:courseId, hoặc bọc phần detail bằng một layout-aware component khi user đã đăng nhập.
3. Đảm bảo CTA của My Courses, dashboard, lesson và course detail dùng URL student thống nhất.
4. Quy định rõ khi user chưa enrollment: hiển thị sidebar hay public shell, thay vì thay đổi layout âm thầm.
5. Thêm visual regression/manual test cho navigation: Dashboard → My Courses → Course detail → Lesson → Back.

### UI-03 - Sidebar desktop cuộn theo nội dung

**Mức:** P1  
**Source:** frontend/src/components/layouts/StudentLayout.css dòng 146-162; AdminLayout.css dòng 103-118.

Sidebar desktop hiện là flex item thông thường. Nó không có position sticky, top, align-self, height hoặc overflow-y. Chỉ sidebar mobile được position fixed.

**Hướng sửa**

1. Đặt chiều cao layout tính theo header.
2. Với desktop, dùng position: sticky; top: biến chiều cao header; height: calc(100dvh - header).
3. Đặt overflow-y: auto cho sidebar, còn nội dung chính chịu trách nhiệm scroll trang.
4. Dùng cùng quy tắc cho StudentLayout và AdminLayout; kiểm thử menu dài, viewport thấp và zoom 200 phần trăm.

### UI-04 - Dữ liệu học viên có table tốt nhưng còn thiếu sort

**Mức:** P1  
**Source frontend:** AdminStudentsPage.jsx dòng 85-92.  
**Source backend:** backend/src/controllers/adminController.js dòng 6-46.

Trang học viên đã có search, status filter và pagination. Tuy nhiên table header chỉ là text; không có state sort hoặc aria-sort. API chỉ nhận status, search, page và limit, sau đó hardcode sort createdAt giảm dần.

**Hướng sửa**

1. Chọn các cột được phép sort: fullName, email, createdAt, status.
2. Thêm sortBy và sortOrder vào URL search params để refresh/back link giữ trạng thái.
3. Backend chỉ map một allowlist field sang MongoDB sort, không truyền trực tiếp field từ client.
4. Header là button có icon tăng/giảm và aria-sort.
5. Chỉ dùng sort server-side, vì data đã có pagination.

### UI-05 - Cột clear search và action table chưa có layout rule riêng

**Mức:** P2  
**Source:** AdminStudentsPage.css dòng 1.

Nút clear dùng position absolute, right 102px và top 8px trong input cao 44px. Vị trí cố định theo pixel nên dễ lệch với font/browser. Cột action không có width cố định; header đang left aligned nhưng cell dùng justify-content flex-end.

**Hướng sửa**

1. Bọc input và clear button trong input wrapper; dùng inset-inline-end và top: 50 phần trăm cùng translateY.
2. Đặt th.action và td.action với width hoặc min-width cố định, text-align center.
3. Action cell dùng justify-content center, gap chuẩn, button có tooltip/aria-label khi thu nhỏ.
4. Với responsive table, chuyển action thành menu hoặc card action thay vì ép ba button ngang.

### UI-06 - Detail học viên hiển thị status raw và chưa có card thông tin có cấu trúc

**Mức:** P1  
**Source:** frontend/src/pages/admin/AdminStudentDetailPage.jsx dòng 11-12.

Trạng thái hiện đưa trực tiếp từ student.status vào mảng fields. Nó không dùng statusLabel/status-badge của trang danh sách. Link back chỉ là text link, card account dùng generic panel/grid nên chưa có phân cấp thông tin.

**Hướng sửa**

1. Trích StatusBadge dùng chung, nhận status enum và luôn hiển thị tiếng Việt.
2. Dùng PageHeader chung với nút back dạng icon button + label, breadcrumb và title.
3. Chia account detail thành khối identity, trạng thái, liên hệ, mốc thời gian.
4. Hoàn thiện block Tiến độ học tập bằng API progress hiện có, hoặc bỏ block placeholder nếu chưa có số liệu.

### UI-07 - Status raw data ở question và assessment

**Mức:** P1  
**Source:** AdminQuestionsPage.jsx dòng 5 và đoạn render table; AdminAssessmentsPage.jsx dòng 40.

Question table render trực tiếp q.status. Assessment table render trực tiếp a.status. Vì status là enum draft/published/hidden nên user thấy tiếng Anh/raw data, trái với vocabulary/material đã có mapping tiếng Việt.

**Hướng sửa**

1. Tạo một status dictionary dùng chung cho course, lesson, material, vocabulary, question, assessment và TOEIC.
2. Tạo StatusBadge có semantic variant: success, warning, neutral, danger.
3. Không đưa enum backend thẳng vào JSX.
4. Không dùng class badge-active/badge-pending nếu CSS chính chỉ định active/pending, vì đây là một nguồn style mismatch hiện hữu.

### UI-08 - Notifications không thống nhất

**Mức:** P1  
**Source:** LessonPage.jsx, TestPage.jsx, StudentToeicExamPage.jsx, AdminStudentsPage.css.

Admin student đã có toast global kiểu admin-toast. LessonPage dùng state notice và render learning-notice trong flow nội dung. TestPage và StudentToeicExamPage vẫn dùng browser alert ở một số lỗi/nộp bài.

**Hướng sửa**

1. Tạo ToastProvider cấp app với success, error, warning, info; có timeout, close button, aria-live.
2. Đổi các state notice và alert thành toast, ngoại trừ confirm destructive action nên dùng modal.
3. Chuẩn hóa thông điệp: hành động, kết quả, bước tiếp theo.
4. Test double click, offline, request fail, success và screen reader announcement.

### UI-09 - Trang Kết quả làm bài chưa hỗ trợ dữ liệu lớn

**Mức:** P1  
**Source frontend:** AdminResultsPage.jsx dòng 5-130.  
**Source backend:** attemptController.js hàm getAdminResults, khoảng dòng 570 trở đi.

Frontend gọi một lần getAdminResults không truyền query, sau đó chỉ filter local exercise/exam. Không có search học viên/bài đánh giá, sort, date range, passed filter hoặc pagination. Backend nhận student, assessment, type nhưng trả toàn bộ attempts, không có page/limit/sort/date filters.

**Hướng sửa**

1. Chốt filter nghiệp vụ: keyword student/email, assessment, type, passed, submittedFrom/submittedTo.
2. Thêm server-side pagination: page, limit, total, pages.
3. Thêm allowlist sort: submittedAt, startedAt, duration, scorePercentage, passed.
4. Thêm indexes Mongo phù hợp sau khi chốt query chính: student + submittedAt; assessment + submittedAt; status + submittedAt.
5. URL phải lưu toàn bộ filter/sort/page để chia sẻ link và quay lại danh sách.
6. UI dùng shared data table, filter bar và empty state; không filter toàn bộ dữ liệu ở browser.

### UI-10 - TOEIC và Result dùng quá nhiều style inline

**Mức:** P1  
**Source:** StudentToeicExamPage.jsx dòng 338 trở đi; AdminToeicListPage.jsx; AdminToeicBuilderPage.jsx; AdminResultsPage.jsx.

Các trang này hardcode màu, spacing, font, border và layout trong JSX. Điều này tạo typography/nút/badge khác với trang chủ, student learning và admin student. Nó cũng làm responsive khó kiểm soát.

**Hướng sửa**

1. Chuyển các inline pattern lặp lại thành class/component: ExamHeader, PartTabs, DataTable, FilterBar, PageHeader, ActionButton.
2. Tất cả màu và font đi qua CSS variables, không qua hex trong JSX.
3. Tạo variant rõ cho primary, secondary, danger, ghost và icon action.
4. Dùng badge nowrap và max-width + ellipsis ở cell dài, thay vì để badge tự wrap.

### UI-11 - Thanh điều hướng Part TOEIC có tồn tại, nhưng cách implement dễ tạo lỗi cảm nhận

**Mức:** P2  
**Source:** StudentToeicExamPage.jsx dòng 340-473.

Source đã có header sticky, nút submit và part navigation button cho từng Part. Vì vậy nhận xét "thiếu nút chuyển Part" không phải là thiếu logic hoàn toàn. Rủi ro hiển thị đến từ hai sticky layer dùng số top hardcode: header có chiều cao theo nội dung, part nav lại fixed top 56px. Khi title, mobile toolbar hoặc zoom làm header cao hơn 56px, part nav có thể bị chồng/khó nhìn.

**Hướng sửa**

1. Đưa ExamHeader và PartTabs sang CSS; dùng CSS custom property --exam-header-height được đo/thiết kế nhất quán.
2. Trên desktop giữ header/timer/submit sticky. Trên mobile dùng một thanh compact hoặc drawer để không chồng content.
3. Part tabs cần active state rõ, auto scroll tab active vào viewport, và badge số câu đã trả lời theo từng Part.
4. Thử ở 360px, 768px, 1024px, zoom 200 phần trăm và với title dài.

### UI-12 - Danh sách từ vựng học viên đang là list một cột

**Mức:** P2  
**Source:** StudentVocabularyPage.jsx; Vocabulary.css.

Markup dùng vocab-list và vocab-entry; CSS đặt một list trắng với từng item full width. Đây là lý do cảm giác khó xem với dữ liệu seed lớn.

**Hướng sửa**

1. Dùng responsive grid cho vocabulary card, ví dụ 3/2/1 cột theo viewport.
2. Card giữ word, pronunciation, part of speech, meaning; example đưa vào chi tiết/flip để giảm mật độ.
3. Giữ topic tab horizontal-scroll và bổ sung search.
4. Không dùng grid cho flashcard mode, vì mode này là one-card learning flow.

## 4. Nhóm feedback UI theo cách xử lý

| Nhóm trong checklist | Nguyên nhân chung | Cách sửa một lần cho nhiều trang |
|---|---|---|
| Card tổng quan/admin statistics | Card thiếu variant và hardcode màu | Shared StatCard: metric, icon, accent semantic, loading state |
| Page title/course/lesson/material/vocabulary/question/assessment/result/statistics | Header được viết riêng ở từng page | Shared PageHeader: eyebrow, title, subtitle, primary action, back/breadcrumb |
| Bảng admin | Hai class table cũ/mới và CSS inline | Shared AdminDataTable: column sizing, header sort, action column, mobile card fallback, pagination |
| Badge status/level/type | Enum/render rule rải rác | Shared StatusBadge + label maps tiếng Việt |
| Buttons/toasts/modals | Có nhiều style và alert/native state | Shared Button, ToastProvider, ConfirmDialog |
| TOEIC library/overview/exam/builder | Inline styles và palette slate/blue tách hệ | Exam UI component set và token map chung |
| Student dashboard/history/profile | Không kế thừa typography/page shell của trang chủ | Student shell, PageHeader, card/table/token dùng chung |

## 5. Thứ tự triển khai đề xuất

### Phase 1 - Khóa nền tảng trước

1. Chọn trang chủ làm chuẩn thương hiệu: Plus Jakarta Sans cho body, Playfair Display cho heading display; chuyển chúng thành global tokens.
2. Xác định token cho surface, text, border, accent, semantic status, spacing, radius, shadow.
3. Xây shared components: AppPageHeader, Button, StatusBadge, ToastProvider, ConfirmDialog, StatCard, DataTable và FilterBar.
4. Chuẩn hóa layout: sidebar sticky, content width, breakpoints, page header spacing.

Không đổi nghiệp vụ ở phase này.

### Phase 2 - Sửa lỗi và contract dữ liệu

1. Sửa topics admin vocabulary.
2. Tách public course detail và student course detail/layout.
3. Bổ sung sort ở student management qua URL và API allowlist.
4. Nâng API admin results thành filter/sort/pagination server-side.
5. Chốt quyền teacher: content-only hay full admin. Nếu content-only, tách route/API permission trước khi tiếp tục polish.

### Phase 3 - Migrate các trang admin

Ưu tiên Dashboard, Students, Student Detail, Courses, Lessons, Materials, Vocabulary, Questions, Assessments, Results, Statistics, rồi TOEIC List/Builder.

Mỗi lần migrate phải xóa style inline tương ứng, thay bằng component/token mới; không chỉ phủ thêm CSS lên giao diện cũ.

### Phase 4 - Migrate student learning

Dashboard, My Courses/Course Detail/Lesson, Vocabulary/Flashcard, Assessment/History/Result/Profile, TOEIC Library/Overview/Exam/Result.

Ưu tiên luồng học và làm bài trước, vì đây là bề mặt người học dùng nhiều nhất.

### Phase 5 - Kiểm thử nghiệm thu UI

1. Desktop 1440px, laptop 1024px, tablet 768px, mobile 360px.
2. Browser Chrome, Edge, Firefox.
3. Keyboard, focus, zoom 200 phần trăm, screen reader labels cho action icon.
4. Danh sách lớn: 142 học viên, 960 vocabulary, 665 question, 118 attempt, TOEIC 200 câu.
5. So sánh screenshot trước/sau cho các route chính.

## 6. Rủi ro nếu chỉ sửa từng trang

- Mỗi page tiếp tục tự định nghĩa màu/font/button riêng, lỗi tương tự quay lại.
- Search/sort/pagination làm ở frontend sẽ chậm và sai khi dữ liệu tăng.
- Sửa sidebar bằng CSS đơn lẻ không khắc phục route public/student tách layout.
- Chỉ đổi label enum không giải quyết map trạng thái dùng khác nhau giữa entity.
- Chỉ làm đẹp TOEIC bằng inline style mới sẽ tiếp tục gây lệch responsive.

## 7. Phạm vi không nên gộp vào đợt UI này

- Thay đổi scoring, attempt snapshot, deadline hoặc TOEIC autosave: các luồng này đã được test tự động và không liên quan trực tiếp tới review UI.
- Payment/checkout: không có route checkout hiện hoạt và ngoài phạm vi tài liệu ban đầu.

