# Phase V3B — Legacy regression report

## Phạm vi thay đổi

- Không sửa `frontend/src/pages/FlashcardPage.jsx`, `StudentVocabularyPage.jsx`, `vocabularyApi.js`, `AdminVocabularyPage.jsx`, `AppRoutes.jsx`, TOEIC Part 1 hoặc TOEIC Part 5 source modules.
- V3B dùng module mới `frontend/src/features/vocabulary-import/`; test fixture tự mount `AdminLayout` trong memory router. Không thêm route production.
- `frontend/package.json` chỉ nhận các lệnh test unit/browser cho V3B.
- Backend V3A router không được gắn vào `backend/src/app.js`; harness mới chỉ tồn tại trong `backend/tests/` và gắn router vào Express app test.

## Regression evidence

| Kiểm tra | Kết quả |
|---|---|
| `backend/npm run test:vocabulary-catalog-v1` | PASS 9/9. Bao gồm “legacy required refs, endpoints and flashcard DTO stay compatible”, legacy DOCX preview/confirm isolation và catalog indexes. |
| `frontend/npm run test:toeic-part5:unit` | PASS 9/9. |
| `backend/npm run test:vocabulary-import-v3a` | PASS 8/8; router/persistence prototype contract còn nguyên. |
| `frontend npm run build` | PASS. |
| UI source edit audit | Không có import từ legacy `vocabularyApi`/legacy DOCX modal. |

Không chạy browser smoke trực tiếp Student Flashcard trong V3B; kết luận legacy ở đây giới hạn vào regression suites và source boundary nêu trên. Build/test pass không xác nhận runtime Flashcard trên application backend.
