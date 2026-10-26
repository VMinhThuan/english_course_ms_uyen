# Duplicate preservation report

The V2 batch run retained **14 normalized repeated-headword groups / 29 source occurrences**. Each occurrence stays in `items` with its own file, source ordinal and paragraph locator. Duplicate annotation never deletes a row or joins database identities; this parser creates no database IDs.

| Classification | Groups | Headwords |
|---|---:|---|
| `SAME_CONTENT_DIFFERENT_CHAPTER` | 1 | release |
| `SAME_HEADWORD_DIFFERENT_SENSE` | 4 | complimentary, extension, convey, access |
| `NEEDS_REVIEW` | 9 | maintenance, arrange, occasionally, approval, outline, clarify, transaction, entirely, rigorous inspection |
| **Total** | **14** | **29 occurrences** |

The `release` pair has normalized raw entry text equality and remains two candidates in two Easy Start chapters. The other classifications follow the source verification findings and are candidate labels only; they are not authorization to reuse or merge Vocabulary records. No normalized same-Chapter exact-duplicate group or different-POS group was confirmed in the source verification.
