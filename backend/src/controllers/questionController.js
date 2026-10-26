import Question from '../models/Question.js';
import Lesson from '../models/Lesson.js';
import Assessment from '../models/Assessment.js';
import Attempt from '../models/Attempt.js';
import { getPart5EligibilityIssues } from '../services/toeicPart5BankSelection.js';

// Helper to validate type rules
const validateQuestionPayload = ({ type, options, correctAnswers }) => {
  if (!type || !['single_choice', 'multiple_choice', 'fill_blank', 'typed_answer'].includes(type)) {
    return 'Invalid question type';
  }

  if (!correctAnswers || !Array.isArray(correctAnswers) || correctAnswers.length === 0) {
    return 'At least one correct answer must be provided';
  }

  if (type === 'single_choice') {
    if (!options || !Array.isArray(options) || options.length < 2) {
      return 'Single choice question requires at least 2 options';
    }
    if (correctAnswers.length !== 1) {
      return 'Single choice question must have exactly 1 correct answer';
    }
    const optionIds = options.map((o) => o.id);
    if (!optionIds.includes(correctAnswers[0])) {
      return 'Correct answer ID must match one of the option IDs';
    }
  }

  if (type === 'multiple_choice') {
    if (!options || !Array.isArray(options) || options.length < 2) {
      return 'Multiple choice question requires at least 2 options';
    }
    const optionIds = options.map((o) => o.id);
    for (const ans of correctAnswers) {
      if (!optionIds.includes(ans)) {
        return 'All correct answer IDs must match valid option IDs';
      }
    }
  }

  return null;
};

const isToeicPart5 = (toeicPart) => toeicPart !== null && toeicPart !== undefined && toeicPart !== '' && Number(toeicPart) === 5;

const validatePart5QuestionPayload = ({ questionText, type, options, correctAnswers, explanation }) => {
  if (typeof questionText !== 'string' || !questionText.trim()) {
    return 'Part 5 question text is required';
  }

  if (type !== 'single_choice') {
    return 'TOEIC Part 5 questions must use single_choice type';
  }

  if (!Array.isArray(options) || options.length !== 4) {
    return 'TOEIC Part 5 questions require exactly 4 options (A, B, C, D)';
  }

  const optionIds = options.map((option) => option?.id);
  const expectedIds = new Set(['A', 'B', 'C', 'D']);
  if (optionIds.some((id) => !expectedIds.has(id)) || new Set(optionIds).size !== 4) {
    return 'TOEIC Part 5 option IDs must be exactly A, B, C, and D';
  }

  if (options.some((option) => typeof option?.text !== 'string' || !option.text.trim())) {
    return 'TOEIC Part 5 option text is required for A, B, C, and D';
  }

  if (!Array.isArray(correctAnswers) || correctAnswers.length !== 1 || !optionIds.includes(correctAnswers[0])) {
    return 'TOEIC Part 5 questions require exactly 1 correct answer matching an option ID';
  }

  if (typeof explanation !== 'string' || !explanation.trim()) {
    return 'TOEIC Part 5 explanation is required';
  }

  return null;
};

