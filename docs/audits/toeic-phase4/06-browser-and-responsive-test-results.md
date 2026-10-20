# Browser and responsive test results

## Status

**Product browser QA: `NOT_RUN`.** The user's established preference is to run their own browser/UI smoke test. We ran backend API integration tests and a frontend production build only; neither is browser visual evidence.

## Environment and viewports

| Environment | Result |
|---|---|
| Browser/runtime for product | NOT_RUN |
| Desktop viewport | NOT_RUN |
| Tablet viewport | NOT_RUN |
| Mobile viewport | NOT_RUN |
| Browser console inspection | NOT_RUN |
| Before/after product screenshots | None |
| Accessibility tree / screen reader | NOT_RUN |

The in-app browser attempt was limited to opening the source Google Doc. The document view redirected to Google sign-in, so its 31 embedded reference images remain `VISUAL_REFERENCE_UNAVAILABLE`. It was not used to open or smoke test the application.

## Interaction results

| Flow | Source/API evidence | Browser result |
|---|---|---|
| Student catalog/detail remains in student shell | Nested route source and successful frontend build | NOT_RUN |
| Public course discovery route remains | Existing public route declarations unchanged | NOT_RUN |
| Direct URL/refresh/back navigation | No runtime route exercise | NOT_RUN |
| Mobile sidebar keyboard/touch | Source adds Escape, focus trap, focus return, and hidden closed links | NOT_RUN |
| PDF preview/error/fallback | Protected API integration passes; native viewer not rendered | NOT_RUN |
| Vocabulary search/topic/sort/page | API integration passes; rendered screen not exercised | NOT_RUN |
| Flashcard keyboard/next/previous | Source and build only | NOT_RUN |
| Enrollment modal cancel/confirm/focus | Source and build only | NOT_RUN |
| Notice colors/live regions | Source and build only | NOT_RUN |
| Difficulty form save/reload/student display | API integration plus source/build only | NOT_RUN |

No PASS/FAIL visual result is claimed. No browser console errors were observed because the application was not opened.
