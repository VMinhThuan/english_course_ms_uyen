# Phase V3B — Admin Import UI implementation

## Kết quả

Đã dựng UI thao tác được cho quy trình **Upload → Preview → Editorial Review → Confirm Draft**. Giao diện gọi V3A bằng API client riêng, đã chạy qua mock browser suite và Express/MongoMemoryReplSet harness với một DOCX tổng hợp.

UI hiện được giữ ngoài `AppRoutes`; entry để chạy browser test nằm trong `frontend/tests/fixtures/`. Entry này dùng `AdminLayout` thật bên trong `MemoryRouter`, không tạo production route và không khởi tạo application API/database.

## Thành phần

| File | Vai trò |
|---|---|
| `frontend/src/features/vocabulary-import/VocabularyImportWorkspace.jsx` | Wizard, batch recovery, preview/filter, editor, audit, review và confirm. |
| `frontend/src/features/vocabulary-import/VocabularyImportWorkspace.css` | Bố cục responsive dùng token Admin và source/parsed/editor comparison. |
| `frontend/src/features/vocabulary-import/api.js` | Fetch client độc lập cho hợp đồng V3A; có thể cấu hình `baseUrl` và header provider trong harness. |
| `frontend/src/features/vocabulary-import/model.js` | Hợp nhất parsed + edited values để hiển thị, trạng thái, locator, giới hạn và nhãn validation. |
| `frontend/tests/fixtures/vocabulary-import.html` | HTML entry chỉ dùng khi chạy Vite cho QA. |
| `frontend/tests/fixtures/vocabulary-import-fixture.jsx` | Fixture dùng `AdminLayout` trong memory route và API endpoint test được inject. |
| `backend/tests/vocabularyImportV3bHarnessServer.js` | Express harness riêng, synthetic Admin/Teacher principal và MongoMemoryReplSet loopback `_test`. |

## Hành vi đã triển khai

- Chọn nhiều DOCX, drag-and-drop, file list, kích thước, lỗi định dạng, giới hạn 5 file / 10 MiB mỗi file / 25 MiB mỗi batch.
- Yêu cầu Admin nhập và xác nhận nhãn `sourceFolder`; UI không đọc `File.path` hoặc suy luận thư mục máy.
- Hỗ trợ nhiều Chapter trong một batch và xử lý batch tiếp theo theo thao tác riêng.
- Mở batch theo ID; lưu duy nhất Batch ID gần nhất trong local storage để khôi phục sau reload.
- Tải danh sách candidate theo server pagination 20 dòng, search và filter status/validation/review/import. UI không tải 711 editor forms cùng lúc.
- Candidate editor giữ riêng `rawValues`, `parsedValues` và controlled edited values. Raw/source/parsed hiển thị chỉ đọc; API update chỉ nhận các trường cho phép.
- Chỉnh Word, POS, nhiều senses, ví dụ Anh–Việt và notes; có lý do chỉnh sửa.
- Hiển thị field validation, duplicate/source revision, review state, imported references và audit timeline.
- Approve bị khóa nếu API chưa trả `VALIDATION_PASSED`; duplicate cần reviewer chọn lại `KEEP_SEPARATE` sau mỗi lần edit.
- Confirm chỉ cho chọn candidate đã hợp lệ và được duyệt. Response hiển thị result references/row errors và không đổi trạng thái publication.
- Khi request lỗi, form đang nhập được giữ lại. Sau lỗi mạng ở Confirm, UI khóa lần Confirm kế tiếp cho đến khi Admin tải lại batch.

## Trạng thái tích hợp

`UI_COMPONENT_READY=YES` trong test fixture; `MOCK_E2E_READY=YES`; `ISOLATED_BACKEND_E2E_READY=YES` cho luồng synthetic đã chạy. `APPLICATION_INTEGRATION_READY=NO`: chưa gắn vào `AdminVocabularyPage`, chưa đăng ký route, và V3A router vẫn tách khỏi `backend/src/app.js`.

Lệnh chạy browser suite:

```powershell
cd frontend
npm run test:vocabulary-import:mock:e2e
npm run test:vocabulary-import:real:e2e
```

Không có Confirm trên 30 DOCX gốc hoặc 711 candidate thật trong Phase V3B.
