# Phase V2.1 handover

## Result

The original-source batch still accounts for all 30 DOCX files and all 711 candidates. Word/POS/order and paragraph locators reconcile 711/711; source hashes and package checks pass 30/30; there are no missing or extra candidates and zero parser issues.

The new independent sample has 90 unique entries, three per file at start, middle, and end. Five of the six historic Phase 2 independent oracles overlap these rows; the sixth adds DAY 4 ordinal 12. Therefore INDEPENDENT_GOLDEN_REFERENCE.csv contains a deduplicated union of 91 unique source entries. The expanded 14-field matrix covers the 90 stratified rows; it does not claim expanded-field comparison for the one historic-only row. Field totals across the 90 expanded sample rows:

| Field | EXACT_MATCH | AMBIGUOUS_SOURCE | Other statuses |
|---|---:|---:|---:|
| Word/Phrase | 90 | 0 | 0 |
| Part of speech | 90 | 0 | 0 |
| Meaning | 90 | 0 | 0 |
| Multiple senses | 90 | 0 | 0 |
| English example | 90 | 0 | 0 |
| Vietnamese example | 89 | 1 | 0 |
| Example pairing | 89 | 1 | 0 |
| Notes/usage | 90 | 0 | 0 |
| Source ordinal | 90 | 0 | 0 |
| Source display number | 90 | 0 | 0 |
| Source paragraph locator | 90 | 0 | 0 |
| Chapter/topic candidate | 90 | 0 | 0 |
| Sense/example association | 86 | 4 | 0 |
| Raw source preserved | 90 | 0 | 0 |

The matrix has zero INCORRECT_MAPPING, MISSING_FIELD, EXTRA_CONTENT, NORMALIZATION_ONLY, and NOT_ANNOTATED cells in this sample. NOT_ANNOTATED remains a separate status and is not included as a pass. One fused paragraph boundary and three implicit sense/example associations remain human review items. No accuracy percentage is inferred for the 621 candidates outside the sample.

## Risk checks and remaining review

- All 14 V0.6 note-risk rows currently contain notes, with no note value duplicated verbatim into the meaning field.
- A full screen of current Must-Know meanings found no common usage-pattern markers. The 49 historical V0.6 meaning-boundary cases remain individually unverified because their preserved report has no row identities.
- The attribute multi-POS/multi-example case is included in the independent sample.
- The Day 3 source heading context is retained as topic candidate.
- DAY 4 display number 12 is preserved on source ordinals 12 and 13.
- Essential inline and paragraph-block layouts are both represented.
- All 14 duplicate groups and 29 occurrences remain separate; no Vocabulary merge or reuse was performed.
- All 711 candidates remain NEEDS_REVIEW, NOT_APPROVED, and NOT_ELIGIBLE for publication.

## Readiness gates

| Gate | Status | Evidence and limit |
|---|---|---|
| SOURCE_ACCOUNTING_READY | PASS | 30/30 hashes and package checks; 711/711 source references, no missing/extra candidates |
| GOLDEN_DATASET_READY | PARTIAL | 91 unique entries in the deduplicated union; 90 expanded rows across all files, with six ambiguous status cells across four entries requiring human review |
| FIELD_ACCURACY_VERIFIED | SAMPLE_ONLY | Expanded 14-field comparison covers 90 stratified rows; 621 candidates are outside that matrix, with one having only historic legacy-field coverage |
| PARSER_REGRESSION_READY | PASS_SCOPED | Parser tests 10/10; full-source acceptance passed; Phase 1 security tests 18/18; not a full app or deploy result |
| DUPLICATE_PRESERVATION_READY | PASS | 14 groups / 29 occurrences preserved without merging |
| DEPENDENCY_BASELINE_READY | PARTIAL | Audit clean and patched lock resolved; deployment Node version unknown and declared Node range is broader than the sanitizer minimum |
| IMPORT_CONTRACT_REVIEW_READY | READY_FOR_REVIEW | Contract proposal only; no API/controller/database integration |
| V1_DATA_FOUNDATION_READY | NO_GO_PENDING_DECISIONS | Product-owner decision and database baseline remain outstanding |
| V3_IMPORT_INTEGRATION_READY | NOT_STARTED | No production parser integration, controller, database write, migration, or publication behavior |

## Tests and dependency result

Parser fixture suite: 10/10 passed. Original-source acceptance: 30/30 files, 711/711 entries, 0 missing/extra, 0 parser issues. Phase 1 security suite: 18/18 passed after shared sanitizer/body-parser dependency reconciliation. npm audit: zero vulnerabilities. This does not establish full backend regression, editorial approval, deployment compatibility, or release readiness.

## Scope boundary

No primary checkout writes, reset, rebase, merge, commit, push, deploy, database connection, migration, database identity creation, API/controller integration, Part 1/5 changes, or publish action was performed. No customer DOCX text was added to Git. Implementation and reports remain in the isolated V2 worktree.
