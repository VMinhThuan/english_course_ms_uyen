# Phase V4A — Vocabulary membership management

## Behavior

`ChapterVocabulary` remains the join record between a Chapter and Vocabulary. A Vocabulary may be linked to multiple Chapters. The Admin prototype can list/search/paginate current memberships, add an active Catalog-only Vocabulary by ID, and reorder every membership in one Chapter. The unique `(chapterId, vocabularyId)` index prevents duplicate membership in the same Chapter; same Vocabulary in a different Chapter is supported.

Reorder accepts the complete current membership ID set and rejects stale or duplicate sets. In a transaction it bumps the Chapter version and updates only membership `sortOrder` values for that Chapter. It does not edit Vocabulary content or another Chapter. Tag and Chapter archive are non-cascading.

## UI

The Chapter panel shows ordered Vocabulary entries and up/down controls with accessible labels. Reorder is disabled while a search filter is active so a visible subset cannot accidentally be treated as the whole order. The add form selects from active Catalog Vocabulary options and describes that Vocabulary content is preserved.

## Evidence

V4A MongoMemoryReplSet integration creates a Vocabulary in two Chapters, rejects duplicate membership in one Chapter, reverses one Chapter's order and asserts content and the other Chapter's membership remain unchanged.

**Readiness:** `MEMBERSHIP_READY=YES` for isolated Catalog data.
