import Lesson from '../models/Lesson.js';
import LearningProgress from '../models/LearningProgress.js';
import Enrollment from '../models/Enrollment.js';

/**
 * Recalculates and updates Enrollment.progress for a student in a course based strictly on published lessons.
 * Formula: Math.round((completedPublishedLessons / totalPublishedLessons) * 100)
 * Clamped between 0 and 100.
 */
export const recalculateCourseProgress = async (studentId, courseId) => {
  const publishedLessons = await Lesson.find({ course: courseId, status: 'published' }).select('_id');
  const totalPublishedLessons = publishedLessons.length;

  if (totalPublishedLessons === 0) {
    await Enrollment.findOneAndUpdate(
      { student: studentId, course: courseId },
      { progress: 0 },
      { new: true }
    );
    return 0;
  }

  const publishedLessonIds = publishedLessons.map((l) => l._id);
  const completedCount = await LearningProgress.countDocuments({
    student: studentId,
    course: courseId,
    lesson: { $in: publishedLessonIds },
    status: 'completed',
  });

  const rawPercentage = (completedCount / totalPublishedLessons) * 100;
  const progressPercentage = Math.min(100, Math.max(0, Math.round(rawPercentage)));

  await Enrollment.findOneAndUpdate(
    { student: studentId, course: courseId },
    { progress: progressPercentage },
    { new: true }
  );

  return progressPercentage;
};
