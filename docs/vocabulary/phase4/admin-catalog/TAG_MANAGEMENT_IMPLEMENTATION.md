# Phase V4A — Tag management

## Scope

The V4A Admin prototype lists, searches, filters, paginates, creates, edits and archives Vocabulary Tags. New Tags are always `draft`. The editor controls name, slug, description and display order; list rows show Chapter and Vocabulary membership counts.

## Implementation

- Backend: `backend/src/routes/vocabularyCatalogManagementPrototypeRoutes.js` exposes Tag endpoints behind injected trusted authentication and an Admin role check.
- Service: `backend/src/services/vocabularyCatalogManagementPrototype.js` validates an allowlist, normalizes values, checks optimistic versions and maps duplicate slugs to `SLUG_ALREADY_EXISTS`.
- Model: `backend/src/models/VocabularyTag.js` has a unique slug index and optimistic concurrency.
- UI: `frontend/src/features/vocabulary-catalog/VocabularyCatalogWorkspace.jsx` and `VocabularyCatalogWorkspace.css` provide the Vietnamese, responsive Tag list and editor.
- All reads and writes in this prototype are additionally guarded to a connected `127.0.0.1` Mongo database whose name ends in `_test`.

Archive changes Tag status to `archived`; it does not delete Chapters, memberships, Vocabulary or progress. No Publish transition or production route was added.

## Evidence

`backend/tests/vocabularyCatalogV4a.integration.test.js` covers create/edit, duplicate slug, search/counts, archive retention, role rejection and concurrent edits. `frontend/e2e/vocabulary-catalog-v4a-real-backend.mjs` creates a Tag in the browser against `vocabulary_v4a_admin_test`.

**Readiness:** `TAG_MANAGEMENT_READY=YES` for the isolated prototype; production access policy, database baseline and app integration remain separate gates.
