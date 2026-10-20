import mongoose from 'mongoose';
import LearningProgress from '../models/LearningProgress.js';
import Lesson from '../models/Lesson.js';
import Enrollment from '../models/Enrollment.js';
import Course from '../models/Course.js';
import Material from '../models/Material.js';
import User from '../models/User.js';
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
    const { studentId: rawStudentId } = req.params;
    if (!/^[\da-f]{24}$/i.test(rawStudentId)) {
      return res.status(400).json({ status: 'error', code: 'INVALID_STUDENT_ID', message: 'Mã học viên không hợp lệ.' });
    }
    const studentId = new mongoose.Types.ObjectId(rawStudentId);
    const student = await User.exists({ _id: studentId, role: 'student' });
    if (!student) return res.status(404).json({ status: 'error', code: 'STUDENT_NOT_FOUND', message: 'Không tìm thấy thông tin học viên.' });

    const parsePage = (value, fallback, max = 1000000) => {
      if (value === undefined || value === '') return fallback;
      if (!/^[0-9]+$/.test(String(value))) return null;
      const parsed = Number(value);
      return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= max ? parsed : null;
    };
    const lessonPage = parsePage(req.query.page, 1);
    const lessonLimit = parsePage(req.query.limit, 20, 100);
    const coursePage = parsePage(req.query.coursePage, 1);
    const courseLimit = parsePage(req.query.courseLimit, 20, 100);
    if ([lessonPage, lessonLimit, coursePage, courseLimit].some((value) => value === null)) {
      return res.status(400).json({ status: 'error', code: 'INVALID_PAGINATION', message: 'Trang hoặc số dòng mỗi trang không hợp lệ.' });
    }
    if (req.query.courseId && !/^[\da-f]{24}$/i.test(String(req.query.courseId))) {
      return res.status(400).json({ status: 'error', code: 'INVALID_COURSE_ID', message: 'Mã khóa học không hợp lệ.' });
    }

    const enrollments = await Enrollment.find({ student: studentId }).select('course enrolledAt').lean();
    const enrolledCourseIds = enrollments.map((item) => item.course).filter(Boolean);
    const legacyCourseIds = await Course.distinct('_id', { students: studentId });
    const allCourseIds = [...new Map([...enrolledCourseIds, ...legacyCourseIds].map((id) => [String(id), id])).values()];
    const enrollmentByCourse = new Map(enrollments.map((item) => [String(item.course), item]));
    const courses = allCourseIds.length
      ? await Course.find({ _id: { $in: allCourseIds } }).select('_id title isPublished updatedAt').lean()
      : [];
    const courseById = new Map(courses.map((course) => [String(course._id), course]));
    const availableCourseIds = allCourseIds.filter((id) => courseById.has(String(id)));
    const requestedCourseId = req.query.courseId ? new mongoose.Types.ObjectId(String(req.query.courseId)) : null;
    const scopedCourseIds = requestedCourseId
      ? availableCourseIds.filter((id) => String(id) === String(requestedCourseId))
      : availableCourseIds;

    const courseStats = availableCourseIds.length ? await Lesson.aggregate([
      { $match: { course: { $in: availableCourseIds }, status: 'published' } },
      {
        $lookup: {
          from: LearningProgress.collection.name,
          let: { lessonId: '$_id' },
          pipeline: [
            { $match: { $expr: { $and: [{ $eq: ['$lesson', '$$lessonId'] }, { $eq: ['$student', studentId] }] } } },
            { $project: { status: 1, progress: 1, completedAt: 1, lastAccessedAt: 1, startedAt: 1 } },
          ],
          as: '__studentProgress',
        },
      },
      { $set: { __progress: { $arrayElemAt: ['$__studentProgress', 0] } } },
      {
        $group: {
          _id: '$course',
          totalLessons: { $sum: 1 },
          completedLessons: { $sum: { $cond: [{ $eq: ['$__progress.status', 'completed'] }, 1, 0] } },
          inProgressLessons: { $sum: { $cond: [{ $eq: ['$__progress.status', 'in_progress'] }, 1, 0] } },
          lastLearningActivity: { $max: '$__progress.lastAccessedAt' },
        },
      },
    ]).allowDiskUse(true) : [];
    const statsByCourse = new Map(courseStats.map((item) => [String(item._id), item]));
    const courseRows = availableCourseIds.map((id) => {
      const course = courseById.get(String(id));
      const stats = statsByCourse.get(String(id)) || { totalLessons: 0, completedLessons: 0, inProgressLessons: 0, lastLearningActivity: null };
      const totalLessons = stats.totalLessons || 0;
      const completedLessons = stats.completedLessons || 0;
      const inProgressLessons = stats.inProgressLessons || 0;
      return {
        _id: course._id,
        title: course.title,
        isPublished: course.isPublished,
        enrolledAt: enrollmentByCourse.get(String(id))?.enrolledAt || null,
        totalLessons,
        completedLessons,
        inProgressLessons,
        notStartedLessons: Math.max(0, totalLessons - completedLessons - inProgressLessons),
        completionPercentage: totalLessons ? Math.round((completedLessons / totalLessons) * 100) : 0,
        lastLearningActivity: stats.lastLearningActivity || null,
      };
    }).sort((a, b) => String(a.title).localeCompare(String(b.title), 'vi') || String(a._id).localeCompare(String(b._id)));

    const summaryRows = courseRows.filter((course) => scopedCourseIds.some((id) => String(id) === String(course._id)));
    const totalLessons = summaryRows.reduce((sum, item) => sum + item.totalLessons, 0);
    const completedLessons = summaryRows.reduce((sum, item) => sum + item.completedLessons, 0);
    const inProgressLessons = summaryRows.reduce((sum, item) => sum + item.inProgressLessons, 0);
    const notStartedLessons = Math.max(0, totalLessons - completedLessons - inProgressLessons);
    const lastLearningActivity = summaryRows.reduce((latest, item) => item.lastLearningActivity && (!latest || item.lastLearningActivity > latest) ? item.lastLearningActivity : latest, null);
    const completionPercentage = totalLessons ? Math.round((completedLessons / totalLessons) * 100) : 0;

    const courseTotal = courseRows.length;
    const coursePageRows = courseRows.slice((coursePage - 1) * courseLimit, coursePage * courseLimit);
    const lessonFilter = { course: { $in: scopedCourseIds }, status: 'published' };
    const [lessonDocs, lessonTotal] = await Promise.all([
      Lesson.find(lessonFilter)
        .select('_id title course order createdAt updatedAt')
        .sort({ course: 1, order: 1, _id: 1 })
        .skip((lessonPage - 1) * lessonLimit)
        .limit(lessonLimit)
        .lean(),
      Lesson.countDocuments(lessonFilter),
    ]);
    const lessonIds = lessonDocs.map((lesson) => lesson._id);
    const progressRows = lessonIds.length ? await LearningProgress.find({ student: studentId, lesson: { $in: lessonIds } })
      .select('lesson status progress startedAt completedAt lastAccessedAt')
      .lean() : [];
    const progressByLesson = new Map(progressRows.map((row) => [String(row.lesson), row]));
    const lessonRows = lessonDocs.map((lesson) => {
      const record = progressByLesson.get(String(lesson._id));
      const course = courseById.get(String(lesson.course));
      return {
        _id: lesson._id,
        title: lesson.title,
        order: lesson.order,
        course: course ? { _id: course._id, title: course.title } : null,
        status: record?.status || 'not_started',
        progress: record?.progress ?? 0,
        startedAt: record?.startedAt || null,
        completedAt: record?.completedAt || null,
        lastAccessedAt: record?.lastAccessedAt || null,
      };
    });

    return res.json({
      status: 'success',
      data: {
        courseCount: availableCourseIds.length,
        totalCourses: availableCourseIds.length,
        totalLessons,
        completedLessons,
        inProgressLessons,
        notStartedLessons,
        completionPercentage,
        lastLearningActivity,
        courses: coursePageRows,
        coursePagination: { page: coursePage, limit: courseLimit, total: courseTotal, pages: Math.ceil(courseTotal / courseLimit) },
        lessons: lessonRows,
        lessonPagination: { page: lessonPage, limit: lessonLimit, total: lessonTotal, pages: Math.ceil(lessonTotal / lessonLimit) },
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

    // Recently updated published lessons (up to 5)
    const recentLessons = [...publishedLessons]
      .sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt))
      .slice(0, 5)
      .map((l) => {
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

    const recentMaterials = await Material.find({
      lesson: { $in: publishedLessonIds },
      status: 'published',
    })
      .select('title description fileType fileSize lesson createdAt updatedAt')
      .populate({ path: 'lesson', select: 'title course', populate: { path: 'course', select: 'title' } })
      .sort({ updatedAt: -1, createdAt: -1 })
      .limit(5)
      .lean();

    // Dynamically import Assessment and Attempt if needed or use mongoose models
    const Assessment = (await import('../models/Assessment.js')).default;
    const Attempt = (await import('../models/Attempt.js')).default;
    const now = new Date();

    const availableAssessments = await Assessment.find({
      status: 'published',
      $and: [
        { $or: [{ availableFrom: { $exists: false } }, { availableFrom: null }, { availableFrom: { $lte: now } }] },
        { $or: [{ availableUntil: { $exists: false } }, { availableUntil: null }, { availableUntil: { $gte: now } }] },
      ],
    })
      .select('title description type duration durationMinutes minutes attemptLimit passScore questions availableFrom availableUntil')
      .sort({ createdAt: -1 })
      .limit(5);

    const availableAssessmentIds = availableAssessments.map((assessment) => assessment._id);
    const submittedAssessmentCounts = availableAssessmentIds.length
      ? await Attempt.aggregate([
        { $match: { student: studentId, assessment: { $in: availableAssessmentIds }, status: { $in: ['submitted', 'completed'] } } },
        { $group: { _id: '$assessment', count: { $sum: 1 } } },
      ])
      : [];
    const submittedAttemptCounts = new Map(submittedAssessmentCounts.map(({ _id, count }) => [_id.toString(), count]));
    const taskAssessments = availableAssessments.map((assessment) => ({
      ...assessment.toObject(),
      submittedAttemptCount: submittedAttemptCounts.get(assessment._id.toString()) || 0,
    }));

    const recentAttemptDocs = await Attempt.find({ student: studentId, status: 'submitted' })
      .populate('assessment', 'title type passScore totalScore')
      .sort({ submittedAt: -1 })
      .limit(5);
    const recentResults = recentAttemptDocs.map((attempt) => {
      const scorePercentage = attempt.maxScore > 0 ? Math.round((attempt.score / attempt.maxScore) * 100) : 0;
      const passScore = Number.isFinite(Number(attempt.passScore)) ? Number(attempt.passScore) : Number(attempt.assessment?.passScore || 0);
      return {
        ...attempt.toObject(),
        totalScore: Number.isFinite(Number(attempt.maxScore)) ? Number(attempt.maxScore) : Number(attempt.assessment?.totalScore || 0),
        scorePercentage: attempt.scorePercentage ?? scorePercentage,
        passScore,
        passed: typeof attempt.passed === 'boolean' ? attempt.passed : scorePercentage >= passScore,
      };
    });

    res.json({
      status: 'success',
      data: {
        studentName: req.user.fullName || req.user.email,
        studentAvatar: typeof req.user.avatar === 'string' ? req.user.avatar : '',
        totalAvailableLessons,
        completedLessons: completedCount,
        inProgressLessons: inProgressCount,
        overallProgress,
        continueLearningLesson,
        recentLessons,
        recentMaterials,
        availableAssessments: taskAssessments,
        recentResults,
      },
    });
  } catch (error) {
    next(error);
  }
};
