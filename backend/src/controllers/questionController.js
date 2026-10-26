import Question from '../models/Question.js';
import Assessment from '../models/Assessment.js';
import Attempt from '../models/Attempt.js';

const normalizePart5Answer = (value) => String(value ?? '').normalize('NFKC').trim().toLocaleLowerCase('en');

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
    const { questionText, type, explanation, options, correctAnswers, score, topic, status, toeicPart } = req.body;

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

    const question = await Question.create({
      questionText,
      type,
      explanation: explanation || '',
      options: options || [],
      correctAnswers,
      score: score || 1,
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
    const { search, topic, type, status, toeicPart, page = 1, limit = 50 } = req.query;

    const filter = {};
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
    const question = await Question.findById(id);

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

// Published Part 5 bank only. Correct answers are deliberately omitted until submission.
export const getStudentPart5Questions = async (req, res, next) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 20));
    const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 80) : '';
    const filter = {
      toeicPart: 5,
      status: 'published',
      ...(search ? { questionText: { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } } : {}),
    };
    const [items, total] = await Promise.all([
      Question.find(filter)
        .select('_id questionText type options topic')
        .sort({ createdAt: 1, _id: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Question.countDocuments(filter),
    ]);
    return res.json({
      status: 'success',
      data: { items, pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 } },
    });
  } catch (error) {
    return next(error);
  }
};

export const submitStudentPart5Answer = async (req, res, next) => {
  try {
    const selected = typeof req.body.answer === 'string' ? req.body.answer : '';
    if (!selected) return res.status(400).json({ status: 'error', message: 'Hãy chọn một đáp án.' });

    const question = await Question.findOne({ _id: req.params.id, toeicPart: 5, status: 'published' })
      .select('correctAnswers explanation options')
      .lean();
    if (!question) return res.status(404).json({ status: 'error', message: 'Câu hỏi Part 5 không khả dụng.' });

    const answer = question.correctAnswers?.[0] || '';
    const correctOption = question.options?.find((option) => normalizePart5Answer(option.id) === normalizePart5Answer(answer)) || null;
    return res.json({
      status: 'success',
      data: {
        isCorrect: normalizePart5Answer(selected) === normalizePart5Answer(answer),
        correctOption,
        explanation: question.explanation || '',
      },
    });
  } catch (error) {
    return next(error);
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
