# 04 — Browser E2E results

## Environment

Playwright 1.64.1, Chrome channel, headless; Vite/API dùng cổng động trên 127.0.0.1; MongoMemoryServer có DB name ngẫu nhiên. Harness sinh synthetic users/content/materials/attempts, giới hạn browser network vào loopback và dọn dữ liệu/thư mục tạm.

## Outcome

**36 passed, 0 failed, 0 blocked.** Test bao phủ AUTH_01–06, DASH_01–04, LESS_02–03, DOC_01–03, VOC_01–02, EXAM_01–06, HIST_01, PROF_01–02, ADM_U_01–04, REP_01, NON_SEC_02, NON_RESP_01; thêm ba E2E-only cases: course enrollment display, direct private-file denial và mobile question sheet.

Các flow đã xác minh: login/logout/status; dashboard; lesson và PDF preview/download; vocabulary/detail/search/flashcard; exam start, autosave, refresh, progress/unanswered, timeout, scoring/result/hidden-answer; create/search/suspend/reactivate student; password change; report một attempt; dashboard responsive overflow.

Một số E2E source cases chỉ chạy subcheck: LESS_02, VOC_01, ADM_U_03, REP_01, NON_RESP_01. Chúng giữ trạng thái NOT_RUN trong master matrix vì chưa đủ expected behavior.

## Screenshots

- Dashboard: student-dashboard-1920.png, student-dashboard-768.png, student-dashboard-412.png, student-dashboard-375.png.
- Auth: auth-guard-redirect.png, login-invalid-credentials.png, account-suspended.png, account-suspended-active-session.png, logout-login-page.png.
- Learning: student-courses-desktop.png, lesson-desktop.png, lesson-pdf-preview.png, flashcard-desktop.png.
- Exam: assessment-desktop-before-refresh.png, assessment-result-desktop.png, assessment-unanswered-16-of-20.png, assessment-auto-submit.png, assessment-hidden-answer-result.png, assessment-mobile-question-sheet.png, assessment-mobile-submit-warning.png, student-history.png.
- Admin: admin-student-created.png, admin-student-detail.png, admin-results.png.

All images are in evidence/.

## Console/network telemetry

- Page exceptions: 0; backend error samples: 0; console warnings: 0.
- Console errors: 163 total, comprising 157 requests intentionally blocked by test network policy and 6 resource_load_error events. The six resource events were not individually attributed; no page-level JavaScript exceptions accompanied them.
- One local navigation sample: DOMContentLoaded 401 ms; load 552 ms. Not a production performance benchmark.
- Responsive assertions only cover the dashboard viewport set and mobile exam sheet; they do not prove all routes, native devices, or other browser engines.

Raw data: evidence/browser-e2e-results.json.


