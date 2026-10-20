# Phase 2 API Contracts

All attempt endpoints continue to require authentication and an active student account. Ownership is checked before writes. Engine checks run before scoring or mutation. `serverTime` is informational for the frontend countdown; backend deadline remains authoritative.

## Start/resume

### Standard

`POST /api/v1/assessments/:id/start`

Success data includes `attemptId`, `startedAt`, `deadlineAt`, `serverTime`, `revision`, `durationMinutes`, safe question snapshots, and (when resumed) saved `answers`.

Errors include `ASSESSMENT_ENGINE_MISMATCH`, `ATTEMPT_ENGINE_UNRESOLVED`, `ASSESSMENT_NOT_AVAILABLE`, `ASSESSMENT_EXPIRED`, and `ATTEMPT_LIMIT_REACHED`.

### TOEIC

`POST /api/v1/toeic/tests/:id/start`

Success data includes `attemptId`, `startedAt`, `deadlineAt`, `serverTime`, `revision`, answers, flags, safe question/group snapshots, and parts. Existing question grouping and snapshot semantics remain unchanged.

Limit errors return HTTP 403 and `ATTEMPT_LIMIT_REACHED`; `attemptLimit = 0` does not block starts.

## Autosave

### Standard

`PATCH /api/v1/attempts/:attemptId/answers`

```json
{
  "revision": 4,
  "answers": { "question-id": "option-id" }
}
```

### TOEIC

`PATCH /api/v1/toeic/attempts/:attemptId/answers`

```json
{
  "revision": 4,
  "answers": [{ "questionId": "question-id", "selectedOptionIds": ["option-id"] }],
  "flaggedQuestionIds": ["question-id"]
}
```

Success returns `saved`, incremented `revision`, flags, `savedAt`, and `serverTime`. Writes are accepted only for the current revision and before `deadlineAt`.

Errors:

| HTTP | Code | Meaning |
|---:|---|---|
| 403 | `ATTEMPT_EXPIRED` | Deadline reached; server finalized using the persisted answer map. |
| 400 | `ATTEMPT_FINALIZED` | Attempt is already terminal. |
| 409 | `STALE_REVISION` | Another tab/request has advanced state; response includes current revision and saved answers. |
| 409 | `ATTEMPT_ENGINE_MISMATCH` | Attempt belongs to the other exam engine. |
| 409 | `ATTEMPT_ENGINE_UNRESOLVED` | Backend cannot safely establish the engine. |
| 428 | `REVISION_REQUIRED` | Client omitted revision. |

Unknown question IDs are ignored; answer fields remain bounded to the attempt snapshots.

## Submit/finalization

### Standard

`POST /api/v1/attempts/:attemptId/submit`

```json
{ "revision": 5, "answers": { "question-id": "option-id" } }
```

### TOEIC

`POST /api/v1/toeic/attempts/:attemptId/submit`

```json
{ "revision": 5, "answers": { "question-id": ["option-id"] } }
```

Before deadline, manual submit requires the current revision; current answers merge over the persisted map. At/after deadline, the client answer payload is ignored and the persisted map is graded. Terminal duplicate submit returns the stored result. Standard finalizes to `submitted`; TOEIC finalizes to `completed`.

Possible errors: `ATTEMPT_ENGINE_MISMATCH`, `ATTEMPT_ENGINE_UNRESOLVED`, `STALE_REVISION`, `ATTEMPT_FINALIZING`, and `REVISION_REQUIRED`.

Finalization can also be triggered by Standard result retrieval, TOEIC attempt retrieval, resume, the student assessment/test list, and attempt-history reads.

## Results and attempt summaries

- `GET /api/v1/attempts/:attemptId/result` validates Standard engine/ownership and finalizes an expired in-progress attempt before returning result review.
- `GET /api/v1/toeic/attempts/:attemptId` validates TOEIC engine/ownership and finalizes an expired attempt before returning the TOEIC result state.
- `GET /api/v1/assessments/available` returns `attemptCount`, `remainingAttempts` (`null` for unlimited), `hasActiveAttempt`, `activeAttemptId`, and `lastAttempt` summary.
- `GET /api/v1/toeic/tests` returns equivalent TOEIC fields.
- History endpoints include expiry recovery and continue returning terminal attempt records.

## Material download

`GET /api/v1/materials/:id/download`

The request still passes through `verifyToken` and the existing Phase 1 material policy (account status, enrollment, publication, ownership, and `allowDownload`). Private files stream with `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff`, allowlisted `Content-Type`, `Content-Length`, and sanitized `Content-Disposition` with `filename` and UTF-8 `filename*`. CORS exposes only the additional `Content-Disposition` response header; configured origins/credentials are unchanged.

The original-name schema path is optional; no backfill is required. Unsupported MIME metadata falls back to `application/octet-stream`. Known legacy `fileType` values are used as stored metadata and are not re-sniffed during download.

## Client compatibility

The updated frontend sends revisions. Older clients that omit revision will receive `REVISION_REQUIRED` for active saves/manual submits. Deploy frontend and backend together. Requests after deadline can still trigger finalization but cannot change answer contents.
