# Phase V4B — Legacy and Cross-Phase Regression Report

## Đã chạy

| Phạm vi | Lệnh | Kết quả |
|---|---|---|
| Parser V2 | `npm run test:vocabulary-parser-v2` | 9 PASS, 1 SKIPPED (real 30-DOCX oracle) |
| Catalog V1 + legacy DTO/progress retention | `npm run test:vocabulary-catalog-v1` | 9/9 PASS |
| V1.1 Parser → Catalog integration/goldens | `npm run test:vocabulary-integration-v1-1` | 2 SKIPPED; source/golden paths chưa cấu hình |
| V3A Import backend | `npm run test:vocabulary-import-v3a` | 8/8 PASS |
| V3B API/model unit | `npm run test:vocabulary-import:unit` | 6/6 PASS |
| V3B mock browser | `npm run test:vocabulary-import:mock:e2e` | PASS |
| V3B isolated real backend browser | `npm run test:vocabulary-import:real:e2e` | PASS; synthetic DOCX/Mongo test DB |
| V4A Tag/Chapter backend | `npm run test:vocabulary-catalog-v4a` | 9/9 PASS |
| V4A isolated real backend browser | `npm run test:vocabulary-catalog-v4a:real:e2e` | PASS |
| V4B Student API | `npm run test:vocabulary-student-catalog-v4b` | 9/9 PASS |
| Learning API/Progress | `npm run test:phase4` | 5/5 PASS |
| TOEIC Part 5 import backend | `npm run test:phase2-import` | 6/6 PASS |
| TOEIC Part 5 frontend unit | `npm run test:toeic-part5:unit` | 9/9 PASS |
| TOEIC Part 5 mock browser | `npm run test:toeic-part5:mock:e2e` | PASS |
| TOEIC Part 5 isolated backend browser | `npm run test:toeic-part5:real:e2e` | PASS |
| TOEIC Part 5 question bank browser | `npm run test:toeic-part5:bank:e2e` | PASS |
| Frontend production build | `npm run build` | PASS; existing bundle-size warning >500 kB |
| Backend dependency audit | `npm audit` | 0 vulnerabilities |
| Frontend dependency audit | `npm audit` | 0 vulnerabilities |

V4B mock/real Browser E2E và kết quả chi tiết được ghi ở `BROWSER_E2E_RESULTS.md`.

## Suite nguồn thật bị SKIPPED

Parser V2 test đánh dấu SKIPPED case đối chiếu 30 DOCX/711 locator. V1.1 integration đánh dấu SKIPPED cả dry-run 30 DOCX lẫn 90 independent goldens vì không có `VOCABULARY_DOCX_*` source path và `VOCABULARY_DOCX_GOLDEN_ROOT`. Các path mặc định dưới `local-assets/vocabulary-source` và `docs/vocabulary/phase0/source-gate-closure` không tồn tại trong worktree.

Không chạy source acceptance, không đọc/Confirm 30 DOCX thật và không ghi đè `docs/vocabulary/phase2/PARSER_COVERAGE_RESULTS.csv`. SKIPPED không được tính là PASS.

## Phạm vi chưa được gọi là full regression

Không chạy Part 1 hoặc toàn bộ application suite. Không xác minh application auth/runtime, production database, browser session thật hay deployment. Không sửa file TOEIC Part 5; các suite liên quan chỉ là hồi quy đọc/test.
