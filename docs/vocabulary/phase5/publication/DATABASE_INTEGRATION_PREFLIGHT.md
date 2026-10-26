# Phase V5A — Database Integration Preflight

## Readiness hiện tại

**DATABASE_BASELINE_READY = NO.** Không lấy URI ứng dụng từ `.env`, không kết nối database ứng dụng, không chạy migration hoặc tạo index bên ngoài MongoMemoryReplSet. Legacy `test:e2e:phase5` sets `MONGODB_URI` to its generated loopback MongoMemoryServer URI before importing `app.js`; no application DB target was used.

| Hạng mục | Evidence / trạng thái |
|---|---|
| MongoDB identity/topology | UNKNOWN; chưa xác minh cluster, database name, replica-set/sharding, backup hoặc môi trường |
| Vocabulary records/legacy refs | Source model có `lesson` + `course` bắt buộc cho legacy rows; số lượng và shape DB thật UNKNOWN |
| Catalog data | Collection Tag/Chapter/Membership mới, chưa có baseline thật |
| LearningProgress | Schema tham chiếu `student`, `lesson`, `course`, unique `(student, lesson)`; không thấy `vocabularyId` trong model hiện tại |
| Bookmarks | Flashcard giữ legacy bookmark key riêng và Catalog key `student-vocabulary-catalog-chapter-bookmarks-v1` trong localStorage; DB bookmark rows chưa được phát hiện trong code path đã khảo sát |
| Index conflicts/duplicates | UNKNOWN vì không chạy read-only aggregate trên DB thật |
| Migration/rollback | Chưa có migration production được duyệt |

## Index surface cần baseline

- Vocabulary hiện hữu: `{lesson, topic, order}`; Catalog rows có partial index `{catalogStatus, word, _id}` với filter `catalogOnly=true`.
- Tag: unique `slug`; status/order listing index.
- Chapter: `{tagId, status, sortOrder, _id}` và partial unique `{tagId, normalizedTitle}`.
- Membership: unique `{chapterId, vocabularyId}`, unique source-identity scope, chapter ordering và reverse `{vocabularyId}` lookup.
- Batch/Candidate/Audit/Mapping/PublicationAudit: unique batch/source identities, per-batch occurrence, evidence lookups, mapping-per-batch, và idempotency unique key.

`backend/src/configs/database.js` bật Mongoose `autoIndex` chỉ khi `NODE_ENV` là development/test **và** `MONGOOSE_AUTO_INDEX=true`. Production không tự bật autoIndex theo config hiện tại. Harness chủ động gọi `Model.init()` trên database test để kiểm chứng declared indexes.

## Preflight được đề xuất trước integration

1. Operator/Owner xác nhận ứng dụng, environment, cluster/database identity và backup point; URI chỉ được nạp qua secret manager ở quy trình được duyệt.
2. Chạy read-only inventory đã review trên một principal chỉ đọc: collection/index metadata, Vocabulary count/shape, duplicate key candidates, dangling Lesson/Course refs, LearningProgress, mọi bookmark store và Catalog-like legacy fields.
3. So sánh index definitions với collection/index thực tế; lập báo cáo duplicate/conflict, write volume và query plan trên staging.
4. Product Owner duyệt access policy, manual provenance và lifecycle semantics.
5. Viết migration riêng có dry-run/report, backup, unique-index precheck, idempotent apply và rollback; không dùng `autoIndex` thay migration.
6. Chỉ sau đó tích hợp routes/auth, chạy staging integration trên target commit và xác minh legacy references/progress/bookmark không đổi.

`backend/src/scripts/inventoryVocabularyCatalogReadOnly.js` là công cụ inventory; chưa chạy trên ứng dụng vì identity/authorization database chưa được xác minh. Kết quả prototype không thay thế baseline.
