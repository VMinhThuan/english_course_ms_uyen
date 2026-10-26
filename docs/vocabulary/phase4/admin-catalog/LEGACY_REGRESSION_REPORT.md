# Phase V4A — Legacy and cross-phase regression report

All runs were local. Mongo-backed suites use their own loopback MongoMemoryServer/MongoMemoryReplSet test databases.

| Area | Result |
|---|---|
| V4A Tag/Chapter/membership/mapping integration | PASS 9/9 assertions |
| V4A real-backend Admin browser | PASS; synthetic DOCX and `vocabulary_v4a_admin_test` |
| V3A Batch/import backend | PASS 8/8 |
| V3B frontend unit | PASS 6/6 |
| V3B mock browser | PASS; 14 workflow scenarios |
| V3B isolated backend browser | PASS; upload, review, Confirm Draft, identity, audit and 390px reflow |
| Vocabulary Catalog V1, legacy DTO and Flashcard contract | PASS 9/9 |
| Parser V2 unit | PASS 9; 1 real-source reconciliation test skipped |
| V1.1 30-file Parser/Adapter and independent-golden runs | 2 skipped because original DOCX/golden source paths were not provided in this worktree |
| Legacy learning API integration | PASS 5/5 |
| TOEIC Part 5 backend import regression | PASS 6/6 |
| TOEIC Part 5 frontend utility regression | PASS 9/9 |
| Frontend production build | PASS; existing large-chunk advisory remains |
| `npm audit --audit-level=low` (frontend and backend) | PASS; 0 vulnerabilities in each project |
| `git -c core.whitespace=cr-at-eol diff --check` | PASS |

V4A changes are not mounted in `backend/src/app.js` or the frontend production route tree. No Part 1/Part 5 module was changed. The V1 Catalog suite specifically verifies legacy Vocabulary endpoints, Student/Flashcard DTO compatibility, deletion behavior and LearningProgress retention.

## Limits

Parser V2's synthetic/unit coverage passed. The 30 original DOCX reconciliation and 90-row independent golden comparison were not executed: their environment variables point to private source evidence absent from this worktree. No 711 Vocabulary source records were written.
