import Assessment from '../models/Assessment.js';
import Question from '../models/Question.js';
import Attempt from '../models/Attempt.js';
import { hasActiveQuestionBankSelectionLock } from '../services/toeicPart5BankSelection.js';

const rejectDuringQuestionBankSelection = async (assessmentId, res) => {
  if (!await hasActiveQuestionBankSelectionLock(assessmentId)) return false;
  res.status(409).json({
    status: 'error',
    code: 'QUESTION_BANK_SELECTION_BUSY',
    message: 'Đang xử lý lựa chọn câu hỏi Part 5. Hãy thử lại sau.',
  });
  return true;
};

// Helper to normalize questions input
const formatAssessmentQuestions = async (rawQuestions) => {
  if (!rawQuestions || !Array.isArray(rawQuestions)) return [];

  const formatted = [];
  for (const item of rawQuestions) {
    const qId = typeof item === 'string' ? item : item.question || item._id;
    if (!qId) continue;

    const qDoc = await Question.findById(qId);
    if (!qDoc) {
      throw new Error(`Referenced question ID ${qId} does not exist`);
    }

    const qScore = typeof item === 'object' && item.score !== undefined ? Number(item.score) : qDoc.score || 1;
    if (qScore <= 0) {
      throw new Error(`Question score for ${qDoc.questionText} must be greater than 0`);
    }

    formatted.push({
      question: qDoc._id,
      score: qScore,
    });
  }

  return formatted;
};

