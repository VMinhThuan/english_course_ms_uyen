# 11 — Remaining risks and follow-up

## Blockers

1. 30/62 Master cases NOT_RUN và 4 BLOCKED; acceptance P1 chưa đạt.
2. Chưa có staging/deployment target cho HTTPS/domain, hosting, health checks, SPA fallback, live CORS/API URL hoặc quyền Super Admin.
3. Chưa chạy concurrency load test 100–120 learner.
4. Upload trên Vercel/serverless dùng thư mục tạm; cần durable private storage và kế hoạch tương thích URL cũ.
5. Backend còn advisory Moderate mammoth → argparse → sprintf-js; chưa xác định đầy đủ attacker-controlled reachability.
6. Index duplicate-data preflight, migration timing, verification và rollback chưa test.
7. Còn thiếu SQL injection, đầy đủ XSS, bốn loại malicious upload, upload overflow, multi-tab, double-submit và offline recovery.

## Hành vi acceptance chưa đủ

- Module/topic sorting và lesson/course mobile navigation.
- Full multimedia lesson text/image/external link behavior.
- Toàn bộ exercise formats và trạng thái submit/reload/attempt-limit.
- Homework status/autosave/scoring.
- Admin CRUD đầy đủ cho lesson/material/vocabulary/exam bank.
- Student profile chứa nhiều lesson/homework/exam attempt.
- Bảng report nhiều học viên có sort điểm; report kết hợp theo học viên.
- So sánh giao diện đủ 31 ảnh ở đúng page/state/viewport.
- Native PDF behavior, tài liệu lớn, keyboard/screen reader và target touch size.
- Android/iOS/tablet thật và browser engine thứ hai.

## Quyết định tương thích/chính sách cần xác nhận

- Xác nhận 50 MiB general upload và 25 MiB preview theo corpus thật.
- Xác nhận taxonomy difficulty beginner/intermediate/advanced.
- Chốt chính sách TOEIC page images và external HTTPS material.
- Xác nhận Node runtime, quy trình index trên host thật, storage backup/restore.

Không sử dụng dữ liệu production, tài khoản thật, secret triển khai, dịch vụ notification hoặc shared database trong Phase 5.

