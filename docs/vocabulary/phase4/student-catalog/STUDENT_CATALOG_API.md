# Phase V4B — Student Catalog API Prototype

## Base path và giới hạn

Frontend adapter mặc định gọi `/api/v1/student/vocabulary-catalog`. Harness backend gắn cùng router tại `/student/vocabulary-catalog` để không sửa app router. Cả router và UI fixture đều chưa được đăng ký trong ứng dụng thật.

Router yêu cầu middleware xác thực tin cậy được inject. `req.user` phải có ObjectId và `role === 'student'`; header role do client tự gửi không được dùng làm danh tính. API prototype chỉ chạy khi Mongoose kết nối loopback `127.0.0.1` tới database tên kết thúc `_test`.

## Endpoints

| Method | Endpoint | Kết quả |
|---|---|---|
| GET | `/tags?page=1&limit=20&search=` | Tag Published và tổng Chapter/Vocabulary eligible |
| GET | `/tags/:tagId/chapters?page=1&limit=12&search=` | Chapter Published trong đúng Tag, có số Vocabulary eligible |
| GET | `/chapters/:chapterId` | Metadata một Chapter chỉ khi Chapter và Tag cha Published |
| GET | `/chapters/:chapterId/vocabularies?page=1&limit=100&search=` | Vocabulary eligible theo `ChapterVocabulary.sortOrder`, rồi `_id` |

`page` bắt đầu từ 1; `limit` từ 1 đến 100; `search` tối đa 80 ký tự. Tìm kiếm được escape thành literal regex. ID sai định dạng trả 400; ID Draft/Archived hoặc không tồn tại trả 404. Lỗi ngoài dự kiến trả thông báo chung.

## DTO allowlist

Tag: `_id`, `name`, `slug`, `description`, `sortOrder`, `chapterCount`, `vocabularyCount`, `access`.

Chapter: `_id`, `tagId`, `tagName`, `title`, `description`, `chapterNumber`, `sortOrder`, `vocabularyCount`, `access`.

Vocabulary: `_id`, `word`, `partOfSpeech`, `meaning`, `exampleEnglish`, `exampleVietnamese`, `catalogSenses`, `catalogNotes`, `sortOrder`. Mỗi sense chỉ giữ `partOfSpeech`, `usagePattern`, `meaning`, `examples[{english,vietnamese}]`, `notes`.

Không trả `rawValues`, `rawPartOfSpeech`, `normalizedMeaning`, `sourceLocators`, đường dẫn/relative path, SHA-256, `sourceIdentity`, Candidate/Batch/Audit IDs, trạng thái editorial hoặc ref Lesson/Course.

## Bộ lọc visibility và count

Các count được aggregate phía MongoDB theo Chapter; không phát một HTTP request cho mỗi card. Từ được tính theo occurrence membership hợp lệ nên Vocabulary xuất hiện ở hai Chapter được tính trong cả hai aggregate Chapter. Chapter Published rỗng vẫn được trả với count `0`.

`studentVocabularyCatalogPrototypeRoutes.js` không được import hoặc mount trong `backend/src/app.js`. `PENDING_PO` vẫn là trạng thái policy; path trong tài liệu là hợp đồng prototype, không phải endpoint production đã phát hành.
