# Dependency baseline reconciliation

## Baselines inspected

- Isolated V2 worktree started at 2b112f2d9c6c769578159428c04454bd441ad3ef.
- Newer primary checkout baseline 6ee5f094870d1dd40884434a9d94f3041128853e was inspected read-only. Its checkout was already dirty and was not modified.
- Baseline 2b used sanitize-html 2.17.4 and resolved body-parser 1.20.8.
- Baseline 6ee pins sanitize-html 2.18.1 and overrides body-parser 1.20.9. It also adds saxes and yauzl and contains Part 1/Part 5 changes. Those feature changes were not copied into the isolated worktree.
- V2 uses yauzl for ZIP reading and @xmldom/xmldom for XML. ZIP fixtures use fflate as a development dependency. V2 does not use saxes.

## Isolated worktree resolution

The 2b audit had two vulnerable package resolutions: body-parser at high severity and sanitize-html at moderate severity, with five sanitizer advisories attached. The isolated V2 declarations and lock now resolve:

| Package | Declared | Locked |
|---|---:|---:|
| @xmldom/xmldom | ^0.8.15 | 0.8.15 |
| yauzl | ^3.4.0 | 3.4.0 |
| fflate (development fixtures) | ^0.8.3 | 0.8.3 |
| sanitize-html | 2.18.1 | 2.18.1 |
| body-parser via Express | override 1.20.9 | 1.20.9 |

The explicit body-parser override matches the newer baseline. Lockfile v3, npm ls, and package-lock-only installation are consistent. No force fix was used. npm audit reports zero vulnerabilities after the update. Parser tests passed 10/10 and the shared Phase 1 security suite passed 18/18.

The baseline body-parser advisory is high severity: versions below 1.20.9 can crash an application on a compressed request with trailing bytes. npm audit reported five moderate sanitize-html advisories at 2.17.4: unsafe URI schemes on explicitly allowed URI-bearing attributes; an implied-close noscript discard-boundary issue; meta-refresh URL handling; a textarea/xmp solidus-close mutation-XSS; and SVG SMIL URI-list handling. Four are tied to allowing affected attributes or non-default tags that the lesson policy excludes. The noscript finding needs more care: the policy allows img and the affected parser path uses the default nonTextTags behavior, so this review does not declare that advisory unreachable in the current policy. Updating to 2.18.1 removes the reported findings, and the targeted Phase 1 sanitizer tests still pass.

Advisories: [body-parser GHSA-27r3-jxmh-p828](https://github.com/advisories/GHSA-27r3-jxmh-p828), [sanitize-html GHSA-vccv-cmxp-4j9h](https://github.com/advisories/GHSA-vccv-cmxp-4j9h), [GHSA-x3q4-9hxx-gx8m](https://github.com/advisories/GHSA-x3q4-9hxx-gx8m), [GHSA-cv27-6wvh-8x7j](https://github.com/advisories/GHSA-cv27-6wvh-8x7j), [GHSA-jxwj-j7wr-gfrw](https://github.com/advisories/GHSA-jxwj-j7wr-gfrw), [GHSA-g8qq-57p8-ggw5](https://github.com/advisories/GHSA-g8qq-57p8-ggw5).

## Runtime and integration risk

The project engine declaration remains Node 22.x. sanitize-html 2.18.1 declares a minimum Node version of 22.12.0. This run used Node 22.18.0, so local verification used a supported runtime. The declared range permits earlier Node 22 minors and the deployment runtime was not inspected. Keep dependency/runtime readiness PARTIAL until the supported minimum and deployment Node version are confirmed.

No Part 1/Part 5 module or test change from 6ee was imported. No application-wide regression or deployment compatibility is claimed.
