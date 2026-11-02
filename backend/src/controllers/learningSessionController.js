import mongoose from 'mongoose';
import LearningSession from '../models/LearningSession.js';
import LearningProgress from '../models/LearningProgress.js';
import LearningActivity from '../models/LearningActivity.js';
import Lesson from '../models/Lesson.js';
import Course from '../models/Course.js';

const isObjectId = (value) => typeof value === 'string' && /^[\da-f]{24}$/i.test(value);
const toObjectId = (value) => new mongoose.Types.ObjectId(value);

// Maximum allowed seconds to accumulate in a single heartbeat (anti-inflation limit)
const MAX_HEARTBEAT_SECONDS = 45;
// Maximum idle wall-clock time allowed before a session is considered stale (15 minutes)
const MAX_IDLE_SECONDS = 15 * 60;

/**
 * @desc    Start a learning session for a lesson
 * @route   POST /api/v1/learning/sessions/start
 * @access  Private (Active Student / Admin / Teacher)
 */
export const startSession = async (req, res, next) => {
  try {
    const studentId = req.user._id;
    const { lessonId: rawLessonId, courseId: rawCourseId } = req.body || {};

    const targetLessonId = rawLessonId || req.body?.lesson;
    if (!targetLessonId || !isObjectId(String(targetLessonId))) {
      return res.status(400).json({
        status: 'error',
        code: 'INVALID_LESSON_ID',
        message: 'Mã bài học không hợp lệ.',
      });
    }

    const lessonDoc = await Lesson.findById(targetLessonId).lean();
    if (!lessonDoc) {
      return res.status(404).json({
        status: 'error',
        code: 'LESSON_NOT_FOUND',
        message: 'Không tìm thấy bài học.',
      });
    }

    // Students can only access published lessons
    if (req.user.role === 'student' && lessonDoc.status !== 'published') {
      return res.status(404).json({
        status: 'error',
        code: 'LESSON_NOT_FOUND',
        message: 'Bài học chưa được xuất bản.',
      });
    }

    const lessonObjectId = toObjectId(String(targetLessonId));
    const courseObjectId = lessonDoc.course;

    // 1. Update or create LearningProgress
    let progress = await LearningProgress.findOne({ student: studentId, lesson: lessonObjectId });
    const isFirstAccess = !progress || progress.visitCount === 0;

    if (progress) {
      progress.visitCount = (progress.visitCount || 0) + 1;
      progress.lastAccessedAt = new Date();
      if (progress.status === 'not_started') {
        progress.status = 'in_progress';
        if (!progress.startedAt) progress.startedAt = new Date();
      }
      await progress.save();
    } else {
      progress = await LearningProgress.create({
        student: studentId,
        lesson: lessonObjectId,
        course: courseObjectId,
        status: 'in_progress',
        progress: 0,
        startedAt: new Date(),
        lastAccessedAt: new Date(),
        visitCount: 1,
        totalActiveSeconds: 0,
      });
    }

    // 2. Close any stale previous active sessions for this student on any lesson
    const now = new Date();
    await LearningSession.updateMany(
      {
        student: studentId,
        status: 'active',
      },
      {
        $set: {
          status: 'completed',
          endedAt: now,
        },
      }
    );

    // 3. Create fresh active session
    const session = await LearningSession.create({
      student: studentId,
      course: courseObjectId,
      lesson: lessonObjectId,
      startedAt: now,
      lastHeartbeatAt: now,
      accumulatedActiveSeconds: 0,
      status: 'active',
    });

    // 4. Record user-visible activity event (debounced)
    const eventType = isFirstAccess ? 'started_lesson' : 'resumed_lesson';
    const recentActivity = await LearningActivity.findOne({
      student: studentId,
      lesson: lessonObjectId,
      eventType,
      createdAt: { $gte: new Date(Date.now() - 30 * 60 * 1000) }, // within last 30 minutes
    }).lean();

    if (!recentActivity) {
      await LearningActivity.create({
        student: studentId,
        course: courseObjectId,
        lesson: lessonObjectId,
        eventType,
        metadata: {
          lessonTitle: lessonDoc.title,
          chapter: lessonDoc.chapter || lessonDoc.topic || '',
        },
      });
    }

    return res.status(201).json({
      status: 'success',
      data: {
        sessionId: session._id,
        session: {
          _id: session._id,
          course: session.course,
          lesson: session.lesson,
          startedAt: session.startedAt,
          status: session.status,
        },
        progress: {
          status: progress.status,
          progress: progress.progress,
          visitCount: progress.visitCount,
          totalActiveSeconds: progress.totalActiveSeconds,
          lastAccessedAt: progress.lastAccessedAt,
        },
      },
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * @desc    Send learning session heartbeat to record active duration
 * @route   POST /api/v1/learning/sessions/heartbeat
 * @access  Private (Active Student / Admin / Teacher)
 */
export const sendHeartbeat = async (req, res, next) => {
  try {
    const studentId = req.user._id;
    const { sessionId: rawSessionId, activeSeconds: rawActiveSeconds } = req.body || {};

    if (!rawSessionId || !isObjectId(String(rawSessionId))) {
      return res.status(400).json({
        status: 'error',
        code: 'INVALID_SESSION_ID',
        message: 'Mã phiên học không hợp lệ.',
      });
    }

    const session = await LearningSession.findOne({
      _id: toObjectId(String(rawSessionId)),
      student: studentId,
    });

    if (!session) {
      return res.status(404).json({
        status: 'error',
        code: 'SESSION_NOT_FOUND',
        message: 'Không tìm thấy phiên học.',
      });
    }

    if (session.status !== 'active') {
      return res.status(400).json({
        status: 'error',
        code: 'SESSION_NOT_ACTIVE',
        message: 'Phiên học không còn ở trạng thái hoạt động.',
      });
    }

    const now = Date.now();
    const lastHbTime = new Date(session.lastHeartbeatAt).getTime();
    const wallElapsedSec = Math.max(0, Math.round((now - lastHbTime) / 1000));

    // Stale session check (e.g. browser left open overnight or asleep)
    if (wallElapsedSec > MAX_IDLE_SECONDS) {
      session.status = 'completed';
      session.endedAt = new Date(lastHbTime + 60000);
      await session.save();
      return res.status(400).json({
        status: 'error',
        code: 'SESSION_EXPIRED',
        message: 'Phiên học đã tạm dừng do không có hoạt động trong thời gian dài.',
      });
    }

    // Anti-inflation security calculation:
    // Capped to: actual reported activeSeconds <= wall-clock elapsed + 5 seconds tolerance <= MAX_HEARTBEAT_SECONDS (45s)
    const claimedSeconds = Number(rawActiveSeconds);
    const safeClaimed = Number.isFinite(claimedSeconds) && claimedSeconds > 0 ? claimedSeconds : 0;
    const maxAllowedSeconds = Math.min(MAX_HEARTBEAT_SECONDS, wallElapsedSec + 5);
    const addedSeconds = Math.round(Math.min(safeClaimed, maxAllowedSeconds));

    session.accumulatedActiveSeconds = (session.accumulatedActiveSeconds || 0) + addedSeconds;
    session.lastHeartbeatAt = new Date();
    await session.save();

    // Accumulate totalActiveSeconds in LearningProgress
    if (addedSeconds > 0) {
      await LearningProgress.updateOne(
        { student: studentId, lesson: session.lesson },
        {
          $inc: { totalActiveSeconds: addedSeconds },
          $set: { lastAccessedAt: new Date() },
        }
      );
    }

    return res.json({
      status: 'success',
      data: {
        sessionId: session._id,
        accumulatedActiveSeconds: session.accumulatedActiveSeconds,
        addedSeconds,
      },
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * @desc    End learning session
 * @route   POST /api/v1/learning/sessions/end
 * @access  Private (Active Student / Admin / Teacher)
 */
export const endSession = async (req, res, next) => {
  try {
    const studentId = req.user._id;
    const { sessionId: rawSessionId, activeSeconds: rawActiveSeconds } = req.body || {};

    if (!rawSessionId || !isObjectId(String(rawSessionId))) {
      return res.status(400).json({
        status: 'error',
        code: 'INVALID_SESSION_ID',
        message: 'Mã phiên học không hợp lệ.',
      });
    }

    const session = await LearningSession.findOne({
      _id: toObjectId(String(rawSessionId)),
      student: studentId,
    });

    if (!session) {
      return res.status(404).json({
        status: 'error',
        code: 'SESSION_NOT_FOUND',
        message: 'Không tìm thấy phiên học.',
      });
    }

    if (session.status === 'active') {
      const now = Date.now();
      const lastHbTime = new Date(session.lastHeartbeatAt).getTime();
      const wallElapsedSec = Math.max(0, Math.round((now - lastHbTime) / 1000));

      const claimedSeconds = Number(rawActiveSeconds);
      const safeClaimed = Number.isFinite(claimedSeconds) && claimedSeconds > 0 ? claimedSeconds : 0;
      const maxAllowedSeconds = Math.min(MAX_HEARTBEAT_SECONDS, wallElapsedSec + 5);
      const addedSeconds = Math.round(Math.min(safeClaimed, maxAllowedSeconds));

      session.accumulatedActiveSeconds = (session.accumulatedActiveSeconds || 0) + addedSeconds;
      session.lastHeartbeatAt = new Date();
      session.status = 'completed';
      session.endedAt = new Date();
      await session.save();

      if (addedSeconds > 0) {
        await LearningProgress.updateOne(
          { student: studentId, lesson: session.lesson },
          {
            $inc: { totalActiveSeconds: addedSeconds },
            $set: { lastAccessedAt: new Date() },
          }
        );
      }
    }

    return res.json({
      status: 'success',
      message: 'Phiên học đã kết thúc thành công.',
      data: {
        accumulatedActiveSeconds: session.accumulatedActiveSeconds,
      },
    });
  } catch (error) {
    return next(error);
  }
};
