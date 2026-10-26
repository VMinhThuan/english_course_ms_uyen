# Source Identity and Duplicate Tests

## Identity contract

SHA-256 được tính từ tuple:

`schemaVersion + normalizedRelativePath + uppercase(fileSha256) + sourceOrdinal + paragraphStart + paragraphEnd`

Path phải tương đối, chuẩn hóa dấu phân cách và không được thoát khỏi source root. Identity định danh occurrence nguồn; nó không phải Vocabulary `_id`.

## Kết quả

- Cùng occurrence tạo identity ổn định.
- Khác source SHA tạo identity khác.
- 711 occurrence có 711 identity.
- Membership retry/concurrency trong Catalog V1 chỉ tạo một membership; identity conflict bị từ chối.
- Candidate retry/concurrency trong persistence prototype chỉ tạo một candidate; evidence khác cùng identity bị từ chối.
- Hai Vocabulary cùng headword nhưng nghĩa khác vẫn là hai Catalog record.
- 14 duplicate groups / 29 duplicate occurrences vẫn giữ nguyên. Phân loại hiện tại: 9 `NEEDS_REVIEW`, 4 `SAME_HEADWORD_DIFFERENT_SENSE`, 1 `SAME_CONTENT_DIFFERENT_CHAPTER`.
- Case repeated-headword được yêu cầu vẫn còn hai occurrences; adapter không merge chúng.

Source duplicate annotation chỉ hỗ trợ reviewer. Không tự merge, reuse, approve hoặc publish.
