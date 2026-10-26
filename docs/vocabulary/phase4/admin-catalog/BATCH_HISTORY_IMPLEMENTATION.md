# Phase V4A — Import Batch history

## API and display

The prototype adds paginated/searchable `GET /` history to the isolated V3A router. Rows include Batch ID/identity, create/update dates, source folder labels, file and candidate counts, validation/review/import counts, parser versions, Batch status, Confirm status and mapping status. The list DTO does not include filenames, relative paths, SHA values, raw DOCX, parsed values or Candidate source identity.

The Batch is read from the existing V3A model/service; the browser cannot set Batch identity or status. “Continue review” opens the same Batch ID in `VocabularyImportWorkspace`, which loads the saved Batch and Candidate state. The mapping dialog is a separate endpoint and may show file name/path/hash to the authenticated Admin because those values are required to identify the source being mapped.

## UI

`frontend/src/features/vocabulary-catalog/VocabularyCatalogWorkspace.jsx` includes search, status filter, pagination, counts, retry/loading/empty states, mapping entry and the V3B continuation action. The `initialBatchId`/`autoOpenBatch` option was added to the V3B component for this handoff.

## Evidence

The V4A integration test asserts that history omits `History Only.docx`, `fileSha256`, `relativePath`, raw/parsed values and `sourceIdentity`. The real-backend browser test visits history, saves a mapping and confirms that “continue review” opens the same Batch in V3B.

**Readiness:** `BATCH_HISTORY_READY=YES` for the isolated prototype; production route and permission integration are not ready.
