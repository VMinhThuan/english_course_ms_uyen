# 09 — Release readiness

## Quyết định

**NO-GO phát hành.** Các kiểm tra cục bộ và E2E đã chạy đều xanh, nhưng điều kiện nghiệm thu Master Plan và các kiểm tra staging/load/deployment chưa hoàn tất.

## Gates

| Gate | Trạng thái | Căn cứ |
|---|---|---|
| Bao phủ toàn bộ ID chi tiết | PASS | PDF và Phase 0 CSV có 62 ID; discrepancy tiêu đề ghi 45 được ghi nhận. |
| P1 đạt 100% | FAIL | 17/38 PASS; còn 17 NOT_RUN và 4 BLOCKED. |
| P2 đạt tối thiểu 95% | FAIL | 9/22 PASS; 13 NOT_RUN. |
| P3 đạt tối thiểu 90% | PASS | 2/2 PASS. |
| Backend Phase 1–4 | PASS | 56/56 assertions. |
| Playwright Phase 5 | PASS | 36/36 trên DB cách ly. |
| Frontend build | PASS WITH WARNING | Main chunk và PDF worker lớn; Vite advisory. |
| npm audit High/Critical | PASS | Không có High/Critical; còn Moderate backend chain. |
| Load 100–120 user | BLOCKED | Chưa có staging/authorization target. |
| Domain/HTTPS/hosting | BLOCKED | Chưa được cung cấp endpoint. |
| Super Admin handover | BLOCKED | Không có credential bàn giao; không thử login production. |
| Durable uploads | OPEN RELEASE RISK | Serverless storage là tạm; chưa test storage đích. |
| Index migration | OPEN RELEASE RISK | Chưa preflight/verify trên staging. |
| Thiết bị/trình duyệt thật | NOT_RUN | Viewport emulation, không phải device/engine matrix. |

## Checklist trước khi xin duyệt rollout

- Xác nhận Node runtime, API origin, CORS, SPA fallback, TLS, health checks và logging.
- Chọn durable private upload storage; test quyền preview/download và backup/restore.
- Preflight dữ liệu duplicate trước unique index; áp dụng/xác minh index theo migration được duyệt.
- Triaged GHSA mammoth dependency theo regression DOCX.
- Hoàn tất các P1 NOT_RUN, đặc biệt exam security và uploads.
- Chạy load profile 100–120 trên staging với stop criteria.
- Hoàn thành backup/restore và rollback rehearsal; xin human sign-off.

## Git và rollback

Không có thay đổi production nên không cần rollback production. Checkpoint preflight: D:\SideProject\_checkpoints\english-course-phase5-preflight-20261020-120624. Repo vẫn ở main, HEAD d8b5c49b0e6fb73e7f414798ae077a9ce713f001; các thay đổi Phase 1–5 chưa commit. Giữ checkpoint và review toàn bộ diff trước merge/deploy.


## Changed file summary

- Phase 5 product fixes: backend/src/controllers/progressController.js; frontend/src/pages/StudentDashboardPage.jsx; frontend/src/pages/StudentDashboardPage.css; frontend/src/pages/TestPage.jsx.
- Browser regression harness: frontend/e2e/phase5-browser.mjs, including the all-submitted-attempts assertion for HIST_01.
- Phase 5 reports, matrix and evidence: docs/audits/toeic-phase5/.
- Existing Phase 1–4 implementation and dirty files remain preserved as recorded in the preflight checkpoint; no commit or deploy was created.
