# Phase V3A — Test results

## V3A isolated prototype

| Command | Kết quả | Bằng chứng |
|---|---|---|
| `npm run test:vocabulary-import-v3a` | PASS 8/8 | Express harness, MongoMemoryReplSet loopback, synthetic Admin; upload, pagination/search, edit/revalidate, field audit, review approve/reject, duplicate gate, source revision, Draft Confirm và concurrent retry. |
| `npm run test:vocabulary-catalog-v1` | PASS 9/9 | Catalog model/service, index/idempotency và legacy regression fixtures. |
| `node --test tests/docxVocabularyParserV2.test.js` với 3 biến `VOCABULARY_DOCX_*` | PASS 10/10 | Parser unit tests cùng acceptance trên 30 DOCX thật: 711 candidates, no missing/extra, source hashes/locators đối chiếu. Chỉ parse/adapter; không gọi Confirm. |
| `npm run test:vocabulary-integration-v1-1` với source paths | PASS 1, SKIP 1 | Parser V2.1 → Adapter V1 dry-run trên 711 occurrences PASS. Test 90 expanded goldens skip vì private `VOCABULARY_DOCX_GOLDEN_ROOT` không có trong worktree hiện tại. |

V3A integration test kiểm tra tối đa 5 DOCX/batch, MIME/signature/OOXML errors, >10 MiB upload, client-supplied role, Teacher/unauthenticated access, nested mass assignment, HTML input, raw/parsed immutability, validation transitions, stale version conflicts, duplicate `KEEP_SEPARATE`, source revision, multiple Chapter candidate preservation, transaction confirm và concurrent retry. Chỉ synthetic DOCX được lưu/Confirm, trong MongoMemoryReplSet.

## Regression và supply-chain checks

| Command | Kết quả |
|---|---|
| `npm run test:phase1` | PASS 19 |
| `npm run test:phase2` | PASS 20 |
| `npm run test:phase3` | PASS 13 |
| `npm run test:phase4` | PASS 5 |
| `npm run test:phase2-import` | PASS 6 |
| `node --test tests/phase5Cors.test.js tests/phase5ToeicPart5AssessmentSelection.test.js tests/phase6IndexReadiness.test.js` | PASS 12 |
| `npm ls --depth=0` | PASS; dependency tree resolve đầy đủ |
| `npm audit --audit-level=low` | PASS; 0 vulnerabilities |
| `node --check` cho module/service/route/model/test V3A | PASS |
| `git -c core.whitespace=cr-at-eol diff --check` | PASS |

Tổng số test hiện chạy pass trong các nhóm liệt kê: 103; một test 90-row expanded golden bị skip do private evidence root không có. `npm run test:phase5` không chạy do manifest trỏ tới file Part 1 test vắng mặt; CORS/Part 5 selection chạy trực tiếp. Backend không khai báo build script.

## Phạm vi thực thi

- 30 DOCX thật chỉ được đọc trong Parser/Adapter dry-run; không lưu 711 candidate thật vào MongoMemory hoặc app DB và không gọi Confirm.
- MongoMemoryReplSet/MongoMemoryServer test bind loopback và được đóng sau test.
- Không đọc secret, không kết nối app database, không migration, deploy, commit hoặc push.
- Không browser/runtime smoke test; không có app API integration hoặc production database proof.
