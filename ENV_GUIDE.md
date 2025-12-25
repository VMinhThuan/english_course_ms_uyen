# Hướng dẫn cấu hình Environment Variables

## 📋 Tổng quan

Dự án sử dụng 2 file `.env` riêng biệt:
- **Backend**: `backend/.env`
- **Frontend**: `frontend/.env`

## 🔧 Backend (.env)

### Các biến bắt buộc:

#### 1. **PORT** (Server Port)
```env
PORT=5000
```
- Port mà Backend server sẽ chạy
- Mặc định: `5000`

#### 2. **NODE_ENV** (Environment)
```env
NODE_ENV=development
```
- `development`: Môi trường phát triển
- `production`: Môi trường production
- `test`: Môi trường test

#### 3. **MONGODB_URI** (Database Connection)
```env
# Local MongoDB
MONGODB_URI=mongodb://localhost:27017/english_course

# MongoDB Atlas (Cloud)
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/english_course?retryWrites=true&w=majority
```
- Connection string để kết nối MongoDB
- **Local**: `mongodb://localhost:27017/english_course`
- **Atlas**: Lấy từ MongoDB Atlas dashboard

#### 4. **JWT_SECRET** (JWT Access Token Secret)
```env
JWT_SECRET=your-super-secret-jwt-key-change-in-production-min-32-chars
```
- Secret key để ký Access Token
- **QUAN TRỌNG**: Phải thay đổi trong production!
- Tạo key mạnh: `openssl rand -base64 32`

#### 5. **JWT_REFRESH_SECRET** (JWT Refresh Token Secret)
```env
JWT_REFRESH_SECRET=your-super-secret-refresh-key-change-in-production-min-32-chars
```
- Secret key để ký Refresh Token
- **QUAN TRỌNG**: Phải thay đổi trong production!
- Phải khác với `JWT_SECRET`
- Tạo key mạnh: `openssl rand -base64 32`

#### 6. **JWT_EXPIRE** (Access Token Expiry)
```env
JWT_EXPIRE=15m
```
- Thời gian hết hạn của Access Token
- Format: `15m` (15 phút), `1h` (1 giờ), `1d` (1 ngày)
- Mặc định: `15m`

#### 7. **JWT_REFRESH_EXPIRE** (Refresh Token Expiry)
```env
JWT_REFRESH_EXPIRE=7d
```
- Thời gian hết hạn của Refresh Token
- Format: `7d` (7 ngày), `30d` (30 ngày)
- Mặc định: `7d`

#### 8. **FRONTEND_URL** (CORS Origin)
```env
FRONTEND_URL=http://localhost:5173
```
- URL của Frontend để CORS cho phép request
- Development: `http://localhost:5173`
- Production: `https://your-frontend-domain.com`

---

## 🎨 Frontend (.env)

### Các biến bắt buộc:

#### 1. **VITE_API_URL** (Backend API URL)
```env
VITE_API_URL=http://localhost:5000/api/v1
```
- URL của Backend API
- **Lưu ý**: Vite yêu cầu prefix `VITE_` cho tất cả biến môi trường
- Development: `http://localhost:5000/api/v1`
- Production: `https://api.your-domain.com/api/v1`

---

## 🚀 Cách thiết lập

### Bước 1: Backend

```bash
cd backend
cp .env.example .env
# Mở file .env và điền thông tin
```

**Ví dụ file `.env` cho Development:**
```env
PORT=5000
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/english_course
JWT_SECRET=dev-secret-key-123456789012345678901234567890
JWT_REFRESH_SECRET=dev-refresh-secret-123456789012345678901234567890
JWT_EXPIRE=15m
JWT_REFRESH_EXPIRE=7d
FRONTEND_URL=http://localhost:5173
```

**Ví dụ file `.env` cho Production:**
```env
PORT=5000
NODE_ENV=production
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/english_course
JWT_SECRET=<generate-strong-secret-32-chars-min>
JWT_REFRESH_SECRET=<generate-strong-secret-32-chars-min>
JWT_EXPIRE=15m
JWT_REFRESH_EXPIRE=7d
FRONTEND_URL=https://your-frontend-domain.com
```

### Bước 2: Frontend

```bash
cd frontend
cp .env.example .env
# Mở file .env và điền thông tin
```

**Ví dụ file `.env` cho Development:**
```env
VITE_API_URL=http://localhost:5000/api/v1
```

**Ví dụ file `.env` cho Production:**
```env
VITE_API_URL=https://api.your-domain.com/api/v1
```

---

## 🔐 Bảo mật

### ⚠️ QUAN TRỌNG:

1. **KHÔNG commit file `.env` lên Git**
   - File `.env` đã được thêm vào `.gitignore`
   - Chỉ commit file `.env.example`

2. **Thay đổi JWT secrets trong production**
   - Không dùng secret mặc định
   - Tạo secret mạnh, ngẫu nhiên
   - Mỗi môi trường dùng secret khác nhau

3. **Bảo vệ MongoDB URI**
   - Không để lộ password trong connection string
   - Sử dụng MongoDB Atlas với IP whitelist
   - Tạo user riêng với quyền hạn tối thiểu

4. **CORS Configuration**
   - Chỉ cho phép domain Frontend thực tế
   - Không dùng `*` (allow all) trong production

---

## 🛠️ Tạo JWT Secret mạnh

### Cách 1: OpenSSL
```bash
openssl rand -base64 32
```

### Cách 2: Node.js
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### Cách 3: Online Generator
- Truy cập: https://generate-secret.vercel.app/32

---

## 📝 Checklist

Trước khi deploy production, đảm bảo:

- [ ] Đã thay đổi `JWT_SECRET`
- [ ] Đã thay đổi `JWT_REFRESH_SECRET`
- [ ] Đã cấu hình `MONGODB_URI` đúng
- [ ] Đã set `NODE_ENV=production`
- [ ] Đã cấu hình `FRONTEND_URL` đúng domain
- [ ] Đã cấu hình `VITE_API_URL` đúng domain Backend
- [ ] File `.env` không được commit lên Git

---

## 🐛 Troubleshooting

### Backend không kết nối được MongoDB
- Kiểm tra MongoDB đang chạy (local) hoặc connection string đúng (Atlas)
- Kiểm tra `MONGODB_URI` trong `.env`

### Frontend không gọi được API
- Kiểm tra `VITE_API_URL` đúng
- Kiểm tra Backend đang chạy
- Kiểm tra CORS trong Backend (`FRONTEND_URL`)

### Token expired ngay lập tức
- Kiểm tra `JWT_EXPIRE` và `JWT_REFRESH_EXPIRE`
- Kiểm tra system time của server

