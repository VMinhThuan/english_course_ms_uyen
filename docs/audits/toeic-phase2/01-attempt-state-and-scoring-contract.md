# Attempt State and Scoring Contract

## State transitions

```text
                 manual submit before deadline
in_progress  ------------------------------------> submitted (Standard)
     |                                            completed (TOEIC)
     |
     +-- server time >= deadline; grade stored answers --> submitted / completed
```

Terminal states are immutable through student save/submit routes. A duplicate submit returns the stored result and does not regrade it. Standard keeps the existing `submitted` status; TOEIC keeps `completed`. Both terminal statuses count against a positive attempt limit. `attemptLimit = 0` remains unlimited. The existing partial unique index still enforces at most one active attempt per student and assessment.

## Engine discrimination

New attempts store `engine` at start. Submit, autosave, and result routes resolve and validate the expected engine before mutation or scoring. For a legacy attempt without `engine`, the backend resolves the engine from the associated assessment's `examFormat`. If this source is absent or conflicts with a stored engine, the route fails closed with `ATTEMPT_ENGINE_UNRESOLVED` or `ATTEMPT_ENGINE_MISMATCH`; it does not guess from a client payload.

## Deadline policy

- The backend clock is authoritative. The client clock is only a display/trigger.
- Before `deadlineAt`, autosave and manual submission can accept new answers only when the server accepts the request and its revision is current. At or after `deadlineAt`, a submit request can trigger finalization, but its answer payload is ignored; autosave is rejected.
- At or after the deadline, finalization uses only `attempt.answers`, the last answer map accepted by the server. Any answer map in a late submit payload is ignored.
- The former ten-second answer grace is removed. Retry/finalization requests may still be made after the deadline, but they cannot add answers.
- Expiry stores `submittedAt = deadlineAt`, `duration = deadlineAt - startedAt`, `isExpired = true`, score, counts, and TOEIC breakdown where applicable.
- Expired attempts are recovered on Standard/TOEIC resume, result/attempt retrieval, assessment-list, and history requests. There is no scheduled worker in Phase 2.

## Scoring contract

- Both engines grade immutable `questionSnapshots`; assessment/question edits do not rewrite the captured question/answer set.
- Standard preserves exact single-choice and exact-set multiple-choice matching, case/space-normalized typed-answer matching, question score weighting, pass threshold, and pass/fail result fields.
- TOEIC preserves its existing accepted option ID/text behavior, exact-set multiple-choice rule, listening/reading totals, part breakdown, and the existing estimated score helper functions.
- A new Standard attempt snapshots the assessment pass score. Legacy attempts without that field use their assessment's pass score as fallback.
- Unanswered questions count separately from incorrect questions, as before.
- No historical terminal attempt is automatically rescored or rewritten.

## Autosave and multiple tabs

- Every active save requires an integer `revision` equal to the server's current revision.
- The server atomically matches attempt ID, `in_progress`, deadline, and revision, then writes answers/flags and advances revision in one `findOneAndUpdate`.
- Equal stale revisions now conflict; missing revisions return `REVISION_REQUIRED` (HTTP 428). A late save is rejected and triggers expiry finalization.
- The frontend serializes its own queued saves and presents a conflict state with an explicit reload action. It does not silently merge a stale tab over the server copy.
- Standard manual submit also carries the revision. A pre-deadline stale submit conflicts rather than replacing another tab's latest answer map.
- Revision 1 has a backward-compatible CAS filter for old documents whose stored revision field is absent. No revision backfill is run.

## Attempt limits and list summaries

Student assessment and TOEIC test lists report active attempt ID/state, terminal attempt count, remaining attempts (null for unlimited), and the latest terminal score/timestamp. Expired active attempts are finalized before these summaries are returned. A positive limit blocks creation with the stable code `ATTEMPT_LIMIT_REACHED`.

## Compatibility boundary

The revised frontend must be deployed with the backend because active saves and pre-deadline submits now require revision. Existing terminal history remains readable. Legacy in-progress attempts with a resolvable engine and missing revision can continue at revision 1; unknown engines fail closed. There is no database migration requirement for the optional fields.
