# Duplicate review result

The current batch output retains 14 normalized headword groups and 29 source occurrences. Every group occurrence is still present as an individual parser item, matched by source path and ordinal. The parser did not create database identities or merge candidates.

| Requested check | Candidate classification | Occurrences | Result |
|---|---|---:|---|
| release | SAME_CONTENT_DIFFERENT_CHAPTER | 2 | Both chapter occurrences retained |
| complimentary | SAME_HEADWORD_DIFFERENT_SENSE | 2 | Both candidates retained |
| extension | SAME_HEADWORD_DIFFERENT_SENSE | 2 | Both candidates retained |
| convey | SAME_HEADWORD_DIFFERENT_SENSE | 2 | Both candidates retained |
| access | SAME_HEADWORD_DIFFERENT_SENSE | 3 | All three candidates retained |
| Remaining groups | NEEDS_REVIEW | 18 | Nine groups remain separate and unapproved |
| **Total** | **14 groups** | **29** | **All source occurrences retained** |

The remaining nine groups have two occurrences each. The release pair remains two cross-chapter occurrences with normalized same-content classification. That classification is only a possible reuse candidate for a future Data Foundation decision. The nine NEEDS_REVIEW groups and all same-headword/different-sense groups remain separate. No Chapter occurrence was dropped and no reuse or merge decision was made.
