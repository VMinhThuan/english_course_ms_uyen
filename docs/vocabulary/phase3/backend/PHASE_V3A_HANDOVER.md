# Phase V3A — Handover

## Kết quả

Đã triển khai một backend prototype Admin Import/Preview/Edit/Review/Confirm Draft, chạy qua Express harness riêng và MongoMemoryReplSet loopback. Router không được mount vào ứng dụng chính. Prototype giới hạn tuyệt đối thao tác DB ở host `127.0.0.1` và database có suffix `_test`.

Batch hỗ trợ tối đa 5 DOCX, lưu source SHA/path/version/actor/counts. Candidate giữ immutable raw/parsed source, editable overrides, validation/review/import states, duplicate/source revision annotation và field audit. Edit/review/Confirm có version check và transaction. Confirm giữ senses/examples arrays trong Catalog-only fields, tạo Draft Tag/Chapter/Vocabulary/Membership, không tạo Lesson/Course hoặc Published content.

Parser V2.1 và Adapter V1 đọc 30 DOCX thật theo luồng dry-run: 30/30 file checks, 711/711 occurrence accounting/locator match và duplicate annotations vẫn giữ. Không Confirm hoặc lưu candidate thật. API/persistence tests dùng hoàn toàn synthetic DOCX/identity.

## Trả lời các câu hỏi V3A

1. **Upload DOCX có tạo batch đúng không?** Có, trong isolated test DB; retry cùng tập path/hash trả Batch hiện tại.
2. **Có preview được candidates không?** Có; pagination/search/status filters và row errors hoạt động. 30 DOCX thật được parse/adapter-preview trong bộ nhớ.
3. **Admin sửa/review từng candidate được không?** Có với synthetic Admin principal do harness gán; edit, revalidate, approve/reject, duplicate decision và audit được test.
4. **Raw source/audit được bảo toàn không?** Có trong synthetic persistence test; `rawValues`, `parsedValues`, identity/source hash immutable; edit/audit atomic.
5. **Confirm Draft đã chạy chưa?** Có, trên MongoMemoryReplSet với synthetic candidate; Draft Catalog rows, Tag/Chapter và membership tạo trong transaction.
6. **Retry/concurrency an toàn không?** Cùng upload idempotent; stale edit trả 409; concurrent Confirm chỉ tạo một set Draft refs/audit cho mỗi source identity.
7. **Có duplicate không?** Parser/Catalog duplicate và source revisions được annotate, không auto-merge. Reviewer chỉ có thể chọn `KEEP_SEPARATE`; nếu Confirm được chọn, occurrence được tạo thành Catalog ID riêng. Retry không tạo duplicate lặp.
8. **Legacy Vocabulary có bị ảnh hưởng không?** Regression suites PASS; route legacy chưa được chuyển hướng, Catalog-only fields bị ẩn trong legacy DTO, LearningProgress/Part 1/5 không bị sửa.
9. **PO/database nào chặn app integration?** Access/role policy, Tag/Chapter/source mapping, duplicate reuse policy, review authority/retention, app database host/topology/read-only baseline, current counts/duplicates/index conflict, migration/rollback/autoIndex và deployment Node runtime vẫn cần quyết định/kiểm chứng.
10. **Có thể bắt đầu V3B Admin UI không?** Có thể bắt đầu thiết kế UI hoặc client prototype dựa trên contract isolated/stub. Chưa thể nối UI vào application API hoặc database thật.

## Readiness gates

| Gate | Trạng thái | Bằng chứng/giới hạn |
|---|---|---|
| `PROTOTYPE_READY` | **YES** | API, persistence, validation, review và Confirm được test với synthetic data trong MongoMemoryReplSet. |
| `V3_BACKEND_READY` | **YES — isolated prototype only** | Chỉ trong scope router harness + loopback test DB; không nghĩa là production integration. |
| `ACCESS_POLICY_APPROVED` | **NO** | PO chưa phê duyệt access/role/review/publish policy. |
| `DATABASE_BASELINE_READY` | **NO / BLOCKED** | Không xác minh app DB identity/read-only principal; không kết nối. |
| `APPLICATION_INTEGRATION_READY` | **NO** | Router chưa đăng ký app; chưa có authorization policy, production topology hay migration review. |
| `PRODUCTION_READY` | **NO** | Không có app DB baseline, PO approval, migration/deployment/runtime acceptance. |

## Boundary và bước tiếp theo

- Scratch checkout vẫn ở HEAD `6ee5f094870d1dd40884434a9d94f3041128853e`; không commit/push/rebase/merge. Các thay đổi V1.1 vốn đã dirty được giữ lại trong cùng worktree.
- Primary checkout và Parser worktree không bị sửa. TOEIC Part 1/Part 5 không bị sửa.
- Không đọc/nạp `.env`, không kết nối app DB, không ghi 711 source records, không migration/publish/deploy.
- Trước application integration: PO duyệt policy + mapping; cấp database identity read-only để inventory; review migration/index/rollback; kiểm tra runtime Node triển khai; sau đó mới tách bounded rollout decision.
- V3B chưa được bắt đầu trong task này.
