# Phase V1 — báo cáo tương thích legacy

## Kết quả kiểm tra

| Khu vực | Hành vi đang có / thay đổi | Bằng chứng |
|---|---|---|
| Vocabulary Lesson/Course | Hai refs vẫn bắt buộc với legacy row; chỉ catalogOnly=true được bỏ refs. Legacy mặc định published; Catalog mặc định hidden ở trường status riêng của legacy. | backend/src/models/Vocabulary.js |
| Student Vocabulary | GET hiện tại lọc status=published và catalogOnly != true; distinct topics dùng cùng bộ lọc. Không có route Student Catalog mới. | backend/src/controllers/vocabularyController.js, getStudentVocabularyByLesson |
| Lesson detail và xóa Lesson | Truy vấn từ vựng theo Lesson loại Catalog; xóa Lesson chỉ xóa legacy Vocabulary và giữ hành vi xóa Progress hiện hữu. | backend/src/controllers/lessonController.js, getLessonById/deleteLesson |
| Xóa Lesson từ Course | Cascade Vocabulary giới hạn vào row legacy. | backend/src/controllers/courseController.js, delete course lessons |
| Legacy Admin/Teacher CRUD | Danh sách, get-by-id, update và delete loại Catalog. Update loại trường discriminator khỏi body. Route/role hiện hữu không đổi. | backend/src/controllers/vocabularyController.js; backend/src/routes/vocabularyRoutes.js |
| DOCX importer legacy | Preview và confirm chỉ dò duplicate trong Vocabulary gắn Lesson, loại Catalog. Importer cũ không gọi adapter V2.1. | backend/src/controllers/vocabularyController.js, previewDocxVocabulary/confirmDocxVocabularyImport |
| Flashcard | Frontend dựng card theo Lesson/Topic; Lesson detail trả vocabulary cùng lesson. DTO word legacy giữ _id, word, meaning, POS, example và topic. Catalog chưa tương thích UI này nếu chưa có API/UI riêng được duyệt. | frontend/src/pages/FlashcardPage.jsx; backend/src/controllers/lessonController.js |
| Bookmark | Không tìm thấy model Bookmark ở backend. Flashcard lưu localStorage bằng key toeic-chapter-flashcard-bookmarks và dùng Lesson ID làm chapter key. Không chuyển bookmark sang Catalog. | frontend/src/pages/FlashcardPage.jsx |
| LearningProgress | Schema tham chiếu student, lesson, course; unique student/lesson. Không có ref Vocabulary. Archive Catalog không xóa hoặc chuyển Progress. | backend/src/models/LearningProgress.js |

## Kiểm chứng

MongoMemoryServer test tạo Course/Lesson fixture theo schema trong database disposable để kiểm tra legacy Vocabulary; service Catalog không ghi hoặc gắn các refs này. Test xác nhận Student/Admin list chỉ trả legacy row, DTO không lộ catalogOnly/catalogStatus, Admin get/update/delete Catalog trả 404, Lesson detail và Lesson/Course cascade loại Catalog, và archive giữ nguyên LearningProgress.

Một test cố ý gắn Lesson/Course vào Catalog row chỉ trong database disposable, để kiểm tra phòng thủ trước dữ liệu bất thường; Catalog service bình thường không tạo link này.

## Giới hạn

Kiểm thử controller trực tiếp với response recorder, không khởi chạy browser hoặc toàn bộ ứng dụng. Không có database thật để kiểm kê các route, dữ liệu ngoại lệ hoặc bookmark người dùng. Không tuyên bố full application regression.

**Gate:** LEGACY_COMPATIBILITY_READY = PASS cho code và DTO trong phạm vi kiểm thử cô lập; rollout còn phụ thuộc migration/index review và dữ liệu ứng dụng.
