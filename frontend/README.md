# English Course Frontend

Frontend application cho hệ thống học tiếng Anh trực tuyến.

## Cấu trúc

```
frontend/
├── src/
│   ├── api/              # Axios services gọi backend
│   ├── components/        # Component tái sử dụng
│   ├── layouts/          # Layout theo role
│   ├── pages/            # Page chính
│   ├── hooks/            # Custom hooks
│   ├── routes/           # React Router + route guard
│   ├── store/            # State management (Zustand)
│   ├── utils/            # Helper FE
│   ├── App.jsx
│   └── main.jsx
├── vite.config.js
└── package.json
```

## Cài đặt

```bash
npm install
cp .env.example .env
# Chỉnh sửa .env với API URL của backend
npm run dev
```

## Tính năng

- Authentication (Login/Register)
- Course enrollment
- Lesson viewing
- Test taking với TTS support
- Role-based access control (Student/Teacher/Admin)

