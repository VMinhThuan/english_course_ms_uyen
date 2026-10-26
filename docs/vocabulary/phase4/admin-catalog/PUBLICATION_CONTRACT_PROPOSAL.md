# Phase V4A — Publication contract proposal

## Policy status

`PENDING_PO`. This file and `backend/src/services/vocabularyPublicationContract.js` describe a proposal only. V4A adds no Publish API, student Catalog API, state-transition endpoint or production permission rule.

## Proposed eligibility

A vocabulary occurrence is eligible only when all gates pass:

1. Tag exists and is `published`.
2. Chapter exists, is `published`, and its `tagId` matches that Tag.
3. Vocabulary is Catalog-only and `catalogStatus` is `published`.
4. A ChapterVocabulary membership exists and links that exact Chapter to that exact Vocabulary.
5. Editorial `reviewStatus` is `REVIEW_APPROVED`.

The pure evaluator reports blockers for missing/archived/draft records and mismatched references. Publishing a Tag alone cannot make a word visible. Archive maps to hidden. Creation maps to Draft; editorial review is a separate state.

## Evidence and decision boundary

Unit assertions exercise a fully eligible record, a Draft Tag, a missing membership, mismatched Chapter/Tag and mismatched membership references. A route probe returns 404 for a proposed Publish endpoint.

No authority or production readiness is inferred from these tests. Product/policy approval and a separate V4B student experience remain future work.
