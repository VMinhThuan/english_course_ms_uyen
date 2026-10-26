# Phase V1 — kế hoạch tích hợp Parser V2.1

## Bằng chứng đầu vào

Handover Parser V2.1 trong worktree riêng báo cáo 30/30 DOCX và 711/711 occurrence, 14 duplicate groups/29 occurrences, 6/6 historic full-field goldens; 705 candidate chưa có oracle đầy đủ và cả 711 vẫn NEEDS_REVIEW. Accuracy report riêng có 90 dòng mẫu mở rộng theo field; EXACT_MATCH/Ambiguous cell không đồng nghĩa với editorial approval. Các số liệu này được đọc từ báo cáo sẵn có; parser acceptance không chạy lại trong Phase V1.

## Adapter V1

backend/src/services/vocabularyCatalogCandidateAdapter.js nhận một candidate có source metadata và trả envelope schemaVersion 1.0.0. sourceIdentity là SHA-256 của schema version, normalized relative path, file SHA-256, source ordinal và paragraph start/end.

Envelope giữ nguyên path gốc, SHA-256, parserVersion, ordinal/display number, paragraph/table locator, layout, source-folder/Chapter/Topic candidates, raw source payload, parsed senses/notes, normalized values, duplicateCandidate, reviewReasons/issues, và editedValues riêng. Tag/Chapter candidate ở NEEDS_REVIEW; publicationEligible=false. Adapter không flatten senses thành meaning string.

Kiểm thử dùng candidate tổng hợp, xác nhận round-trip field preservation, identity determinism, path/hash validation, duplicate metadata và review state. Không gọi parser, không đọc DOCX thật, không lưu candidate vào database.

## Kế hoạch V2/V3

1. Product Owner duyệt mapping một DOCX thành Chapter và source folder thành Tag; xác định semantics cho nhiều senses/examples so với Vocabulary.meaning/example legacy.
2. Chọn nơi lưu Candidate provenance và editorial audit. Hiện adapter giữ envelope trong bộ nhớ; ChapterVocabulary chỉ lưu sourceIdentity nên chưa bảo toàn raw payload sau persistence.
3. Chốt duplicate policy. Giữ mọi occurrence; chỉ reuse một Vocabulary ID nếu quyết định được phê duyệt và có kiểm tra nội dung, không auto-merge.
4. Hợp nhất Parser V2.1 qua dependency diff có review. Cả baseline 2b và 6ee yêu cầu Node 22.x. Baseline 2b dùng sanitize-html 2.17.4, không khai báo saxes/yauzl; baseline 6ee dùng 2.18.1 và thêm saxes 6/yauzl 3.4. Parser module import @xmldom/xmldom và yauzl; package/lock main 6ee không kê @xmldom trực tiếp. Parser working tree hiện khai báo @xmldom/xmldom 0.8.15 và fflate 0.8.3, đồng thời đang dirty. Không chép lockfile giữa hai worktree.
5. Xây preview/review trước; chỉ tạo Draft sau editorial approval; publish cần quyền, audit, migration/index và database baseline riêng.
6. Chạy golden/legacy tests và kiểm thử API trên database disposable sau khi contract được duyệt. Không đưa 711 candidate vào hệ thống ở V1.

**PARSER_INTEGRATION_READY = PARTIAL** (adapter thử nghiệm có test; chưa tích hợp parser hoặc persistence). **V3_IMPORT_READY = NO.**
