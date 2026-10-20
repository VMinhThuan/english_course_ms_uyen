# Phase 4 UI baseline and source map

## Baseline

- Repository: `D:\SideProject\english_course_ms_uyen`
- Branch/commit at Phase 4 start: `main` / `d8b5c49b0e6fb73e7f414798ae077a9ce713f001`
- Phase 1–3 work was already uncommitted in the shared working tree. It was preserved.
- Pre-implementation checkpoint: `%TEMP%\toeic-phase4-pre-implementation-20261020-103824`; the snapshot includes `backend/src`, `backend/tests`, `frontend/src`, `docs/audits`, package manifests/locks, and `snapshot-manifest.txt`.
- Master Test Plan: [Google Docs source](https://docs.google.com/document/d/19mooB-jlPZGBWXZkFg6fWwnYFGtbVDojg-aOo8uPCPs/edit?tab=t.0). Text and test-case tables were read through the connected Drive document tool. The document reports 62 detailed test cases and 31 embedded images.
- `VISUAL_REFERENCE_UNAVAILABLE`: the document's embedded images could not be inspected in the available document view. The in-app browser redirected to Google sign-in; no authentication was attempted. No image was treated as reviewed, and no screenshot was taken as product evidence.
- No local baseline/browser screenshot or verified export was found in the repository during this pass.

## Route map before/after

| Flow | Before | Phase 4 source |
|---|---|---|
| Public catalog/detail | `/courses`, `/courses/:id` outside `StudentLayout` | Preserved |
| Student enrolled courses | `/student/my-courses` linked to public `/courses/:id` | Links to `/student/courses/:id` |
| Student all courses | No student catalog route | `/student/courses` under `StudentLayout` |
| Student course detail | No student-specific detail route | `/student/courses/:id` under `StudentLayout` |
| Student lesson | `/student/courses/:courseId/lessons/:lessonId` | Preserved; back/prev/next remain in student routes |
| Legacy enrollment page | Full-page confirmation route | `/student/enroll/:courseId` redirects into course detail and opens its confirmation dialog |
| Protected material file | `/api/v1/materials/:id/download` attachment | Preserved; `/api/v1/materials/:id/preview` added |
| Student vocabulary | `/api/v1/vocabulary` or `/lesson/:lessonId` returned full list | Legacy full-list behavior remains when no new paging/search/sort/ID parameters are supplied; new UI opts into bounded paging |

## Existing design/layout

- Student routes render through `StudentLayout`, which provides header, sidebar, and the mobile navigation drawer.
- Public catalog and detail routes remain unprotected for discovery.
- Course cards share `MyCoursesPage.css`; Phase 4 sets a two-column desktop catalog based on the textual test-plan note, with one column at narrow mobile widths. The target image/viewport could not be verified.
- Lesson content, materials, and completion controls use `CourseLearning.css`.
- Vocabulary/flashcards use `Vocabulary.css`.
- Admin lessons use the existing admin form/table components.

## Test-plan image/text mapping

| Source case | Textual observation | Source area |
|---|---|---|
| `LESS_02` | Course list/detail navigation, card consistency, download feedback, enrollment confirmation, PDF rendering, lesson navigation, mobile progress/material/navigation | `AppRoutes.jsx`, `MyCoursesPage.jsx`, `CourseListPage.jsx`, `CourseDetailPage.jsx`, `EnrollCoursePage.jsx`, `LessonPage.jsx`, learning CSS |
| `DOC_01` | Inline PDF reader expected | `LessonPage.jsx`, `materialController.js` |
| `DOC_02` | Authorized downloads must retain the original file | `LessonPage.jsx`, `materialController.js`, `materialDownload.js` |
| `DOC_03` | Restricted material must not expose a direct download URL | Phase 1 access policy and protected upload route; preview follows the same policy |
| `VOC_01` | Vocabulary data clarity, grid presentation, long-list navigation, Vietnamese flashcard labels | `StudentVocabularyPage.jsx`, `FlashcardPage.jsx`, `Vocabulary.css` |
| `VOC_02` | Search English word or Vietnamese meaning | vocabulary API/controller and student page |

## Source root causes identified from baseline

- `MyCoursesPage` navigated to the public course detail route; the route was not nested below `StudentLayout`.
- The lesson material UI only offered a download action. The protected download endpoint returned an attachment.
- Vocabulary UI did not offer search/sort/pagination or a return-to-top action; the student vocabulary endpoint returned an unbounded list.
- Flashcard labels were English.
- `.learning-notice` had a success-green base style regardless of the operation outcome.
- Enrollment confirmation occupied a separate page.
- Lesson schema and forms did not contain a difficulty field.
- The mobile student sidebar moved off-screen with a transform but did not remove its links from keyboard order.

## Browser baseline

Product browser baseline: `NOT_RUN` per the user's established UI-testing preference. No runtime defect has been claimed from an unexecuted interaction.
