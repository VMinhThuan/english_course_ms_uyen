# 04 — Remaining risks and follow-up

## Blockers before production rollout

| Priority | Risk / unverified condition | Evidence | Next action |
|---|---|---|---|
| HIGH | Lesson/material file size compatibility is unknown; the 50 MiB ceiling is provisional. | Baseline general lesson/material Multer routes had no maximum. Workspace contains only four 38-byte PNGs and no representative corpus. | Inventory production file sizes in a read-only report; confirm or set per-purpose caps before deployment. Do not truncate/delete files. |
| HIGH | Local upload storage on Vercel is temporary and may not persist across function invocations/instances. | `backend/src/utils/uploadConfig.js` maps Vercel to `os.tmpdir()/uploads`; no persistent storage adapter is configured. | Select and test approved persistent storage (private object storage or equivalent) before relying on new private uploads in a serverless deployment. Plan legacy URL compatibility; no migration was run. |
| HIGH | API authorization and legacy URL matching have not been exercised against real MongoDB records. | No disposable DB was available; middleware tests inject fake Material/Lesson/Enrollment records. | Prepare an isolated DB and fixtures for both current and legacy `fileUrl`/`filePath` shapes, verify allow/deny cases, and inspect cleanup/reference behavior. |
| HIGH | TOEIC imported page images are public assets, including for unpublished assessments. | `toeicController` emits `/uploads/public/...`; upload guard treats unreferenced public JPEGs as public static assets and does not query Assessment publication/attempt access. | Decide whether draft exam images are confidential. If yes, design assessment-scoped authorization without changing attempt/scoring behavior and verify student image rendering in the TOEIC flow. |
| MEDIUM | The target backend runtime has not been confirmed. | `backend/package.json` now requires Node `>=22.12.0` for `sanitize-html@2.18.1`; local checks used Node 22.18.0. | Verify target build/runtime logs and Vercel Project Settings. No deployment was performed. |
| MEDIUM | Production upload route aliases, the configured 50 MiB ceiling, and disk failures were not exercised end-to-end. | A local Express/Multer harness verifies common middleware errors, small-cap enforcement, naming, and cleanup, but it does not mount each production route or exercise a 50 MiB body. | Mount each upload route family in a no-DB test or inject storage dependencies; verify authorization, route-specific field limits, production caps, storage failure, and cleanup. |

## Policy decisions still needed

1. **`allowDownload=false` preview:** Phase 1 returns no local bytes and the student UI offers no download. Define allowed preview types, whether a protected proxy is required, browser cache policy, and whether previews count as disclosure before Phase 4.
2. **External materials:** HTTPS links are gated until disclosed, but the provider controls subsequent access and recipients can copy a URL. Decide on host allowlisting or controlled storage if revocation is required.
3. **General upload ceilings:** 50 MiB for lesson/material and admin uploads is a common provisional cap. Confirm production corpus and desired caps per type; the TOEIC 30 MiB and DOCX 10 MiB limits remain unchanged.

## Other residual security/operational limits

- Every public/legacy image/audio request checks MongoDB first so a database-referenced asset cannot bypass material authorization. This can make public media return 503 during a database outage and adds query load per asset request.
- Public media and TOEIC page images are intentionally retrievable without authentication when not referenced by a Material/Lesson record. Treat the URL as public once issued.
- ZIP, DOCX, XLSX, PPTX, and other container formats are signature-checked but are not malware-scanned, decompressed under a resource budget, or semantically validated at upload time. They are served as attachments with `nosniff`.
- A third-party file provider may expose an external HTTPS file independently from this application after an authorized user opens it.
- Account suspension takes effect on subsequent authenticated requests; it cannot cancel a request already executing. No attempts or scores are auto-submitted or modified.
- Browser visual behavior, actual file download behavior, response cookie handling, and real role transitions still require safe integration/browser validation.
- No general SQL injection audit was performed. Mongo/Mongoose query safety outside the HTML/file/account issues is not covered by this phase.

## Suggested follow-up order

1. Confirm the backend deployment runtime and persistent file-storage target.
2. Inventory production file sizes and classify assessment page images as public or restricted.
3. Build a disposable MongoDB fixture namespace and run the required access matrix without touching shared data.
4. Extend the isolated multipart harness to mount each production route family and exercise route-specific fields, authorization, and storage failures.
5. Confirm the `allowDownload=false` preview policy before implementing any preview path.
6. Run the user's browser smoke checks on student, teacher, admin, existing media, and legacy file flows; retain attempt/scoring cases as Phase 2 work.
