# 05 — Phase 5 bug-fix log

Fixes are in the uncommitted working tree and were retested with synthetic data.

| Defect | Case | Root cause / fix | Before → after | Retest |
|---|---|---|---|---|
| TOEIC-P5-001 — Future assessments shown as due tasks | DASH_03 | Dashboard queried published assessments without availability bounds. Added inclusive availableFrom/availableUntil filters; null/missing bounds remain open-ended. | Future tests could appear as tasks → only current assessments appear. | E2E excludes three future assessments and checks active homework/test deadlines. |
| TOEIC-P5-002 — Recent result lacks maximum score | DASH_04 | Recent-attempt DTO did not reliably expose expected maximum score. Added totalScore from attempt.maxScore, falling back to assessment.totalScore. | Score could lack denominator → dashboard displays 2/2 and pass/date. | E2E dashboard result assertion and synthetic API/DB data. |
| TOEIC-P5-003 — Dashboard avatar had no accessible fallback | DASH_01 | Response/UI lacked a stable avatar value for users without a profile photo. Added studentAvatar and safe image/initials fallback with accessible name. | Missing/unsafe value could leave no usable profile marker → accessible avatar/initials shown. | E2E avatar assertion and desktop/mobile captures. |
| TOEIC-P5-004 — Exam progress omitted percentage semantics | EXAM_03 | Question count did not expose required percentage and progressbar state. Added rounded completion percent and progressbar aria value. | Count only → 16/20, 80%, aria-valuenow 80. | E2E checks exact unanswered numbers 5, 8, 12, 19 and 80% state. |
| TOEIC-P5-005 — Result omitted elapsed time | EXAM_05 | Result screen lacked the expected elapsed minutes/seconds. Added elapsed duration. | Result could omit duration → score/count/pass/time all visible. | E2E checks duration and classification; assessment-result-desktop.png. |

Files touched for these fixes: backend/src/controllers/progressController.js, frontend/src/pages/StudentDashboardPage.jsx, frontend/src/pages/StudentDashboardPage.css, frontend/src/pages/TestPage.jsx, frontend/e2e/phase5-browser.mjs.

Prior Phase 1–4 changes remain uncommitted and are not counted as new Phase 5 fixes. The remaining NOT_RUN cases are coverage gaps, not inferred passes.

