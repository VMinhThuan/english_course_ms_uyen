# Phase V2 handover

## Answers to the 10 requested questions

1. **How many entries did V2 detect?** 711/711 candidates across 30 original DOCX files: 243 Easy Start, 294 Must-Know and 174 Essential Collocation.
2. **How many fully matched fields?** Six manually annotated full-field goldens matched 6/6. The other 705 have no independent full-field expected values and are not counted as correct. Overall 711-row strict field accuracy is unknown.
3. **How many need review?** All 711 candidates have `reviewStatus: NEEDS_REVIEW`; 705 specifically lack an independent complete field oracle. Nothing is auto-approved.
4. **Are there missing or extra entries?** No: 0 missing, 0 extra against the independent 711-row locator reference. Word/POS/order and paragraph-start locator match 711/711.
5. **Were all duplicates preserved?** Yes: 14 groups and 29 occurrences. One `release` pair is same-content/different-chapter, four groups are different-sense candidates and nine remain `NEEDS_REVIEW`. No rows were merged.
6. **Did V2 improve on V1?** Yes for source coverage and structural extraction: V1 detected 294/711 and omitted all Easy Start/Collocation rows; V2 accounts for 711/711, preserves locators and maps the six independent field goldens. Full-field accuracy for the other 705 remains unverified, so this does not establish import readiness.
7. **Which layouts still need Admin review?** All layouts remain review-required until the full field reference is checked. Highest attention: Must-Know notes and sense boundaries; Essential inline rows and translations without explicit labels; any future source using tables, external relationships or unfamiliar layouts.
8. **Is V2 ready for the Import API?** No. The source module is isolated and the field oracle covers only six rows. Do not replace or route the production parser to V2 yet.
9. **Did existing Vocabulary or Flashcards change?** No source changes were made to the old parser, controller, routes, schemas, Vocabulary endpoints, flashcard APIs or LearningProgress. A focused legacy text-parser contract test passed; no full application regression suite was run.
10. **What blocks Data Foundation integration?** Independent field annotation and Admin review for the remaining 705 entries; approval of the candidate/import contract and existing PO model/access/duplicate decisions; a separately authorized database baseline; and a bounded API integration plan. No database import, migration or API integration was performed.

## Gate status

| Gate | Status |
|---|---|
| Original source hashes and package parsing | **PASS — 30/30** |
| Entry accounting / source locators | **PASS — 711/711** |
| Independent word/POS/order comparison | **PASS — 711/711** |
| Independently verified full-field accuracy | **PARTIAL — 6/6 goldens; 705 unverified** |
| Duplicate preservation | **PASS — 14 groups / 29 occurrences** |
| Import API integration | **NOT STARTED — intentionally out of scope** |
| Database baseline / writes | **NOT RUN — no DB connection** |
| V1/Data Foundation readiness | **NO-GO** |

Implementation is isolated on branch `codex/vocabulary-docx-parser-v2` in the managed worktree based at `2b112f2d9c6c769578159428c04454bd441ad3ef`. No commit, push or deployment was made. No source DOCX was copied into the worktree or Git.

**Primary-checkout integrity note:** the first inspection observed primary `main` at `2b112f2`. Final inspection observed it at `6ee5f094870d1dd40884434a9d94f3041128853e`; its reflog records `reset: moving to origin/main` at `2026-10-26 07:07:24 +0700`. This task did not issue a reset command and did not attempt to move that dirty checkout back. At final inspection it still had 83 dirty paths, all 30 original DOCX files remained present, and `docs/vocabulary/phase2` was absent from that primary path. The committed range from `2b112f2` to `6ee5f09` changes package manifests substantially, while the legacy parser, vocabulary controller and routes have no committed diff in that range. The Phase V2 worktree was not rebased; reconcile the dependency baseline before future integration. The Phase V2 output exists only in the managed worktree.

## Re-run

Set these environment variables to the existing local data and V0.6 reports, then run the two commands from `backend/`:

```powershell
$env:VOCABULARY_DOCX_SOURCE_ROOT = 'D:\SideProject\english_course_ms_uyen\local-assets\vocabulary-source'
$env:VOCABULARY_DOCX_REFERENCE_CSV = 'D:\SideProject\english_course_ms_uyen\docs\vocabulary\phase0\source-gate-closure\DOCX_SOURCE_ENTRY_LOCATORS.csv'
$env:VOCABULARY_DOCX_SHA256_MANIFEST = 'D:\SideProject\english_course_ms_uyen\docs\vocabulary\phase0\source-gate-closure\DOCX_SHA256_MANIFEST.csv'
npm run test:vocabulary-parser-v2
npm run accept:vocabulary-parser-v2
```
