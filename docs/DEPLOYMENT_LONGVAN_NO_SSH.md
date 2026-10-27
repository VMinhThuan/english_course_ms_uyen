# Phương án CI/CD Long Vân không cần SSH shell

## Kết luận kiểm tra ngày 2026-10-27

| Hạng mục | Kết quả kiểm tra | Ý nghĩa |
| --- | --- | --- |
| SSH TCP `22`, `2222`, `2200`, `2022` tới `45.119.80.8` | Timeout từ môi trường kiểm tra | Public key đã authorize không đủ; SSH service/firewall/IP allowlist chưa cho kết nối. Không thể dùng workflow SSH hiện có. |
| FTP TCP `21` | Kết nối được | Có thể là đường upload thay thế. |
| Explicit FTPS trên `21` | Bắt tay TLS 1.3 thành công, chứng chỉ hợp lệ cho `cpanelhcm2.longvan.net` | FTPS control channel có hỗ trợ; vẫn phải preflight bằng tài khoản thật để xác minh passive data channel và quyền thư mục. |
| cPanel HTTPS `2083` | Bắt tay TLS thành công | Có thể dùng cPanel UAPI nếu account được cấp API token và `PassengerApps` được bật. |
| `https://api.toeicmsuyen.vn/health` | Passenger HTTP 500, `Web application could not be started`, Error ID `f038761b` | Lỗi diễn ra trước Express route. Cần Passenger log; chưa có bằng chứng để kết luận là MongoDB hay chỉ thiếu `node_modules`. |

Các probe này không dùng mật khẩu, không ghi dữ liệu và không thử đăng nhập cPanel/FTP. Kết quả từ một mạng không đại diện cho IP GitHub Actions, nhưng đủ để xác nhận hướng SSH hiện không khả dụng và FTPS/cPanel API đáng để preflight.

## Đối chiếu với Lamcoffee

Repository lân cận `/Users/vuthuan/lam-coffee-website` có workflow lịch sử `.github/workflows/deploy.yml`. Phiên bản hiện tại:

1. Upload backend bằng GitHub Actions `SamKirkland/FTP-Deploy-Action` tới cPanel qua FTP port 21; workflow từng thử FTPS, sau đó commit `87e5f51` chuyển về FTP do timeout data connection.
2. Tạo và upload `backend/tmp/restart.txt` để yêu cầu Passenger restart.
3. SSH chỉ là bước `npm ci --omit=dev` **tùy chọn**, được `continue-on-error`; vì vậy upload/restart vẫn chạy khi SSH không dùng được.
4. Sau đó health check API; hiện workflow chỉ cảnh báo khi health check thất bại và không rollback tự động.

TOEIC khác Lamcoffee ở điểm quan trọng: engine Node bị khóa `>=22.12 <23`, có `package-lock`, dữ liệu runtime cần bảo vệ (`uploads/`, `data/`), và app đang Passenger 500. Vì vậy không sao chép nguyên workflow Lamcoffee, đặc biệt không hạ xuống FTP plain text, không bỏ qua health failure, và không coi FTP upload là đã cài dependency thành công.

## Workflow đã chuẩn bị

[`deploy-backend-ftps-cpanel.yml`](../.github/workflows/deploy-backend-ftps-cpanel.yml) dùng hai kênh:

```text
GitHub Actions
  ├─ FTPS: upload code + tmp/restart.txt
  └─ cPanel UAPI :2083: PassengerApps/list_applications -> PassengerApps/ensure_deps
                                      └─ cPanel chạy npm install cho app
```

Workflow luôn chạy `npm ci` và regression test bằng Node 22 trên GitHub. Khi chạy thủ công với `deploy=false`, nó chỉ làm preflight read-only: đăng nhập FTPS để list application directory, và gọi `PassengerApps/list_applications`. Job upload chỉ chạy khi repository variable `BACKEND_FTPS_CPANEL_DEPLOY_ENABLED` được đặt chính xác là `true`; mặc định biến này không tồn tại nên workflow **không thể deploy production**.

`PassengerApps/ensure_deps` là API chuẩn cPanel cho “Enable Dependencies”/cài npm dependencies. Cơ chế Node.js Selector UI cũng có nút **Run npm install**. Tuy vậy, API/UI thực thi `npm install`, không được xác nhận là `npm ci --omit=dev`; do đó nó là phương án khả thi cần preflight thật, không phải bằng chứng rằng nó đã đáp ứng đúng policy dependency production.

`tmp/restart.txt` là cơ chế restart Passenger mức user của cPanel. Workflow đưa file này vào payload FTPS sau upload code. Không dùng Docker, PM2, sudo, hoặc restart Apache toàn server.

## Secrets và xác nhận cần có

Tạo các GitHub Actions secrets, không đưa bất kỳ giá trị nào vào Git:

