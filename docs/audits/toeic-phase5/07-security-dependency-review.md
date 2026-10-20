# 07 — Security and dependency review

## Dependency audit

Các lệnh npm audit chạy cho full và production dependency trees; JSON được giữ trong evidence.

| Dependency tree | Kết quả |
|---|---|
| Frontend | 0 vulnerabilities |
| Backend | 3 package entries trong cùng chain; 3 Moderate, 0 High, 0 Critical |

Chain backend: direct dependency mammoth → argparse → sprintf-js. npm audit xác định sprintf-js tới 1.1.3 có thể gây denial of service khi format string do caller kiểm soát chứa precision quá lớn. Advisory: [GHSA-hp3w-g68c-fv3c](https://github.com/advisories/GHSA-hp3w-g68c-fv3c). GitHub phân loại Moderate; npm record dùng CVSS 3.1 5.3. Advisory hiện chưa liệt kê phiên bản sprintf-js đã vá.

npm đề xuất hạ mammoth xuống 0.3.29, là thay đổi major lớn. Không áp dụng tự động vì nguy cơ phá vỡ API trích xuất/chuyển đổi DOCX hiện tại. Ứng dụng dùng API document conversion của Mammoth; việc tồn tại argparse trong dependency chain không tự chứng minh đường khai thác từ input bên ngoài. Chưa chứng minh reachability của format string do attacker kiểm soát hoặc fuzz đường gọi. Cần đánh giá bản vá/fork/isolated replacement tương thích và chạy regression DOCX trước khi nâng/hạ dependency.

## Hành vi được kiểm tra

- Login/logout, sai mật khẩu, tài khoản khóa và thu hồi session đang mở.
- Password trong MongoMemoryServer là bcrypt hash.
- Lesson E2E xác nhận script/event-handler bị loại và synthetic marker không chạy.
- Restricted material trả 403; direct private URL không xác thực bị từ chối.
- Student không truy cập được admin route.
- Browser page exceptions và backend error samples đều bằng 0.

## Còn thiếu

- NON_SEC_01 NOT_RUN tổng thể: có XSS lesson sanitization subcheck, nhưng chưa chạy các payload trên mọi trường đầu vào và chưa thử SQL injection.
- NON_FILE_01/02 NOT_RUN: chưa upload thực tế .exe/.php/.sh/.js và file lớn hơn 20 MiB qua mọi production route.
- SEC_EXAM_01–05 NOT_RUN: chưa chạy multi-tab, double-submit stress, chỉnh đồng hồ client, offline/reconnect và full recovery.
- Chưa đánh giá public legacy media, production CSP, lưu trữ bền vững và security trên deployment thực tế.

Không auto-fix dependency, không dùng production credential, không deploy hoặc chạy security test trên production.

