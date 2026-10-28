# Kế Hoạch Và Hướng Dẫn Chuyển Frontend Sang Hosting Long Vân (cPanel)

Tài liệu này cung cấp toàn bộ quy trình, hướng dẫn cấu hình, kiểm tra trước chuyển đổi (preflight), cắt chuyển DNS (cutover) và phương án dự phòng (rollback) để chuyển frontend `toeicmsuyen.vn` từ Vercel sang cPanel Long Vân HN.

---

## 1. Thông Tin Hệ Thống

| Mục | Thông tin |
| --- | --- |
| **Domain Frontend** | `toeicmsuyen.vn` (canonical) & `www.toeicmsuyen.vn` |
| **Backend API** | `https://api.toeicmsuyen.vn/api/v1` |
| **Hosting Long Vân** | `cpanelhn1.longvan.net` |
| **IP Server Long Vân** | `103.237.144.116` |
| **Backend Root trên Server** | `apps/english-course/backend` (CloudLinux Node.js Selector) |
| **Giao thức triển khai** | Explicit FTPS (Port 21, TLS yêu cầu) |
| **Workflow Frontend** | `.github/workflows/deploy-frontend.yml` |

---

## 2. Kết Quả Audit & Các Thay Đổi Đã Thực Hiện

### 2.1. Frontend Architecture & API Client
- **Framework**: React 18, Vite 6, React Router DOM v7, Zustand, Axios.
- **API URL Configuration**:
  - Tệp [frontend/src/api/apiBaseUrl.js](file:///Users/vuthuan/english-course-web/frontend/src/api/apiBaseUrl.js) đã được cập nhật:
    - Production build mặc định gọi thẳng backend mới: `https://api.toeicmsuyen.vn/api/v1`.
    - Development build mặc định gọi: `http://localhost:3000/api/v1`.
    - Hỗ trợ ghi đè linh hoạt qua `VITE_API_URL` khi build.
    - Đã loại bỏ hoàn toàn việc phụ thuộc rewrite Vercel `/api/v1`.
- **Media Assets Resolution**:
  - Tệp [frontend/src/utils/mediaUrl.js](file:///Users/vuthuan/english-course-web/frontend/src/utils/mediaUrl.js) đã được chuẩn hóa:
    - Các file static trên frontend (như `/audio/part-2-challenge/...` và `/favicon.ico`) giữ nguyên origin frontend.
    - Các file uploaded trên backend (như `/uploads/...`) được chuyển hướng chính xác đến `https://api.toeicmsuyen.vn/uploads/...`.
    - Các URL external (Vercel Blob storage, CDN) được giữ nguyên.
- **Rollback Safety cho Vercel**:
  - Tệp [vercel.json](file:///Users/vuthuan/english-course-web/vercel.json) và [frontend/vercel.json](file:///Users/vuthuan/english-course-web/frontend/vercel.json) đã được trỏ `destination` của `/api/v1/:path*` sang `https://api.toeicmsuyen.vn/api/v1/:path*` thay vì backend Vercel cũ đã ngưng hoạt động.

### 2.2. Kiểm Tra CORS & Cookies Đăng Nhập
1. **Kiểm tra CORS thực tế trên Backend**:
   - `curl -I -X OPTIONS https://api.toeicmsuyen.vn/api/v1/auth/me -H "Origin: https://toeicmsuyen.vn"`:
     -> **204 No Content**, `Access-Control-Allow-Origin: https://toeicmsuyen.vn`, `Access-Control-Allow-Credentials: true`. (Apex domain đã được cấu hình trong `FRONTEND_URL`).
   - `curl -I -X OPTIONS https://api.toeicmsuyen.vn/api/v1/auth/me -H "Origin: https://www.toeicmsuyen.vn"`:
     -> **500 Not allowed by CORS**.
   - **Giải pháp**:
     - `.htaccess` trên frontend tự động redirect 301 toàn bộ traffic từ `www.toeicmsuyen.vn` về `https://toeicmsuyen.vn`, đảm bảo mọi API call đều xuất phát từ origin hợp lệ.
     - Đồng thời, khuyến nghị quản trị viên bổ sung `FRONTEND_ORIGINS=https://www.toeicmsuyen.vn` vào file `apps/english-course/backend/.env` trên cPanel để đảm bảo an toàn tuyệt đối.
2. **Cookies & Authentication**:
   - Backend sử dụng `SameSite=None; Secure` trong production và `httpOnly: true` cho `refreshToken`.
   - Access token được lưu trong `localStorage` và gửi qua header `Authorization: Bearer <token>`.
   - Cả frontend (`toeicmsuyen.vn`) và backend (`api.toeicmsuyen.vn`) đều thuộc chung domain cấp 2 (`toeicmsuyen.vn`), do đó cơ chế xác thực cookie và refresh token hoạt động mượt mà giữa các subdomain.
3. **Uploads**:
   - Luồng upload tài liệu và ảnh sử dụng cơ chế direct presigned PUT lên Vercel Blob thông qua `blobUploadApi.js`, không phụ thuộc vào rewrite của hosting.

### 2.3. Cấu Hình Apache `.htaccess` Chuyên Dụng
Tệp [frontend/public/.htaccess](file:///Users/vuthuan/english-course-web/frontend/public/.htaccess) đã được tạo và tự động copy vào `frontend/dist/.htaccess` khi build, bao gồm:
1. **Ép HTTPS (301)**: Mọi truy cập HTTP chuyển sang HTTPS.
2. **Canonical Domain (301)**: Mọi truy cập `www.toeicmsuyen.vn` chuyển sang `https://toeicmsuyen.vn`.
3. **Bảo toàn File & Thư mục vật lý**: Tài nguyên có sẵn được Apache phục vụ trực tiếp.
4. **Chặn Fallback đối với Asset hoặc API bị thiếu (QUAN TRỌNG)**:
   - Request bắt đầu bằng `/api/` bị thiếu trả về **HTTP 404** (không rơi vào `index.html`).
   - Request trỏ vào `/assets/`, `/audio/`, `/uploads/` hoặc các đuôi file `.js, .css, .mp3, .png, .woff2, .json...` bị thiếu trả về **HTTP 404** (không rơi vào `index.html`), ngăn ngừa lỗi cú pháp `Uncaught SyntaxError: Unexpected token '<'`.
5. **SPA Routing Fallback**: Các route client-side hợp lệ (`/courses`, `/login`, `/student/dashboard`, `/admin/...`) được chuyển về `/index.html`.
6. **MIME Types & Gzip**: Cấu hình đầy đủ cho `.js`, `.mjs`, `.wasm`, `.woff2`, `.mp3`, `.m4a`, `.traineddata`.
7. **Cache Control**:
   - `index.html`: `no-store, no-cache, must-revalidate` (đảm bảo người dùng luôn nhận bản cập nhật mới nhất ngay sau khi deploy).
   - Static chunks trong `assets/`: `public, max-age=31536000, immutable`.

---

## 3. Xác Minh Document Root Trên cPanel

> [!IMPORTANT]
> **Không mặc định `public_html` khi chưa kiểm tra.**
> Hãy thực hiện các bước sau trên cPanel để xác định đúng thư mục:

1. Đăng nhập vào cPanel tại `https://cpanelhn1.longvan.net:2083`.
2. Truy cập mục **Domains** (hoặc **Domains** trong giao diện cPanel).
3. Tìm bản ghi của domain `toeicmsuyen.vn` và `www.toeicmsuyen.vn`.
4. Quan sát cột **Document Root**:
   - Nếu là `/home/<user>/public_html` hoặc `public_html`: Thư mục tương đối qua FTP là `public_html`.
   - Nếu là `/home/<user>/public_html/toeicmsuyen.vn`: Thư mục tương đối qua FTP là `public_html/toeicmsuyen.vn`.
   - Nếu là `/home/<user>/toeicmsuyen.vn`: Thư mục tương đối qua FTP là `toeicmsuyen.vn`.
5. Sau khi xác định chính xác, bạn có thể truyền tham số `frontend_docroot` khi chạy manual workflow hoặc sử dụng giá trị mặc định `public_html` nếu đúng.

---

## 4. Thiết Lập GitHub Actions Secrets

Để kích hoạt workflow triển khai tự động `.github/workflows/deploy-frontend.yml`, cần thiết lập các Secret trong GitHub Repository (**Settings → Secrets and variables → Actions**):

| Tên Secret | Giá trị yêu cầu | Ý nghĩa |
| --- | --- | --- |
| `LONGVAN_FTPS_HOST` | `cpanelhn1.longvan.net` | Host FTPS (đã có từ backend) |
| `LONGVAN_FTPS_USER` | `<ftp_user>` | User FTPS (đã có từ backend) |
| `LONGVAN_FTPS_PASSWORD` | `<ftp_password>` | Password FTPS (đã có từ backend) |
| `FRONTEND_DOCROOT_VERIFIED` | `true` | Xác nhận đã kiểm tra Document Root trong cPanel Domains |
| `FRONTEND_FTPS_DEPLOY_ENABLED` | `true` | Cho phép thực hiện thao tác ghi/upload lên production |

---

## 5. Quy Trình Kiểm Tra Trước Khi Cắt Chuyển DNS (Không Downtime)

Để kiểm tra frontend trên server Long Vân trước khi sửa DNS chính thức:

### Bước 1: Deploy Frontend Lên Long Vân
1. Vào GitHub Actions, chọn workflow **Deploy frontend to Long Van via Explicit FTPS**.
2. Bấm **Run workflow**:
   - Lần 1: Chọn `deploy = false` để chạy kiểm tra build, unit tests và preflight kết nối FTPS an toàn (read-only).
   - Lần 2: Chọn `deploy = true` để tải bản build production vào thư mục Document Root trên cPanel.

### Bước 2: Kiểm Tra Trực Tiếp Qua File `hosts`
Trên máy tính thử nghiệm (Mac/Linux/Windows), mở file hosts và thêm dòng sau:
```text
103.237.144.116 toeicmsuyen.vn www.toeicmsuyen.vn
```
*(Đường dẫn file hosts: Mac/Linux: `/etc/hosts`; Windows: `C:\Windows\System32\drivers\etc\hosts`)*

### Bước 3: Mở Trình Duyệt Kiểm Tra
1. Mở cửa sổ ẩn danh (Incognito) truy cập `http://toeicmsuyen.vn`:
   - Xác nhận chuyển hướng HTTPS thành công.
2. Kiểm tra React Router & Refresh:
   - Bấm vào `/courses`, `/login`.
   - Refresh trang (F5) tại `/courses` hoặc `/login` -> Trang phải tải đúng giao diện, không bị lỗi 404 Apache.
3. Kiểm tra API:
   - Đăng nhập tài khoản học viên / admin.
   - Kiểm tra F12 Console: Các request API phải gửi đến `https://api.toeicmsuyen.vn/api/v1/...` và nhận response 200/204 thành công.
4. Kiểm tra Audio & Media:
   - Nghe thử audio Part 2 Challenge: `/student/part-2-challenge`.
   - Kiểm tra ảnh bài học và đề thi TOEIC.
5. Kiểm tra tính năng chặn Fallback:
   - Truy cập `https://toeicmsuyen.vn/assets/non-existent.js` -> Phải nhận mã lỗi **404**, không được nhận HTML của `index.html`.
   - Truy cập `https://toeicmsuyen.vn/api/v1/unknown` -> Phải nhận mã lỗi **404**.
6. **Sau khi kiểm tra xong**: Xóa dòng mapping trong file hosts.

---

## 6. Hướng Dẫn Cắt Chuyển DNS (Cutover)

Sau khi hoàn tất kiểm tra qua file hosts và xác nhận hệ thống sẵn sàng:

1. **Hạ TTL trước 24 giờ**:
   - Đăng nhập trang quản trị DNS của domain `toeicmsuyen.vn`.
   - Chuyển TTL của bản ghi `@` và `www` xuống **300 giây** (5 phút).
2. **Cập nhật bản ghi DNS**:
   - Bản ghi `@` (Apex):
     - Loại: `A`
     - Giá trị: `103.237.144.116`
   - Bản ghi `www`:
     - Loại: `CNAME` trỏ về `toeicmsuyen.vn` (hoặc bản ghi `A` trỏ về `103.237.144.116`).
3. **Cấp phát SSL (cPanel AutoSSL)**:
   - Vào cPanel -> **Security** -> **SSL/TLS Status**.
   - Tích chọn cả hai domain `toeicmsuyen.vn` và `www.toeicmsuyen.vn`.
   - Bấm **Run AutoSSL**.
   - Chờ hệ thống xác thực HTTP-01 và cấp chứng chỉ Let's Encrypt / Sectigo (mất khoảng 2-5 phút).
4. **Xác nhận DNS toàn cầu**:
   - Chạy lệnh kiểm tra:
     ```bash
     dig +short toeicmsuyen.vn A
     dig +short www.toeicmsuyen.vn A
     ```
   - Cả hai domain phải trỏ về IP `103.237.144.116`.

---

## 7. Phương Án Rollback Về Vercel (Nếu Có Sự Cố)

Trong trường hợp xảy ra lỗi nghiêm trọng ngoài dự kiến:
1. **Dự án Vercel vẫn được giữ nguyên trạng**, không xóa project hoặc environment trên Vercel.
2. **Thực hiện đổi lại DNS**:
   - Đổi bản ghi `@` (`toeicmsuyen.vn`): Trỏ lại A record `216.198.79.1` (hoặc `76.76.21.21`).
   - Đổi bản ghi `www` (`www.toeicmsuyen.vn`): Trỏ lại CNAME `006d2cd9893acb66.vercel-dns-017.com.` (hoặc `cname.vercel-dns.com`).
3. Do TTL đã đặt 300s, lượng truy cập sẽ tự động quay trở về Vercel trong vòng tối đa 5 phút mà không làm gián đoạn dịch vụ.
