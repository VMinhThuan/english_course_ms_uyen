import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import LearningSession from '../models/LearningSession.js';
import LearningProgress from '../models/LearningProgress.js';
import LearningActivity from '../models/LearningActivity.js';
import Lesson from '../models/Lesson.js';
import StudentPresence from '../models/StudentPresence.js';
import LearningSessionHeartbeat from '../models/LearningSessionHeartbeat.js';
import {
  creditValidatedInterval,
  getDailyProgress,
  getDateKeyInTimezone,
  getUserTimezone,
} from '../services/learningStreakService.js';
import { isStudentSessionEnforcementEnabled } from '../security/authSession.js';

const isObjectId = (value) => typeof value === 'string' && /^[\da-f]{24}$/i.test(value);
const toObjectId = (value) => new mongoose.Types.ObjectId(value);

// Maximum allowed seconds to accumulate in a single heartbeat (anti-inflation limit)
const MAX_HEARTBEAT_SECONDS = 45;
// Maximum idle wall-clock time allowed before a session is considered stale (15 minutes)
const MAX_IDLE_SECONDS = 15 * 60;
const ACTIVITY_PATH_PREFIXES = {
  vocabulary: ['/student/vocabulary', '/student/flashcards', '/student/vocabulary-quest'],
  listening: ['/student/part-1', '/student/vocabulary-dictation', '/student/hard-words-dictation'],
  exercise: ['/student/grammar/'],
  quiz: ['/student/part-5'],
  assessment: ['/student/tests/', '/student/toeic/attempt/'],
  interactive: ['/student/part-2-challenge', '/student/road-to-part-7', '/student/streak-challenge'],
  mini_game: ['/student/part-2-challenge', '/student/streak-challenge'],
};

const isApprovedActivityPath = (activityType, activityId) => {
  const path = String(activityId || '').trim();
  return Boolean(path && ACTIVITY_PATH_PREFIXES[activityType]?.some((prefix) => path === prefix || path.startsWith(prefix)));
};

const getLearningSessionScope = (req) => (
  req.user?.role === 'student' && isStudentSessionEnforcementEnabled()
    ? { authSessionId: req.authSessionId || '__missing_auth_session__' }
    : {}
);

const isTransactionUnavailable = (error) => (
  [20, 251, 263, 303].includes(Number(error?.code))
  || /transaction.*(not supported|replica set|mongos)/i.test(String(error?.message || ''))
);

const runLearningTransaction = async (work) => {
  const topologyType = mongoose.connection?.getClient?.()?.topology?.description?.type;
  // Existing unit/integration suites intentionally use standalone
  // MongoMemoryServer. Keep those local tests usable, while production and
  // staging remain fail-closed unless MongoDB transactions are available.
  if (process.env.NODE_ENV === 'test' && topologyType === 'Single') return work(null);
  const mongoSession = await mongoose.startSession();
  try {
    let result;
    await mongoSession.withTransaction(async () => {
      result = await work(mongoSession);
    });
    return result;
  } catch (error) {
    if (isTransactionUnavailable(error)) {
      error.statusCode = 503;
      error.code = 'LEARNING_SESSION_UNAVAILABLE';
      error.message = 'Tính năng ghi nhận thời gian học cần MongoDB replica set hoặc MongoDB Atlas.';
    }
    throw error;
  } finally {
    await mongoSession.endSession();
  }
};

/**
 * @desc    Record student presence and active study time outside lesson sessions
 * @route   POST /api/v1/learning/sessions/activity-heartbeat
 * @access  Private (Active Student)
 */
