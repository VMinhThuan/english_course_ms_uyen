# Source reconciliation — 30 originals / 711 entries

## Reconciliation result

| Source group | Original DOCX files | Independent source rows | V2 candidates | Missing | Extra |
|---|---:|---:|---:|---:|---:|
| TOEIC EASY START | 10 | 243 | 243 | 0 | 0 |
| TOEIC MUST-KNOW VOCABULARY | 10 | 294 | 294 | 0 | 0 |
| TOEIC ESSENTIAL COLLOCATION | 10 | 174 | 174 | 0 | 0 |
| **Total** | **30** | **711** | **711** | **0** | **0** |

The 711-row locator CSV was generated during Phase V0.6 by inspecting the original OOXML and is independent of V2 output. V2 matched its word, POS, per-file order and paragraph-start locator for **711/711** rows. All 30 input hashes matched the Phase V0.6 SHA-256 manifest; package/XML/relationship validation completed for all 30.

The prior flattened-text count of 709 remains historical comparison data. The two additional source rows are Start 2 (+1) and Start 6 (+1); V2 uses the original-DOCX total of 711.

## Special source boundaries retained

- Word numbering resolves for each Easy Start entry; Start 2 has 33 entries and Start 6 has 25.
- Must-Know keeps source display number separate from ordinal. DAY 4 has two entries with `sourceDisplayNumber = 12`, each retained as a distinct candidate.
- The header `Day 3 :` maps to topic candidate `Day 3`.
- The filename `Chaper 10.docx` is preserved exactly.
- No source entry is discarded because its headword duplicates another row.

## Limits of this reconciliation

The independent locator source validates word/POS/order/start paragraph, not every meaning, example pair or note. Six manually annotated source rows validate those mapped fields across the layouts. The remaining 705 rows are not counted as full-field-correct and must stay in review. Reaching 711 candidates is an accounting result, not proof of 711 fully correct field mappings.
