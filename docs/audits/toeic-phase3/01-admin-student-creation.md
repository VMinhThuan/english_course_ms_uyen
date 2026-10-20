# Admin student creation

## Luồng

Admin/teacher có token hợp lệ tạo học viên tại `POST /api/v1/admin/students`. Route nằm sau `verifyToken` và `checkRole('admin', 'teacher')`, tiếp tục dùng model `User` và password `pre('save')` hook bcrypt hiện có. Tài khoản được tạo ngay với `role: student`, `status: active`, `isActive: true`, `approvedAt` và `approvedBy`; không chờ activation email hay bước duyệt bổ sung. Public self-registration vẫn tạo tài khoản `pending` như trước.

## API request/response

Request JSON:

```json
{
  "fullName": "Nguyễn Văn An",
  "email": "an@example.com",
  "username": "nguyenvanan",
  "password": "mật-khẩu-ban-đầu"
}
```

Trường đặc quyền gửi thêm trong body bị bỏ qua; backend luôn đặt role/status/isActive/approval theo policy của endpoint.

Thành công trả HTTP 201 và `data.student` an toàn gồm `_id`, `id`, tên, email, username, điện thoại, role, status, isActive, thời gian tạo/cập nhật/duyệt và lần đăng nhập gần nhất. Response không chứa password hoặc hash.

## Validation và bảo mật mật khẩu

- `fullName`: bắt buộc, trim và gộp khoảng trắng, tối đa 100 ký tự, từ chối control characters.
- `email`: bắt buộc, trim/lowercase, tối đa 254 ký tự và kiểm tra định dạng cơ bản.
- `username`: bắt buộc, trim/lowercase, 3–30 ký tự theo `[a-z0-9._-]`.
- `password`: bắt buộc, tối thiểu 6 ký tự, tối đa 72 byte UTF-8 để tránh cắt cụt đầu vào bcrypt.
- Email/username đã tồn tại: HTTP 409 `STUDENT_ALREADY_EXISTS`; lỗi E11000 từ race unique-index cũng được chuyển thành response 409 ổn định.
- Validation: HTTP 400 `VALIDATION_ERROR` kèm lỗi theo field.
- Middleware trả 401 khi chưa xác thực, 403 khi role không được phép; test xác minh student và tài khoản suspended không vào được admin detail.

Plaintext password chỉ có mặt trong request tạo ban đầu. Model hash trước khi lưu; frontend không lưu dài hạn hoặc ghi log password; response không trả hash. Đăng nhập ngay bằng email hoặc username được xác minh qua `/api/v1/auth/login` trên test DB.

## Giao diện

`AdminStudentsPage` có nút “Thêm học viên” cho role admin/teacher, modal gồm bốn trường, validation tiếng Việt, trạng thái submitting, lỗi email/username trùng và refresh danh sách sau khi tạo. Nếu filter hiện tại không thể hiện student active mới, trang chuyển về danh sách phù hợp để người dùng thấy bản ghi.

## RBAC/ownership

Phase 3 giữ RBAC hiện tại: `adminRoutes` cho role `admin` và `teacher`. Test xác nhận cả hai role tạo được học viên và role student bị từ chối. Route student-management chưa có model ownership/assignment để giới hạn teacher theo lớp hoặc học viên; quyền teacher hiện là phạm vi toàn hệ thống theo router hiện có. Cần chủ sản phẩm xác nhận policy này trước rollout nếu kỳ vọng teacher chỉ thấy học viên được phân công.

## Test

Mongo integration test xác nhận tài khoản active, hash khác plaintext, comparePassword thành công, login bằng email và username, output không lộ mật khẩu, mass-assignment bị chặn, email/username unique kể cả race tạo đồng thời, validation và 401/403. Test teacher hiện xác nhận behavior RBAC theo source, không xác nhận ownership scope.
