# Phase V3B — Browser test results

## Lệnh đã chạy

| Lệnh | Kết quả |
|---|---|
| `cd frontend; npm run build` | PASS. Vite build hoàn tất; có cảnh báo chunk hiện hữu lớn hơn 500 KiB. Test fixture không được thêm làm production entry. |
| `cd frontend; npm run test:vocabulary-import:unit` | PASS: 6/6. |
| `cd frontend; npm run test:vocabulary-import:mock:e2e` | PASS. Mock API, Vite và Playwright; 3 upload attempts, 3 PATCH, 4 review, 2 Confirm requests. |
| `cd frontend; npm run test:vocabulary-import:real:e2e` | PASS. UI gọi Express V3A trên MongoMemoryReplSet loopback; một synthetic DOCX 1,372 bytes, 1 candidate được Confirm. |
| `cd frontend; npm run test:toeic-part5:unit` | PASS: 9/9 regression utility tests. |
| `cd backend; npm run test:vocabulary-catalog-v1` | PASS: 9/9, gồm legacy endpoints/flashcard DTO và legacy DOCX separation. |
| `cd backend; npm run test:vocabulary-import-v3a` | PASS: 8/8. |
| `cd backend; npm run test:vocabulary-integration-v1-1` | 2 tests SKIPPED vì private source/golden evidence paths không được cấu hình; không có test fail. |

## Ma trận kiểm thử

| Scenario | Bằng chứng | Trạng thái |
|---|---|---|
| DOCX hợp lệ và multipart upload | Mock browser + real synthetic DOCX qua parser V3A | PASS |
| Tối đa 5 file | UI từ chối 6 file; V3A route có giới hạn 5 | PASS cho ngưỡng từ chối |
| File lớn hơn 10 MiB | Mock browser chọn 10 MiB + 1 byte | PASS |
| Tổng batch lớn hơn 25 MiB | Mock browser chọn 3 × 9 MiB | PASS |
| Sai extension/MIME | Mock browser; V3A backend suite kiểm tra file policy | PASS |
| Search, validation filter, pagination | Mock browser 22 candidates; server page size 20 | PASS |
| Nhiều DOCX / nhiều Chapter | Mock browser gửi 2 file; V3A suite kiểm tra multi-file | PASS |
| Sửa senses, examples, notes | Controlled editor mock browser; real UI PATCH notes | PASS |
| Validation errors và Approve gate | Mock candidate invalid hiển thị field issue và khóa Approve | PASS |
| Candidate 409 | Mock browser giữ local text, mở server version rõ ràng; V3A integration suite | PASS |
| Approve / Reject + reason | Mock browser và real V3A review | PASS |
| Duplicate `KEEP_SEPARATE` | Mock browser; real flow kiểm tra decision nếu parser annotate duplicate | PASS |
| Sửa sau Approve | Mock browser xác nhận review reset và cần xác nhận duplicate lại | PASS |
| Audit timeline | Mock browser; real API actions `FIELDS_EDITED`, `REVIEW_DECISION`, `CONFIRMED_DRAFT` | PASS |
| Confirm Draft và imported refs | Mock browser + real transaction trong MongoMemoryReplSet | PASS |
| Upload API error giữ form | Mock browser retry sau lỗi synthetic parser | PASS |
| Confirm mất response | Mock browser abort response; khóa retry đến batch reload | PASS (mock only) |
| Reopen batch sau reload / idempotent upload reuse | Mock browser + real reload theo Batch ID | PASS |
| Không gắn nhãn Published | Mock browser và real response `NOT_ELIGIBLE` | PASS |
| Responsive mobile 390px | Hai browser suites kiểm tra `scrollWidth <= viewport` | PASS tại viewport đo được |
| Unauthenticated / Teacher | Real isolated harness trả 401 / 403 | PASS |
| Legacy Vocabulary/Flashcard regression | Catalog V1 suite 9/9, gồm legacy DTO; Part 5 unit 9/9 | PASS tĩnh/integration; không chạy Flashcard browser |

## Ranh giới kết quả

Mock browser không chứng minh database hoặc authorization. Real backend browser dùng duy nhất một DOCX tổng hợp được tạo tại runtime, loopback MongoMemoryReplSet database `vocabulary_v3b_browser_test` và synthetic Admin identity. Không dùng 30 DOCX khách hàng, không Confirm 711 entries, không application database. Responsive được đo bằng DOM layout; chưa có screen reader audit thủ công.
