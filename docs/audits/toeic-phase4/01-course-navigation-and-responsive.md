# DEF-018 — Course navigation and responsive learning UI

## Source correction

The original issue was a route-boundary mismatch: My Courses linked into `/courses/:id`, which remained public and outside `StudentLayout`. Back links then returned to the public catalog.

Phase 4 adds `/student/courses` and `/student/courses/:id` below the protected student layout. My Courses cards now point at the student detail route; course detail and lesson return links preserve the learner context. The public `/courses` and `/courses/:id` routes are unchanged. The old `/student/enroll/:courseId` path remains as a redirect into the course detail modal flow.

## Navigation behavior

- Student all-course and My Courses pages expose an explicit two-way switcher.
- Course detail within the student shell links back to My Courses; the public detail retains its public return path.
- Enrolled lesson links, previous/next lessons, and lesson return links use `/student/courses/:courseId/...`.
- Course catalog title is set for `/student/courses`.
- Direct URL and refresh behavior follows the client route tree and protected route. It has not been confirmed in a browser.

## Layout, cards, and progress

- All-course catalog cards use the My Courses card markup/styles, with the existing thumbnail/image fallback and consistent title/meta/action area.
- Course cards use two columns on desktop/tablet and one column below 520px. This responds to the Master Test Plan's text that the catalog should use two columns; the embedded image and exact viewport were unavailable, so the breakpoint is an implementation assumption pending visual review.
- Lesson rows show optional difficulty badges. The completion/progress calculation is unchanged.
- My Courses and course detail source already render a percentage plus a progress bar; no progress formula was added or changed in Phase 4.
- Lesson footer now presents compact “Bài trước”, completion, and “Bài tiếp theo” controls. Course titles remain available through accessible labels.

## Mobile sidebar

The drawer retains its overlay and body scroll lock. The menu button exposes Vietnamese `aria-label`, `aria-expanded`, and `aria-controls`. Opening the drawer focuses its first item, traps Tab focus, closes on Escape, and returns focus to the trigger. At mobile widths, the closed drawer uses `visibility:hidden`, so off-screen links do not remain keyboard focus targets. A resize to desktop closes the drawer.

## Verification and limits

- Static source confirms nested routes, shared card markup, progress percentage markup, and keyboard drawer handling.
- Automated browser tests: `NOT_RUN`.
- Responsive screenshots/device rendering, scroll position, route refresh, back-button behavior, and visual card alignment: `NOT_RUN`.
- The two-column desktop choice should be confirmed against the unavailable Master Test Plan image at the intended viewport.
