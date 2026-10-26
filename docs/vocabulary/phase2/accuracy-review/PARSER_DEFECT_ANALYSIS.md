# Parser defect analysis

## Confirmed defects and fixes

1. **Must-Know subsection punctuation.** An optional colon after a POS subsection such as “(n):” leaked into the usage pattern. Parser V2.1 removes the structural colon while retaining a meaningful usage tail. A synthetic regression covers both conditions.
2. **Usage references parsed as meanings.** Meaning mode accepted structurally recognizable usage patterns such as “+ N/V” and “+ clause”. The parser now routes these to notes based on structure, with no headword-specific exceptions. Synthetic coverage includes the previously observed “assure ... + clause” shape.
3. **Legacy note-to-Vietnamese risk.** The 14 V0.6 note-risk records were rechecked against direct raw OOXML evidence. All 14 current parser rows contain one or more notes; none of the note values is duplicated verbatim in its meaning field. This is a targeted structural check, separate from full-field golden verification.

The changes preserve raw paragraphs and source locators. Reprocessing the originals still returns 711 entries with no missing or extra candidates and zero parser issues.

## Risks checked without a parser patch

- **49 historical meaning-boundary cases:** the preserved V0.6 report has aggregate totals but no row-level file/ordinal identities. The exact 49 rows cannot be joined to the V2 results from that report. A structural scan across all 294 current Must-Know rows found no common usage-pattern markers in parsed meanings; this is not a full manual re-review.
- **Easy Start paragraph boundary:** one sample Vietnamese example shares a paragraph with the next numbered entry. The OOXML does not establish the intended boundary. V2 preserves raw text and reports ambiguity rather than guessing.
- **Sense/example association:** three Must-Know sample records have examples following multiple senses without explicit sense-level association. The examples and bilingual pairings match; association remains ambiguous.
- No V0.6 parser defect was assumed to persist in V2 without current source evidence.

No patch is keyed to a vocabulary headword. No ambiguous source text was silently shortened. No candidate was removed, merged, or approved. Parser version is 2.1.0 after the structural fixes.
