import Question from '../models/Question.js';
import Lesson from '../models/Lesson.js';
import Assessment from '../models/Assessment.js';
import Attempt from '../models/Attempt.js';

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

// @desc    Admin create question
// @route   POST /api/v1/admin/questions
// @access  Private (Admin/Teacher)
export const createQuestion = async (req, res, next) => {
  try {
    const { questionText, type, explanation, options, correctAnswers, score, lesson, topic, status } = req.body;

    if (!questionText) {
      return res.status(400).json({
        status: 'error',
        message: 'Question text is required',
      });
    }

    const validationErr = validateQuestionPayload({ type, options, correctAnswers });
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
    const { search, lesson, topic, type, status, page = 1, limit = 50 } = req.query;

    const filter = {};
    if (lesson) filter.lesson = lesson;
    if (topic) filter.topic = topic;
    if (type) filter.type = type;
    if (status) filter.status = status;
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
    const question = await Question.findById(id);

    if (!question) {
      return res.status(404).json({
        status: 'error',
        message: 'Question not found',
      });
    }

    const payload = {
      type: req.body.type || question.type,
      options: req.body.options || question.options,
      correctAnswers: req.body.correctAnswers || question.correctAnswers,
    };

    const validationErr = validateQuestionPayload(payload);
    if (validationErr) {
      return res.status(400).json({
        status: 'error',
        message: validationErr,
      });
    }

    const updatedQuestion = await Question.findByIdAndUpdate(id, req.body, {
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
