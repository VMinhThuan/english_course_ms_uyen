import LearningProgress from '../models/LearningProgress.js';
import Lesson from '../models/Lesson.js';
import Enrollment from '../models/Enrollment.js';
import { recalculateCourseProgress } from '../utils/progressHelper.js';

// @desc    Access lesson (initialize/update lesson progress)
// @route   POST /api/v1/progress/access
// @access  Private (Active Student)
export const accessLesson = async (req, res, next) => {
  try {
    const { lessonId, lesson: lessonParam } = req.body;
    const targetLessonId = lessonId || lessonParam;

    if (!targetLessonId) {
      return res.status(400).json({
        status: 'error',
        message: 'Lesson ID is required',
      });
    }

    // Validate referenced lesson exists
    const lessonDoc = await Lesson.findById(targetLessonId);
    if (!lessonDoc) {
      return res.status(404).json({
        status: 'error',
        message: 'Referenced lesson does not exist',
      });
    }

    // Security Gate: Students cannot access non-published lessons
    if (req.user && req.user.role === 'student' && lessonDoc.status !== 'published') {
      return res.status(404).json({
        status: 'error',
        message: 'Lesson not found',
      });
    }

    // Authenticated student identity & course derived strictly from Backend
    const studentId = req.user._id;
    const courseId = lessonDoc.course;

    let record = await LearningProgress.findOne({ student: studentId, lesson: targetLessonId });

    if (record) {
      // Prompt Rule 2: Prevent Completed Lesson Regression
      if (record.status === 'completed' && record.progress === 100) {
        // Keep status completed and progress 100, update only lastAccessedAt
        record.lastAccessedAt = new Date();
        await record.save();
      } else {
        // Change not_started -> in_progress
        record.status = 'in_progress';
        record.lastAccessedAt = new Date();
        if (!record.startedAt) {
          record.startedAt = new Date();
        }
        await record.save();
      }
    } else {
      // Create new in_progress record
      record = await LearningProgress.create({
        student: studentId,
        lesson: targetLessonId,
        course: courseId,
        status: 'in_progress',
        progress: 0,
        startedAt: new Date(),
        lastAccessedAt: new Date(),
      });
    }

    res.json({
      status: 'success',
      data: {
        progress: record,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Mark lesson complete
// @route   POST /api/v1/progress/complete
// @access  Private (Active Student)
export const completeLesson = async (req, res, next) => {
  try {
    const { lessonId, lesson: lessonParam } = req.body;
    const targetLessonId = lessonId || lessonParam;

    if (!targetLessonId) {
      return res.status(400).json({
        status: 'error',
        message: 'Lesson ID is required',
      });
    }

    const lessonDoc = await Lesson.findById(targetLessonId);
    if (!lessonDoc) {
      return res.status(404).json({
        status: 'error',
        message: 'Referenced lesson does not exist',
      });
    }

    if (req.user && req.user.role === 'student' && lessonDoc.status !== 'published') {
      return res.status(404).json({
        status: 'error',
        message: 'Lesson not found',
      });
    }

    const studentId = req.user._id;
    const courseId = lessonDoc.course;

    let record = await LearningProgress.findOne({ student: studentId, lesson: targetLessonId });

    if (record) {
      record.status = 'completed';
      record.progress = 100;
      if (!record.completedAt) record.completedAt = new Date();
      record.lastAccessedAt = new Date();
      await record.save();
    } else {
      record = await LearningProgress.create({
        student: studentId,
        lesson: targetLessonId,
        course: courseId,
        status: 'completed',
        progress: 100,
        startedAt: new Date(),
        completedAt: new Date(),
        lastAccessedAt: new Date(),
      });
    }

    // Recalculate Enrollment.progress for overall course
    const courseProgress = await recalculateCourseProgress(studentId, courseId);

    res.json({
      status: 'success',
      message: 'Lesson marked as completed',
      data: {
        progress: record,
        courseProgress,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Admin get calculated student progress statistics from MongoDB
// @route   GET /api/v1/admin/students/:studentId/progress
// @access  Private (Admin/Teacher)
export const getAdminStudentProgress = async (req, res, next) => {
  try {
    const { studentId } = req.params;
    const { courseId } = req.query;

    const lessonFilter = { status: 'published' };
    if (courseId) lessonFilter.course = courseId;

    const publishedLessons = await Lesson.find(lessonFilter)
      .populate('course', 'title')
      .sort({ order: 1 });

    const totalLessons = publishedLessons.length;
    const lessonIds = publishedLessons.map((l) => l._id);

    const progressRecords = await LearningProgress.find({
      student: studentId,
      lesson: { $in: lessonIds },
    });

    const progressMap = new Map();
    let maxActivity = null;

    progressRecords.forEach((rec) => {
      progressMap.set(rec.lesson.toString(), rec);
      if (rec.lastAccessedAt) {
        if (!maxActivity || rec.lastAccessedAt > maxActivity) {
          maxActivity = rec.lastAccessedAt;
        }
      }
    });

    let completedLessons = 0;
    let inProgressLessons = 0;
    let notStartedLessons = 0;

    const lessonsDetail = publishedLessons.map((l) => {
      const rec = progressMap.get(l._id.toString());
      let lStatus = 'not_started';
      let lProgress = 0;
      let completedAt = null;
      let lastAccessedAt = null;

      if (rec) {
        lStatus = rec.status;
        lProgress = rec.progress;
        completedAt = rec.completedAt;
        lastAccessedAt = rec.lastAccessedAt;
      }

      if (lStatus === 'completed') completedLessons++;
      else if (lStatus === 'in_progress') inProgressLessons++;
      else notStartedLessons++;

      return {
        _id: l._id,
        title: l.title,
        course: l.course,
        status: lStatus,
        progress: lProgress,
        completedAt,
        lastAccessedAt,
      };
    });

    const completionPercentage =
      totalLessons > 0 ? Math.min(100, Math.max(0, Math.round((completedLessons / totalLessons) * 100))) : 0;

    res.json({
      status: 'success',
      data: {
        totalLessons,
        completedLessons,
        inProgressLessons,
        notStartedLessons,
        completionPercentage,
        lastLearningActivity: maxActivity,
        lessons: lessonsDetail,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get Student Dashboard aggregated data from real MongoDB
// @route   GET /api/v1/progress/student-dashboard
// @access  Private (Active Student)
export const getStudentDashboard = async (req, res, next) => {
  try {
    const studentId = req.user._id;

    // Published lessons
    const publishedLessons = await Lesson.find({ status: 'published' })
      .populate('course', 'title')
      .sort({ order: 1, createdAt: -1 });

    const totalAvailableLessons = publishedLessons.length;
    const publishedLessonIds = publishedLessons.map((l) => l._id);

    // Student's progress records
    const progressRecords = await LearningProgress.find({
      student: studentId,
      lesson: { $in: publishedLessonIds },
    });

    const progressMap = new Map();
    let completedCount = 0;
    let inProgressCount = 0;

    progressRecords.forEach((rec) => {
      progressMap.set(rec.lesson.toString(), rec);
      if (rec.status === 'completed') completedCount++;
      else if (rec.status === 'in_progress') inProgressCount++;
    });

    const overallProgress =
      totalAvailableLessons > 0
        ? Math.min(100, Math.max(0, Math.round((completedCount / totalAvailableLessons) * 100)))
        : 0;

    // Continue learning lesson: find most recently accessed in_progress or not_started published lesson
    let continueLearningLesson = null;
    const sortedRecords = progressRecords
      .filter((r) => r.status === 'in_progress')
      .sort((a, b) => new Date(b.lastAccessedAt || b.updatedAt) - new Date(a.lastAccessedAt || a.updatedAt));

    if (sortedRecords.length > 0) {
      const foundLesson = publishedLessons.find((l) => l._id.toString() === sortedRecords[0].lesson.toString());
      if (foundLesson) {
        continueLearningLesson = {
          _id: foundLesson._id,
          title: foundLesson.title,
          description: foundLesson.description,
          course: foundLesson.course,
          status: 'in_progress',
          progress: sortedRecords[0].progress || 0,
        };
      }
    }

    if (!continueLearningLesson && publishedLessons.length > 0) {
      // Pick first uncompleted lesson
      const firstUncompleted = publishedLessons.find((l) => {
        const rec = progressMap.get(l._id.toString());
        return !rec || rec.status !== 'completed';
      });
      if (firstUncompleted) {
        const rec = progressMap.get(firstUncompleted._id.toString());
        continueLearningLesson = {
          _id: firstUncompleted._id,
          title: firstUncompleted.title,
          description: firstUncompleted.description,
          course: firstUncompleted.course,
          status: rec ? rec.status : 'not_started',
          progress: rec ? rec.progress : 0,
        };
      }
    }

    // Recent published lessons (up to 5)
    const recentLessons = publishedLessons.slice(0, 5).map((l) => {
      const rec = progressMap.get(l._id.toString());
      return {
        _id: l._id,
        title: l.title,
        description: l.description,
        course: l.course,
        status: rec ? rec.status : 'not_started',
        progress: rec ? rec.progress : 0,
      };
    });

    // Dynamically import Assessment and Attempt if needed or use mongoose models
    const Assessment = (await import('../models/Assessment.js')).default;
    const Attempt = (await import('../models/Attempt.js')).default;

    const availableAssessments = await Assessment.find({ status: 'published' })
      .select('title type duration minutes attemptLimit passScore questions')
      .sort({ createdAt: -1 })
      .limit(5);

    const recentAttemptDocs = await Attempt.find({ student: studentId, status: 'submitted' })
      .populate('assessment', 'title type passScore totalScore')
      .sort({ submittedAt: -1 })
      .limit(5);
    const recentResults = recentAttemptDocs.map((attempt) => {
      const scorePercentage = attempt.maxScore > 0 ? Math.round((attempt.score / attempt.maxScore) * 100) : 0;
      const passScore = Number.isFinite(Number(attempt.passScore)) ? Number(attempt.passScore) : Number(attempt.assessment?.passScore || 0);
      return {
        ...attempt.toObject(),
        scorePercentage: attempt.scorePercentage ?? scorePercentage,
        passScore,
        passed: typeof attempt.passed === 'boolean' ? attempt.passed : scorePercentage >= passScore,
      };
    });

    res.json({
      status: 'success',
      data: {
        studentName: req.user.fullName || req.user.email,
        totalAvailableLessons,
        completedLessons: completedCount,
        inProgressLessons: inProgressCount,
        overallProgress,
        continueLearningLesson,
        recentLessons,
        availableAssessments,
        recentResults,
      },
    });
  } catch (error) {
    next(error);
  }
};