// @desc    Admin create question
// @route   POST /api/v1/admin/questions
// @access  Private (Admin/Teacher)
export const createQuestion = async (req, res, next) => {
  try {
    const { questionText, type, explanation, options, correctAnswers, score, lesson, topic, status, toeicPart } = req.body;

    if (!questionText) {
      return res.status(400).json({
        status: 'error',
        message: 'Question text is required',
      });
    }

    const validationErr = isToeicPart5(toeicPart)
      ? validatePart5QuestionPayload({ questionText, type, options, correctAnswers, explanation })
      : validateQuestionPayload({ type, options, correctAnswers });
    if (validationErr) {
      return res.status(400).json({
        status: 'error',
        message: validationErr,
      });
    }

    if (lesson) {
      const parentLesson = await Lesson.findById(lesson);
      if (!parentLesson) {
        return res.status(404).json({
          status: 'error',
          message: 'Referenced lesson does not exist',
        });
      }
    }

    const question = await Question.create({
      questionText,
      type,
      explanation: explanation || '',
      options: options || [],
      correctAnswers,
      score: score || 1,
      lesson: lesson || null,
      topic: topic || 'General',
      status: status || 'draft',
      ...(toeicPart !== undefined ? { toeicPart } : {}),
      createdBy: req.user._id,
    });

    res.status(201).json({
      status: 'success',
      message: 'Question created successfully',
      data: {
        question,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Admin get questions with filters & search & pagination
// @route   GET /api/v1/admin/questions
// @access  Private (Admin/Teacher)
export const getQuestions = async (req, res, next) => {
  try {
    const { search, lesson, topic, type, status, toeicPart, page = 1, limit = 50 } = req.query;

    const filter = {};
    if (lesson) filter.lesson = lesson;
    if (topic) filter.topic = topic;
    if (type) filter.type = type;
    if (status) filter.status = status;
    if (toeicPart !== undefined && toeicPart !== '') {
      const parsedToeicPart = Number(toeicPart);
      if (!Number.isInteger(parsedToeicPart) || parsedToeicPart < 1 || parsedToeicPart > 7) {
        return res.status(400).json({
          status: 'error',
          message: 'toeicPart must be an integer from 1 to 7',
        });
      }
      filter.toeicPart = parsedToeicPart;
    }
    if (search) {
      filter.questionText = { $regex: search, $options: 'i' };
    }

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 50;
    const skip = (pageNum - 1) * limitNum;

    const total = await Question.countDocuments(filter);
    const questions = await Question.find(filter)
      .populate('lesson', 'title status')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    res.json({
      status: 'success',
      data: {
        questions,
        pagination: {
          total,
          page: pageNum,
          pages: Math.ceil(total / limitNum) || 1,
          limit: limitNum,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Admin get question by ID
// @route   GET /api/v1/admin/questions/:id
// @access  Private (Admin/Teacher)
export const getQuestionById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const question = await Question.findById(id).populate('lesson', 'title status');

    if (!question) {
      return res.status(404).json({
        status: 'error',
        message: 'Question not found',
      });
    }

    res.json({
      status: 'success',
      data: {
        question,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Admin update question
// @route   PUT /api/v1/admin/questions/:id
// @access  Private (Admin/Teacher)
export const updateQuestion = async (req, res, next) => {
  try {
    const { id } = req.params;
    const question = await Question.findById(id).select('+importBatchId');

    if (!question) {
      return res.status(404).json({
        status: 'error',
        message: 'Question not found',
      });
    }

    const updateBody = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    const operatorKeys = Object.keys(updateBody).filter((field) => field.startsWith('$'));
    const requestedStatus = updateBody.status ?? updateBody.$set?.status ?? updateBody.$max?.status;

    if (question.importBatchId && req.user.role === 'teacher' && requestedStatus === 'published') {
      return res.status(403).json({
        status: 'error',
        code: 'ADMIN_REVIEW_REQUIRED',
        message: 'An Admin must review imported Questions before publishing them.',
      });
    }
    if (question.importBatchId && req.user.role === 'teacher' && operatorKeys.length > 0) {
      return res.status(400).json({
        status: 'error',
        code: 'IMPORTED_QUESTION_FIELD_UPDATES_ONLY',
        message: 'Use ordinary field assignments to update an imported Question.',
      });
    }

    const effectiveValue = (field) => {
      if (Object.prototype.hasOwnProperty.call(updateBody, field)) return updateBody[field];
      if (Object.prototype.hasOwnProperty.call(updateBody.$set || {}, field)) return updateBody.$set[field];
      if (Object.prototype.hasOwnProperty.call(updateBody.$unset || {}, field)) return undefined;
      return question[field];
    };
    const payload = {
      questionText: effectiveValue('questionText'),
      type: effectiveValue('type'),
      options: effectiveValue('options'),
      correctAnswers: effectiveValue('correctAnswers'),
      explanation: effectiveValue('explanation'),
      toeicPart: effectiveValue('toeicPart'),
    };

    const validationErr = isToeicPart5(payload.toeicPart)
      ? operatorKeys.some((field) => !['$set', '$unset'].includes(field))
        ? 'TOEIC Part 5 updates must assign or unset fields directly.'
        : validatePart5QuestionPayload(payload)
      : validateQuestionPayload({
        type: payload.type || question.type,
        options: payload.options || question.options,
        correctAnswers: payload.correctAnswers || question.correctAnswers,
      });
    if (validationErr) {
      return res.status(400).json({
        status: 'error',
        message: validationErr,
      });
    }

    const safeUpdate = { ...updateBody };
    for (const [field, value] of Object.entries(safeUpdate)) {
      if (field.startsWith('import')) {
        delete safeUpdate[field];
        continue;
      }
      if (field.startsWith('$') && value && typeof value === 'object' && !Array.isArray(value)) {
        const filtered = Object.fromEntries(Object.entries(value).filter(([path, destination]) => {
          const sourcePath = path.split('.')[0];
          const destinationPath = field === '$rename' && typeof destination === 'string'
            ? destination.split('.')[0]
            : '';
          return !sourcePath.startsWith('import') && !destinationPath.startsWith('import');
        }));
        if (Object.keys(filtered).length > 0) safeUpdate[field] = filtered;
        else delete safeUpdate[field];
      }
    }

    const updatedQuestion = await Question.findByIdAndUpdate(id, safeUpdate, {
      new: true,
      runValidators: true,
    });

    res.json({
      status: 'success',
      message: 'Question updated successfully',
      data: {
        question: updatedQuestion,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Admin delete question (safely checks references)
// @route   DELETE /api/v1/admin/questions/:id
// @access  Private (Admin/Teacher)
export const deleteQuestion = async (req, res, next) => {
  try {
    const { id } = req.params;

    const question = await Question.findById(id);
    if (!question) {
      return res.status(404).json({
        status: 'error',
        message: 'Question not found',
      });
    }

    // Safety Requirement 5: Check if referenced by Assessment or Attempt
    const inAssessment = await Assessment.findOne({ 'questions.question': id });
    const inAttempt = await Attempt.findOne({ 'questionSnapshots.questionId': id });

    if (inAssessment || inAttempt) {
      return res.status(409).json({
        status: 'error',
        message: 'Cannot delete question referenced by assessments or student attempts. Change status to hidden instead.',
      });
    }

    await Question.findByIdAndDelete(id);

    res.json({
      status: 'success',
      message: 'Question deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Admin publish all valid draft Part 5 bank questions
// @route   POST /api/v1/admin/questions/publish-part5-bank
// @access  Private (Admin)
export const publishPart5BankQuestions = async (req, res, next) => {
  try {
    const draftQuestions = await Question.find({
      toeicPart: 5,
      status: 'draft',
      bankSourceQuestionId: { $exists: false },
      bankTargetAssessmentId: { $exists: false },
    });

    const validIds = [];
    for (const q of draftQuestions) {
      if (getPart5EligibilityIssues(q).filter((i) => i.code !== 'QUESTION_NOT_PUBLISHED').length === 0) {
        validIds.push(q._id);
      }
    }

    if (validIds.length > 0) {
      await Question.updateMany(
        { _id: { $in: validIds } },
        { $set: { status: 'published' } }
      );
    }

    res.json({
      status: 'success',
      message: `Đã xuất bản thành công ${validIds.length} câu hỏi Part 5.`,
      data: {
        publishedCount: validIds.length,
        skippedCount: draftQuestions.length - validIds.length,
      },
    });
  } catch (error) {
    next(error);
  }
};

