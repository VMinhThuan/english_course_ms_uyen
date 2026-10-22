import { courseApi } from '../api/courseApi.js';
import { lessonApi } from '../api/lessonApi.js';
import { getChapterLabel, sortLessonVocabulary } from '../constants/toeicVocabularyBooks.js';
import { loadAllStudentVocabulary } from './loadAllStudentVocabulary.js';

async function loadPublishedToeicLessons() {
  const courseResponse = await courseApi.getCourses({ englishType: 'TOEIC' });
  const courses = courseResponse.data?.courses || [];
  const lessonsByCourse = await Promise.all(courses.map(async (course, courseIndex) => {
    const response = await lessonApi.getLessonsByCourse(course._id);
    return (response.data?.lessons || []).map((lesson) => ({
      ...lesson,
      courseTitle: course.title,
      courseOrder: courseIndex,
    }));
  }));

  return lessonsByCourse.flat().sort((left, right) =>
    left.courseOrder - right.courseOrder
    || Number(left.order || 0) - Number(right.order || 0)
    || String(left._id).localeCompare(String(right._id)),
  );
}

async function loadChapters(topic, lessons) {
  const vocabulary = await loadAllStudentVocabulary({ topic });
  const wordsByLesson = new Map();
  vocabulary.forEach((word) => {
    const lessonId = String(word.lesson?._id || word.lesson || '');
    if (!lessonId) return;
    const words = wordsByLesson.get(lessonId) || [];
    words.push(word);
    wordsByLesson.set(lessonId, words);
  });

  return lessons
    .filter((lesson) => lesson.topic === topic)
    .map((lesson, index) => {
      const chapterLabel = getChapterLabel({ ...lesson, order: index + 1 }, index);
      const lessonDetail = chapterLabel.subtitle
        .replace(lesson.courseTitle || '', '')
        .replace(/^\s*[-–—:|]+\s*/, '')
        .trim();
      return {
        ...lesson,
        chapterTitle: chapterLabel.title,
        chapterSubtitle: [lesson.courseTitle, lessonDetail].filter(Boolean).join(' · '),
        words: sortLessonVocabulary(wordsByLesson.get(String(lesson._id)) || []),
      };
    })
    .filter((chapter) => chapter.words.length > 0);
}

export async function loadToeicVocabularyBooks(books) {
  const lessons = await loadPublishedToeicLessons();
  return Promise.all(books.map(async (book) => ({
    ...book,
    chapters: await loadChapters(book.topic, lessons),
  })));
}

export async function loadToeicVocabularyBook(topic) {
  const [lessons, vocabulary] = await Promise.all([
    loadPublishedToeicLessons(),
    loadAllStudentVocabulary({ topic }),
  ]);
  const wordsByLesson = new Map();
  vocabulary.forEach((word) => {
    const lessonId = String(word.lesson?._id || word.lesson || '');
    if (!lessonId) return;
    const words = wordsByLesson.get(lessonId) || [];
    words.push(word);
    wordsByLesson.set(lessonId, words);
  });

  return lessons
    .filter((lesson) => lesson.topic === topic)
    .map((lesson, index) => {
      const chapterLabel = getChapterLabel({ ...lesson, order: index + 1 }, index);
      const lessonDetail = chapterLabel.subtitle
        .replace(lesson.courseTitle || '', '')
        .replace(/^\s*[-–—:|]+\s*/, '')
        .trim();
      return {
        lesson,
        chapterTitle: chapterLabel.title,
        chapterSubtitle: [lesson.courseTitle, lessonDetail].filter(Boolean).join(' · '),
        words: sortLessonVocabulary(wordsByLesson.get(String(lesson._id)) || []),
      };
    })
    .filter((chapter) => chapter.words.length > 0);
}
