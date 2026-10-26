# Legacy parser compatibility report

## Result

The existing `backend/src/services/docxVocabularyParser.js` and its `vocabularyController.js` preview call site are unchanged. V2 is exported from a new module and is not imported by the controller or route. Existing endpoints, DOCX preview/confirm flow, Vocabulary and Lesson schemas, student flashcard APIs, and LearningProgress code were not changed.

The compatibility test imports the legacy parser and exercises its existing `parseText` result shape, summary keys and `status: published` behavior. That legacy status remains only in the old parser; V2 candidates contain no `status` property and always have `reviewStatus: NEEDS_REVIEW`.

## Scope boundary

This verifies module separation and the small legacy text-parser contract. It is not a full application regression run, an API preview/confirm integration test, or proof that a future Import API can consume V2 candidates. No existing controller caller was redirected.
