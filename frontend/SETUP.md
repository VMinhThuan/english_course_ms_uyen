# Frontend Setup Guide

## Lỗi: "vite: command not found"

Lỗi này xảy ra khi dependencies chưa được cài đặt.

## Cách sửa

### Bước 1: Cài đặt dependencies

```bash
cd frontend
npm install
```

Quá trình này sẽ:
- Cài đặt tất cả dependencies từ `package.json`
- Tạo thư mục `node_modules/`
- Cài đặt Vite và các tools cần thiết

### Bước 2: Chạy development server

Sau khi cài đặt xong:

```bash
npm run dev
```

Frontend sẽ chạy tại: `http://localhost:5173`

## Các lệnh khác

```bash
# Development server
npm run dev

# Build cho production
npm run build

# Preview build
npm run preview
```

## Troubleshooting

### Nếu `npm install` bị lỗi:
- Kiểm tra Node.js version: `node --version` (cần >= 18)
- Xóa `node_modules` và `package-lock.json` rồi cài lại:
  ```bash
  rm -rf node_modules package-lock.json
  npm install
  ```

### Nếu vẫn lỗi:
- Kiểm tra kết nối internet
- Thử dùng `npm install --legacy-peer-deps`

