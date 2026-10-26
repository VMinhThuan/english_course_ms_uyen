# Phase V3A — Batch và Candidate persistence

## VocabularyImportBatch

Batch lưu:

- `batchIdentity`: SHA-256 của schema version và tập source relative path + file SHA-256 đã sắp xếp.
- `actorId`: ObjectId principal lấy từ trusted middleware.
- `schemaVersion`, `parserVersions`.
- `sourceFiles`: relative path, file SHA-256, source-folder/Chapter candidates, số candidate và Draft Tag/Chapter refs theo từng source file.
- `candidateCount`, duplicate group/occurrence counts, trạng thái và counts theo parse/validation/review/import.
- `createdAt`, `updatedAt`, version `__v` cho concurrency.

Cùng tập file, path và SHA trong cùng schema trả Batch cũ, giữ nguyên edit/review. File đổi SHA ở cùng relative path tạo Batch revision riêng. Parser version được ghi để truy vết; version mới không tự ghi đè Batch hoặc Candidate cũ.

## VocabularyImportCandidate

Candidate bảo toàn các trường riêng biệt:

| Trường | Ý nghĩa |
|---|---|
| `sourceMetadata` | Path tương đối, SHA, parser/schema version, ordinal, paragraph/table locators và Chapter/Topic candidates; immutable. |
| `parsedValues` | Word, POS, senses, examples, notes và normalized fields parser trả về; immutable. |
| `rawValues` | Raw paragraph/runs/source evidence; immutable. |
| `editedValues` | Override biên tập riêng, chỉ nhận field allowlist. |
| `duplicateMetadata` | Parser duplicate, match Catalog hiện có và revision trước đó; advisory, không merge. |
| `validationIssues`, review/import/publication state | Trạng thái workflow và row-level errors. |
| `reviewedBy`, `reviewedAt`, `rejectionReason` | Snapshot của quyết định review gần nhất; audit collection vẫn là timeline đầy đủ. |
| `importedVocabularyId`, `importedChapterId`, `importedMembershipId` | Ref để retry Confirm an toàn. |

Senses và bilingual examples được giữ dạng arrays. Candidate edit không được thay `sourceIdentity`, file SHA, locator, raw source, parsed source, duplicate annotations hoặc audit data.

## Source identity và batch identity

`sourceIdentity` tiếp tục theo Adapter V1:

`schemaVersion + normalizedRelativePath + uppercase(fileSha256) + sourceOrdinal + paragraphStart + paragraphEnd` → SHA-256.

Identity này định danh source occurrence, không phải Batch ID hoặc Vocabulary ID. Thay file SHA sinh identity occurrence mới và được gắn `sourceRevision` khi path/ordinal đã có revision trước. Bản ghi cũ không bị overwrite.

## Atomic edit và review

Edit/validate/candidate version, field audit, Batch counts/version được ghi trong cùng transaction. Audit lưu actor, timestamp, changed field, before/after và lý do. Review decision, actor, timestamp, reject reason hoặc `KEEP_SEPARATE` cũng được ghi trong transaction.

Confirm tạo Tag/Chapter/Vocabulary/Membership, cập nhật Candidate import refs, ghi audit và cập nhật Batch trong một transaction. `Vocabulary` Catalog có thêm `catalogSenses` và `catalogNotes` để giữ toàn bộ sense/example arrays; các trường legacy `meaning` và `example*` chỉ map sense/example đầu để tương thích schema hiện có. Không làm phẳng rồi bỏ mất nội dung còn lại. Các field Catalog mới không xuất hiện trong legacy Vocabulary JSON DTO.

Prototype yêu cầu MongoDB transaction. Trên topology không hỗ trợ transaction, thao tác dừng trước khi báo thành công và không chuyển sang kiểu write một phần.

## Database boundary

Mọi thao tác workflow chỉ chạy khi Mongoose connection host là `127.0.0.1` và database name kết thúc `_test`. Test sử dụng MongoMemoryReplSet. Không kết nối database ứng dụng, không chạy migration hoặc tạo index ngoài test database.
