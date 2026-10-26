# Phase V4B — Progress and Bookmark Compatibility

## LearningProgress

LearningProgress legacy yêu cầu quan hệ Lesson/Course và không biểu diễn Catalog Chapter. V4B không tạo ID giả, không ghi progress, không thêm model/API/index/migration. Catalog API không trả Lesson/Course ref.

V1 integration vẫn xác nhận archive giữ nguyên LearningProgress và Student Flashcard DTO legacy. Phase 4 Learning API suite PASS 5/5. Hai browser Catalog flow không phát request progress; mock flow còn chạy nhánh Lesson Flashcard riêng.

## Bookmark

| Loại | localStorage key | Định danh card |
|---|---|---|
| Lesson/topic Flashcard | `toeic-chapter-flashcard-bookmarks` | Lesson ID như trước |
| Catalog Flashcard | `student-vocabulary-catalog-chapter-bookmarks-v1` | `catalog:<tagId>:<chapterId>` |

Browser E2E seed một legacy bookmark, lưu Catalog Chapter rồi xác nhận giá trị legacy không bị ghi đè. Bookmark mới là UI-local state, không phải persistence server hay tiến độ học.

## Giới hạn chứng cứ

Legacy route được chạy trong mock browser với API responses tổng hợp và được bảo vệ bởi V1 integration regression. Real Catalog harness không mount Lesson API; vì vậy không tuyên bố xác nhận legacy flow với application database/runtime thật.
