# Phase V4A — V3A Import Tag and Chapter mapping

## Identity and mapping

`VocabularyImportCatalogMapping` is separate from Batch and Candidate. It records Batch identity, explicit target Tag ID and one entry per source file. An entry preserves the source file identity derived from the immutable relative path and SHA-256, the relative path, source folder label, source Chapter candidate and candidate count. The mapping action is either:

- `EXISTING` with an explicit Chapter ID that belongs to the selected Tag; or
- `CREATE` with validated Chapter fields, created as Draft inside Confirm's transaction.

Two files cannot create same-title Chapters in one Tag. A proposed title already present in that Tag is rejected; an Admin must choose the existing Chapter explicitly. Mapping never changes Parser V2.1 `sourceIdentity`, Batch `sourceFiles`, Candidate raw/parsed values, review history or Batch identity.

## Confirm behavior

The V4A harness constructs the V3A router with `requireCatalogMappingForConfirm: true`, so Confirm without a complete mapping returns `CATALOG_MAPPING_REQUIRED`. Candidate confirmation resolves Tag/Chapter by stored IDs. The mapping is locked in the same transaction when Drafts are created. The default V3A prototype mode remains available for its previous regression suite; V4A does not mount either router in the application.

Tag creation is available as a separate explicit Admin action. Mapping does not create or select a Tag by matching the source folder label.

## Evidence and limit

The V4A integration test covers explicit mapping, cross-Tag Chapter rejection, duplicate title rejection, no-map Confirm blocking, source preservation, Draft import and mapping lock. The browser harness maps one file to an existing Chapter and another to a new Chapter, then opens the same Batch in V3B review.

**Readiness:** `IMPORT_MAPPING_READY=YES` for isolated synthetic data. Rights/policy approval remains `PENDING_PO`; no customer DOCX or 711-row source was imported.
