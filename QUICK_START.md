# Quick Start Guide

Hướng dẫn nhanh để chạy dự án.

## Yêu cầu

- Node.js >= 18
- MongoDB (local hoặc MongoDB Atlas)
- npm hoặc yarn

## Bước 1: Cài đặt Backend

```bash
cd backend
npm install
cp .env.example .env
```

Chỉnh sửa `.env`:
```env
PORT=5000
MONGODB_URI=mongodb://localhost:27017/english_course
JWT_SECRET=your-secret-key-here
JWT_REFRESH_SECRET=your-refresh-secret-key-here
FRONTEND_URL=http://localhost:5173
```

Chạy Backend:
```bash
npm run dev
```

Backend sẽ chạy tại: `http://localhost:5000`

## Bước 2: Cài đặt Frontend

```bash
cd frontend
npm install
cp .env.example .env
```

Chỉnh sửa `.env`:
```env
VITE_API_URL=http://localhost:5000/api/v1
```

Chạy Frontend:
```bash
npm run dev
```

Frontend sẽ chạy tại: `http://localhost:5173`

## Bước 3: Test

1. Mở browser: `http://localhost:5173`
2. Đăng ký tài khoản mới (Student hoặc Teacher)
3. Đăng nhập
4. Test các tính năng:
   - Xem danh sách khóa học
   - Đăng ký khóa học (nếu là Student)
   - Tạo bài giảng (nếu là Teacher)
   - Làm bài test Reading với TTS

## API Testing

Bạn có thể test API bằng Postman hoặc curl:

```bash
# Đăng ký
curl -X POST http://localhost:5000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "student@test.com",
    "password": "123456",
    "fullName": "Test Student",
    "role": "student"
  }'

# Đăng nhập
curl -X POST http://localhost:5000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "student@test.com",
    "password": "123456"
  }'
```

## Cấu trúc quan trọng

### Backend
- `src/models/` - MongoDB schemas
- `src/controllers/` - Request handlers
- `src/routes/` - API routes
- `src/middlewares/` - Auth, error handling
- `src/utils/` - Helpers (textSimilarity, generateToken)

### Frontend
- `src/api/` - Axios API services
- `src/pages/` - Page components
- `src/layouts/` - Layouts theo role
- `src/routes/` - React Router với guards
- `src/store/` - Zustand state management
- `src/utils/` - TTS, Speech Recognition helpers

## Troubleshooting

### Backend không kết nối được MongoDB
- Kiểm tra MongoDB đang chạy
- Kiểm tra `MONGODB_URI` trong `.env`

### Frontend không gọi được API
- Kiểm tra Backend đang chạy
- Kiểm tra `VITE_API_URL` trong `.env`
- Kiểm tra CORS settings trong Backend

### Token expired
- Frontend tự động refresh token
- Nếu vẫn lỗi, đăng nhập lại

## Next Steps

Xem `EXAMPLES.md` để hiểu chi tiết về 3 ví dụ code đã triển khai:
1. Đăng ký khóa học
2. Upload bài giảng
3. Bài test Reading với TTS

