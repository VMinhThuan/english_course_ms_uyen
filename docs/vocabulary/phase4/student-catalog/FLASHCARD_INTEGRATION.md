# Phase V4B — Flashcard Integration

## Nhánh Catalog

`frontend/src/pages/FlashcardPage.jsx` nhận biết Catalog qua `catalogTagId`. Nhánh này lấy Chapter Published của Tag, chọn `startChapterId`, rồi lazy-load toàn bộ trang Vocabulary của Chapter đang hoạt động. Mặt trước hiển thị tên Chapter; mặt sau là toàn bộ Vocabulary theo `ChapterVocabulary.sortOrder`.

`flashcardPresentationAdapter.js` chỉ chuyển các trường học viên được phép dùng và giữ toàn bộ sense, POS, usage pattern, ví dụ song ngữ cùng notes. Mỗi sense có vùng nghĩa/ví dụ riêng. Chuỗi như `<img ...>` tiếp tục là text; browser test xác nhận không tạo phần tử `<img>` hay chạy handler.

Lật bằng click/Enter/Space; `ArrowLeft` và `ArrowRight` chuyển Chapter khi focus ở card. Chapter rỗng hiển thị 0 từ. Không có TTS hoặc audio giả.

## Tương thích nhánh Lesson

Khi không có `catalogTagId`, loader Lesson/topic/course cũ vẫn giữ nhánh hiện hành và dùng `toeic-chapter-flashcard-bookmarks`. Catalog bookmark nằm ở `student-vocabulary-catalog-chapter-bookmarks-v1`, với key kết hợp Tag ID và Chapter ID.

Catalog không tạo `lesson` giả trong card/DTO, không gọi LearningProgress và không đổi hợp đồng API Lesson Flashcard. Browser mock chạy lại nhánh legacy với response vocabulary tổng hợp; real backend harness chỉ bật Student Catalog nên phần Lesson runtime được xác nhận riêng bằng V1 regression và mock browser.
