# Phase V4B — Handover

## Đã thực hiện

- Read-only Student Catalog prototype với Tag → Chapter cards → aggregate Chapter Flashcards.
- Backend kiểm tra Published state, đúng quan hệ Tag/Chapter, membership và provenance V3A qua Candidate, Batch và review/import Audit.
- DTO allowlist giữ mọi sense, POS, ví dụ song ngữ và notes; loại source/review/audit metadata.
- Student route/page chỉ xuất hiện trong isolated harness; không chỉnh production application route tree.
- Catalog bookmark dùng localStorage riêng; không ghi LearningProgress và không tạo Lesson/Course giả.
- 9 tài liệu Phase V4B được tạo trong thư mục này.

## Vị trí source chính

| Vai trò | File |
|---|---|
| Visibility/read service | `backend/src/services/studentVocabularyCatalogPrototype.js` |
| Injected-auth GET router | `backend/src/routes/studentVocabularyCatalogPrototypeRoutes.js` |
| API adapter | `frontend/src/features/vocabulary-catalog/studentApi.js` |
| Student Tag/Chapter page | `frontend/src/features/vocabulary-catalog/StudentVocabularyCatalogPage.jsx` |
| Safe Flashcard adapter | `frontend/src/features/vocabulary-catalog/flashcardPresentationAdapter.js` |
| Isolated student fixture | `frontend/tests/fixtures/vocabulary-catalog-v4b-fixture.jsx` |
| Real test data/harness | `backend/tests/helpers/vocabularyStudentCatalogFixtures.js`, `backend/tests/vocabularyStudentCatalogV4bHarnessServer.js` |

## Readiness gates

| Gate | Trạng thái | Căn cứ |
|---|---|---|
| `STUDENT_CATALOG_API_READY` | YES — prototype | 9/9 API integration trên MongoMemoryReplSet |
| `CHAPTER_CARD_UI_READY` | YES — isolated fixture | dynamic Tag, Chapter/page/search/count, mobile 390px |
| `FLASHCARD_INTEGRATION_READY` | YES — prototype | aggregate card, rich senses, keyboard, lazy Chapter API |
| `PUBLICATION_FILTER_READY` | YES — prototype | backend status/provenance/audit gating, negative fixtures |
| `LEGACY_FLASHCARD_COMPATIBILITY_READY` | YES — prototype evidence | V1 regression + legacy mock browser; application runtime chưa được xác minh |
| `MOCK_BROWSER_READY` | YES | V4B mock E2E PASS |
| `ISOLATED_BACKEND_BROWSER_READY` | YES | V4B real browser PASS trên DB `_test` loopback |
| `ACCESS_POLICY_APPROVED` | NO — `PENDING_PO` | Chưa có phê duyệt PO |
| `DATABASE_BASELINE_READY` | NO | Không kết nối/inventory application DB |
| `APPLICATION_INTEGRATION_READY` | NO | Router và trang chưa mount/register trong app |
| `PRODUCTION_READY` | NO | Không có policy, DB baseline, app integration hoặc release/deploy evidence |

## Boundary

Giữ nguyên `PENDING_PO`. Không thêm Publish API, route production, migration, application DB access, dữ liệu 711 từ, Confirm 30 DOCX, commit, push, merge, rebase, Part 1/5 edit hoặc deploy. Chưa chuyển sang V5.

Chi tiết API, card, Flashcard, visibility, bookmark/progress, browser và regression nằm trong các báo cáo kèm theo.
