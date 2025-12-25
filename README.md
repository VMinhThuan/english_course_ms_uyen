# English Course Online - Full Stack Application

Hệ thống học tiếng Anh trực tuyến với kiến trúc tách biệt hoàn toàn giữa Frontend và Backend.

## 📁 Cấu trúc dự án

```
english_course_online_web/
├── backend/          # Node.js + Express API
└── frontend/         # React + Vite
```

## 🏗️ Kiến trúc

- **Backend**: RESTful API, chỉ trả về JSON
- **Frontend**: SPA (Single Page Application), gọi API qua Axios
- **Giao tiếp**: RESTful API với JWT authentication
- **Database**: MongoDB với Mongoose

## 🚀 Cài đặt và chạy

### Backend

```bash
cd backend
npm install
cp .env.example .env
# Chỉnh sửa .env với thông tin MongoDB và JWT secrets
npm run dev
```

Backend chạy tại: `http://localhost:5000`

### Frontend

```bash
cd frontend
npm install
cp .env.example .env
# Chỉnh sửa VITE_API_URL nếu cần
npm run dev
```

Frontend chạy tại: `http://localhost:5173`

## 📋 API Endpoints

### Authentication
- `POST /api/v1/auth/register` - Đăng ký
- `POST /api/v1/auth/login` - Đăng nhập
- `POST /api/v1/auth/refresh` - Refresh token
- `POST /api/v1/auth/logout` - Đăng xuất
- `GET /api/v1/auth/me` - Lấy thông tin user hiện tại

### Courses
- `GET /api/v1/courses` - Lấy danh sách khóa học
- `GET /api/v1/courses/:id` - Lấy chi tiết khóa học
- `POST /api/v1/courses` - Tạo khóa học (Teacher/Admin)
- `PUT /api/v1/courses/:id` - Cập nhật khóa học (Teacher/Admin)
- `DELETE /api/v1/courses/:id` - Xóa khóa học (Admin)

### Enrollments
- `POST /api/v1/enrollments` - Đăng ký khóa học (Student)
- `GET /api/v1/enrollments/my-courses` - Khóa học của tôi (Student)

### Lessons
- `GET /api/v1/lessons/course/:courseId` - Lấy bài giảng theo khóa học
- `POST /api/v1/lessons` - Tạo bài giảng (Teacher/Admin)
- `PUT /api/v1/lessons/:id` - Cập nhật bài giảng (Teacher/Admin)

### Tests
- `GET /api/v1/tests/lesson/:lessonId` - Lấy bài test theo lesson
- `POST /api/v1/tests/:testId/submit` - Nộp bài test (Student)
- `GET /api/v1/tests/:testId/result` - Xem kết quả test

## 🎯 Ví dụ code đã triển khai

### 1. Đăng ký khóa học (FE gọi BE)
**File**: `frontend/src/pages/EnrollCoursePage.jsx`
- Frontend gọi `enrollmentApi.enrollCourse(courseId)`
- Backend xử lý logic đăng ký và trả JSON response

### 2. Upload bài giảng (Teacher)
**File**: `frontend/src/pages/CreateLessonPage.jsx`
- Frontend tạo FormData với files
- Backend nhận file qua multer, lưu vào `uploads/`
- Backend lưu metadata vào MongoDB

### 3. Bài test Reading (TTS ở FE, auto-check ở BE)
**File**: `frontend/src/pages/TestPage.jsx`
- Frontend sử dụng Web Speech API (TTS) để đọc text
- Frontend sử dụng Speech Recognition để ghi âm học sinh
- Backend sử dụng `textSimilarity` để so sánh và chấm điểm tự động

## 🔐 Authentication Flow

1. User đăng nhập → Backend trả Access Token + Refresh Token (httpOnly cookie)
2. Frontend lưu Access Token vào localStorage
3. Mỗi request gửi kèm `Authorization: Bearer <access_token>`
4. Nếu token hết hạn, Frontend tự động refresh token
5. Refresh token hết hạn → User phải đăng nhập lại

## 👥 Roles

- **Student**: Xem khóa học, đăng ký, làm bài test
- **Teacher**: Tạo/cập nhật khóa học, bài giảng
- **Admin**: Toàn quyền

## 🛠️ Technologies

### Backend
- Node.js + Express
- MongoDB + Mongoose
- JWT (jsonwebtoken)
- Multer (file upload)
- bcryptjs (password hashing)

### Frontend
- React 18
- Vite
- React Router DOM
- Axios
- Zustand (state management)
- Web Speech API (TTS & Speech Recognition)

## 📝 Notes

- Backend và Frontend hoàn toàn độc lập, có thể deploy riêng
- Frontend chỉ biết URL của Backend qua environment variable
- Không có template engine, chỉ JSON API
- File uploads được lưu trong `backend/uploads/`

# english_course_online_web_FE-BE git init git add README.md git commit -m implement codebase BE + FE and design new screens for 3 role system: student, teacher, admin git branch -M Thuan git remote add origin https://github.com/VMinhThuan/english_course_online_web_FE-BE.git git push -u origin main
# english_course_online_web_FE-BE git init git add README.md git commit -m implement codebase BE + FE and design new screens for 3 role system: student, teacher, admin git branch -M Thuan git remote add origin https://github.com/VMinhThuan/english_course_online_web_FE-BE.git git push -u origin Thuan