// @desc    Admin create assessment (exercise or exam)
// @route   POST /api/v1/admin/assessments
// @access  Private (Admin/Teacher)
export const createAssessment = async (req, res, next) => {
  try {
    const {
      title,
      description,
      type,
      questions,
      durationMinutes,
      status,
      availableFrom,
      availableUntil,
      attemptLimit,
      showCorrectAnswers,
      passScore,
    } = req.body;

    if (!title || type !== 'exercise') {
      return res.status(400).json({
        status: 'error',
        message: 'Tên bài và loại bài tập hợp lệ là bắt buộc.',
      });
    }
    if (passScore !== undefined && (!Number.isFinite(Number(passScore)) || Number(passScore) < 0 || Number(passScore) > 100)) {
      return res.status(400).json({ status: 'error', message: 'Pass score must be a percentage between 0 and 100' });
    }

    let formattedQuestions = [];
    if (questions && Array.isArray(questions)) {
      try {
        formattedQuestions = await formatAssessmentQuestions(questions);
      } catch (err) {
        return res.status(400).json({
          status: 'error',
          message: err.message,
        });
      }
    }

    const assessment = new Assessment({
      title,
      description: description || '',
      type: 'exercise',
      questions: formattedQuestions,
      durationMinutes: durationMinutes !== undefined ? Number(durationMinutes) : 30,
      status: status || 'draft',
      availableFrom: availableFrom ? new Date(availableFrom) : null,
      availableUntil: availableUntil ? new Date(availableUntil) : null,
      attemptLimit: attemptLimit !== undefined ? Number(attemptLimit) : 0,
      passScore: passScore !== undefined ? Number(passScore) : 0,
      showCorrectAnswers: showCorrectAnswers === undefined ? true : Boolean(showCorrectAnswers),
      createdBy: req.user._id,
    });

    await assessment.save();

    res.status(201).json({
      status: 'success',
      message: 'Assessment created successfully',
      data: {
        assessment,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Admin get assessments with filters & search
// @route   GET /api/v1/admin/assessments
// @access  Private (Admin/Teacher)
export const getAdminAssessments = async (req, res, next) => {
  try {
    const { status, search } = req.query;

    const filter = { type: 'exercise', examFormat: { $in: ['standard', null] } };
    if (status) filter.status = status;
    if (search) {
      filter.title = { $regex: search, $options: 'i' };
    }

    const assessments = await Assessment.find(filter)
      .sort({ createdAt: -1 });

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

// @desc    Admin get single assessment by ID
// @route   GET /api/v1/admin/assessments/:id
// @access  Private (Admin/Teacher)
export const getAdminAssessmentById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const assessment = await Assessment.findOne({ _id: id, type: 'exercise', examFormat: { $in: ['standard', null] } })
      .populate('questions.question');

    if (!assessment) {
      return res.status(404).json({
        status: 'error',
        message: 'Assessment not found',
      });
    }
    res.json({
      status: 'success',
      data: {
        assessment,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Admin update assessment
// @route   PUT /api/v1/admin/assessments/:id
// @access  Private (Admin/Teacher)
export const updateAssessment = async (req, res, next) => {
  try {
    const { id } = req.params;
    const assessment = await Assessment.findById(id);

    if (!assessment) {
      return res.status(404).json({
        status: 'error',
        message: 'Assessment not found',
      });
    }
    if (assessment.type !== 'exercise' || !['standard', undefined, null].includes(assessment.examFormat)) {
      return res.status(404).json({ status: 'error', message: 'Không tìm thấy bài tập.' });
    }
    if (await rejectDuringQuestionBankSelection(id, res)) return;

    const updates = { ...req.body };

    if (updates.passScore !== undefined && (!Number.isFinite(Number(updates.passScore)) || Number(updates.passScore) < 0 || Number(updates.passScore) > 100)) {
      return res.status(400).json({ status: 'error', message: 'Pass score must be a percentage between 0 and 100' });
    }
    if (updates.passScore !== undefined) updates.passScore = Number(updates.passScore);

    if (updates.questions && Array.isArray(updates.questions)) {
      try {
        updates.questions = await formatAssessmentQuestions(updates.questions);
      } catch (err) {
        return res.status(400).json({
          status: 'error',
          message: err.message,
        });
      }
    }

    delete updates.lesson;
    delete updates.course;
    delete updates.type;
    delete updates.examFormat;

    Object.assign(assessment, updates);
    await assessment.save();

    res.json({
      status: 'success',
      message: 'Assessment updated successfully',
      data: {
        assessment,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Admin update assessment status with Publish Validation
// @route   PATCH /api/v1/admin/assessments/:id/status
// @access  Private (Admin/Teacher)
export const updateAssessmentStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const allowedStatuses = ['draft', 'published', 'hidden'];
    if (!status || !allowedStatuses.includes(status)) {
      return res.status(400).json({
        status: 'error',
        message: `Invalid status. Allowed values: ${allowedStatuses.join(', ')}`,
      });
    }

    const assessment = await Assessment.findById(id);
    if (!assessment) {
      return res.status(404).json({
        status: 'error',
        message: 'Assessment not found',
      });
    }
    if (assessment.type !== 'exercise' || !['standard', undefined, null].includes(assessment.examFormat)) {
      return res.status(404).json({ status: 'error', message: 'Không tìm thấy bài tập.' });
    }
    if (await rejectDuringQuestionBankSelection(id, res)) return;

    // Publish Validation (Requirement 7 & TEST BJ)
    if (status === 'published') {
      if (!assessment.title || assessment.title.trim() === '') {
        return res.status(400).json({
          status: 'error',
          message: 'Cannot publish assessment without a valid title',
        });
      }
      if (!assessment.questions || assessment.questions.length === 0) {
        return res.status(400).json({
          status: 'error',
          message: 'Cannot publish assessment without at least one assigned question',
        });
      }
      for (const qItem of assessment.questions) {
        const qDoc = await Question.findById(qItem.question);
        if (!qDoc) {
          return res.status(400).json({
            status: 'error',
            message: `Assigned question ID ${qItem.question} no longer exists`,
          });
        }
        if (!qItem.score || qItem.score <= 0) {
          return res.status(400).json({
            status: 'error',
            message: 'All questions must have a positive score > 0',
          });
        }
      }
      if (!assessment.durationMinutes || assessment.durationMinutes <= 0) {
        return res.status(400).json({
          status: 'error',
          message: 'Assessment duration must be greater than 0 minutes',
        });
      }
      if (
        assessment.availableFrom &&
        assessment.availableUntil &&
        new Date(assessment.availableUntil) <= new Date(assessment.availableFrom)
      ) {
        return res.status(400).json({
          status: 'error',
          message: 'availableUntil must be strictly after availableFrom',
        });
      }
    }

    assessment.status = status;
    await assessment.save();

    res.json({
      status: 'success',
      message: `Assessment status updated to ${status}`,
      data: {
        assessment,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Admin delete assessment (with Delete Safety for existing attempts)
// @route   DELETE /api/v1/admin/assessments/:id
// @access  Private (Admin/Teacher)
export const deleteAssessment = async (req, res, next) => {
  try {
    const { id } = req.params;

    const assessment = await Assessment.findById(id);
    if (!assessment) {
      return res.status(404).json({
        status: 'error',
        message: 'Assessment not found',
      });
    }
    if (assessment.type !== 'exercise' || !['standard', undefined, null].includes(assessment.examFormat)) {
      return res.status(404).json({ status: 'error', message: 'Không tìm thấy bài tập.' });
    }
    if (await rejectDuringQuestionBankSelection(id, res)) return;

    // Safety Requirement 6 & TEST BD: Cannot delete assessment with student attempts
    const existingAttempts = await Attempt.countDocuments({ assessment: id });
    if (existingAttempts > 0) {
      return res.status(409).json({
        status: 'error',
        message: 'Cannot delete assessment with existing student attempts. Change status to hidden instead.',
      });
    }

    await Assessment.findByIdAndDelete(id);

    res.json({
      status: 'success',
      message: 'Assessment deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};
