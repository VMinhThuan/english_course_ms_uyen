# Phase V4B — Browser E2E Results

## Kết quả theo suite

| Suite | Kết quả | Backend/data | Mobile |
|---|---|---|---|
| `npm run test:vocabulary-catalog-v4b:mock:e2e` | PASS | API mock, fixture Tag/Vocabulary tổng hợp | 390 × 844; scroll width 390 |
| `npm run test:vocabulary-catalog-v4b:real:e2e` | PASS | MongoMemoryReplSet `vocabulary_student_catalog_v4b_browser_test`, loopback `127.0.0.1` | 390 × 844; scroll width 390 |

Real browser test cố ý chặn một lần GET danh sách Chapter bằng 503 để kiểm tra error/retry; retry và các luồng khác đi tới API/Mongo cô lập thật.

## Hai mươi trường hợp

| # | Trường hợp | Mock browser | Isolated backend/browser |
|---:|---|---|---|
| 1 | Danh sách Tag động | PASS | PASS |
| 2 | Lọc Chapter theo Tag | PASS | PASS |
| 3 | Một Chapter là một card | PASS | PASS |
| 4 | Chapter theo thứ tự ổn định | PASS | PASS |
| 5 | Count eligible Vocabulary | PASS | PASS |
| 6 | Mở Flashcard từ Chapter card | PASS | PASS |
| 7 | Multiple senses/POS/ví dụ Anh–Việt/notes | PASS | PASS |
| 8 | Flip bằng chuột và keyboard | PASS | PASS |
| 9 | Next/Previous và phím mũi tên | PASS | PASS |
| 10 | Chapter rỗng | PASS | PASS |
| 11 | Draft Tag ẩn | PASS | PASS |
| 12 | Draft Chapter ẩn | PASS | PASS |
| 13 | Draft Vocabulary ẩn | Fixture response loại row | API thực loại row |
| 14 | Archived data ẩn | Tag không có trong mock list | Direct Draft/Archived API IDs 404; Tag ẩn |
| 15 | Direct URL không bypass visibility | PASS, Draft/Tag không khả dụng | PASS, Draft Chapter/Tag direct URL/API |
| 16 | Sai membership/provenance không lộ data | Mock chỉ trả allowlisted fixture | API thực loại wrong IDs, thiếu Candidate/Audit/membership |
| 17 | Không tràn ngang ở 390px | PASS | PASS |
| 18 | Browser Back/Forward | PASS | PASS |
| 19 | Loading/error/retry | Loading + 503/retry | 503 injection + retry thành công trên API thật |
| 20 | Lesson Flashcard compatibility | PASS với legacy API mock | Partial: Catalog flow giữ bookmark/progress; Lesson endpoint không mount trong harness |

`StudentLayout` chỉ được dùng trong fixture. Không có Playwright browser kết nối application database hoặc application auth session.
