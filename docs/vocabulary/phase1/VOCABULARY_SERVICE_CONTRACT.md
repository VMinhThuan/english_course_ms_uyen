# Phase V1 — hợp đồng service Vocabulary Catalog

Đây là service nội bộ, chưa được gắn route hoặc quyền API. Mọi endpoint tương lai phải có quyết định quyền riêng và kiểm tra authorization ở controller; service hiện không phải ranh giới phân quyền.

## Hàm đã triển khai

| Hàm | Kết quả và ràng buộc |
|---|---|
| createVocabularyTag(input) | Tạo Tag ở Draft; slug unique. Không nhận trạng thái Published từ caller. |
| createVocabularyChapter(input) | Yêu cầu tagId hợp lệ và Tag tồn tại; tạo Chapter ở Draft. |
| createCatalogVocabulary(input) | Tạo Vocabulary mới, catalogOnly=true, catalogStatus=draft, status=hidden; không tạo Lesson/Course. |
| addVocabularyToChapter(input) | Yêu cầu Chapter, Catalog Vocabulary và sourceIdentity; trả membership hiện hữu khi cùng cặp và identity; xung đột sẽ báo lỗi, không merge từ. |
| archiveVocabularyChapter(chapterId) | Chuyển Chapter sang Archived; không xóa row liên quan. |
| listPublishedCatalogVocabulary(options) | Trả các membership chỉ khi Tag, Chapter và Vocabulary đều Published; lọc theo tagId/chapterId/search và phân trang ổn định. |

Phân trang nhận page >= 1 và limit 1–100. Tìm kiếm tối đa 80 ký tự và regex được escape. Sort xác định theo Chapter sortOrder/chapterNumber/_id rồi Membership sortOrder/_id.

## Idempotency và duplicate

sourceIdentity là định danh của occurrence nguồn, không phải Vocabulary ID. Cùng identity/cùng cặp trả cùng membership khi retry; cùng identity nhưng khác cặp báo SOURCE_IDENTITY_CONFLICT; cùng cặp nhưng identity khác báo MEMBERSHIP_ALREADY_EXISTS. Unique indexes phân xử race đồng thời.

Không có unique index trên headword và không tự merge duplicate. Hai Vocabulary cùng word nhưng khác nghĩa vẫn có ID riêng; một ID có thể gắn nhiều Chapter thông qua các membership khác nhau.

## Lỗi chính

INVALID_ID, INVALID_PAGINATION, INVALID_SEARCH, SOURCE_IDENTITY_REQUIRED, INVALID_SORT_ORDER, TAG_NOT_FOUND, CHAPTER_NOT_FOUND, CATALOG_VOCABULARY_NOT_FOUND, SOURCE_IDENTITY_CONFLICT và MEMBERSHIP_ALREADY_EXISTS.

## Chưa có trong V1

Không có CRUD API cho Catalog, edit/review audit log, publish transition, delete, transaction điều phối Tag/Chapter/Vocabulary, hay persistence của toàn bộ Parser Candidate. Tạo mới luôn Draft. Publish và quyền truy cập chờ Product Owner phê duyệt.
