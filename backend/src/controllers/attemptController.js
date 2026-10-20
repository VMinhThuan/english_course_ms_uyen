import Attempt from '../models/Attempt.js';
import Assessment from '../models/Assessment.js';
import Question from '../models/Question.js';
import {
  finalizeAttempt,
  isTerminalAttempt,
  resolveAttemptEngine,
} from '../utils/attemptLifecycle.js';

// Helper to generate safe student question DTO (NO secret answers/grading rules)
const sanitizeQuestionSnapshotForStudent = (snapshot) => {
  return {
    questionId: snapshot.questionId,
    type: snapshot.type,
    questionText: snapshot.questionText,
    options: snapshot.options ? snapshot.options.map((o) => ({ id: o.id, text: o.text })) : [],
    score: snapshot.score,
  };
};

const getPassResult = (attempt, assessment) => {
  const scorePercentage = attempt.maxScore > 0
    ? Math.round((attempt.score / attempt.maxScore) * 100)
    : 0;
  const passScore = Number.isFinite(Number(attempt.passScore))
    ? Number(attempt.passScore)
    : Number(assessment?.passScore || 0);
  return {
    scorePercentage: attempt.scorePercentage ?? scorePercentage,
    passScore,
    passed: typeof attempt.passed === 'boolean' ? attempt.passed : scorePercentage >= passScore,
  };
};

