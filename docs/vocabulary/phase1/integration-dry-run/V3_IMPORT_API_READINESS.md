# V3 Import API Readiness

## Kết luận

**Chưa bắt đầu V3 Admin Import/Review API trong Phase V1.1.** Parser, adapter, validator và persistence prototype chạy được trong test scope; policy/schema rollout chưa được Product Owner phê duyệt. Phase này dừng trước route/API theo yêu cầu.

## Quyết định cần review

- Admin quản lý Tag, Chapter, Import và Publish; Teacher tiếp tục quản lý Vocabulary legacy.
- Student đăng nhập chỉ đọc Catalog đã Published; Catalog độc lập Course enrollment.
- Import mặc định Draft; parse/validation không đồng nghĩa review approval.
- Duplicate được review trước khi reuse; không tự merge.
- Archive không cascade-delete Vocabulary, membership hoặc progress.
- Quyền approve/reject, lý do bắt buộc, audit actor identity và import retry/batch lifecycle.
- Catalog candidate → legacy/catalog Vocabulary field mapping, cùng cơ chế atomic edit + audit.

Không route Student/Teacher/Admin mới, migration hoặc publish behavior nào được thêm. Database baseline cũng đang BLOCKED.
