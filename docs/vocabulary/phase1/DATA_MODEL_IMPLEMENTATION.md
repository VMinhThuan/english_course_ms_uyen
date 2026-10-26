# Phase V1 — triển khai mô hình dữ liệu

## Phạm vi và nền

Triển khai nằm trong worktree riêng, HEAD nền là 6ee5f094870d1dd40884434a9d94f3041128853e. Không thay đổi checkout chính hoặc worktree Parser V2.1. Catalog dùng chung collection Vocabulary hiện có; không tạo Lesson/Course giả và không nhân bản một Vocabulary chỉ để gắn vào nhiều Chapter.

## Quan hệ

- VocabularyTag một-nhiều VocabularyChapter qua tagId.
- VocabularyChapter một-nhiều ChapterVocabulary qua chapterId.
- Vocabulary một-nhiều ChapterVocabulary qua vocabularyId; một Vocabulary có thể xuất hiện ở nhiều Chapter.
- Lesson/Course vẫn là quan hệ legacy của Vocabulary khi catalogOnly không phải true.

Các model gồm VocabularyTag (name, slug, description, sortOrder, status, timestamps), VocabularyChapter (tagId, title, description, chapterNumber, sortOrder, status, timestamps) và ChapterVocabulary (chapterId, vocabularyId, sortOrder, sourceIdentity, timestamps).

Vocabulary hiện có thêm catalogOnly và catalogStatus. Catalog row có thể bỏ lesson/course; các field legacy tiếp tục bắt buộc với row không thuộc Catalog. Row mới thuộc Catalog luôn bắt đầu ở catalogStatus=draft và legacy status=hidden.

Các schema và index nằm tại backend/src/models/VocabularyTag.js, VocabularyChapter.js, ChapterVocabulary.js và Vocabulary.js. Service không có hàm publish hoặc xóa; archive chỉ đổi trạng thái Chapter và giữ membership cùng Vocabulary.

## Index

- Vocabulary giữ index legacy lesson/topic/order; thêm partial index catalog_status_word cho catalogOnly=true.
- Tag có slug unique và index status/sortOrder/_id.
- Chapter có index tagId/status/sortOrder/_id.
- Membership có unique chapterId/vocabularyId, unique sourceIdentity cho giá trị string, index chapterId/sortOrder/_id và index ngược vocabularyId.

Model.init() và collection.indexes() đã được kiểm tra trên MongoMemoryServer. Chưa tạo index trên database ứng dụng.

## Migration và rollback trước khi tích hợp

Đây là thay đổi schema tương thích mở rộng, chưa cần backfill legacy: document thiếu catalogOnly được truy vấn như legacy bằng điều kiện catalogOnly != true. Trước rollout, phải kiểm tra MongoDB version/topology, autoIndex, index xung đột và khả năng dùng partial index; triển khai code tương thích trước, tạo index có giám sát, rồi xác minh truy vấn và số liệu. Không chạy kế hoạch này trong Phase V1.

Rollback chỉ gỡ index mới và trường code sau khi xác minh không có Catalog row/membership nào cần giữ. Nếu đã có dữ liệu Catalog, phải xuất và bảo toàn chúng trước khi quay lại schema buộc mọi Vocabulary có Lesson/Course. Không xóa hoặc sửa LearningProgress hay legacy Vocabulary.

**Gate:** DATA_MODEL_READY = PASS trong môi trường cô lập; cần review migration/rollback trước khi tích hợp vào ứng dụng.
