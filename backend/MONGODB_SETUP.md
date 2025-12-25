# Hướng dẫn cấu hình MongoDB Atlas

## 🔗 Connection String của bạn

```
mongodb+srv://minhthuan20192020:<db_password>@cluster0.cgaadgm.mongodb.net/?appName=Cluster0
```

## 📝 Cách cấu hình

### Bước 1: Thay thế Password

1. Mở file `backend/.env`
2. Tìm dòng `MONGODB_URI`
3. Thay `<db_password>` bằng password thực tế của MongoDB Atlas user

**Ví dụ:**
```env
# Trước (có placeholder)
MONGODB_URI=mongodb+srv://minhthuan20192020:<db_password>@cluster0.cgaadgm.mongodb.net/english_course?retryWrites=true&w=majority&appName=Cluster0

# Sau (với password thực tế)
MONGODB_URI=mongodb+srv://minhthuan20192020:MyPassword123@cluster0.cgaadgm.mongodb.net/english_course?retryWrites=true&w=majority&appName=Cluster0
```

### Bước 2: Thêm tên Database

Thêm tên database vào connection string (ví dụ: `english_course`)

**Format đúng:**
```
mongodb+srv://username:password@cluster.mongodb.net/database_name?retryWrites=true&w=majority
```

**Ví dụ hoàn chỉnh:**
```env
MONGODB_URI=mongodb+srv://minhthuan20192020:YourPassword123@cluster0.cgaadgm.mongodb.net/english_course?retryWrites=true&w=majority&appName=Cluster0
```

## 🔐 Lấy Password từ MongoDB Atlas

1. Đăng nhập vào [MongoDB Atlas](https://cloud.mongodb.com/)
2. Vào **Database Access** (trong menu bên trái)
3. Tìm user `minhthuan20192020`
4. Click **Edit** → **Edit Password**
5. Nếu quên password, có thể **Reset Password**

## ✅ Kiểm tra kết nối

Sau khi cấu hình xong, chạy Backend:

```bash
cd backend
npm run dev
```

Nếu thấy log:
```
MongoDB Connected: cluster0-shard-00-00.cgaadgm.mongodb.net
```

→ Kết nối thành công! ✅

## ⚠️ Lưu ý bảo mật

1. **KHÔNG commit file `.env` lên Git**
   - File `.env` đã có trong `.gitignore`
   - Chỉ commit `.env.example` (không có password)

2. **Network Access trong MongoDB Atlas**
   - Vào **Network Access** trong MongoDB Atlas
   - Thêm IP của server hoặc `0.0.0.0/0` (cho phép tất cả - chỉ dùng cho development)

3. **Database User Permissions**
   - Đảm bảo user có quyền `readWrite` hoặc `readWriteAnyDatabase`

## 🐛 Troubleshooting

### Lỗi: "Authentication failed"
- Kiểm tra password đúng chưa
- Kiểm tra username đúng: `minhthuan20192020`

### Lỗi: "Connection timeout"
- Kiểm tra Network Access trong MongoDB Atlas
- Thêm IP hiện tại vào whitelist

### Lỗi: "Database not found"
- Database sẽ tự động tạo khi lần đầu kết nối
- Hoặc tạo database trước trong MongoDB Atlas

