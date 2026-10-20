# Reporting API contract

All endpoints below are mounted under `/api/v1/admin` and inherit the current admin router middleware: authenticated `admin` or `teacher`. Student roles are denied. Report handlers validate IDs, bound page size, whitelist sort/state/filter values and never include answers or question snapshots.

## Assessment selector

`GET /api/v1/admin/report-assessments`

| Query | Behavior |
|---|---|
| `page` | Default 1; positive integer up to 1,000,000. |
| `limit` | Default 50; 1–100. |
| `search` | Optional title search, max 80 chars; escaped literal regex. |
| `type` | Optional `exercise` or `exam`. |
| `engine` | Optional `standard` or `toeic`, matched to assessment `examFormat`. |

Returns `data.assessments[]` with safe title/type/format/score/status metadata and `data.pagination`. Selector ordering is title then ID. UI loads 50 rows per page and requires an assessment selection before requesting results.

## Results by assessment / student

`GET /api/v1/admin/results?assessmentId=<ObjectId>`

Legacy query alias `assessment` remains accepted. An assessment is required to prevent collection-wide report scans. The endpoint returns assessment metadata, `summary`, `results[]`, `attempts[]` (backward-compatible alias of results), and pagination.

The existing compatibility route `/api/v1/attempts/admin/results` remains mounted and uses the same handler; its `assessment` and `student` aliases are covered by the Mongo integration test.

| Query | Behavior |
|---|---|
| `studentId` / legacy `student` | Restrict to one student; ObjectId required. |
| `type` | `exercise` or `exam`. |
| `engine` | `standard` or `toeic`. Conflicting/unknown legacy engine resolves to no engine and is excluded when this filter is applied. |
| `from`, `to` | Inclusive UTC date/time range over attempt `startedAt`; date-only `to` includes the end of that UTC day. |
| `state` / legacy `status` | `ALL`, `COMPLETED_SCORED`, `IN_PROGRESS`, `EXPIRED_PENDING_FINALIZATION`, `LEGACY_UNVERIFIED`; default `COMPLETED_SCORED`. |
| `sort` | `score_desc` (default), `score_asc`, `completed_asc`, `started_desc`, `student_asc`. |
| `page`, `limit` | Default 1/20, page up to 1,000,000, limit 1–100. |

When `studentId` is selected the same report is scoped to that student and retains retakes as separate rows. Student Detail also exposes `GET /api/v1/admin/students/:studentId/attempts`, which defaults to `state=ALL` and `sort=started_desc`.

## Result row and ranking

Rows expose attempt/student/assessment IDs, safe student identity, safe assessment metadata/title, engine, stored and logical status, `isScored`, `isExpired`, score/maxScore/percentage, start/deadline/submission times, duration and TOEIC estimated score when present. `answers`, `questionSnapshots`, and correct answers are excluded.

Default ranking order is score descending, completion timestamp ascending, then attempt ID ascending. That final key makes equal score/time ordering deterministic. The API does not return a separate persisted rank field; the ordered result list defines rank within the current filtered result.

## Summary statistics

`summary` is calculated over all attempts matching assessment, student, type, engine and date filters, independent of the selected row `state` and page. It includes:

- `attemptCount`, `scoredAttemptCount`
- `distinctStudents`, `scoredDistinctStudents`
- `highestScore`, `lowestScore`, `averageScore`
- `inProgressCount`, `expiredPendingCount`, `unverifiedCount`

Statistics use raw score values within one selected assessment; unlike cross-assessment dashboards, they do not mix scales. Retakes increase attempt counts but only add one entry to distinct-student counts. TOEIC estimated score is a separate field sourced from the stored TOEIC breakdown. No pass rate is inferred from heterogeneous or missing thresholds.

## Pagination and query behavior

Pagination is server-side. Results require one assessment, use the `assessment_startedAt_report` index for assessment/date matching, sort with a stable ID tie-break and limit page size to 100. The aggregation computes counts and rows in one `$facet`, uses projected assessment metadata and fetches student identity after page limiting except for student-name sorting. It allows disk use. A refreshed request after inserts returns updated totals and page contents; numeric offset pages are not a multi-request snapshot and can shift when data is inserted before the offset.

## Error and compatibility behavior

| HTTP | Code | Meaning |
|---:|---|---|
| 400 | `ASSESSMENT_REQUIRED` | Results request omitted assessment ID. |
| 400 | `INVALID_ASSESSMENT_ID` | Malformed assessment ID. |
| 404 | `ASSESSMENT_NOT_FOUND` | Valid ID not found. |
| 400 | `INVALID_PAGINATION`, `INVALID_STATE`, `INVALID_SORT`, `INVALID_ASSESSMENT_TYPE`, `INVALID_ENGINE`, `INVALID_STUDENT_ID`, `INVALID_DATE_RANGE` | Invalid report query. |
| 401 / 403 | Existing auth middleware response | Missing/invalid identity or role. |

`assessment`, `student`, `status`, and response `attempts` aliases preserve older consumers. The previous unbounded GET now requires a selected assessment and returns 400 otherwise; this is an intentional safe contract change. Admin student profile GET has a legacy 404 response without a stable machine-readable code; this was not changed in Phase 3.