| Secret | Yêu cầu |
| --- | --- |
| `LONGVAN_FTPS_HOST` | Hostname FTPS do Long Vân xác nhận; ưu tiên hostname khớp chứng chỉ, không dùng IP nếu certificate không khớp. |
| `LONGVAN_FTPS_USER` | FTP account bị giới hạn chỉ vào home của `toeicmsuyenvn` hoặc thư mục app. |
| `LONGVAN_FTPS_PASSWORD` | Password của FTP account chuyên deploy. |
| `LONGVAN_CPANEL_HOST` | Hostname cPanel cho TLS port 2083. |
| `LONGVAN_CPANEL_USER` | `toeicmsuyenvn`. |
| `LONGVAN_CPANEL_API_TOKEN` | API token riêng, có hiệu lực với UAPI `PassengerApps/list_applications` và `PassengerApps/ensure_deps`; cần rotate/revoke được. |

Sau khi secrets có mặt, chạy thủ công workflow với `deploy=false`. Chỉ bật `BACKEND_FTPS_CPANEL_DEPLOY_ENABLED=true` khi cả hai preflight pass và Long Vân xác nhận cách restore một release cũ. Thiết lập GitHub Environment `longvan-production` với required reviewers trước khi bật biến này.

## Giới hạn rollback và phương án khuyến nghị

FTPS + cPanel UAPI hiện **chưa xác minh** được server-side atomic rename/copy backup, nên workflow không tự nhận là zero-downtime hay auto-rollback. Nó luôn bỏ qua `.env`, `uploads/`, `data/`, `logs/`, `node_modules/`, và không dùng clean slate; nhưng nếu code mới làm app lỗi sau khi cài dependency, recovery cần deploy lại commit tốt đã biết bằng `workflow_dispatch`, `deploy=true`, `release_ref=<commit-SHA>`, sau khi xem log.

Do đó phương án ổn định theo thứ tự ưu tiên là:

1. **Tốt nhất:** Long Vân mở SSH/SFTP shell cho GitHub Actions (hoặc allowlist dải IP runner) và cho phép `rsync`, Node Selector activation, `npm ci --omit=dev`, cùng backup/restart; dùng workflow SSH hiện có vì có backup và rollback tự động.
2. **Phương án không SSH có điều kiện:** FTPS + cPanel UAPI workflow mới, chỉ sau khi preflight xác nhận `PassengerApps` hoạt động, `ensure_deps` thực sự cài được dependencies cho Node 22, restart file được Passenger nhận, và Long Vân xác nhận backup/redeploy rollback.
3. **Không khuyến nghị:** FTP plain text như fallback Lamcoffee. Chỉ cân nhắc nếu Long Vân chứng minh FTPS passive data channel không hỗ trợ và chấp nhận rủi ro transport; không bật trong workflow TOEIC.

## Yêu cầu chính xác gửi Long Vân

Nếu chọn SSH, yêu cầu họ kiểm tra và phản hồi bằng log/kết quả test:

1. Dịch vụ `sshd` có lắng nghe port nào cho user `toeicmsuyenvn`, và firewall/WAF/CageFS có allow inbound từ GitHub-hosted runners hay yêu cầu self-hosted runner/IP tĩnh.
2. SSH shell không phải chỉ SFTP: chạy được `bash`, `rsync`, `source /home/toeicmsuyenvn/nodevenv/apps/english-course/backend/22/bin/activate`, `node --version`, `npm --version`, `npm ci --omit=dev`, và `touch .../tmp/restart.txt`.
3. App root owner/permissions và Passenger log path cho error `f038761b`; gửi stack trace đã che secrets.
4. Node.js Selector thực tế dùng Node >=22.12, startup file `app.js`, mode production, domain `api.toeicmsuyen.vn`, app root đúng, và restart qua `tmp/restart.txt` có hiệu lực.
5. Có backup/snapshot server-side trước deploy và cách restore do cPanel user thực hiện được.

Nếu chọn không SSH, yêu cầu họ xác nhận thay vì suy đoán:

1. FTPS explicit trên port 21 hỗ trợ passive data connections từ GitHub Actions và FTP account có quyền list/write `apps/english-course/backend` nhưng không cần quyền toàn account.
2. cPanel API tokens được bật; token của `toeicmsuyenvn` gọi được `PassengerApps/list_applications` và `PassengerApps/ensure_deps` qua port 2083.
3. `ensure_deps type=npm app_path=apps/english-course/backend` tương thích với **CloudLinux Node.js Selector** app hiện tại và Node 22, không chỉ với stock cPanel Application Manager.
4. Họ cung cấp/cho phép đọc Passenger app log để chẩn đoán Error ID `f038761b`, và xác nhận thao tác restart sau FTPS upload.

## Nguồn xác minh

- cPanel xác nhận UAPI dùng port 2083 và có API token cho cPanel account: [API tokens](https://api.docs.cpanel.net/cpanel/tokens/).
- cPanel có `PassengerApps/ensure_deps` để cài npm dependencies: [cPanel Application Manager deployment article](https://cpanel.net/blog/products/cpanel-application-manager-and-app-deployment-101/).
- CloudLinux Node.js Selector UI có **Run npm install**, Restart và startup-file settings: [CloudLinux Manager UI](https://docs.cloudlinux.com/cloudlinuxos/lve_manager/).
- cPanel ghi nhận `tmp/restart.txt` là Passenger restart signal: [Node.js application guide](https://docs.cpanel.net/knowledge-base/web-services/how-to-install-a-node.js-application/).