export const sendStudentActivityHeartbeat = async (req, res, next) => {
  try {
    if (req.user?.role !== 'student') {
      return res.json({ status: 'success', data: { addedSeconds: 0 } });
    }
    const studentId = req.user._id;
    const now = new Date();
    const isActive = req.body?.isActive === true;
    const requestedRoute = typeof req.body?.route === 'string' ? req.body.route.trim().slice(0, 160) : '';
    const route = requestedRoute.startsWith('/student/') || requestedRoute === '/student'
      ? requestedRoute
      : '';

    const presenceUpdate = {
      $set: {
        lastSeenAt: now,
        currentRoute: route,
        ...(isActive ? { lastActiveAt: now } : {}),
      },
    };
    try {
      await StudentPresence.updateOne({ _id: studentId }, presenceUpdate, { upsert: true });
    } catch (error) {
      if (error?.code !== 11000) throw error;
      await StudentPresence.updateOne({ _id: studentId }, presenceUpdate);
    }

    // This endpoint is presence-only. Valid study time is credited exclusively
    // by an authenticated learning session, so dashboard presence cannot grow a streak.
    return res.json({ status: 'success', data: { addedSeconds: 0, isActive } });
  } catch (error) {
    return next(error);
  }
};

/**
 * @desc    Start a learning session for a lesson
 * @route   POST /api/v1/learning/sessions/start
 * @access  Private (Active Student / Admin / Teacher)
 */
