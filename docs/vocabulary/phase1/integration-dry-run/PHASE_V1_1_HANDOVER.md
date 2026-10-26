# Phase V1.1 Handover

## Kết quả

Parser V2.1, Catalog Adapter V1 và envelope validation chạy chung trên 30 DOCX read-only. 711/711 occurrences và source locators được giữ; 14 duplicate groups/29 occurrences không bị merge. 90 expanded independent goldens cho 1.254 exact field comparisons và 6 source-ambiguous comparisons. Mọi candidate tiếp tục `NEEDS_REVIEW`; publication bị khóa.

Synthetic persistence, legacy DOCX preview/confirm, legacy list/CRUD/flashcard, delete lifecycle, progress retention, security và các regression suite được chạy trong test scope. Tổng cộng 96 targeted tests passed. `npm ci`, `npm ls`, `npm audit`, module import side-effect check và `git diff --check` với CRLF-aware config đều passed. Không có 711-row write, app DB connection, route/API, migration, deploy, commit hoặc push.

## Readiness gates

| Gate | Status | Evidence / boundary |
|---|---|---|
| `PARSER_CATALOG_INTEGRATION_READY` | PASS | 711 envelopes validate, source fields/order/locators giữ nguyên |
| `DEPENDENCY_BASELINE_READY` | PASS — scratch | `npm ci`, `npm ls`, audit 0; runtime deployment chưa kiểm tra |
| `SOURCE_PRESERVATION_READY` | PASS — structural | 1.254 exact + 6 ambiguous; 711 đều cần human review |
| `LEGACY_COMPATIBILITY_READY` | PASS — bounded tests | Controller/model regression trên synthetic fixtures và MongoMemoryServer |
| `CANDIDATE_PERSISTENCE_DESIGN_READY` | PASS — prototype | Synthetic retry/conflict/edit/audit; chưa rollout schema/API |
| `DATABASE_BASELINE_READY` | BLOCKED | Host/database/read-only principal chưa xác minh |
| `ACCESS_POLICY_APPROVED` | NO | Product Owner decisions còn pending |
| `V3_IMPLEMENTATION_READY` | NO | Dừng trước Import/Review API |
| `PRODUCTION_READY` | NO | Không có policy approval, DB baseline hoặc deployment acceptance |

## Test evidence

- `npm run test:vocabulary-parser-v2`: 10 passed.
- `npm run accept:vocabulary-parser-v2`: 30 files, 711 rows, 711 locators, 30 SHA matches, 14 duplicate groups; no problems.
- `npm run test:vocabulary-integration-v1-1`: 2 passed (real-source pipeline + 90 expanded goldens).
- `npm run test:vocabulary-catalog-v1`: 9 passed (Catalog, candidate persistence, legacy controller behavior).
- Phase 1/2/3/4, Phase 2 import, Phase 5 CORS/Part 5 selection, Phase 6 index suites: 75 passed.
- `npm ci`: 228 added, 229 audited, 0 vulnerabilities; `npm audit --audit-level=low`: 0 vulnerabilities.

Parser acceptance/pipeline runs nhận source paths qua `VOCABULARY_DOCX_SOURCE_ROOT`, `VOCABULARY_DOCX_REFERENCE_CSV`, `VOCABULARY_DOCX_SHA256_MANIFEST`; expanded goldens dùng thêm `VOCABULARY_DOCX_GOLDEN_ROOT` trỏ tới private evidence ngoài scratch. Các biến chỉ được đặt cho test process.

## Next gate

Review các Product Owner decisions ở `V3_IMPORT_API_READINESS.md`. Xác minh app database identity và quyền read-only trước inventory. Chỉ sau các gate đó mới quyết định schema rollout và mở V3 API.
