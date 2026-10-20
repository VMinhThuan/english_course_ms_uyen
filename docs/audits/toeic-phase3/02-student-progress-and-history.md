# Student progress and assessment history

## Data sources và phạm vi

API `GET /api/v1/admin/students/:studentId/progress` kiểm tra ObjectId và xác nhận target có `role: student`. Danh sách khóa học là hợp của:

1. `Enrollment` theo học viên.
2. `Course.students` cho bản ghi legacy chưa có Enrollment.

Course không còn tồn tại bị loại khỏi tập. Chỉ lesson `status: published` được đưa vào tổng số, phần trăm và danh sách; draft/hidden không hiển thị.

Trạng thái bài học lấy từ `LearningProgress` theo student+lesson. `completed` được tính hoàn thành; `in_progress` tính đang học; không có record tính chưa bắt đầu. Progress percent của bài giữ giá trị lưu (mặc định 0). Phần trăm khóa học/tổng được làm tròn từ `completedLessons / totalPublishedLessons`, không dùng `Enrollment.progress` denormalized.

## API response

`data` gồm `courseCount`/`totalCourses`, `totalLessons`, `completedLessons`, `inProgressLessons`, `notStartedLessons`, `completionPercentage`, `lastLearningActivity`, `courses[]`, `coursePagination`, `lessons[]` và `lessonPagination`.

- Lesson pagination: `page`, `limit`, mặc định 1/20, tối đa 100; `courseId` tùy chọn lọc lesson và summary theo một khóa.
- Course pagination: `coursePage`, `courseLimit`, mặc định 1/20, tối đa 100.
- ID không hợp lệ trả `INVALID_STUDENT_ID`/`INVALID_COURSE_ID`; pagination sai trả `INVALID_PAGINATION`.

Test fixture xác nhận hai khóa từ Enrollment và Course.students, ba bài published (hai completed, một in progress), 67% completion, loại lesson draft/hidden và course filter.

## Attempt history

`GET /api/v1/admin/students/:studentId/attempts` dùng cùng pipeline canonical của reporting. Mặc định `state=ALL`, `sort=started_desc`, page 1, limit 20; giới hạn 100 dòng/trang. Hỗ trợ engine, type, ngày bắt đầu và trạng thái. History hiển thị Standard/TOEIC, trạng thái logical, điểm, thời gian, duration và TOEIC estimate nếu có. Score `0` hiển thị như điểm hợp lệ; thiếu bằng chứng scoring không biến thành 0.

Attempt `in_progress` có deadline hết hạn được hiển thị `EXPIRED_PENDING_FINALIZATION` và không cộng vào điểm đã chấm. Terminal record không khớp contract hoặc dữ liệu legacy thiếu trường điểm là `LEGACY_UNVERIFIED`. Attempt retake vẫn là các attempt riêng; thống kê có `attemptCount` và số học viên distinct riêng.

API chỉ project thông tin an toàn; answers, question snapshots và đáp án đúng không được trả về. GET admin history dùng read-only aggregation, không gọi lifecycle finalizer. User-facing Phase 2 recovery routes giữ nguyên contract đã ghi tại `docs/audits/toeic-phase2/01-attempt-state-and-scoring-contract.md`.

## Giao diện

`AdminStudentDetailPage` tải profile, khóa học, lesson progress và attempt history thực tế. Có lọc khóa học, engine và trạng thái, phân trang từng bảng, skeleton/loading, empty/error states. Hiển thị điểm theo `isScored`, expired/pending và trạng thái legacy; không dùng placeholder “chưa có hoạt động” khi API có dữ liệu.

## Trường hợp legacy

Enrollment thiếu thời gian vẫn hiển thị `enrolledAt: null`; Course.students được hợp vào kết quả và `enrolledAt` là null nếu không có Enrollment. Legacy attempt thiếu engine được resolve từ Assessment.examFormat khi nhất quán; mismatch/thiếu bằng chứng terminal giữ trạng thái chưa xác minh. Không backfill hoặc ghi lại dữ liệu cũ.
