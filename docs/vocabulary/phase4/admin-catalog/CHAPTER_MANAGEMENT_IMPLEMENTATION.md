# Phase V4A — Chapter management

## Contract

Each Chapter belongs to one Tag and represents one future Student Catalog card. V4A does not create Lesson/Course records or modify `LearningProgress`.

## Implementation

- `backend/src/models/VocabularyChapter.js` stores `tagId`, title, description, chapter number, sort order and draft/published/archived status. A normalized title is maintained internally and uniquely indexed with `tagId` to reject duplicate titles within a Tag.
- `backend/src/services/vocabularyCatalogManagementPrototype.js` implements paged Chapter listing, create, edit, explicit Tag-ID move and archive. Writes use optimistic versions; a move retains memberships.
- `backend/src/routes/vocabularyCatalogManagementPrototypeRoutes.js` exposes only the prototype endpoints behind trusted Admin authentication.
- `frontend/src/features/vocabulary-catalog/VocabularyCatalogWorkspace.jsx` renders Chapter cards, search/status filters and keyboard-operable create/edit/archive forms. Chapter create now sends only fields allowed by the API; moving an existing Chapter includes an explicit Tag ID.

Creating a new Chapter as part of an Import mapping is deferred until Confirm. A title matching an existing Chapter causes a conflict and requires an explicit `EXISTING` mapping. No name-based auto-join occurs.

## Evidence

The V4A MongoMemoryReplSet suite checks normalized duplicate detection, move between Tags, archive behavior and membership retention. The real-backend browser scenario creates a Chapter and maps a second source file to an explicitly named new Chapter.

**Readiness:** `CHAPTER_MANAGEMENT_READY=YES` for the isolated prototype. Production migration/index readiness is not asserted.
