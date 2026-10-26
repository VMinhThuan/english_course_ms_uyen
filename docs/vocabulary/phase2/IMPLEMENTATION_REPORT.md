# Parser V2 implementation report

Implemented `backend/src/services/docxVocabularyParserV2.js` as a separate module. The legacy `DocxVocabularyParser`, preview controller, Confirm API, Vocabulary schema and learner endpoints were not edited or redirected.

## Implemented

- Streaming DOCX ZIP validation, SHA-256, resource limits, CRC-32 checks, required OOXML-part checks, strict XML parsing, and internal relationship validation.
- OOXML paragraph/run extraction with Word breaks, formatting evidence, numbering, source order and paragraph/table locators.
- Easy Start, Must-Know and Essential Collocation source-layout strategies.
- Multi-POS and multi-sense candidates; paired English/Vietnamese examples; separate note fields; raw and normalized forms.
- Automatic numbering and literal display numbering are retained independently from source ordinal. Day headings accept `Day 3 :`.
- Duplicate candidates are annotated across a batch; no candidate is removed or merged.
- Candidates use `reviewStatus: NEEDS_REVIEW`; the output does not have a `status: published` field.
- Added a source acceptance runner and a dedicated Node test command. Original DOCX files remain outside the worktree and Git.

## Observed source run

The acceptance runner read the 30 original files from the existing local source directory. It matched the prior SHA-256 manifest for 30/30 files, processed 711/711 locator rows, detected zero missing or extra entries, and matched word/POS/order and paragraph-start locators for 711/711. The 14 duplicate groups and 29 occurrences remain present.

Six hand-annotated field goldens across the three layouts passed. The other 705 rows have not been compared with an independent, complete meaning/example/note reference and remain unverified. All 711 candidates remain marked `NEEDS_REVIEW`; the parser is not approved for import.

## Dependency and isolation notes

Added direct runtime dependencies `yauzl` and `@xmldom/xmldom`, plus dev dependency `fflate` for in-memory package tests. The work is on branch `codex/vocabulary-docx-parser-v2` in a managed worktree based at `2b112f2d9c6c769578159428c04454bd441ad3ef`. No source DOCX, database, migration, deployment, commit or push was performed.
