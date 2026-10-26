# Independent golden dataset methodology

## Scope and independence

The Phase V2.1 set has 90 unique entries across all 30 original DOCX files: exactly three per file, selected at the start, middle, and end (30 entries in each position). The source files were read from the existing local source directory and were not copied into Git.

Expected fields were manually annotated in the ignored local artifact INDEPENDENT_GOLDEN_REFERENCE.json from direct OOXML extraction of word/document.xml using .NET ZipArchive and XmlDocument. The annotation process does not import or invoke Parser V2 and does not derive expected values from parser output. Source SHA-256, source ordinal, paragraph range, raw OOXML, and document-header context were recorded independently. The comparator only joins the completed annotations to parser output after the expected values were written.

The sample covers all observed layouts: Easy Start inline numbered paragraphs, Must-Know numbered sense blocks, Essential inline collocations, and Essential paragraph blocks. It includes the attribute multi-POS/multi-example case, bilingual examples, usage notes, multiple senses, inline meaning/example content, and source-absent POS. Thirty Essential samples correctly expect no POS because the source does not provide one. Empty expected values are annotated as empty; they are not NOT_ANNOTATED.

The tracked reference CSV is the deduplicated union of this 90-row expanded sample and the six historic Phase 2 independent full-field oracles. Five historic rows overlap the expanded sample, so the union contains 91 unique entries. The remaining historic-only oracle is DAY 4 source ordinal 12. That row retains its prior field scope and is marked LEGACY_ORACLE_FIELDS_ONLY; it is not included in the expanded 14-field matrix. The matrix therefore contains 90 rows per expanded field, and the reference CSV contains 91 unique source entries.

The ignored raw evidence set has 129 unique rows: the 90 stratified records plus legacy note-risk candidates, repeated-headword occurrences, and the two DAY 4 display-number-12 occurrences. These selectors overlap, so 129 is the deduplicated evidence count rather than their sum. Raw source paragraphs and XML remain under ignored local-assets.

## Field comparison

The comparator reports EXACT_MATCH, NORMALIZATION_ONLY, MISSING_FIELD, INCORRECT_MAPPING, EXTRA_CONTENT, AMBIGUOUS_SOURCE, and NOT_ANNOTATED independently. NOT_ANNOTATED is never counted as a pass. FIELD_ACCURACY_MATRIX.csv contains one row per file and field, the layout, and counters for all seven statuses, including zero counters.

One Vietnamese-example boundary is ambiguous because the source paragraph continues directly into the next numbered entry. Three further sample entries have examples after multiple senses without explicit sense-level attachment. The example text and bilingual pairings match; only sense association is ambiguous. These four cases remain marked for human review and are not treated as approval.

## Limits

This targeted stratified sample is not a random sample designed for a population accuracy estimate. No accuracy percentage is projected to the 621 candidates outside the expanded 14-field matrix; one of those has only the prior legacy-oracle field scope. All 711 candidates remain NEEDS_REVIEW and not publication eligible. Full text for the new 90-row sample, raw OOXML, and the complete private review queue remain in ignored local-assets/vocabulary-phase2.1. The six historic oracle values that predate V2.1 remain in the existing test helper; V2.1 did not copy or expand those values. Tracked CSV files contain source metadata and comparison statuses only.

The V0.6 report preserves the count of 49 meaning-boundary comparisons but no row-level source file/ordinal identities. ACTUAL_PARSER_COVERAGE.csv has 30 file-level aggregate rows, and PARSER_FIELD_MAPPING_ERRORS.md reports the 49 count without an entry list. A full Must-Know structural screen found no common usage markers remaining in parsed meanings, but that screen does not individually adjudicate the 49 historical records.

The ignored local files INDEPENDENT_GOLDEN_REFERENCE.json and golden-field-statuses.json contain the new expected and actual text values; raw OOXML is in raw-ooxml-sample-evidence.json and the text-bearing queue is in VOCABULARY_REVIEW_QUEUE.private.json. Each tracked golden row contains its source file, checksum, ordinal, paragraph range, layout, sample position, and review status. The local golden manifest SHA-256 is recorded in the ignored reference artifact.