// @desc    Student get available published assessments
// @route   GET /api/v1/assessments/available
// @access  Private (Active Student)
export const getAvailableAssessments = async (req, res, next) => {
  try {
    const now = new Date();
    const filter = {
      status: 'published',
      examFormat: { $in: ['standard', null] },
      $and: [
        { $or: [{ availableFrom: null }, { availableFrom: { $lte: now } }] },
        { $or: [{ availableUntil: null }, { availableUntil: { $gte: now } }] },
      ],
    };

    const assessments = await Assessment.find(filter)
      .populate('lesson', 'title')
      .populate('course', 'title')
      .select('-questions.question');

    const assessmentIds = assessments.map((assessment) => assessment._id);
    let attempts = assessmentIds.length
      ? await Attempt.find({ student: req.user._id, assessment: { $in: assessmentIds } }).sort({ submittedAt: -1 })
      : [];
    const assessmentsById = new Map(assessments.map((assessment) => [String(assessment._id), assessment]));
    for (const attempt of attempts) {
      if (attempt.status !== 'in_progress' || new Date(attempt.deadlineAt) > now) continue;
      const assessment = assessmentsById.get(String(attempt.assessment));
      if (resolveAttemptEngine(attempt, assessment) !== 'standard') continue;
      await finalizeAttempt({ Attempt, attempt, assessment, engine: 'standard', now });
    }
    if (assessmentIds.length) {
      attempts = await Attempt.find({ student: req.user._id, assessment: { $in: assessmentIds } }).sort({ submittedAt: -1 });
    }

    const attemptsByAssessment = new Map();
    for (const attempt of attempts) {
      const key = String(attempt.assessment);
      if (!attemptsByAssessment.has(key)) attemptsByAssessment.set(key, []);
      attemptsByAssessment.get(key).push(attempt);
    }
    const assessmentsWithAttemptState = assessments.map((assessment) => {
      const assessmentAttempts = attemptsByAssessment.get(String(assessment._id)) || [];
      const activeAttempt = assessmentAttempts.find((attempt) => attempt.status === 'in_progress');
      const finishedAttempts = assessmentAttempts.filter(isTerminalAttempt);
      const lastAttempt = finishedAttempts[0];
      const attemptLimit = Number(assessment.attemptLimit || 0);
      return {
        ...(assessment.toObject ? assessment.toObject() : assessment),
        attemptCount: finishedAttempts.length,
        attemptLimit,
        remainingAttempts: attemptLimit === 0 ? null : Math.max(0, attemptLimit - finishedAttempts.length),
        hasActiveAttempt: Boolean(activeAttempt),
        activeAttemptId: activeAttempt?._id || null,
        lastAttempt: lastAttempt ? {
          attemptId: lastAttempt._id,
          status: lastAttempt.status,
          score: lastAttempt.score,
          maxScore: lastAttempt.maxScore,
          percentage: lastAttempt.scorePercentage ?? (lastAttempt.maxScore > 0
            ? Math.round((lastAttempt.score / lastAttempt.maxScore) * 100)
            : 0),
          passed: lastAttempt.passed,
          submittedAt: lastAttempt.submittedAt,
          isExpired: lastAttempt.isExpired,
        } : null,
      };
    });

    res.json({
      status: 'success',
      data: {
        assessments: assessmentsWithAttemptState,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Student get active attempts for login-time resume prompt
// @route   GET /api/v1/attempts/active
// @access  Private (Active Student)
export const getStudentActiveAttempts = async (req, res, next) => {
  try {
    const attempts = await Attempt.find({
      student: req.user._id,
      status: 'in_progress',
      deadlineAt: { $gt: new Date() },
    })
      .populate('assessment', 'title examFormat toeicMode')
      .sort({ startedAt: -1 });

    const activeAttempts = attempts.reduce((items, attempt) => {
      const assessment = attempt.assessment;
      const engine = resolveAttemptEngine(attempt, assessment);
      if (!assessment || !engine) return items;

      items.push({
        attemptId: attempt._id,
        assessmentId: assessment._id,
        title: assessment.title || 'Bài kiểm tra',
        engine,
        startedAt: attempt.startedAt,
        deadlineAt: attempt.deadlineAt,
      });
      return items;
    }, []);

    res.json({ status: 'success', data: { attempts: activeAttempts } });
  } catch (error) {
    next(error);
  }
};

// @desc    Student get assessment detail by ID
// @route   GET /api/v1/assessments/:id
// @access  Private (Active Student)
export const getStudentAssessmentById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const assessment = await Assessment.findById(id)
      .populate('lesson', 'title')
      .populate('course', 'title');

    if (!assessment || assessment.status !== 'published' || assessment.examFormat !== 'standard') {
      return res.status(404).json({
        status: 'error',
        message: 'Assessment not found or not available',
      });
    }

    res.json({
      status: 'success',
      data: {
        assessment: {
          _id: assessment._id,
          title: assessment.title,
          description: assessment.description,
          type: assessment.type,
          durationMinutes: assessment.durationMinutes,
          totalScore: assessment.totalScore,
          passScore: assessment.passScore ?? 0,
          attemptLimit: assessment.attemptLimit,
          questionCount: assessment.questions ? assessment.questions.length : 0,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Student start or resume assessment attempt
// @route   POST /api/v1/assessments/:id/start
// @access  Private (Active Student)
export const startAttempt = async (req, res, next) => {
  try {
    const { id } = req.params;
    const studentId = req.user._id;

    const assessment = await Assessment.findById(id);
    if (!assessment || assessment.status !== 'published') {
      return res.status(404).json({
        status: 'error',
        message: 'Assessment not found or not published',
      });
    }
    if (assessment.examFormat !== 'standard') {
      return res.status(409).json({ status: 'error', code: 'ASSESSMENT_ENGINE_MISMATCH', message: 'Bài đánh giá này thuộc hệ thống thi khác.' });
    }

    // Validate availability dates
    const now = new Date();
    if (assessment.availableFrom && now < new Date(assessment.availableFrom)) {
      return res.status(403).json({
        status: 'error',
        code: 'ASSESSMENT_NOT_AVAILABLE',
        message: 'Assessment is not yet available',
      });
    }
    if (assessment.availableUntil && now > new Date(assessment.availableUntil)) {
      return res.status(403).json({
        status: 'error',
        code: 'ASSESSMENT_EXPIRED',
        message: 'Assessment availability window has expired',
      });
    }

    // REQUIREMENT 1: Resumable Start Attempt
    // Check if student already has an active in_progress Attempt for this assessment
    let activeAttempt = await Attempt.findOne({
      student: studentId,
      assessment: id,
      status: 'in_progress',
    });

    if (activeAttempt) {
      // Check if attempt is still within valid window
      const engine = resolveAttemptEngine(activeAttempt, assessment);
      if (engine !== 'standard') {
        return res.status(409).json({ status: 'error', code: 'ATTEMPT_ENGINE_UNRESOLVED', message: 'Không thể xác định hệ thống chấm điểm của lượt làm bài.' });
      }
      if (now < activeAttempt.deadlineAt) {
        const sanitizedQuestions = activeAttempt.questionSnapshots.map(sanitizeQuestionSnapshotForStudent);
        return res.json({
          status: 'success',
          message: 'Resumed existing active attempt',
          data: {
            attemptId: activeAttempt._id,
            startedAt: activeAttempt.startedAt,
            deadlineAt: activeAttempt.deadlineAt,
            serverTime: now,
            revision: activeAttempt.revision || 1,
            durationMinutes: assessment.durationMinutes,
            answers: activeAttempt.answers || {},
            questions: sanitizedQuestions,
          },
        });
      } else {
        await finalizeAttempt({ Attempt, attempt: activeAttempt, assessment, engine: 'standard', now });
      }
    }

    // REQUIREMENT 15 & 9: Attempt Limit Check
    const submittedCount = await Attempt.countDocuments({
      student: studentId,
      assessment: id,
      status: { $in: ['submitted', 'completed'] },
    });

    if (assessment.attemptLimit > 0 && submittedCount >= assessment.attemptLimit) {
      return res.status(403).json({
        status: 'error',
        code: 'ATTEMPT_LIMIT_REACHED',
        message: 'Bạn đã sử dụng hết số lượt làm bài kiểm tra này.',
      });
    }

    // REQUIREMENT 2: Snapshot strategy (Build immutable question snapshots)
    const questionSnapshots = [];
    for (const item of assessment.questions) {
      const qDoc = await Question.findById(item.question);
      if (!qDoc) continue;

      questionSnapshots.push({
        questionId: qDoc._id.toString(),
        type: qDoc.type,
        questionText: qDoc.questionText,
        options: qDoc.options || [],
        correctAnswers: qDoc.correctAnswers || [],
        score: item.score || qDoc.score || 1,
        explanation: qDoc.explanation || '',
      });
    }

    if (questionSnapshots.length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Assessment has no valid questions',
      });
    }

    const startedAt = new Date();
    const deadlineAt = new Date(startedAt.getTime() + assessment.durationMinutes * 60 * 1000);

    let newAttempt;
    try {
      newAttempt = await Attempt.create({
        student: studentId,
        assessment: id,
        assessmentType: assessment.type,
        engine: 'standard',
        passScore: Number(assessment.passScore || 0),
        startedAt,
        deadlineAt,
        status: 'in_progress',
        revision: 1,
        questionSnapshots,
        answers: {},
      });
    } catch (error) {
      // Concurrent browser starts (for example React development StrictMode) must
      // resume the winning attempt rather than create a duplicate.
      if (error?.code !== 11000) throw error;
      const resumedAttempt = await Attempt.findOne({ student: studentId, assessment: id, status: 'in_progress' });
      if (!resumedAttempt) throw error;
      return res.json({
        status: 'success',
        message: 'Resumed existing active attempt',
        data: {
          attemptId: resumedAttempt._id,
          startedAt: resumedAttempt.startedAt,
          deadlineAt: resumedAttempt.deadlineAt,
          serverTime: new Date(),
          revision: resumedAttempt.revision || 1,
          durationMinutes: assessment.durationMinutes,
          answers: resumedAttempt.answers || {},
          questions: resumedAttempt.questionSnapshots.map(sanitizeQuestionSnapshotForStudent),
        },
      });
    }

    const sanitizedQuestions = questionSnapshots.map(sanitizeQuestionSnapshotForStudent);

    res.status(201).json({
      status: 'success',
      message: 'Attempt started successfully',
      data: {
        attemptId: newAttempt._id,
        startedAt: newAttempt.startedAt,
        deadlineAt: newAttempt.deadlineAt,
        serverTime: new Date(),
        revision: newAttempt.revision,
        durationMinutes: assessment.durationMinutes,
        questions: sanitizedQuestions,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Student submit assessment attempt with server-side auto grading
// @route   POST /api/v1/attempts/:attemptId/submit
// @access  Private (Active Student)
export const submitAttempt = async (req, res, next) => {
  try {
    const { attemptId } = req.params;
    const studentId = req.user._id;

    const attempt = await Attempt.findById(attemptId);
    if (!attempt) {
      return res.status(404).json({
        status: 'error',
        message: 'Attempt not found',
      });
    }

    // Ownership check (Requirement 21 & TEST AQ)
    if (attempt.student.toString() !== studentId.toString()) {
      return res.status(403).json({
        status: 'error',
        message: 'You are not authorized to submit this attempt',
      });
    }

    const assessment = await Assessment.findById(attempt.assessment).select('passScore examFormat showCorrectAnswers');
    const engine = resolveAttemptEngine(attempt, assessment);
    if (!engine) {
      return res.status(409).json({ status: 'error', code: 'ATTEMPT_ENGINE_UNRESOLVED', message: 'Không thể xác định hệ thống chấm điểm của lượt làm bài.' });
    }
    if (engine !== 'standard') {
      return res.status(409).json({ status: 'error', code: 'ATTEMPT_ENGINE_MISMATCH', message: 'Lượt làm bài này phải được nộp qua hệ thống thi TOEIC.' });
    }

    // Idempotent submission: the stored terminal result is never regraded.
    if (isTerminalAttempt(attempt)) {
      const passResult = getPassResult(attempt, assessment);
      return res.json({
        status: 'success',
        message: 'Attempt already submitted',
        data: {
          result: {
            attemptId: attempt._id,
            score: attempt.score,
            maxScore: attempt.maxScore,
            percentage: passResult.scorePercentage,
            ...passResult,
            correctCount: attempt.correctCount,
            incorrectCount: attempt.incorrectCount,
            unansweredCount: attempt.unansweredCount,
            duration: attempt.duration,
            submittedAt: attempt.submittedAt,
            isExpired: attempt.isExpired,
          },
        },
      });
    }

    const now = new Date();
    if (now < new Date(attempt.deadlineAt) && !Number.isInteger(req.body.revision)) {
      return res.status(428).json({ status: 'error', code: 'REVISION_REQUIRED', message: 'Thiếu revision để nộp bài an toàn. Hãy tải lại lượt làm bài.' });
    }
    const finalized = await finalizeAttempt({
      Attempt,
      attempt,
      assessment,
      engine,
      answers: req.body.answers,
      revision: req.body.revision,
      now,
    });
    if (finalized.kind === 'revision_conflict') {
      return res.status(409).json({
        status: 'error',
        code: now >= attempt.deadlineAt ? 'ATTEMPT_FINALIZING' : 'STALE_REVISION',
        message: 'Bài làm đã được cập nhật ở phiên khác. Hãy tải lại trạng thái mới nhất trước khi nộp.',
        serverRevision: finalized.attempt?.revision || attempt.revision || 1,
        answers: finalized.attempt?.answers || attempt.answers || {},
      });
    }
    const finalAttempt = finalized.attempt;
    const passResult = getPassResult(finalAttempt, assessment);

    res.json({
      status: 'success',
      message: 'Attempt submitted and auto-graded successfully',
      data: {
        result: {
          attemptId: attempt._id,
          score: finalAttempt.score,
          maxScore: finalAttempt.maxScore,
          percentage: passResult.scorePercentage,
          ...passResult,
          correctCount: finalAttempt.correctCount,
          incorrectCount: finalAttempt.incorrectCount,
          unansweredCount: finalAttempt.unansweredCount,
          duration: finalAttempt.duration,
          submittedAt: finalAttempt.submittedAt,
          isExpired: finalAttempt.isExpired,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Student get attempt result
// @route   GET /api/v1/attempts/:attemptId/result
// @access  Private (Active Student)
export const getAttemptResult = async (req, res, next) => {
  try {
    const { attemptId } = req.params;
    const studentId = req.user._id;

    let attempt = await Attempt.findById(attemptId);
    if (!attempt) {
      return res.status(404).json({
        status: 'error',
        message: 'Attempt not found',
      });
    }

    // Ownership check (Requirement 21 & TEST BH)
    if (attempt.student.toString() !== studentId.toString()) {
      return res.status(403).json({
        status: 'error',
        message: 'Not authorized to view this result',
      });
    }

    const assessment = await Assessment.findById(attempt.assessment);
    const engine = resolveAttemptEngine(attempt, assessment);
    if (!engine) {
      return res.status(409).json({ status: 'error', code: 'ATTEMPT_ENGINE_UNRESOLVED', message: 'Không thể xác định hệ thống chấm điểm của lượt làm bài.' });
    }
    if (engine !== 'standard') {
      return res.status(409).json({ status: 'error', code: 'ATTEMPT_ENGINE_MISMATCH', message: 'Lượt làm bài này thuộc hệ thống thi TOEIC.' });
    }

    if (attempt.status === 'in_progress' && new Date() >= new Date(attempt.deadlineAt)) {
      const finalized = await finalizeAttempt({ Attempt, attempt, assessment, engine, now: new Date() });
      if (finalized.kind === 'revision_conflict') return res.status(409).json({ status: 'error', code: 'ATTEMPT_FINALIZING', message: 'Đang hoàn tất bài làm. Vui lòng tải lại kết quả.' });
      attempt = finalized.attempt;
    }

    if (attempt.status !== 'submitted') {
      return res.status(400).json({
        status: 'error',
        message: 'Attempt has not been submitted yet',
      });
    }

    const showAnswers = assessment ? assessment.showCorrectAnswers : true;

    const questionReview = attempt.questionSnapshots.map((q) => {
      const studentAns = attempt.answers ? attempt.answers[q.questionId] : undefined;
      let isCorrect = false;

      if (studentAns !== undefined && studentAns !== null && studentAns !== '') {
        if (q.type === 'single_choice') {
          isCorrect = typeof studentAns === 'string' && q.correctAnswers.includes(studentAns);
        } else if (q.type === 'multiple_choice') {
          const submittedArray = Array.isArray(studentAns) ? studentAns : [studentAns];
          const submittedSet = new Set(submittedArray);
          const correctSet = new Set(q.correctAnswers);
          if (submittedSet.size === correctSet.size) {
            isCorrect = [...submittedSet].every((val) => correctSet.has(val));
          }
        } else if (q.type === 'fill_blank' || q.type === 'typed_answer') {
          const normSub = String(studentAns).trim().toLowerCase();
          isCorrect = q.correctAnswers.some((ans) => String(ans).trim().toLowerCase() === normSub);
        }
      }

      const item = {
        questionId: q.questionId,
        questionText: q.questionText,
        type: q.type,
        options: q.options,
        studentAnswer: studentAns || null,
        isCorrect,
        score: q.score,
      };

      if (showAnswers) {
        item.correctAnswers = q.correctAnswers;
        item.explanation = q.explanation;
      }

      return item;
    });

    const passResult = getPassResult(attempt, assessment);

    res.json({
      status: 'success',
      data: {
        result: {
          attemptId: attempt._id,
          assessmentTitle: assessment ? assessment.title : 'Assessment',
          assessmentType: attempt.assessmentType,
          score: attempt.score,
          maxScore: attempt.maxScore,
          percentage: passResult.scorePercentage,
          ...passResult,
          correctCount: attempt.correctCount,
          incorrectCount: attempt.incorrectCount,
          unansweredCount: attempt.unansweredCount,
          duration: attempt.duration,
          submittedAt: attempt.submittedAt,
          showCorrectAnswers: showAnswers,
          questions: questionReview,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Student get attempt history
// @route   GET /api/v1/attempts/history
// @access  Private (Active Student)
export const getStudentHistory = async (req, res, next) => {
  try {
    const studentId = req.user._id;
    const now = new Date();
    const expiredAttempts = await Attempt.find({
      student: studentId,
      status: 'in_progress',
      deadlineAt: { $lte: now },
    }).populate('assessment');
    for (const expiredAttempt of expiredAttempts) {
      if (resolveAttemptEngine(expiredAttempt, expiredAttempt.assessment) !== 'standard') continue;
      await finalizeAttempt({ Attempt, attempt: expiredAttempt, assessment: expiredAttempt.assessment, engine: 'standard', now });
    }

    const attempts = await Attempt.find({
      student: studentId,
      status: { $in: ['submitted', 'completed'] },
    })
      .populate('assessment', 'title type passScore totalScore examFormat toeicMode')
      .sort({ submittedAt: -1 });

    const history = attempts.map((att) => ({
      _id: att._id,
      attemptId: att._id,
      assessment: att.assessment ? {
        _id: att.assessment._id,
        title: att.assessment.title,
        type: att.assessment.type,
        examFormat: att.assessment.examFormat,
        toeicMode: att.assessment.toeicMode,
        passScore: getPassResult(att, att.assessment).passScore,
        totalScore: att.assessment.totalScore,
      } : { title: 'Assessment', type: att.assessmentType, passScore: getPassResult(att).passScore },
      toeicBreakdown: att.toeicBreakdown,
      type: att.assessmentType,
      score: att.score,
      maxScore: att.maxScore,
      totalScore: att.maxScore,
      percentage: getPassResult(att, att.assessment).scorePercentage,
      scorePercentage: getPassResult(att, att.assessment).scorePercentage,
      passScore: getPassResult(att, att.assessment).passScore,
      passed: getPassResult(att, att.assessment).passed,
      duration: att.duration,
      submittedAt: att.submittedAt,
    }));

    res.json({
      status: 'success',
      data: {
        attempts,
        history,
      },
    });
  } catch (error) {
    next(error);
  }
};

// Admin reports use the read-only canonical attempt reporting pipeline.
export { getAdminResults } from './adminReportingController.js';
