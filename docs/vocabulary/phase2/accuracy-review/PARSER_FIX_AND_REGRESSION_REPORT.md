# Parser fix and regression report

## Changes

- Recorded the corrected parser as version 2.1.0.
- Removed an optional structural colon from Must-Know POS subsection tails without removing meaningful usage text.
- Added a structural usage-reference classifier so usage syntax is stored as notes rather than meanings.
- Added synthetic regression cases for colon syntax and multiple usage-reference forms, including “+ clause”.
- Preserved raw paragraphs, source SHA-256, source ordinal, paragraph locators, and review status.

## Results

| Check | Result |
|---|---|
| Parser unit and fixture tests | PASS, 10/10 |
| Original DOCX acceptance | PASS, 30 files and 711 entries; 0 missing and 0 extra |
| Word, POS, and order reconciliation | PASS, 711/711 |
| Paragraph locator coverage | PASS, 711/711 |
| Source SHA-256 and package validation | PASS, 30/30 |
| Parser issues across original candidates | 0 |
| Independent V2.1 golden comparison | 90 unique rows; all 90 source hashes match |
| Duplicate preservation | PASS, 14 groups and 29 occurrences |
| Legacy parser contract and no-publish guard | PASS in parser suite |
| Phase 1 security suite after shared dependency changes | PASS, 18/18 |
| npm audit after dependency reconciliation | PASS, 0 vulnerabilities |

The golden comparison reports one ambiguous source boundary and three ambiguous sense/example associations. These remain explicit editorial review items. This is not a full application regression or deployment result. No database connection was used.
