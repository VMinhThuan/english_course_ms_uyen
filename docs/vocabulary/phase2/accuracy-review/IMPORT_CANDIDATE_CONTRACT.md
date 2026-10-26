# Import candidate contract proposal

**Status:** review proposal only. This phase adds no API, controller, persistence, import, or publication behavior.

## Source mapping

- For this 30-file source set, one DOCX maps to one Chapter candidate.
- The DOCX source folder maps to a Tag candidate.
- The envelope carries both schemaVersion and parserVersion so preview rows can be validated against their producer and contract.
- Preserve source path, byte-level SHA-256, parser version, source ordinal, display number when present, paragraph start/end, layout, chapter/topic candidates, and raw-source reference.
- A deterministic idempotency key should hash the schema version, normalized source path, source SHA-256, source ordinal, and paragraph range. This key is a source identity for preview/import retries, not a database or Vocabulary ID.

## Candidate fields

Keep source fields separate from editor changes:

- Raw word, POS list, senses, usage patterns, bilingual examples, and notes are immutable source-derived values.
- Edited values live in a separate field set. Each change should carry actor, timestamp, and field-level before/after values.
- Senses and examples remain arrays to preserve multiple POS, meanings, and examples.
- Validation and parser issues are attached to a stable row-level source identity.
- Duplicate groups are advisory metadata. They do not remove an occurrence or trigger automatic reuse.

## Preview state

The preview should distinguish parser confidence, automated validation, independent golden verification, human editorial approval, and publication eligibility. This parser does not compute confidence. A passing parser or golden check does not approve editorial content. Candidates stay unapproved until the editor action required by the product workflow occurs. The preview contract contains no automatic publish state or action.

The full private review queue includes parsed fields, raw source references, validation issues, duplicate candidates, and review statuses. The tracked VOCABULARY_REVIEW_QUEUE.csv is metadata-only to avoid adding source vocabulary text to Git.
