# Phase V1 — ranh giới truy cập và quyết định cần phê duyệt

## Ranh giới hiện tại

Không thêm route Catalog cho Student, Teacher hoặc Admin. Route legacy hiện vẫn dùng verifyToken và checkRole(teacher, admin) cho CRUD; Student chỉ thấy API vocabulary legacy. Service V1 là nội bộ và chưa được gắn authorization.

Các handler legacy lọc catalogOnly=true khỏi list/get/update/delete và Student query. Lesson detail, cascade xóa Lesson/Course và importer legacy cũng loại Catalog. Tạo mới luôn Draft; không có hàm publish.

## Chính sách còn là đề xuất

| Quyết định PO | Trạng thái |
|---|---|
| Ai được tạo/sửa Tag và Chapter | Chưa phê duyệt |
| Admin-only hay Teacher có thể quản trị/import | Chưa phê duyệt; không mở quyền Teacher mới |
| Khi nào Student được xem Published Catalog và qua endpoint nào | Chưa phê duyệt; hiện không có API |
| Review, approve, publish, unpublish và audit actor/timestamp | Chưa phê duyệt; V1 không triển khai transition publish |
| Cho phép reuse Vocabulary cùng nội dung giữa Chapter hay giữ occurrence riêng | Chưa phê duyệt; V1 không merge |
| Search, pagination, visibility theo Tag/Chapter | Đang là contract nội bộ thử nghiệm, chưa là API cam kết |

**ACCESS_POLICY_APPROVED = NO.** Cần quyết định chính thức trước khi thêm route, UI, sửa quyền Teacher/Student hoặc tạo workflow publish.
