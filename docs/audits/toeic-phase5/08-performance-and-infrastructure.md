# 08 — Performance and infrastructure

## Số đo local

- Một lượt navigation: DOMContentLoaded 401 ms; load 552 ms.
- Vite production build hoàn thành trong 4.86 s.
- Main minified JS: 756.59 kB, gzip 205.73 kB.
- PDF worker: 1,264.34 kB.
- Vite cảnh báo chunk vượt 500 kB.

Đây là số liệu local/loopback, không đại diện production.

## Load và dữ liệu

- NON_LOAD_01 BLOCKED: chưa có staging target, bộ tài khoản tổng hợp, concurrency profile hoặc ngưỡng dừng được duyệt. Không tạo traffic 100–120 user.
- Không đưa ra throughput, database latency, memory hoặc error-rate claim.
- Browser policy chặn egress để không phụ thuộc dịch vụ ngoài.

## MongoDB indexes

Model source có index declarations cho username unique, attempt/report queries, course-student lookup, lesson order, enrollment và learning progress. Phase 5 không tạo index hoặc migration trên staging/production. Trước rollout:

1. kiểm tra username null/trùng và index name hiện hữu;
2. đo tác động build index trên staging copy có kích thước gần production;
3. chạy migration có phê duyệt và xác minh bằng listIndexes;
4. ghi giới hạn rollback: drop index không khôi phục dữ liệu hoặc hiệu năng đã mất.

## Upload và PDF

- Phase 1 source ánh xạ storage trên Vercel/serverless tới os.tmpdir()/uploads. Đây là thư mục tạm, không bảo đảm bền qua function/instance; cần chọn và thử durable private storage.
- General upload cap hiện tại là 50 MiB; inline PDF preview cap 25 MiB. Master case yêu cầu thử file vượt 20 MiB. Phase 5 không thử các ngưỡng production hoặc corpus thật.
- PDF fixture nhỏ ba trang đã preview/render và download được. Chưa kiểm tra bộ nhớ PDF lớn, range requests, cancel, mobile PDF hay fallback trên 25 MiB.

## Runtime/configuration/schema

- Local Node.js v22.18.0. Phase 1 audit nêu dependency sanitizer yêu cầu >=22.12; cần xác nhận runtime deployment thực tế.
- CORS/API URL/SPA routing được kiểm tra trên loopback. Chưa kiểm tra API URL, TLS, SPA fallback, health checks, serverless timeout hay production logging.
- Lesson difficulty có beginner/intermediate/advanced; Master PDF không định nghĩa taxonomy chính thức nên cần product xác nhận.
- Schema/index compatibility, backfill và migration production chưa chạy.


