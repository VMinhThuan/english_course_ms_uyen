# Phase V1 — index và idempotency

## Index được kiểm tra

| Collection | Index | Bảo đảm |
|---|---|---|
| Vocabulary | catalogStatus/word/_id, partial catalogOnly=true | Hỗ trợ truy vấn trạng thái/headword của Catalog; legacy lesson/topic/order được giữ. |
| VocabularyTag | unique slug | Một slug không trùng. |
| VocabularyTag | status/sortOrder/_id | Thứ tự danh sách Tag xác định. |
| VocabularyChapter | tagId/status/sortOrder/_id | Tra Chapter theo Tag/lifecycle/thứ tự. |
| ChapterVocabulary | unique chapterId/vocabularyId | Không lặp một từ trong cùng Chapter. |
| ChapterVocabulary | unique sourceIdentity, partial string | Một occurrence nguồn không được gắn nhiều nơi. |
| ChapterVocabulary | chapterId/sortOrder/_id | Thứ tự membership ổn định. |
| ChapterVocabulary | vocabularyId | Tra các Chapter của một Vocabulary. |

## Kết quả MongoMemoryServer

Kiểm tra collection.indexes() xác nhận các index có tên và unique/partial option như khai báo. Test xác nhận:

- cùng identity và cùng Chapter/Vocabulary trả lại membership cũ;
- cùng identity trên cặp khác báo conflict;
- cặp đã tồn tại với identity khác bị từ chối;
- MongoDB unique indexes trực tiếp chặn slug Tag, cặp Chapter/Vocabulary và sourceIdentity trùng;
- tám lần gọi đồng thời cùng identity chỉ tạo một membership;
- một Vocabulary có thể xuất hiện trong nhiều Chapter;
- hai Vocabulary cùng headword nhưng khác nghĩa giữ hai ID;
- lifecycle Draft bị loại khỏi danh sách Published;
- pagination, tag/chapter filter, thứ tự và search ký tự regex đều đúng;
- archive giữ membership và Vocabulary.

Tất cả ghi chỉ xảy ra trong MongoMemoryServer loopback. Không kiểm tra index trên database ứng dụng.

**Gate:** kiểm thử index và idempotency = PASS cô lập. Xây index production cần migration window và kiểm kê xung đột riêng.
