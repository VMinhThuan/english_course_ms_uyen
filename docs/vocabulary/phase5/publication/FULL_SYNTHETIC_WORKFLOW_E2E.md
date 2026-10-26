# Phase V5A — Synthetic Admin → Student Workflow E2E

## Môi trường

- Database: `vocabulary_publication_v5a_browser_test`.
- Topology: MongoMemoryReplSet một node, bind `127.0.0.1`; tên DB kết thúc `_test`.
- API và browser dùng synthetic principals; không load application `.env` hoặc kết nối MongoDB ứng dụng.
- Source DOCX tổng hợp có hai occurrence; cả hai được edit thành từ khác nhau và review duplicate `KEEP_SEPARATE`.

## Workflow đạt được

| Bước | Hành động | Kết quả |
|---|---|---|
| 1 | Admin tạo Tag và Chapter | Draft, chưa visible Student |
| 2 | Upload DOCX tổng hợp | Parser tạo Candidate occurrences |
| 3 | Map source vào Tag/Chapter | Mapping giữ nguyên source identity |
| 4 | Preview, edit, review | Edited Candidate được duyệt; raw/parsed evidence không đổi |
| 5 | Confirm Draft | Tạo Catalog Vocabulary và Membership cùng audit |
| 6 | Kiểm tra eligibility | Summary hiển thị counts/blockers và candidate detail |
| 7 | Review/Publish Tag rồi Chapter | Backend chặn sai thứ tự; sau Publish Student thấy container |
| 8 | Publish Vocabulary từ Admin UI | Hai occurrence Published qua backend |
| 9 | Student đọc Chapter | API trả đúng hai Catalog fields; không lộ source/audit |
| 10 | Admin Hide Vocabulary | Record/Membership còn; Student count giảm |
| 11 | Admin Archive Chapter | Direct-ID Student request trả 404 |

Browser E2E còn làm mất response của lần Publish Vocabulary đầu sau khi backend đã commit. Retry bằng cùng idempotency key nhận response idempotent, không phát sinh lần ghi thứ hai. Viewport 390×844 không tràn ngang.

## Negative cases

Backend V5A suite kiểm tra Teacher/Student bị chặn; client status mass assignment; Chapter trước parent Tag; review reject/stale; thiếu review/confirm audit; sai Candidate references; tamper content; Vocabulary thủ công thiếu provenance; sai Membership; concurrent Publish; retry/idempotency; privacy Student; direct-ID ẩn/archived và non-cascade preservation.

Kết quả: backend V5A 9/9 PASS; browser synthetic E2E PASS. V3A/V4A/V4B flows được giữ trong regression suite và đều PASS theo report `REGRESSION_TEST_RESULTS.md`.

## Giới hạn bằng chứng

Chỉ dùng synthetic DOCX. Không mở, import, Confirm hoặc Publish 30 DOCX nguồn thật/711 occurrences. Source acceptance thật tiếp tục SKIPPED do source root và Phase 0 locator/hash references không có trong checkout và các biến cấu hình nguồn không được đặt.