export const startSession = async (req, res, next) => {
  try {
    const studentId = req.user._id;
    const { lessonId: rawLessonId, activityType: rawActivityType, activityId: rawActivityId } = req.body || {};
    const activityType = String(rawActivityType || (rawLessonId ? 'lesson' : '')).trim().toLowerCase();
    const validActivityTypes = new Set(['lesson', 'vocabulary', 'listening', 'exercise', 'quiz', 'interactive', 'mini_game', 'assessment']);
    if (!validActivityTypes.has(activityType)) {
      return res.status(400).json({ status: 'error', code: 'INVALID_ACTIVITY_TYPE', message: 'Hoạt động học không hợp lệ.' });
    }

    const targetLessonId = rawLessonId || req.body?.lesson;
    if (activityType === 'lesson' && (!targetLessonId || !isObjectId(String(targetLessonId)))) {
      return res.status(400).json({
        status: 'error',
        code: 'INVALID_LESSON_ID',
        message: 'Mã bài học không hợp lệ.',
      });
    }
    if (activityType !== 'lesson' && !isApprovedActivityPath(activityType, rawActivityId)) {
      return res.status(400).json({ status: 'error', code: 'INVALID_ACTIVITY_PATH', message: 'Hoạt động học chưa được xác thực.' });
    }

    const lessonDoc = activityType === 'lesson' ? await Lesson.findById(targetLessonId).lean() : null;
    if (activityType === 'lesson' && !lessonDoc) {
      return res.status(404).json({ status: 'error', code: 'LESSON_NOT_FOUND', message: 'Không tìm thấy bài học.' });
    }

    // Students can only access published lessons
    if (activityType === 'lesson' && req.user.role === 'student' && lessonDoc.status !== 'published') {
      return res.status(404).json({
        status: 'error',
        code: 'LESSON_NOT_FOUND',
        message: 'Bài học chưa được xuất bản.',
      });
    }

    const lessonObjectId = activityType === 'lesson' ? toObjectId(String(targetLessonId)) : null;
    const courseObjectId = activityType === 'lesson' ? lessonDoc.course : null;

    const { session, progress } = await runLearningTransaction(async (mongoSession) => {
      // Progress, active-session fencing, the new session, and the activity
      // event commit together. The unique partial index is the final guard
      // against two concurrent starts for one student.
      let transactionProgress = null;
      const isFirstAccess = activityType === 'lesson'
        ? !(transactionProgress = await LearningProgress.findOne({ student: studentId, lesson: lessonObjectId }).session(mongoSession))
          || transactionProgress.visitCount === 0
        : false;

      const now = new Date();
      if (activityType === 'lesson' && transactionProgress) {
        transactionProgress.visitCount = (transactionProgress.visitCount || 0) + 1;
        transactionProgress.lastAccessedAt = now;
        if (transactionProgress.status === 'not_started') {
          transactionProgress.status = 'in_progress';
          if (!transactionProgress.startedAt) transactionProgress.startedAt = now;
        }
        await transactionProgress.save({ session: mongoSession });
      } else if (activityType === 'lesson') {
        [transactionProgress] = await LearningProgress.create([{
          student: studentId,
          lesson: lessonObjectId,
          course: courseObjectId,
          status: 'in_progress',
          progress: 0,
          startedAt: now,
          lastAccessedAt: now,
          visitCount: 1,
          totalActiveSeconds: 0,
        }], { session: mongoSession });
      }

      await LearningSession.updateMany(
        { student: studentId, status: 'active' },
        { $set: { status: 'completed', endedAt: now } },
        { session: mongoSession },
      );

      const [transactionSession] = await LearningSession.create([{
        student: studentId,
        authSessionId: req.authSessionId || null,
        course: courseObjectId,
        lesson: lessonObjectId,
        activityType,
        activityId: typeof rawActivityId === 'string' ? rawActivityId.trim().slice(0, 160) || null : null,
        timezone: getUserTimezone(req.user),
        startedAt: now,
        lastHeartbeatAt: now,
        accumulatedActiveSeconds: 0,
        status: 'active',
      }], { session: mongoSession });

      if (activityType === 'lesson') {
        const eventType = isFirstAccess ? 'started_lesson' : 'resumed_lesson';
        const recentActivity = await LearningActivity.findOne({
          student: studentId,
          lesson: lessonObjectId,
          eventType,
          createdAt: { $gte: new Date(Date.now() - 30 * 60 * 1000) },
        }).session(mongoSession).lean();
        if (!recentActivity) {
          await LearningActivity.create([{
            student: studentId,
            course: courseObjectId,
            lesson: lessonObjectId,
            eventType,
            metadata: { lessonTitle: lessonDoc.title, chapter: lessonDoc.chapter || lessonDoc.topic || '' },
          }], { session: mongoSession });
        }
      }
      return { session: transactionSession, progress: transactionProgress };
    });

    return res.status(201).json({
      status: 'success',
      data: {
        sessionId: session._id,
        session: {
          _id: session._id,
          course: session.course,
          lesson: session.lesson,
          activityType: session.activityType,
          startedAt: session.startedAt,
          status: session.status,
        },
          ...(progress ? { progress: {
          status: progress.status,
          progress: progress.progress,
          visitCount: progress.visitCount,
          totalActiveSeconds: progress.totalActiveSeconds,
          lastAccessedAt: progress.lastAccessedAt,
          } } : {}),
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
const sendHeartbeatLegacy = async (req, res, next) => {
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

    // Normal clients heartbeat every 15 seconds. Drop sub-second floods before
    // creating idempotency records; this also makes rapid retry storms cheap.
    if (session.startupCreditGranted && wallElapsedSec < 1) {
      return res.json({ status: 'success', data: { sessionId: session._id, accumulatedActiveSeconds: session.accumulatedActiveSeconds || 0, addedSeconds: 0, rateLimited: true } });
    }

    const idempotencyKey = String(
      req.get('Idempotency-Key') || req.body?.heartbeatId || randomUUID(),
    ).trim().slice(0, 160);
    try {
      await LearningSessionHeartbeat.create({ session: session._id, idempotencyKey });
    } catch (error) {
      if (error?.code === 11000) {
        const current = await LearningSession.findById(session._id).select('accumulatedActiveSeconds').lean();
        return res.json({ status: 'success', data: { sessionId: session._id, accumulatedActiveSeconds: current?.accumulatedActiveSeconds || 0, addedSeconds: 0, duplicate: true } });
      }
      throw error;
    }

    // Anti-inflation security calculation:
    // Capped to: actual reported activeSeconds <= wall-clock elapsed + 5 seconds tolerance <= MAX_HEARTBEAT_SECONDS (45s)
    const claimedSeconds = Number(rawActiveSeconds);
    const safeClaimed = Number.isFinite(claimedSeconds) && claimedSeconds > 0 ? claimedSeconds : 0;
    // A startup tolerance may be granted once only. Granting a tolerance on
    // every request would let a client inflate time by sending rapid heartbeats.
    const startupTolerance = session.startupCreditGranted ? 0 : 5;
    const maxAllowedSeconds = Math.min(MAX_HEARTBEAT_SECONDS, wallElapsedSec + startupTolerance);
    const addedSeconds = Math.round(Math.min(safeClaimed, maxAllowedSeconds));

    const previousHeartbeatAt = session.lastHeartbeatAt;
    const nextHeartbeatAt = new Date();
    const updatedSession = await LearningSession.findOneAndUpdate(
      { _id: session._id, student: studentId, status: 'active', lastHeartbeatAt: previousHeartbeatAt },
      {
        $inc: { accumulatedActiveSeconds: addedSeconds },
        $set: { lastHeartbeatAt: nextHeartbeatAt, startupCreditGranted: true },
      },
      { new: true },
    );
    if (!updatedSession) {
      return res.json({ status: 'success', data: { sessionId: session._id, accumulatedActiveSeconds: session.accumulatedActiveSeconds || 0, addedSeconds: 0, concurrent: true } });
    }

    // Accumulate totalActiveSeconds in LearningProgress
    let streakResult = null;
    if (addedSeconds > 0) {
      await LearningProgress.updateOne(
        { student: studentId, lesson: session.lesson },
        {
          $inc: { totalActiveSeconds: addedSeconds },
          $set: { lastAccessedAt: nextHeartbeatAt },
        }
      );
      streakResult = await creditValidatedInterval({
        studentId,
        activityType: session.activityType,
        seconds: addedSeconds,
        intervalStart: previousHeartbeatAt,
        intervalEnd: nextHeartbeatAt,
        timezone: session.timezone || getUserTimezone(req.user),
      });
    }

    return res.json({
      status: 'success',
      data: {
        sessionId: session._id,
        accumulatedActiveSeconds: updatedSession.accumulatedActiveSeconds,
        addedSeconds,
        dailyProgress: streakResult ? await getDailyProgress(
          studentId,
          getDateKeyInTimezone(new Date(), session.timezone || getUserTimezone(req.user)),
          session.timezone || getUserTimezone(req.user),
        ) : null,
        streak: streakResult?.streak || null,
      },
    });
  } catch (error) {
    return next(error);
  }
};

// Transactional heartbeat implementation. The legacy implementation above is
// intentionally retained temporarily as a readable migration reference; this
// export is the route handler used by the application.
export const sendHeartbeat = async (req, res, next) => {
  try {
    const studentId = req.user._id;
    const { sessionId: rawSessionId, activeSeconds: rawActiveSeconds } = req.body || {};
    if (!rawSessionId || !isObjectId(String(rawSessionId))) {
      return res.status(400).json({ status: 'error', code: 'INVALID_SESSION_ID', message: 'Mã phiên học không hợp lệ.' });
    }
    const idempotencyKey = String(req.get('Idempotency-Key') || req.body?.heartbeatId || randomUUID()).trim().slice(0, 160);
    const result = await runLearningTransaction(async (mongoSession) => {
      const session = await LearningSession.findOne({
        _id: toObjectId(String(rawSessionId)),
        student: studentId,
        status: 'active',
        ...getLearningSessionScope(req),
      }).session(mongoSession);
      if (!session) {
        const existing = await LearningSession.findOne({ _id: toObjectId(String(rawSessionId)), student: studentId }).session(mongoSession).lean();
        return { kind: existing ? 'inactive' : 'missing' };
      }

      const now = Date.now();
      const lastHeartbeatMs = new Date(session.lastHeartbeatAt).getTime();
      const wallElapsedSec = Math.max(0, Math.round((now - lastHeartbeatMs) / 1000));
      if (wallElapsedSec > MAX_IDLE_SECONDS) {
        session.status = 'completed';
        session.endedAt = new Date(lastHeartbeatMs + 60000);
        await session.save({ session: mongoSession });
        return { kind: 'expired' };
      }
      if (session.startupCreditGranted && wallElapsedSec < 1) {
        return { kind: 'success', sessionId: session._id, accumulatedActiveSeconds: session.accumulatedActiveSeconds || 0, addedSeconds: 0, rateLimited: true };
      }

      const duplicate = await LearningSessionHeartbeat.findOne({ session: session._id, idempotencyKey }).session(mongoSession).lean();
      if (duplicate) return { kind: 'success', sessionId: session._id, accumulatedActiveSeconds: session.accumulatedActiveSeconds || 0, addedSeconds: 0, duplicate: true };
      await LearningSessionHeartbeat.create([{ session: session._id, idempotencyKey }], { session: mongoSession });

      const claimedSeconds = Number(rawActiveSeconds);
      const safeClaimed = Number.isFinite(claimedSeconds) && claimedSeconds > 0 ? claimedSeconds : 0;
      const maxAllowedSeconds = Math.min(MAX_HEARTBEAT_SECONDS, wallElapsedSec + (session.startupCreditGranted ? 0 : 5));
      const addedSeconds = Math.round(Math.min(safeClaimed, maxAllowedSeconds));
      const previousHeartbeatAt = session.lastHeartbeatAt;
      const nextHeartbeatAt = new Date();
      const updatedSession = await LearningSession.findOneAndUpdate(
        { _id: session._id, student: studentId, status: 'active', lastHeartbeatAt: previousHeartbeatAt, ...getLearningSessionScope(req) },
        { $inc: { accumulatedActiveSeconds: addedSeconds }, $set: { lastHeartbeatAt: nextHeartbeatAt, startupCreditGranted: true } },
        { new: true, session: mongoSession },
      );
      if (!updatedSession) return { kind: 'success', sessionId: session._id, accumulatedActiveSeconds: session.accumulatedActiveSeconds || 0, addedSeconds: 0, concurrent: true };

      let streakResult = null;
      let dailyProgress = null;
      if (addedSeconds > 0) {
        await LearningProgress.updateOne(
          { student: studentId, lesson: session.lesson },
          { $inc: { totalActiveSeconds: addedSeconds }, $set: { lastAccessedAt: nextHeartbeatAt } },
          { session: mongoSession },
        );
        streakResult = await creditValidatedInterval({ studentId, activityType: session.activityType, seconds: addedSeconds, intervalStart: previousHeartbeatAt, intervalEnd: nextHeartbeatAt, timezone: session.timezone || getUserTimezone(req.user), mongoSession });
        dailyProgress = await getDailyProgress(studentId, getDateKeyInTimezone(new Date(), session.timezone || getUserTimezone(req.user)), session.timezone || getUserTimezone(req.user), mongoSession);
      }
      return { kind: 'success', sessionId: session._id, accumulatedActiveSeconds: updatedSession.accumulatedActiveSeconds, addedSeconds, dailyProgress, streak: streakResult?.streak || null };
    });

    if (result.kind === 'missing') return res.status(404).json({ status: 'error', code: 'SESSION_NOT_FOUND', message: 'Không tìm thấy phiên học.' });
    if (result.kind === 'inactive') return res.status(400).json({ status: 'error', code: 'SESSION_NOT_ACTIVE', message: 'Phiên học không còn ở trạng thái hoạt động.' });
    if (result.kind === 'expired') return res.status(400).json({ status: 'error', code: 'SESSION_EXPIRED', message: 'Phiên học đã tạm dừng do không có hoạt động trong thời gian dài.' });
    return res.json({ status: 'success', data: {
      sessionId: result.sessionId,
      accumulatedActiveSeconds: result.accumulatedActiveSeconds,
      addedSeconds: result.addedSeconds,
      ...(result.rateLimited ? { rateLimited: true } : {}),
      ...(result.duplicate ? { duplicate: true } : {}),
      ...(result.concurrent ? { concurrent: true } : {}),
      dailyProgress: result.dailyProgress,
      streak: result.streak,
    } });
  } catch (error) {
    if (error?.code === 11000) {
      const sessionId = toObjectId(String(req.body.sessionId));
      const current = await LearningSession.findById(sessionId).select('accumulatedActiveSeconds').lean();
      return res.json({ status: 'success', data: { sessionId, accumulatedActiveSeconds: current?.accumulatedActiveSeconds || 0, addedSeconds: 0, duplicate: true } });
    }
    return next(error);
  }
};

/**
 * @desc    End learning session
 * @route   POST /api/v1/learning/sessions/end
 * @access  Private (Active Student / Admin / Teacher)
 */
const endSessionLegacy = async (req, res, next) => {
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

    let finalAccumulatedActiveSeconds = session.accumulatedActiveSeconds || 0;
    if (session.status === 'active') {
      const now = Date.now();
      const lastHbTime = new Date(session.lastHeartbeatAt).getTime();
      const wallElapsedSec = Math.max(0, Math.round((now - lastHbTime) / 1000));

      if (wallElapsedSec > MAX_IDLE_SECONDS) {
        session.status = 'completed';
        session.endedAt = new Date(lastHbTime + 60 * 1000);
        await session.save();
        return res.json({
          status: 'success',
          message: 'Phiên học đã hết hạn an toàn sau thời gian không hoạt động.',
          data: { accumulatedActiveSeconds: session.accumulatedActiveSeconds, expired: true },
        });
      }

      const claimedSeconds = Number(rawActiveSeconds);
      const safeClaimed = Number.isFinite(claimedSeconds) && claimedSeconds > 0 ? claimedSeconds : 0;
      const maxAllowedSeconds = Math.min(MAX_HEARTBEAT_SECONDS, wallElapsedSec + (session.startupCreditGranted ? 0 : 5));
      const addedSeconds = Math.round(Math.min(safeClaimed, maxAllowedSeconds));

      const previousHeartbeatAt = session.lastHeartbeatAt;
      const nextHeartbeatAt = new Date();
      const closedSession = await LearningSession.findOneAndUpdate(
        {
          _id: session._id,
          student: studentId,
          status: 'active',
          lastHeartbeatAt: previousHeartbeatAt,
        },
        {
          $inc: { accumulatedActiveSeconds: addedSeconds },
          $set: {
            lastHeartbeatAt: nextHeartbeatAt,
            startupCreditGranted: true,
            status: 'completed',
            endedAt: nextHeartbeatAt,
          },
        },
        { new: true },
      );
      // Another end/heartbeat request won the session claim. It must not
      // credit the interval a second time.
      if (!closedSession) {
        const current = await LearningSession.findById(session._id).select('accumulatedActiveSeconds').lean();
        return res.json({
          status: 'success',
          message: 'Phiên học đã được kết thúc trước đó.',
          data: { accumulatedActiveSeconds: current?.accumulatedActiveSeconds || 0, duplicate: true },
        });
      }
      finalAccumulatedActiveSeconds = closedSession.accumulatedActiveSeconds || 0;

      if (addedSeconds > 0) {
        await LearningProgress.updateOne(
          { student: studentId, lesson: session.lesson },
          {
            $inc: { totalActiveSeconds: addedSeconds },
            $set: { lastAccessedAt: nextHeartbeatAt },
          }
        );
        await creditValidatedInterval({
          studentId,
          activityType: session.activityType,
          seconds: addedSeconds,
          intervalStart: previousHeartbeatAt,
          intervalEnd: nextHeartbeatAt,
          timezone: session.timezone || getUserTimezone(req.user),
        });
      }
    }

    return res.json({
      status: 'success',
      message: 'Phiên học đã kết thúc thành công.',
      data: { accumulatedActiveSeconds: finalAccumulatedActiveSeconds },
    });
  } catch (error) {
    return next(error);
  }
};

export const endSession = async (req, res, next) => {
  try {
    const studentId = req.user._id;
    const { sessionId: rawSessionId, activeSeconds: rawActiveSeconds } = req.body || {};
    if (!rawSessionId || !isObjectId(String(rawSessionId))) {
      return res.status(400).json({ status: 'error', code: 'INVALID_SESSION_ID', message: 'Mã phiên học không hợp lệ.' });
    }
    const result = await runLearningTransaction(async (mongoSession) => {
      const session = await LearningSession.findOne({ _id: toObjectId(String(rawSessionId)), student: studentId, ...getLearningSessionScope(req) }).session(mongoSession);
      if (!session) return { kind: 'missing' };
      if (session.status !== 'active') return { kind: 'success', accumulatedActiveSeconds: session.accumulatedActiveSeconds || 0, duplicate: true };

      const now = Date.now();
      const lastHeartbeatMs = new Date(session.lastHeartbeatAt).getTime();
      const wallElapsedSec = Math.max(0, Math.round((now - lastHeartbeatMs) / 1000));
      if (wallElapsedSec > MAX_IDLE_SECONDS) {
        session.status = 'completed';
        session.endedAt = new Date(lastHeartbeatMs + 60000);
        await session.save({ session: mongoSession });
        return { kind: 'success', accumulatedActiveSeconds: session.accumulatedActiveSeconds || 0, expired: true };
      }

      const claimedSeconds = Number(rawActiveSeconds);
      const safeClaimed = Number.isFinite(claimedSeconds) && claimedSeconds > 0 ? claimedSeconds : 0;
      const addedSeconds = Math.round(Math.min(safeClaimed, Math.min(MAX_HEARTBEAT_SECONDS, wallElapsedSec + (session.startupCreditGranted ? 0 : 5))));
      const previousHeartbeatAt = session.lastHeartbeatAt;
      const nextHeartbeatAt = new Date();
      const closedSession = await LearningSession.findOneAndUpdate(
        { _id: session._id, student: studentId, status: 'active', lastHeartbeatAt: previousHeartbeatAt, ...getLearningSessionScope(req) },
        { $inc: { accumulatedActiveSeconds: addedSeconds }, $set: { lastHeartbeatAt: nextHeartbeatAt, startupCreditGranted: true, status: 'completed', endedAt: nextHeartbeatAt } },
        { new: true, session: mongoSession },
      );
      if (!closedSession) return { kind: 'success', accumulatedActiveSeconds: session.accumulatedActiveSeconds || 0, duplicate: true };

      if (addedSeconds > 0) {
        await LearningProgress.updateOne(
          { student: studentId, lesson: session.lesson },
          { $inc: { totalActiveSeconds: addedSeconds }, $set: { lastAccessedAt: nextHeartbeatAt } },
          { session: mongoSession },
        );
        await creditValidatedInterval({ studentId, activityType: session.activityType, seconds: addedSeconds, intervalStart: previousHeartbeatAt, intervalEnd: nextHeartbeatAt, timezone: session.timezone || getUserTimezone(req.user), mongoSession });
      }
      return { kind: 'success', accumulatedActiveSeconds: closedSession.accumulatedActiveSeconds || 0 };
    });
    if (result.kind === 'missing') return res.status(404).json({ status: 'error', code: 'SESSION_NOT_FOUND', message: 'Không tìm thấy phiên học.' });
    return res.json({ status: 'success', message: result.expired ? 'Phiên học đã hết hạn an toàn sau thời gian không hoạt động.' : 'Phiên học đã kết thúc thành công.', data: { accumulatedActiveSeconds: result.accumulatedActiveSeconds, ...(result.expired ? { expired: true } : {}), ...(result.duplicate ? { duplicate: true } : {}) } });
  } catch (error) {
    return next(error);
  }
};

/** Pause without deleting the accumulated session. A later start request creates
 * a fresh validated interval, which prevents hidden/background time from leaking in. */
export const pauseSession = async (req, res, next) => {
  try {
    const rawSessionId = req.body?.sessionId;
    if (!rawSessionId || !isObjectId(String(rawSessionId))) {
      return res.status(400).json({ status: 'error', code: 'INVALID_SESSION_ID', message: 'Mã phiên học không hợp lệ.' });
    }
    const session = await LearningSession.findOneAndUpdate(
      { _id: toObjectId(String(rawSessionId)), student: req.user._id, status: 'active', ...getLearningSessionScope(req) },
      { $set: { status: 'paused' } },
      { new: true },
    );
    if (!session) return res.status(404).json({ status: 'error', code: 'SESSION_NOT_ACTIVE', message: 'Phiên học không còn hoạt động.' });
    return res.json({ status: 'success', data: { sessionId: session._id, status: session.status, accumulatedActiveSeconds: session.accumulatedActiveSeconds } });
  } catch (error) {
    return next(error);
  }
};
