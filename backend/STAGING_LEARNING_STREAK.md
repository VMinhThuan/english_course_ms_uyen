# Learning Streak staging runbook

## 0. Runtime và deployment

Project yêu cầu Node.js `>=22.12.0 <23`; repository và CI dùng Node `22.23.4` (`.nvmrc`, GitHub Actions). Máy hiện tại phải cài Node 22 trước khi chạy regression:

```bash
nvm install
nvm use
node -v
```

Backend dùng `NODE_ENV=production` cho runtime production behavior và `APP_ENV=staging` để phân biệt staging. Không dùng `NODE_ENV=staging`. Frontend build dùng `VITE_API_URL` trỏ tới API staging; không đưa secret vào Vite env.

Thứ tự deploy staging:

1. Build/test backend và frontend trên Node 22.
2. Cấu hình secret-managed environment từ `.env.staging.example` và `frontend/.env.staging.example`.
3. Kiểm tra domain/API health và CORS origin staging.
4. Chạy target check, index validation, fixture setup.
5. Chạy real E2E Student/Admin rồi mới thực hiện rollout production.

## 1. Tạo database staging

Tạo một MongoDB Atlas project/cluster riêng hoặc database riêng trong cluster staging. Database bắt buộc có tên:

```text
english_course_staging
```

Không dùng URI đang có trong `backend/.env` cho staging. Tạo database user riêng, chỉ có quyền `readWrite` trên `english_course_staging`; không cấp quyền trên database production, không dùng tài khoản Atlas owner.

Copy `backend/.env.staging.example` thành file môi trường staging secret-managed. Dùng `APP_ENV=staging` và giữ `NODE_ENV=production` để runtime Node/Express dùng production behavior. Cần cấu hình cả Upstash Redis staging vì rate limiting phải dùng shared store khi chạy nhiều instance. Các biến cần có: `MONGODB_URI`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `RATE_LIMIT_NAMESPACE`, `RATE_LIMIT_REDIS_TIMEOUT_MS`, `TRUST_PROXY_HOPS`, `FRONTEND_URL`, `FRONTEND_ORIGINS`.

`RATE_LIMIT_NAMESPACE` phải khác production. `TRUST_PROXY_HOPS` chỉ tăng từ `0` sau khi đã xác minh số reverse-proxy hop; không tin `X-Forwarded-For` mặc định.

Kiểm tra target mà không kết nối:

```bash
APP_ENV=staging npm --prefix backend run learning-streak:check-target
```

Ping database staging sau khi secret đã được nạp:

```bash
APP_ENV=staging npm --prefix backend run learning-streak:check-target -- --connect
```

## 2. Index migration

Backup staging trước, sau đó chạy:

```bash
APP_ENV=staging \
ALLOW_LEARNING_STREAK_INDEXES=true \
npm --prefix backend run learning-streak:indexes
```

Script kiểm tra duplicate records, index conflict, unique constraints và TTL trước khi tạo; sau đó đọc lại index để verify. Script không chạy được nếu thiếu cờ xác nhận hoặc nếu database không phải staging/đã được phê duyệt.

## 3. Fixture account

Chỉ chạy trong staging:

```bash
APP_ENV=staging \
ALLOW_STAGING_LEARNING_STREAK_FIXTURE=true \
STREAK_TEST_PASSWORD='<secret-managed-password>' \
npm --prefix backend run seed:learning-streak-staging
```

Fixture tạo student active với dữ liệu 14 ngày hoàn thành. Password không được in ra log; lưu trong secret manager/test vault.

## 4. E2E

Frontend staging cần `VITE_API_URL=https://<staging-api>/api/v1`. Chạy browser E2E hiện có sau khi login fixture bằng secret test account:

```bash
npm --prefix frontend run test:e2e:learning-streak
```

Browser script hiện dùng API mocks cho layout regression; real staging E2E phải dùng một harness/account test riêng và xác nhận database sau mỗi flow.

## 5. Rollback

1. Dừng rollout frontend/backend mới.
2. Rollback application version về release trước.
3. Vì các index Learning Streak là additive, không drop index trong rollback ứng dụng.
4. Nếu migration tạo index lỗi, giữ database nguyên trạng và xử lý duplicate/conflict trước khi retry.
5. Nếu cần rollback dữ liệu fixture, chỉ xóa các fixture có email/username staging đã định danh; không dùng lệnh xóa rộng.
6. Khôi phục backup chỉ khi có sự cố dữ liệu đã được xác minh và có người phê duyệt.
