import mongoose from 'mongoose';
import User from '../models/User.js';
import Course from '../models/Course.js';
import Lesson from '../models/Lesson.js';
import Enrollment from '../models/Enrollment.js';
import LearningProgress from '../models/LearningProgress.js';
import LearningSession from '../models/LearningSession.js';
import LearningActivity from '../models/LearningActivity.js';
import Attempt from '../models/Attempt.js';

const isObjectId = (value) => typeof value === 'string' && /^[\da-f]{24}$/i.test(value);
const toObjectId = (value) => new mongoose.Types.ObjectId(value);

const foldSearchText = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

const parseInteger = (value, fallback, { min = 1, max = 100 } = {}) => {
  if (value === undefined || value === '') return fallback;
  if (!/^[0-9]+$/.test(String(value))) return null;
  const num = Number(value);
  return Number.isSafeInteger(num) && num >= min && num <= max ? num : null;
};

/**
 * @desc    Get overall learning monitoring dashboard metrics
 * @route   GET /api/v1/admin/learning/overview
 * @access  Private (Admin/Teacher)
 */
export const getLearningOverview = async (req, res, next) => {
  try {
    const studentFilter = { role: 'student', status: { $ne: 'rejected' } };
    const [totalStudents, totalCourses] = await Promise.all([
      User.countDocuments(studentFilter),
      Course.countDocuments({ isPublished: true }),
    ]);

    // Active learners: students who have at least one in_progress or completed lesson, or active session
    const [progressStudentIds, sessionStudentIds] = await Promise.all([
      LearningProgress.distinct('student', {
        $or: [
          { status: { $in: ['in_progress', 'completed'] } },
          { totalActiveSeconds: { $gt: 0 } },
          { visitCount: { $gt: 0 } },
        ],
      }),
      LearningSession.distinct('student', { accumulatedActiveSeconds: { $gt: 0 } }),
    ]);

    const activeLearnerSet = new Set([
      ...progressStudentIds.map(String),
      ...sessionStudentIds.map(String),
    ]);
    const activeLearners = activeLearnerSet.size;
    const notStartedStudents = Math.max(0, totalStudents - activeLearners);

    // Sum of all active learning time from LearningSession & LearningProgress
    const [sessionTimeAgg, progressTimeAgg] = await Promise.all([
      LearningSession.aggregate([
        { $group: { _id: null, totalSeconds: { $sum: '$accumulatedActiveSeconds' } } },
      ]),
      LearningProgress.aggregate([
        { $group: { _id: null, totalSeconds: { $sum: '$totalActiveSeconds' } } },
      ]),
    ]);

    const sessionTotalSeconds = sessionTimeAgg[0]?.totalSeconds || 0;
    const progressTotalSeconds = progressTimeAgg[0]?.totalSeconds || 0;
    const totalLearningSeconds = Math.max(sessionTotalSeconds, progressTotalSeconds);

    // Average course completion percentage from Enrollment
    const enrollmentAgg = await Enrollment.aggregate([
      {
        $group: {
          _id: null,
          avgProgress: { $avg: '$progress' },
          completedEnrollments: { $sum: { $cond: [{ $gte: ['$progress', 100] }, 1, 0] } },
          totalEnrollments: { $sum: 1 },
        },
      },
    ]);

    const avgProgress = enrollmentAgg[0]?.avgProgress || 0;
    const averageCompletionPercentage = Math.round(avgProgress);

    // Students who completed all learning: either completed course activity or 100% progress
    const completedStudentsAgg = await Enrollment.aggregate([
      {
        $group: {
          _id: '$student',
          minProgress: { $min: '$progress' },
          courseCount: { $sum: 1 },
        },
      },
      {
        $match: {
          courseCount: { $gt: 0 },
          minProgress: { $gte: 100 },
        },
      },
      { $count: 'total' },
    ]);
    const completedStudents = completedStudentsAgg[0]?.total || 0;

    return res.json({
      status: 'success',
      data: {
        totalStudents,
        activeLearners,
        notStartedStudents,
        completedStudents,
        totalLearningSeconds,
        averageCompletionPercentage,
        totalCourses,
      },
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * @desc    Get paginated students list with learning progress and duration
 * @route   GET /api/v1/admin/learning/students
 * @access  Private (Admin/Teacher)
 */
export const getLearningStudents = async (req, res, next) => {
  try {
    const page = parseInteger(req.query.page, 1, { min: 1, max: 1000000 });
    const limit = parseInteger(req.query.limit, 20, { min: 1, max: 100 });
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const courseId = isObjectId(String(req.query.courseId)) ? toObjectId(String(req.query.courseId)) : null;
    const statusFilter = String(req.query.status || 'all').toLowerCase(); // all, not_started, in_progress, completed
    const sort = String(req.query.sort || 'active_desc').toLowerCase();

    if (page === null || limit === null) {
      return res.status(400).json({
        status: 'error',
        code: 'INVALID_PAGINATION',
        message: 'Trang hoặc số dòng mỗi trang không hợp lệ.',
      });
    }

    // Build base user query for students
    const userFilter = { role: 'student', status: { $ne: 'rejected' } };
    if (search) {
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      userFilter.$or = [
        { fullName: { $regex: escaped, $options: 'i' } },
        { email: { $regex: escaped, $options: 'i' } },
        { username: { $regex: escaped, $options: 'i' } },
        { groupName: { $regex: escaped, $options: 'i' } },
      ];
    }

    let candidateStudents = await User.find(userFilter)
      .select('_id fullName email username phoneNumber groupName avatar createdAt status')
      .lean();

    if (candidateStudents.length === 0) {
      return res.json({
        status: 'success',
        data: {
          students: [],
          pagination: { page, limit, total: 0, pages: 0 },
        },
      });
    }

    const studentIds = candidateStudents.map((s) => s._id);

    // Fetch enrollments
    const enrollmentFilter = { student: { $in: studentIds } };
    if (courseId) {
      enrollmentFilter.course = courseId;
    }

    const [enrollments, publishedCourses, publishedLessons] = await Promise.all([
      Enrollment.find(enrollmentFilter).populate('course', 'title isPublished').lean(),
      Course.find({ isPublished: true }).select('_id title students').lean(),
      Lesson.find({ status: 'published' }).select('_id course order').lean(),
    ]);

    // Map courses by ID
    const courseMap = new Map(publishedCourses.map((c) => [String(c._id), c]));

    // Map published lessons per course
    const lessonsByCourse = new Map();
    publishedLessons.forEach((lesson) => {
      const cId = String(lesson.course);
      if (!lessonsByCourse.has(cId)) lessonsByCourse.set(cId, []);
      lessonsByCourse.get(cId).push(lesson);
    });

    // Map enrolled courses for each student
    const enrolledCoursesByStudent = new Map();
    enrollments.forEach((enr) => {
      const sId = String(enr.student);
      if (!enrolledCoursesByStudent.has(sId)) enrolledCoursesByStudent.set(sId, []);
      if (enr.course) {
        enrolledCoursesByStudent.get(sId).push({
          _id: enr.course._id,
          title: enr.course.title,
          progress: enr.progress || 0,
          enrolledAt: enr.enrolledAt || enr.createdAt,
        });
      }
    });

    // Also consider legacy Course.students array
    publishedCourses.forEach((c) => {
      if (Array.isArray(c.students)) {
        c.students.forEach((sRef) => {
          const sId = String(sRef);
          if (studentIds.some((id) => String(id) === sId)) {
            if (!enrolledCoursesByStudent.has(sId)) enrolledCoursesByStudent.set(sId, []);
            const existing = enrolledCoursesByStudent.get(sId);
            if (!existing.some((e) => String(e._id) === String(c._id))) {
              existing.push({
                _id: c._id,
                title: c.title,
                progress: 0,
                enrolledAt: null,
              });
            }
          }
        });
      }
    });

    // If courseId filter is active, retain only students enrolled in this course
    if (courseId) {
      const courseIdStr = String(courseId);
      candidateStudents = candidateStudents.filter((s) => {
        const studentCourses = enrolledCoursesByStudent.get(String(s._id)) || [];
        return studentCourses.some((c) => String(c._id) === courseIdStr);
      });
    }

    if (candidateStudents.length === 0) {
      return res.json({
        status: 'success',
        data: {
          students: [],
          pagination: { page, limit, total: 0, pages: 0 },
        },
      });
    }

    const filteredStudentIds = candidateStudents.map((s) => s._id);

    // Aggregate LearningProgress for these students
    const progressDocs = await LearningProgress.find({
      student: { $in: filteredStudentIds },
    }).lean();

    const progressByStudent = new Map();
    progressDocs.forEach((p) => {
      const sId = String(p.student);
      if (!progressByStudent.has(sId)) progressByStudent.set(sId, []);
      progressByStudent.get(sId).push(p);
    });

    // Aggregate LearningSession active seconds for these students
    const sessionTimeByStudent = await LearningSession.aggregate([
      { $match: { student: { $in: filteredStudentIds } } },
      {
        $group: {
          _id: '$student',
          totalSessionSeconds: { $sum: '$accumulatedActiveSeconds' },
          latestSessionHb: { $max: '$lastHeartbeatAt' },
        },
      },
    ]);
    const sessionMap = new Map(sessionTimeByStudent.map((s) => [String(s._id), s]));

    // Construct detailed student learning rows
    let rows = candidateStudents.map((student) => {
      const sId = String(student._id);
      const studentCourses = enrolledCoursesByStudent.get(sId) || [];
      const userProgress = progressByStudent.get(sId) || [];
      const userSession = sessionMap.get(sId);

      // Compute total published lessons across enrolled courses
      const enrolledCourseIdSet = new Set(studentCourses.map((c) => String(c._id)));
      let totalLessons = 0;
      enrolledCourseIdSet.forEach((cId) => {
        totalLessons += (lessonsByCourse.get(cId) || []).length;
      });

      // Count completed & in-progress lessons from published lessons only
      let completedLessons = 0;
      let inProgressLessons = 0;
      let maxLastAccessed = null;
      let progressSeconds = 0;

      userProgress.forEach((p) => {
        progressSeconds += p.totalActiveSeconds || 0;
        if (p.lastAccessedAt && (!maxLastAccessed || new Date(p.lastAccessedAt) > maxLastAccessed)) {
          maxLastAccessed = new Date(p.lastAccessedAt);
        }
        if (p.status === 'completed') completedLessons++;
        else if (p.status === 'in_progress') inProgressLessons++;
      });

      if (userSession?.latestSessionHb && (!maxLastAccessed || new Date(userSession.latestSessionHb) > maxLastAccessed)) {
        maxLastAccessed = new Date(userSession.latestSessionHb);
      }

      const sessionSeconds = userSession?.totalSessionSeconds || 0;
      const totalLearningSeconds = Math.max(sessionSeconds, progressSeconds);

      const progressPercentage = totalLessons > 0
        ? Math.min(100, Math.round((completedLessons / totalLessons) * 100))
        : 0;

      let learningStatus = 'NOT_STARTED';
      if (totalLessons > 0 && completedLessons >= totalLessons) {
        learningStatus = 'COMPLETED';
      } else if (completedLessons > 0 || inProgressLessons > 0 || totalLearningSeconds > 0) {
        learningStatus = 'IN_PROGRESS';
      }

      return {
        _id: student._id,
        fullName: student.fullName || student.username || student.email,
        email: student.email,
        username: student.username || '',
        avatar: student.avatar || '',
        phoneNumber: student.phoneNumber || '',
        groupName: student.groupName || '',
        createdAt: student.createdAt,
        enrolledCourses: studentCourses.map((c) => ({ _id: c._id, title: c.title })),
        lastActiveTime: maxLastAccessed,
        totalLearningSeconds,
        completedLessons,
        totalLessons,
        progressPercentage,
        learningStatus,
      };
    });

    // Apply status filter
    if (statusFilter && statusFilter !== 'all') {
      const upperStatus = statusFilter.toUpperCase();
      rows = rows.filter((r) => r.learningStatus === upperStatus);
    }

    // Apply sort
    if (sort === 'name_asc') {
      rows.sort((a, b) => a.fullName.localeCompare(b.fullName, 'vi'));
    } else if (sort === 'name_desc') {
      rows.sort((a, b) => b.fullName.localeCompare(a.fullName, 'vi'));
    } else if (sort === 'time_desc') {
      rows.sort((a, b) => (b.totalLearningSeconds || 0) - (a.totalLearningSeconds || 0));
    } else if (sort === 'progress_desc') {
      rows.sort((a, b) => (b.progressPercentage || 0) - (a.progressPercentage || 0));
    } else {
      // active_desc (default): latest lastActiveTime first
      rows.sort((a, b) => {
        const timeA = a.lastActiveTime ? new Date(a.lastActiveTime).getTime() : 0;
        const timeB = b.lastActiveTime ? new Date(b.lastActiveTime).getTime() : 0;
        return timeB - timeA || a.fullName.localeCompare(b.fullName, 'vi');
      });
    }

    const total = rows.length;
    const paginatedRows = rows.slice((page - 1) * limit, page * limit);

    return res.json({
      status: 'success',
      data: {
        students: paginatedRows,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit) || 1,
        },
      },
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * @desc    Get detailed student learning profile and summary
 * @route   GET /api/v1/admin/learning/students/:studentId
 * @access  Private (Admin/Teacher)
 */
export const getLearningStudentDetail = async (req, res, next) => {
  try {
    const { studentId: rawStudentId } = req.params;
    if (!isObjectId(rawStudentId)) {
      return res.status(400).json({
        status: 'error',
        code: 'INVALID_STUDENT_ID',
        message: 'Mã học viên không hợp lệ.',
      });
    }

    const studentId = toObjectId(rawStudentId);
    const student = await User.findOne({ _id: studentId, role: 'student' })
      .select('_id fullName email username phoneNumber groupName avatar createdAt status approvedAt')
      .lean();

    if (!student) {
      return res.status(404).json({
        status: 'error',
        code: 'STUDENT_NOT_FOUND',
        message: 'Không tìm thấy thông tin học viên.',
      });
    }

    // Enrolled courses
    const [enrollments, legacyCourses] = await Promise.all([
      Enrollment.find({ student: studentId }).populate('course', 'title description level englishType isPublished').lean(),
      Course.find({ students: studentId, isPublished: true }).select('title description level englishType isPublished').lean(),
    ]);

    const enrolledCourseMap = new Map();
    enrollments.forEach((enr) => {
      if (enr.course) {
        enrolledCourseMap.set(String(enr.course._id), {
          _id: enr.course._id,
          title: enr.course.title,
          level: enr.course.level,
          englishType: enr.course.englishType,
          progress: enr.progress || 0,
          enrolledAt: enr.enrolledAt || enr.createdAt,
        });
      }
    });

    legacyCourses.forEach((c) => {
      const cId = String(c._id);
      if (!enrolledCourseMap.has(cId)) {
        enrolledCourseMap.set(cId, {
          _id: c._id,
          title: c.title,
          level: c.level,
          englishType: c.englishType,
          progress: 0,
          enrolledAt: null,
        });
      }
    });

    const enrolledCourses = Array.from(enrolledCourseMap.values());
    const courseIds = enrolledCourses.map((c) => c._id);

    // Published lessons in enrolled courses
    const publishedLessons = courseIds.length
      ? await Lesson.find({ course: { $in: courseIds }, status: 'published' }).select('_id course').lean()
      : [];
    const totalLessons = publishedLessons.length;
    const publishedLessonIds = publishedLessons.map((l) => l._id);

    // Progress records
    const progressRecords = publishedLessonIds.length
      ? await LearningProgress.find({ student: studentId, lesson: { $in: publishedLessonIds } }).lean()
      : [];

    let completedLessons = 0;
    let inProgressLessons = 0;
    let progressTotalSeconds = 0;
    let lastActivityTime = null;

    progressRecords.forEach((p) => {
      progressTotalSeconds += p.totalActiveSeconds || 0;
      if (p.status === 'completed') completedLessons++;
      else if (p.status === 'in_progress') inProgressLessons++;
      if (p.lastAccessedAt && (!lastActivityTime || new Date(p.lastAccessedAt) > lastActivityTime)) {
        lastActivityTime = new Date(p.lastAccessedAt);
      }
    });

    const notStartedLessons = Math.max(0, totalLessons - completedLessons - inProgressLessons);
    const overallCompletionPercentage = totalLessons > 0
      ? Math.min(100, Math.round((completedLessons / totalLessons) * 100))
      : 0;

    // Total learning time from sessions
    const sessionTimeAgg = await LearningSession.aggregate([
      { $match: { student: studentId } },
      {
        $group: {
          _id: null,
          totalSeconds: { $sum: '$accumulatedActiveSeconds' },
          lastHeartbeat: { $max: '$lastHeartbeatAt' },
        },
      },
    ]);
    const sessionTotalSeconds = sessionTimeAgg[0]?.totalSeconds || 0;
    if (sessionTimeAgg[0]?.lastHeartbeat && (!lastActivityTime || new Date(sessionTimeAgg[0].lastHeartbeat) > lastActivityTime)) {
      lastActivityTime = new Date(sessionTimeAgg[0].lastHeartbeat);
    }

    const totalLearningSeconds = Math.max(sessionTotalSeconds, progressTotalSeconds);

    return res.json({
      status: 'success',
      data: {
        student: {
          _id: student._id,
          fullName: student.fullName || student.username || student.email,
          email: student.email,
          username: student.username || '',
          phoneNumber: student.phoneNumber || '',
          groupName: student.groupName || '',
          avatar: student.avatar || '',
          status: student.status,
          createdAt: student.createdAt,
          approvedAt: student.approvedAt,
        },
        enrolledCourses,
        lastLearningActivity: lastActivityTime,
        learningOverview: {
          totalLearningSeconds,
          completedLessons,
          inProgressLessons,
          notStartedLessons,
          overallCompletionPercentage,
          totalLessons,
        },
      },
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * @desc    Get student course progress in hierarchy: Course → Chapter → Lesson
 * @route   GET /api/v1/admin/learning/students/:studentId/progress
 * @access  Private (Admin/Teacher)
 */
export const getLearningStudentProgress = async (req, res, next) => {
  try {
    const { studentId: rawStudentId } = req.params;
    if (!isObjectId(rawStudentId)) {
      return res.status(400).json({
        status: 'error',
        code: 'INVALID_STUDENT_ID',
        message: 'Mã học viên không hợp lệ.',
      });
    }

    const studentId = toObjectId(rawStudentId);
    const requestedCourseId = req.query.courseId && isObjectId(String(req.query.courseId))
      ? toObjectId(String(req.query.courseId))
      : null;

    // Fetch enrolled courses
    const [enrollments, legacyCourses] = await Promise.all([
      Enrollment.find({ student: studentId }).populate('course', 'title description level englishType isPublished').lean(),
      Course.find({ students: studentId, isPublished: true }).select('title description level englishType isPublished').lean(),
    ]);

    const enrolledCourseMap = new Map();
    enrollments.forEach((enr) => {
      if (enr.course) {
        enrolledCourseMap.set(String(enr.course._id), enr.course);
      }
    });
    legacyCourses.forEach((c) => {
      const cId = String(c._id);
      if (!enrolledCourseMap.has(cId)) enrolledCourseMap.set(cId, c);
    });

    let targetCourseIds = Array.from(enrolledCourseMap.keys()).map(toObjectId);
    if (requestedCourseId) {
      targetCourseIds = targetCourseIds.filter((id) => String(id) === String(requestedCourseId));
    }

    if (targetCourseIds.length === 0) {
      return res.json({
        status: 'success',
        data: {
          courses: [],
        },
      });
    }

    // Get published lessons for these courses
    const lessons = await Lesson.find({
      course: { $in: targetCourseIds },
      status: 'published',
    })
      .select('_id title description topic chapter duration difficulty order course createdAt')
      .sort({ course: 1, order: 1, _id: 1 })
      .lean();

    const lessonIds = lessons.map((l) => l._id);

    // Fetch progress and session data for these lessons
    const [progressRows, sessionAgg] = await Promise.all([
      LearningProgress.find({ student: studentId, lesson: { $in: lessonIds } }).lean(),
      LearningSession.aggregate([
        { $match: { student: studentId, lesson: { $in: lessonIds } } },
        {
          $group: {
            _id: '$lesson',
            totalSeconds: { $sum: '$accumulatedActiveSeconds' },
            sessionCount: { $sum: 1 },
          },
        },
      ]),
    ]);

    const progressByLesson = new Map(progressRows.map((p) => [String(p.lesson), p]));
    const sessionByLesson = new Map(sessionAgg.map((s) => [String(s._id), s]));

    // Build hierarchy: Course → Chapter → Lesson
    const coursesHierarchy = targetCourseIds.map((cId) => {
      const courseDoc = enrolledCourseMap.get(String(cId));
      const courseLessons = lessons.filter((l) => String(l.course) === String(cId));

      // Group lessons into chapters
      const chapterMap = new Map();

      courseLessons.forEach((lesson) => {
        const chapterName = (lesson.chapter && lesson.chapter.trim())
          || (lesson.topic && lesson.topic.trim())
          || 'Chương chung';

        if (!chapterMap.has(chapterName)) {
          chapterMap.set(chapterName, []);
        }

        const prog = progressByLesson.get(String(lesson._id));
        const sess = sessionByLesson.get(String(lesson._id));

        const rawStatus = (prog?.status || 'not_started').toLowerCase();
        let status = 'NOT_STARTED';
        if (rawStatus === 'completed' || prog?.progress === 100) {
          status = 'COMPLETED';
        } else if (rawStatus === 'in_progress' || (sess?.totalSeconds || 0) > 0 || (prog?.visitCount || 0) > 0) {
          status = 'IN_PROGRESS';
        }

        const activeSec = Math.max(prog?.totalActiveSeconds || 0, sess?.totalSeconds || 0);
        const visitCount = Math.max(prog?.visitCount || 0, sess?.sessionCount || 0);

        chapterMap.get(chapterName).push({
          _id: lesson._id,
          title: lesson.title,
          order: lesson.order || 0,
          duration: lesson.duration || 0,
          difficulty: lesson.difficulty || null,
          status,
          lastAccessedTime: prog?.lastAccessedAt || null,
          totalActiveDuration: activeSec,
          completionDate: prog?.completedAt || null,
          numberOfVisits: visitCount,
        });
      });

      const chapters = Array.from(chapterMap.entries()).map(([chapterTitle, chapterLessons]) => {
        const completedCount = chapterLessons.filter((l) => l.status === 'COMPLETED').length;
        return {
          chapterTitle,
          totalLessons: chapterLessons.length,
          completedLessons: completedCount,
          lessons: chapterLessons.sort((a, b) => (a.order - b.order) || a.title.localeCompare(b.title, 'vi')),
        };
      });

      const totalCourseLessons = courseLessons.length;
      const completedCourseLessons = courseLessons.filter((l) => {
        const p = progressByLesson.get(String(l._id));
        return p?.status === 'completed' || p?.progress === 100;
      }).length;

      return {
        _id: courseDoc._id,
        title: courseDoc.title,
        level: courseDoc.level,
        englishType: courseDoc.englishType,
        totalLessons: totalCourseLessons,
        completedLessons: completedCourseLessons,
        completionPercentage: totalCourseLessons > 0
          ? Math.round((completedCourseLessons / totalCourseLessons) * 100)
          : 0,
        chapters,
      };
    });

    return res.json({
      status: 'success',
      data: {
        courses: coursesHierarchy,
      },
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * @desc    Get student learning activity timeline history
 * @route   GET /api/v1/admin/learning/students/:studentId/history
 * @access  Private (Admin/Teacher)
 */
export const getLearningStudentHistory = async (req, res, next) => {
  try {
    const { studentId: rawStudentId } = req.params;
    if (!isObjectId(rawStudentId)) {
      return res.status(400).json({
        status: 'error',
        code: 'INVALID_STUDENT_ID',
        message: 'Mã học viên không hợp lệ.',
      });
    }

    const studentId = toObjectId(rawStudentId);
    const page = parseInteger(req.query.page, 1, { min: 1, max: 1000000 });
    const limit = parseInteger(req.query.limit, 20, { min: 1, max: 100 });

    if (page === null || limit === null) {
      return res.status(400).json({
        status: 'error',
        code: 'INVALID_PAGINATION',
        message: 'Trang hoặc số dòng mỗi trang không hợp lệ.',
      });
    }

    const filter = { student: studentId };
    if (req.query.eventType) {
      filter.eventType = String(req.query.eventType).toLowerCase();
    }
    if (req.query.courseId && isObjectId(String(req.query.courseId))) {
      filter.course = toObjectId(String(req.query.courseId));
    }

    const [activities, total] = await Promise.all([
      LearningActivity.find(filter)
        .populate('course', 'title')
        .populate('lesson', 'title chapter topic')
        .populate('assessment', 'title type examFormat')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      LearningActivity.countDocuments(filter),
    ]);

    const formattedActivities = activities.map((act) => ({
      _id: act._id,
      eventType: act.eventType,
      timestamp: act.createdAt,
      course: act.course ? { _id: act.course._id, title: act.course.title } : null,
      lesson: act.lesson ? { _id: act.lesson._id, title: act.lesson.title } : null,
      assessment: act.assessment ? { _id: act.assessment._id, title: act.assessment.title, type: act.assessment.type } : null,
      metadata: act.metadata || {},
    }));

    return res.json({
      status: 'success',
      data: {
        activities: formattedActivities,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit) || 1,
        },
      },
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * @desc    Get course-level learning statistics and lesson breakdown
 * @route   GET /api/v1/admin/learning/courses/:courseId/stats
 * @access  Private (Admin/Teacher)
 */
export const getCourseStats = async (req, res, next) => {
  try {
    const { courseId: rawCourseId } = req.params;
    if (!isObjectId(rawCourseId)) {
      return res.status(400).json({
        status: 'error',
        code: 'INVALID_COURSE_ID',
        message: 'Mã khóa học không hợp lệ.',
      });
    }

    const courseId = toObjectId(rawCourseId);
    const course = await Course.findById(courseId)
      .select('title description level englishType isPublished students createdAt')
      .lean();

    if (!course) {
      return res.status(404).json({
        status: 'error',
        code: 'COURSE_NOT_FOUND',
        message: 'Không tìm thấy khóa học.',
      });
    }

    // Enrolled students in this course
    const enrollments = await Enrollment.find({ course: courseId }).select('student progress enrolledAt').lean();
    const enrolledStudentIds = new Set(enrollments.map((e) => String(e.student)));
    if (Array.isArray(course.students)) {
      course.students.forEach((s) => enrolledStudentIds.add(String(s)));
    }

    const enrolledStudentsCount = enrolledStudentIds.size;
    const enrolledIdsArray = Array.from(enrolledStudentIds).map(toObjectId);

    // Published lessons in this course
    const publishedLessons = await Lesson.find({ course: courseId, status: 'published' })
      .select('_id title chapter topic order duration')
      .sort({ order: 1, _id: 1 })
      .lean();

    const lessonIds = publishedLessons.map((l) => l._id);

    // Progress aggregation for these lessons and enrolled students
    const [progressAgg, sessionAgg] = await Promise.all([
      LearningProgress.aggregate([
        { $match: { course: courseId, lesson: { $in: lessonIds } } },
        {
          $group: {
            _id: '$lesson',
            completedCount: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
            inProgressCount: { $sum: { $cond: [{ $eq: ['$status', 'in_progress'] }, 1, 0] } },
            totalActiveSeconds: { $sum: '$totalActiveSeconds' },
            totalVisits: { $sum: '$visitCount' },
            distinctStudents: { $addToSet: '$student' },
          },
        },
      ]),
      LearningSession.aggregate([
        { $match: { course: courseId, lesson: { $in: lessonIds } } },
        {
          $group: {
            _id: '$lesson',
            totalActiveSeconds: { $sum: '$accumulatedActiveSeconds' },
            sessionVisits: { $sum: 1 },
          },
        },
      ]),
    ]);

    const progressByLesson = new Map(progressAgg.map((p) => [String(p._id), p]));
    const sessionByLesson = new Map(sessionAgg.map((s) => [String(s._id), s]));

    // Students who started learning (have at least one progress record with status != not_started or > 0 active seconds)
    const startedStudentIds = await LearningProgress.distinct('student', {
      course: courseId,
      $or: [
        { status: { $in: ['in_progress', 'completed'] } },
        { totalActiveSeconds: { $gt: 0 } },
        { visitCount: { $gt: 0 } },
      ],
    });
    const startedStudents = startedStudentIds.filter((id) => enrolledStudentIds.has(String(id))).length;

    // Students who completed all published lessons
    let completedStudents = 0;
    if (publishedLessons.length > 0 && enrolledIdsArray.length > 0) {
      const studentCompletedLessons = await LearningProgress.aggregate([
        {
          $match: {
            course: courseId,
            student: { $in: enrolledIdsArray },
            status: 'completed',
            lesson: { $in: lessonIds },
          },
        },
        {
          $group: {
            _id: '$student',
            completedCount: { $sum: 1 },
          },
        },
        {
          $match: {
            completedCount: { $gte: publishedLessons.length },
          },
        },
      ]);
      completedStudents = studentCompletedLessons.length;
    }

    // Average completion percentage from Enrollments
    const avgProgress = enrollments.length
      ? Math.round(enrollments.reduce((sum, e) => sum + (e.progress || 0), 0) / enrollments.length)
      : (publishedLessons.length > 0 && enrolledStudentsCount > 0
          ? Math.round((completedStudents / enrolledStudentsCount) * 100)
          : 0);

    // Total course learning time
    const totalLessonActiveSeconds = publishedLessons.reduce((sum, l) => {
      const prog = progressByLesson.get(String(l._id));
      const sess = sessionByLesson.get(String(l._id));
      return sum + Math.max(prog?.totalActiveSeconds || 0, sess?.totalActiveSeconds || 0);
    }, 0);

    const averageActiveLearningSeconds = enrolledStudentsCount > 0
      ? Math.round(totalLessonActiveSeconds / enrolledStudentsCount)
      : 0;

    // Detailed lesson breakdown
    const lessonStats = publishedLessons.map((lesson) => {
      const prog = progressByLesson.get(String(lesson._id));
      const sess = sessionByLesson.get(String(lesson._id));
      const completedCount = prog?.completedCount || 0;
      const inProgressCount = prog?.inProgressCount || 0;
      const totalSec = Math.max(prog?.totalActiveSeconds || 0, sess?.totalActiveSeconds || 0);
      const totalVisits = Math.max(prog?.totalVisits || 0, sess?.sessionVisits || 0);
      const completionRate = enrolledStudentsCount > 0
        ? Math.round((completedCount / enrolledStudentsCount) * 100)
        : 0;
      const avgActiveSec = enrolledStudentsCount > 0
        ? Math.round(totalSec / enrolledStudentsCount)
        : 0;

      return {
        _id: lesson._id,
        title: lesson.title,
        order: lesson.order || 0,
        chapter: lesson.chapter || lesson.topic || 'Chương chung',
        duration: lesson.duration || 0,
        completedStudentsCount: completedCount,
        inProgressStudentsCount: inProgressCount,
        completionRate,
        totalActiveSeconds: totalSec,
        averageActiveSeconds: avgActiveSec,
        totalVisits,
      };
    });

    return res.json({
      status: 'success',
      data: {
        course: {
          _id: course._id,
          title: course.title,
          description: course.description,
          level: course.level,
          englishType: course.englishType,
          isPublished: course.isPublished,
          totalLessons: publishedLessons.length,
        },
        enrolledStudents: enrolledStudentsCount,
        startedStudents,
        completedStudents,
        averageCompletionPercentage: avgProgress,
        averageActiveLearningSeconds,
        totalActiveSeconds: totalLessonActiveSeconds,
        lessons: lessonStats,
      },
    });
  } catch (error) {
    return next(error);
  }
};
