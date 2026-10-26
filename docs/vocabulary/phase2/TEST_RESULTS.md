# Parser V2 test results

## Executed

Command: `npm run test:vocabulary-parser-v2` from `backend/`, with environment variables pointing to the existing original DOCX directory, Phase V0.6 locator CSV and SHA-256 manifest.

**Result: 9 tests passed, 0 failed, 0 skipped.** The suite covers:

1. Invalid ZIP, required parts, CRC-32, SHA-256 mismatch and uncompressed-byte limits.
2. Malformed XML and broken internal relationships.
3. Easy Start Word numbering, run-format preservation and bilingual field mapping.
4. Must-Know POS senses, arrow pairs, Day 3 parsing and duplicate display number 12.
5. Essential Collocation inline and labeled-next-paragraph layouts.
6. Table locators and explicit review warnings.
7. Duplicate candidate preservation with no row merge.
8. Legacy `parseText` contract compatibility and absence of a V2 publish status.
9. Full acceptance over the 30 original DOCX files against the independent 711-row locator CSV and 30-file SHA-256 manifest.

Acceptance totals: 30/30 files, 711/711 candidates, 0 missing, 0 extra, 711/711 word/POS/order matches, 711/711 paragraph-start locator matches, 30/30 hash matches, 30/30 package validations, 14 duplicate groups / 29 occurrences, and 6/6 independent full-field goldens. The remaining 705 entries are unverified at full-field level and all 711 candidates are marked `NEEDS_REVIEW`.

The separate `npm run accept:vocabulary-parser-v2` command regenerates `PARSER_COVERAGE_RESULTS.csv`. Both commands only read DOCX buffers and write the coverage CSV; they do not call API routes or database code.

## Not run

No full backend/frontend suite, MongoDB integration, API preview/confirm, migration, deployment or browser workflow was run. Those are outside this isolated parser implementation and do not establish import readiness.
