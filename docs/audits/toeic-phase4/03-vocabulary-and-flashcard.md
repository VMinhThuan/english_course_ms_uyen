# DEF-020 / DEF-021 — Vocabulary discovery and flashcards

## Search, filter, and sort

The student vocabulary page now supports debounced search in English and Vietnamese meaning, topic tabs, A–Z/Z–A sort, empty/error states, a clear-search control, and page navigation. Search normalizes Unicode accents and builds escaped literal regex patterns, including Vietnamese vowel variants and `đ/d`, rather than accepting user-supplied regex syntax. Search combines with the selected topic.

The student endpoint validates page/limit/search/topic/sort and caps pages at 100 words. It returns pagination metadata and available topics. Stable sorting uses `_id` as the tie-break. A no-parameter legacy call still returns its prior full result set ordered by `order`/`createdAt`; the new screen and flashcards opt into bounded pages explicitly.

## Presentation and long-list navigation

- Vocabulary is displayed as responsive cards in a grid, with long words, meanings, and examples allowed to wrap.
- The return-to-top control appears after scrolling and uses smooth scrolling unless the user requests reduced motion.
- Topic/search result totals and empty states are announced with status semantics.
- Stale asynchronous responses are ignored; a failed request clears the old list rather than showing stale results as current.

## Flashcards

- Navigation labels are localized as “← Trước” and “Tiếp theo →”. Disabled states prevent moving beyond available cards.
- Flashcards fetch additional pages as the learner advances instead of downloading the full vocabulary list.
- The existing bookmark/review queue is preserved and loaded in bounded ID batches.
- Errors clear after a successful retry.

## Verification and limits

The isolated Phase 4 API test verifies English/Vietnamese accent-insensitive search, topic combination, stable ascending/descending order, page boundaries, hidden-word exclusion, literal handling of regex metacharacters, invalid sort, and legacy full-list behavior. Production build passes. Keyboard activation, animation/reduced-motion appearance, very long lists, and responsive grid rendering have no browser evidence and remain `NOT_RUN`.
