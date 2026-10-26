# Phase V3B — Vocabulary editor design

## Định hướng

Người dùng là Admin biên tập từ vựng theo Chapter. Công việc chính trên mỗi candidate là đối chiếu nội dung DOCX, bản parser đọc được và bản sửa trước khi quyết định review. Giao diện dùng thiết kế sẵn trong Admin portal: màu coffee/cream/yellow, `Plus Jakarta Sans` cho nội dung, `Playfair Display` cho tiêu đề và các số Chapter.

Điểm nhận diện là **dải nguồn ba lớp**: nguồn DOCX bất biến, bản máy đọc bất biến và bản biên tập. Reviewer nhìn được ba trạng thái trong cùng editor mà không cần mở file nguồn ở một cửa sổ khác.

```text
┌──────────────────────────────────────────────────────────────────────┐
│ AdminLayout · Nhập Word & kiểm duyệt · 4 bước                      │
├──────────────────────────────────────────────────────────────────────┤
│ Batch ID · status · counts · duplicate groups · parser · timestamps │
├─────────────────────┬────────────────────────────────────────────────┤
│ Search / filters    │ Preview rows / page controls                  │
├─────────────────────┴────────────────────────────────────────────────┤
│ Chapter navigation       Nguồn DOCX   | Máy đọc | Bản biên tập       │
│                           Review / audit / Confirm controls           │
└──────────────────────────────────────────────────────────────────────┘
```

## Token và bố cục

- **Màu:** dùng `--brand-bg`, `--brand-surface`, `--brand-coffee`, `--brand-yellow`, `--brand-border`, `--brand-success`, `--brand-warning`, `--brand-danger` trong `frontend/src/styles/design-system.css`. Dải source dùng ivory nhẹ để phân biệt evidence với form.
- **Typography:** token font Admin hiện có; serif chỉ dùng cho tiêu đề, số Chapter và word display. Utility labels nhỏ, có độ tương phản và không thay thế nội dung chính.
- **Khoảng cách:** upload dùng hai vùng nguồn/recovery; editor dùng navigation list + comparison cards + review panel; Confirm dùng danh sách chọn và panel đối soát sticky trên desktop.
- **Responsive:** 4 bước thành lưới 2×2 dưới 760px; editor/list xếp dọc; comparison xếp dọc dưới 540px; Confirm summary chuyển lên trước danh sách. Browser test đo `scrollWidth <= viewport` tại 390px.
- **Chuyển động:** chỉ hover/focus transition ngắn; tắt transition/scroll animation khi `prefers-reduced-motion: reduce`.

## Trạng thái và khả năng tiếp cận

- Dùng `button`, `input`, `select`, `textarea`, `fieldset`, `legend`, `details` và native `<dialog>` để giữ semantics bàn phím.
- Mọi input có label; lỗi có nội dung văn bản và `role="alert"`; thông báo động dùng `role="status"`.
- Dialog native nhận focus khi mở, giữ focus trong modal theo trình duyệt và đóng bằng Escape; test xác nhận focus ở trong dialog.
- Có `:focus-visible`, checkbox có nhãn, kích thước điều khiển khoảng 36–42px và có thao tác chọn file thay thế drag-and-drop.
- `beforeunload` và dialog bỏ thay đổi ngăn mất nội dung editor chưa lưu.
- Nội dung DOCX được render dưới dạng text escaped trong `<pre>`/React text; không render raw HTML.
- UI chỉ hiện basename/relative chapter label; không đưa absolute path hoặc parser raw error lên màn hình.

## Ranh giới visual QA

Playwright kiểm tra DOM, thao tác chính, keyboard dialog và reflow 390px. Chưa thực hiện đánh giá thủ công bằng screen reader hoặc chụp ảnh so sánh pixel; các kết quả đó không được đánh dấu là đã xác minh.
