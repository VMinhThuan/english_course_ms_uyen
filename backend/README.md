# English Course Backend API

Backend API cho hệ thống học tiếng Anh trực tuyến.

## Cấu trúc

```
backend/
├── src/
│   ├── config/          # Config (env, database, jwt)
│   ├── models/          # Mongoose schemas
│   ├── routes/          # API routes
│   ├── controllers/     # Request/Response handlers
│   ├── services/        # Business logic
│   ├── middlewares/     # Auth, role, error handler
│   ├── utils/           # Helpers
│   ├── app.js
│   └── server.js
├── .env
└── package.json
```

## Cài đặt

```bash
npm install
cp .env.example .env
# Chỉnh sửa .env với thông tin của bạn
npm run dev
```

## API Endpoints

Base URL: `http://localhost:5000/api/v1`

### Authentication
- `POST /auth/register` - Đăng ký
- `POST /auth/login` - Đăng nhập
- `POST /auth/refresh` - Refresh token
- `POST /auth/logout` - Đăng xuất

### Courses
- `GET /courses` - Lấy danh sách khóa học
- `GET /courses/:id` - Lấy chi tiết khóa học
- `POST /courses` - Tạo khóa học (Teacher/Admin)
- `PUT /courses/:id` - Cập nhật khóa học (Teacher/Admin)
- `DELETE /courses/:id` - Xóa khóa học (Admin)

### Enrollments
- `POST /enrollments` - Đăng ký khóa học (Student)
- `GET /enrollments/my-courses` - Khóa học của tôi (Student)

### Lessons
- `GET /lessons/course/:courseId` - Lấy bài giảng theo khóa học
- `POST /lessons` - Tạo bài giảng (Teacher/Admin)
- `PUT /lessons/:id` - Cập nhật bài giảng (Teacher/Admin)

### Tests
- `GET /tests/lesson/:lessonId` - Lấy bài test theo lesson
- `POST /tests/:testId/submit` - Nộp bài test (Student)
- `GET /tests/:testId/result` - Xem kết quả test

