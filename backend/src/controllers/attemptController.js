import Attempt from '../models/Attempt.js';
import Assessment from '../models/Assessment.js';
import Question from '../models/Question.js';

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
      $and: [
        { $or: [{ availableFrom: null }, { availableFrom: { $lte: now } }] },
        { $or: [{ availableUntil: null }, { availableUntil: { $gte: now } }] },
      ],
    };

    const assessments = await Assessment.find(filter)
      .populate('lesson', 'title')
      .populate('course', 'title')
      .select('-questions.question');

    res.json({
      status: 'success',
      data: {
        assessments,
      },
    });
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

    if (!assessment || assessment.status !== 'published') {
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
      if (now <= activeAttempt.deadlineAt) {
        const sanitizedQuestions = activeAttempt.questionSnapshots.map(sanitizeQuestionSnapshotForStudent);
        return res.json({
          status: 'success',
          message: 'Resumed existing active attempt',
          data: {
            attemptId: activeAttempt._id,
            startedAt: activeAttempt.startedAt,
            deadlineAt: activeAttempt.deadlineAt,
            durationMinutes: assessment.durationMinutes,
            answers: activeAttempt.answers || {},
            questions: sanitizedQuestions,
          },
        });
      } else {
        // Active attempt has passed deadline, mark it as expired/submitted
        activeAttempt.status = 'submitted';
        activeAttempt.isExpired = true;
        activeAttempt.submittedAt = activeAttempt.deadlineAt;
        activeAttempt.duration = Math.round((activeAttempt.deadlineAt - activeAttempt.startedAt) / 1000);
        await activeAttempt.save();
      }
    }

    // REQUIREMENT 15 & 9: Attempt Limit Check
    const submittedCount = await Attempt.countDocuments({
      student: studentId,
      assessment: id,
      status: 'submitted',
    });

    if (assessment.attemptLimit > 0 && submittedCount >= assessment.attemptLimit) {
      return res.status(403).json({
        status: 'error',
        code: 'ATTEMPT_LIMIT_REACHED',
        message: `You have reached the maximum allowed attempt limit (${assessment.attemptLimit}) for this assessment.`,
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
        startedAt,
        deadlineAt,
        status: 'in_progress',
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

    // REQUIREMENT 13: Idempotent Submission / Prevent Double Submission
    if (attempt.status === 'submitted') {
      const assessment = await Assessment.findById(attempt.assessment).select('passScore');
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

    const submittedAt = new Date();
    let durationSeconds = Math.max(0, Math.round((submittedAt - attempt.startedAt) / 1000));
    let isExpired = false;

    // Deadline check with 10s buffer
    if (submittedAt.getTime() > attempt.deadlineAt.getTime() + 10000) {
      isExpired = true;
      durationSeconds = Math.round((attempt.deadlineAt - attempt.startedAt) / 1000);
    }

    const rawAnswers = req.body.answers || {};

    let totalEarnedScore = 0;
    let maxPossibleScore = 0;
    let correctCount = 0;
    let incorrectCount = 0;
    let unansweredCount = 0;

    // Server Auto-Grading against immutable questionSnapshots
    for (const snapshot of attempt.questionSnapshots) {
      const qId = snapshot.questionId;
      const qScore = snapshot.score || 1;
      maxPossibleScore += qScore;

      const subAns = rawAnswers[qId];

      if (
        subAns === undefined ||
        subAns === null ||
        subAns === '' ||
        (Array.isArray(subAns) && subAns.length === 0)
      ) {
        unansweredCount++;
        continue;
      }

      let isCorrect = false;

      if (snapshot.type === 'single_choice') {
        if (typeof subAns === 'string' && snapshot.correctAnswers.includes(subAns)) {
          isCorrect = true;
        }
      } else if (snapshot.type === 'multiple_choice') {
        const submittedArray = Array.isArray(subAns) ? subAns : [subAns];
        const submittedSet = new Set(submittedArray);
        const correctSet = new Set(snapshot.correctAnswers);

        if (submittedSet.size === correctSet.size) {
          isCorrect = [...submittedSet].every((val) => correctSet.has(val));
        }
      } else if (snapshot.type === 'fill_blank' || snapshot.type === 'typed_answer') {
        if (typeof subAns === 'string') {
          const normSub = subAns.trim().toLowerCase();
          isCorrect = snapshot.correctAnswers.some(
            (ans) => String(ans).trim().toLowerCase() === normSub
          );
        }
      }

      if (isCorrect) {
        totalEarnedScore += qScore;
        correctCount++;
      } else {
        incorrectCount++;
      }
    }

    const assessment = await Assessment.findById(attempt.assessment).select('passScore');
    const scorePercentage = maxPossibleScore > 0 ? Math.round((totalEarnedScore / maxPossibleScore) * 100) : 0;
    const passScore = Number(assessment?.passScore || 0);
    attempt.answers = rawAnswers;
    attempt.score = totalEarnedScore;
    attempt.maxScore = maxPossibleScore;
    attempt.correctCount = correctCount;
    attempt.incorrectCount = incorrectCount;
    attempt.unansweredCount = unansweredCount;
    attempt.duration = durationSeconds;
    attempt.submittedAt = submittedAt;
    attempt.status = 'submitted';
    attempt.isExpired = isExpired;
    attempt.scorePercentage = scorePercentage;
    attempt.passScore = passScore;
    attempt.passed = scorePercentage >= passScore;

    await attempt.save();

    res.json({
      status: 'success',
      message: 'Attempt submitted and auto-graded successfully',
      data: {
        result: {
          attemptId: attempt._id,
          score: totalEarnedScore,
          maxScore: maxPossibleScore,
          percentage: scorePercentage,
          scorePercentage,
          passScore,
          passed: attempt.passed,
          correctCount,
          incorrectCount,
          unansweredCount,
          duration: durationSeconds,
          submittedAt: attempt.submittedAt,
          isExpired,
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

    const attempt = await Attempt.findById(attemptId);
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

    if (attempt.status !== 'submitted') {
      return res.status(400).json({
        status: 'error',
        message: 'Attempt has not been submitted yet',
      });
    }

    const assessment = await Assessment.findById(attempt.assessment);
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

// @desc    Admin view all student attempt results
// @route   GET /api/v1/admin/results
// @access  Private (Admin/Teacher)
export const getAdminResults = async (req, res, next) => {
  try {
    const { student, assessment, type } = req.query;

    const filter = { status: { $in: ['submitted', 'completed'] } };
    if (student) filter.student = student;
    if (assessment) filter.assessment = assessment;
    if (type) filter.assessmentType = type;

    const attempts = await Attempt.find(filter)
      .populate('student', 'fullName email')
      .populate('assessment', 'title type passScore totalScore examFormat toeicMode')
      .sort({ submittedAt: -1 });

    const results = attempts.map((att) => ({
      _id: att._id,
      attemptId: att._id,
      studentName: att.student?.fullName || att.student?.email || 'Student',
      assessmentTitle: att.assessment?.title || 'Assessment',
      student: att.student,
      assessment: att.assessment,
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
        results,
      },
    });
  } catch (error) {
    next(error);
  }
};
