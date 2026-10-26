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

## TOEIC explanation translation

Run a read-only inventory first:

```bash
npm run toeic:explanations:translate -- --json
```

The apply mode requires an OpenAI-compatible translation provider. Configure
`TOEIC_TRANSLATION_API_KEY` and optionally `TOEIC_TRANSLATION_API_URL`,
`TOEIC_TRANSLATION_MODEL`, and `TOEIC_TRANSLATION_STATE_FILE`, then run:

```bash
npm run toeic:explanations:translate -- --apply --yes
```

Apply mode creates a JSON backup before the first database update, updates the
source questions and linked bank/full-test copies, and records confirmed
translations in a resumable state file. It never changes options, correct
answers, question IDs, groups, or assessments.
