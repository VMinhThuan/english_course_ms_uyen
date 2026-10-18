# TOEIC scan/import audit — 2026-10-18

## Scope

Read-only review of the local MongoDB `english_course` assessment named **Actual Test**, the saved question groups/questions, the PDF/OCR parser, and the student/admin Part 7 rendering paths. No database records were changed. The assessment is currently a draft.

The uploaded source PDF is not present in the repository's `uploads` directory, so answer letters cannot be checked against the original answer key or visual scan. This review reports structural evidence from the saved import; it does not guess replacement answers.

## Data findings

The draft contains 198 questions in 24 groups, against a 200-question full test configuration.

| Part | Saved | Expected | Missing question numbers | Questions without an answer | Questions without four options |
| --- | ---: | ---: | --- | ---: | ---: |
| 1 | 3 | 6 | 1, 3, 5 | 3 | N/A for image/audio stimulus |
| 2 | 25 | 25 | — | 25 | N/A for audio stimulus |
| 3 | 38 | 39 | 53 | 16 | 6 |
| 4 | 30 | 30 | — | 18 | 2 |
| 5 | 30 | 30 | — | 15 | 5 |
| 6 | 16 | 16 | — | 0 | 0 |
| 7 | 56 | 54 | 163 | 15 | 8 |

Across the full test, 92/198 questions have no saved answer. There are duplicate Part 7 question numbers 182, 183, and 184. This leaves only 195 distinct question numbers and confirms the imported set needs review before publication.

Examples of visible OCR structure damage include question 51's stem containing text from an answer choice and question 152's stem being appended to choice D while its own question text is only the generic number label. These are extraction-order errors, not answer-key facts that can safely be repaired without the PDF.

All 15 Part 7 groups have OCR text passages and no passage image. The source PDF pages are not available in the current upload folder, so passage images cannot be recovered from this saved dataset.

## Changes made

- Answer-key extraction now requires an explicit answer-key header, ignores conflicting answer letters for a question, and reports conflicts instead of silently choosing the first scanned value.
- Import reports now surface duplicate question numbers, incomplete option sets, and Part 7 passages without images.
- The browser OCR retries detected scanned answer-key pages at higher resolution and uses the retry only when it recognizes more answer pairs.
- The TOEIC builder now allows an image to be uploaded for each Part 7 passage. When a passage image is present, admin preview and student exam show the image instead of the full OCR text; the text stays saved as an optional backup in the builder.

## Required data follow-up

Re-import the original PDF after reviewing the new warnings, or open the draft in the builder and correct it against the source. The 92 missing answer keys, 21 incomplete Part 3–7 option sets, duplicate/missing question numbers, and Part 7 images need source-backed review. Do not publish this draft until those items are resolved.
