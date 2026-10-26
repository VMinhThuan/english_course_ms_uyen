# Field accuracy and review report

## Independent checks

| Field or measure | Result | Evidence boundary |
|---|---:|---|
| Word/POS/source order | **711/711 match** | Compared per row with the independent Phase V0.6 OOXML locator CSV. |
| Paragraph-start locator | **711/711 match** | Compared with the independent locator CSV. |
| Full meaning/POS/example/note goldens | **6/6 match** | Six manually annotated rows spanning Easy Start, Must-Know (including multi-POS `attribute` and a note), and both Essential layouts. |
| Remaining entries with full-field oracle | **0/705** | There is no complete independently annotated 711-row field reference. These rows are not declared correct. |
| Missing / extra source candidates | **0 / 0** | Counted against the 711 independent row locators. |
| Candidates marked for review | **711/711** | Parser output is a candidate result only; no editorial or PO approval is implied. |

The six golden cases are `application form`, `attribute`, `negligence`, `implement a change`, `generic drug`, and `advanced degree`. Their expected fields are written independently in the test oracle, not generated from parser output.

## Mapping observations

- Easy Start uses the source paragraph’s colon and Word line breaks; examples are stored as English/Vietnamese pairs. Run color is retained but is not used as the sole delimiter.
- Must-Know stores each POS subsection as a separate sense and splits `→`/`->` pairs. The two `attribute` examples stay with their respective verb/noun senses. Post-example note text stays in `notes`.
- Essential Collocation supports `Ví dụ`/`Dịch` labels in following paragraphs and inline examples separated by source line breaks. It does not require POS.
- Raw paragraph text/runs remain available beside normalized candidates so an Admin reviewer can inspect the original evidence.

## Accuracy verdict

**Measured field accuracy is 6/6 on the independent field goldens. Overall strict full-field accuracy across 711 entries is UNKNOWN, not 100%.** Although the parser produced meaning/example fields for the source rows without structural warnings, 705 of those rows lack an independent expected-field annotation and remain `NEEDS_REVIEW`. This is not ready for automatic import.
