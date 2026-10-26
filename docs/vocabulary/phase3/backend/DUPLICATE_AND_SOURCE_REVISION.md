# Phase V3A — Duplicate và source revision

## Identity

- **Source occurrence identity**: Adapter V1 SHA-256 trên schema, normalized path, file SHA, ordinal và paragraph range.
- **Source file revision**: cùng relative path có SHA khác. Candidate mới nhận occurrence identity mới; Candidate cũ không bị ghi đè.
- **Import Batch identity**: SHA-256 của schema version và danh sách normalized path + file SHA đã canonicalize.
- **Duplicate content**: annotation so sánh nội dung/headword; không dùng làm database identity.
- **Vocabulary ID**: ObjectId Catalog tạo khi reviewer đã approve và Confirm chạy.

Cùng file/path/schema retry trả Batch/Candidate cũ và giữ edit/review state. Tập file nhiều nguồn được canonicalize theo path/hash, vì vậy thứ tự upload không đổi batch identity. Mỗi Batch nhận tối đa 5 DOCX để kiểm tra cross-file duplicate trong giới hạn resource prototype.

## Duplicate annotations

Prototype bảo toàn và phân loại các trường hợp:

- Cùng headword, sense khác.
- Cùng headword, POS khác.
- Nội dung giống nhau nhưng Chapter khác.
- Repeated headword trong cùng Batch.
- Candidate trùng word với Catalog đã tồn tại.
- Upload retry cùng file và file revision khác SHA.

Parser duplicate và Catalog match chỉ là thông tin cho reviewer. Candidate không bị xóa, join, auto-merge hoặc auto-reuse. Admin phải duyệt từng occurrence; duplicate cần `KEEP_SEPARATE` trước khi approve. Confirm tạo ID riêng cho mỗi approved occurrence và giữ Chapter membership qua `ChapterVocabulary.sourceIdentity`.

## Source revision behavior

Khi cùng relative path được upload với SHA khác, service tìm candidate revision trước theo path + source ordinal. Candidate mới mang `sourceRevision` với IDs/hash/review/import state của occurrence trước và reason `SOURCE_REVISION_REQUIRES_REVIEW`. Candidate vẫn `NEEDS_REVIEW`; duplicate quyết định riêng vẫn bắt buộc trước approval. Không cập nhật Vocabulary Published, LearningProgress, source candidate cũ hoặc membership cũ.

Nếu reviewer chọn `KEEP_SEPARATE`, Confirm được phép tạo một Catalog Draft occurrence mới. Đó là quyết định explicit của reviewer; không phải kết quả tự động của identity mới. V3A chưa có cơ chế reuse một Vocabulary ID.

## Bằng chứng source

Parser V2.1 trên 30 DOCX thật chạy theo luồng read-only: 30/30 SHA/package checks, 711/711 occurrence/locator reconciliation và 14 duplicate groups / 29 occurrences được giữ. Adapter dry-run cũng chạy trên 711 occurrence trong bộ nhớ. Không candidate thật nào được gửi qua Confirm hoặc lưu vào database ứng dụng.

Các con số field golden trước đây thuộc report Phase V2.1: 90-entry sample, 1,254 exact field checks và 6 ambiguous field statuses; trong run V3A này test 90-entry cần private golden root đã bị skip. 711 entries vẫn cần human editorial review theo contract nguồn.

## Hạn chế

Prototype tìm Catalog duplicates bằng exact case-insensitive headword match; đó là tín hiệu review, không phải equivalence proof. Dedupe/reuse policy, normalized content fingerprint bền vững và source-revision reconciliation cho dữ liệu database hiện hữu cần Product Owner và database baseline trước integration.
