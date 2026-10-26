# Phase V4A — Admin UI browser results

## Automated browser run

Command: `cd frontend; npm run test:vocabulary-catalog-v4a:real:e2e`

**PASS** against `127.0.0.1` and the disposable `vocabulary_v4a_admin_test` MongoMemoryReplSet. The fixture uses the existing AdminLayout, V4A Catalog workspace and V3B workspace. The browser creates a Tag and Chapter, visits Batch history, maps one DOCX to an existing Chapter and another to an explicitly new Chapter, verifies parser source identities are unchanged, continues review in V3B, and checks a 390px viewport without horizontal overflow. No uncaught browser page errors were recorded.

The synthetic Batch contains two generated DOCX files and four synthetic candidates. Authorization probes returned 401 without an identity and 403 for a synthetic Teacher. No application database or customer file was used.

## UI qualities exercised or inspected

- Vietnamese labels, responsive Chapter/cards and batch rows, and 390px reflow.
- Native `dialog` elements with labelled headings, nested labels, keyboard-operable controls and `role=status`/`role=alert` feedback.
- Loading, empty and retry/error views; unsaved edits guard; field-level native validation.
- DOCX HTML is not rendered by the Catalog UI; mapping only displays escaped text.

This is a browser harness result, not a production login/session or deployed application test. No route was registered in the production route tree.
