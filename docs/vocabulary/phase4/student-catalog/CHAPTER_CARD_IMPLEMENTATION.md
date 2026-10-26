# Phase V4B — Chapter Card Implementation

## Giao diện

`StudentVocabularyCatalogPage.jsx` lấy Tag từ Student API. Tab Tag có tên, số Chapter; mỗi Chapter là một link-card riêng, có title, Tag, mô tả, thứ tự và số Vocabulary do backend trả. Tên Tag/Chapter nguồn không nằm trong production component.

Giao diện giữ token màu, serif heading và hành vi focus của hệ thống Vocabulary/Flashcard hiện có. Dấu Chapter dùng số thứ tự thật; trạng thái rỗng, tải, lỗi, retry và phân trang đều có nội dung tiếng Việt.

## Truy vấn

- Tag được tải theo trang 100 để điều hướng Tag động.
- Chapter hiển thị 12 mục/trang, tìm theo title/description và giữ thứ tự server.
- Flashcard chỉ tải Vocabulary của Chapter đang chọn, theo trang tối đa 100 cho mỗi request.
- URL Catalog lưu `tagId`; Flashcard dùng `catalogTagId` và `startChapterId`.
- Direct URL tới Tag/Chapter không có trong danh sách Published báo không khả dụng, không chuyển lặng lẽ sang nội dung khác.

## Responsive và an toàn nội dung

Tab Tag cuộn ngang; card Chapter xếp một cột trên màn nhỏ. E2E xác nhận `scrollWidth === 390` ở viewport 390px. Tìm kiếm và link có focus-visible. Nội dung DOCX được render thành text, không qua `dangerouslySetInnerHTML`.

Fixture/browser test xác nhận mô hình card là Chapter, không phải card cho từng Vocabulary. Chapter rỗng được giữ lại để trạng thái Catalog phản ánh đúng membership eligible.
