# Phase V5A — Release Boundary và Dependency Review

## Git baseline

- Worktree: `C:\Users\LEGION\.codex\worktrees\vocabulary-v1-1-integration\english_course_ms_uyen`.
- Base commit: `6ee5f094870d1dd40884434a9d94f3041128853e`.
- Sau `git fetch origin main`, `origin/main` vẫn ở `6ee5f094870d1dd40884434a9d94f3041128853e`; worktree bắt đầu đúng base và không có local main changes.
- Branch làm việc: `codex/vocabulary-phase-v5a`.
- Primary checkout có nhiều dirty changes ngoài phạm vi; không được sửa/đồng bộ. TOEIC audit/evidence và `docs/toeic-part5/` trong worktree hiện tại cũng ngoài scope và phải loại khỏi commit Vocabulary.

## Application boundary

- Backend shell là `backend/src/app.js`; hiện mount legacy `/api/v1/vocabulary`, `/api/v1/admin`, Progress, Learning, Question/Assessment và TOEIC routers. Không import/mount Vocabulary Import/Catalog/Student Catalog/Publication prototype routers.
- Harness tự mount các router ở `backend/tests/helpers/vocabularyPublicationV5aHarness.js` và chỉ mở MongoMemoryReplSet loopback `_test`.
- Frontend route registry `frontend/src/routes/AppRoutes.jsx` còn legacy Student/Admin Vocabulary pages; Publication workspace chỉ được render bởi isolated fixture, chưa có route application.
- `Vocabulary` là model dùng chung: legacy cần `lesson/course`; Catalog-only rows được tách bằng `catalogOnly` và không trả các trường Catalog qua legacy DTO. Regression cần tiếp tục chạy trước/sau bất kỳ migration hoặc route mount nào.

## Dependency/runtime

- Runtime kiểm tra: Node `v22.18.0`, npm `10.9.3`; backend engine được chuẩn hóa `>=22.12.0 <23`.
- Backend additions: `@xmldom/xmldom` runtime cho OOXML parser; `fflate` devDependency cho synthetic DOCX/test fixtures. Backend lockfile chỉ đổi khai báo dependencies/engine; không có frontend dependency addition.
- Frontend dùng các dependency hiện hữu; package additions là test scripts.
- `npm audit` backend: 0 vulnerabilities. Frontend: 0 vulnerabilities.

## Integration manifest sau gates

1. Models/services/import pipeline: `Vocabulary.js`, Catalog/Batch/Candidate/Audit models, parser/adapter/persistence/mapping/import services.
2. Admin backend: Catalog management and Publication routes/services, sau khi thay prototype guard bằng application authentication/authorization đã duyệt.
3. Student backend: Student Catalog route/query, sau khi policy, privacy, rate/pagination limits và real DB indexes được duyệt.
4. Legacy compatibility: `vocabularyController.js`, `courseController.js`, `lessonController.js`, Flashcard page/CSS thay đổi cần giữ nguyên legacy DTO, lesson/course relation, bookmark state và progress writes.
5. Frontend route/auth: chỉ đăng ký Admin/Student routes sau khi session roles, navigation/permissions và backend URL contracts thống nhất.
6. Migration: tách thành migration có staging preflight, index conflict report và rollback; không thực hiện trong V5A.

Chưa có application integration commit hoặc production route. Manifest là thứ tự review tích hợp tương lai, không phải trạng thái deploy.
