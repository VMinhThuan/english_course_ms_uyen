import Test from '../models/Test.js';
import Enrollment from '../models/Enrollment.js';
import { checkReadingText } from '../utils/textSimilarity.js';

// @desc    Get test by lesson
// @route   GET /api/v1/tests/lesson/:lessonId
// @access  Private
export const getTestByLesson = async (req, res, next) => {
  try {
    const { lessonId } = req.params;

    const test = await Test.findOne({ lesson: lessonId }).populate('lesson');

    if (!test) {
      return res.status(404).json({
        status: 'error',
        message: 'Test not found for this lesson',
      });
    }

    // Remove correct answers for students
    if (req.user.role === 'student') {
      const testWithoutAnswers = {
        ...test.toObject(),
        questions: test.questions.map((q) => ({
          ...q.toObject(),
          correctAnswer: undefined, // Hide correct answer
        })),
      };
      return res.json({
        status: 'success',
        data: {
          test: testWithoutAnswers,
        },
      });
    }

    res.json({
      status: 'success',
      data: {
        test,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Submit test
// @route   POST /api/v1/tests/:testId/submit
// @access  Private (Student)
export const submitTest = async (req, res, next) => {
  try {
    const { testId } = req.params;
    const { answers, readingText } = req.body; // readingText for reading test
    const studentId = req.user._id;

    const test = await Test.findById(testId).populate('lesson');
    if (!test) {
      return res.status(404).json({
        status: 'error',
        message: 'Test not found',
      });
    }

    // Check if student is enrolled in the course
    const enrollment = await Enrollment.findOne({
      student: studentId,
      course: test.lesson.course,
    });

    if (!enrollment) {
      return res.status(403).json({
        status: 'error',
        message: 'You must enroll in the course to take this test',
      });
    }

    let score = 0;
    let totalPoints = 0;
    const results = [];

    // Grade each question
    for (let i = 0; i < test.questions.length; i++) {
      const question = test.questions[i];
      totalPoints += question.points;

      let isCorrect = false;
      let studentAnswer = answers[i] || '';

      // Special handling for reading test
      if (test.type === 'reading' && question.type === 'fill-blank') {
        if (readingText && question.textToRead) {
          // Check reading text similarity
          const readingCheck = checkReadingText(
            readingText,
            question.expectedText || question.textToRead,
            question.similarityThreshold || 0.8
          );
          isCorrect = readingCheck.isCorrect;
          results.push({
            questionIndex: i,
            question: question.question,
            studentAnswer: readingText,
            isCorrect,
            similarity: readingCheck.similarity,
            message: readingCheck.message,
            points: isCorrect ? question.points : 0,
          });
        } else {
          // Regular answer check
          isCorrect =
            studentAnswer.toLowerCase().trim() ===
            question.correctAnswer.toLowerCase().trim();
          results.push({
            questionIndex: i,
            question: question.question,
            studentAnswer,
            isCorrect,
            points: isCorrect ? question.points : 0,
          });
        }
      } else {
        // Regular multiple choice or fill blank
        isCorrect =
          studentAnswer.toLowerCase().trim() ===
          question.correctAnswer.toLowerCase().trim();
        results.push({
          questionIndex: i,
          question: question.question,
          studentAnswer,
          isCorrect,
          points: isCorrect ? question.points : 0,
        });
      }

      if (isCorrect) {
        score += question.points;
      }
    }

    const percentage = Math.round((score / totalPoints) * 100);

    // Update enrollment progress
    const testResult = {
      test: testId,
      score: percentage,
      submittedAt: new Date(),
    };

    enrollment.progress.completedTests.push(testResult);
    await enrollment.save();

    res.json({
      status: 'success',
      message: 'Test submitted successfully',
      data: {
        score,
        totalPoints,
        percentage,
        results,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get test result
// @route   GET /api/v1/tests/:testId/result
// @access  Private (Student)
export const getTestResult = async (req, res, next) => {
  try {
    const { testId } = req.params;
    const studentId = req.user._id;

    const enrollment = await Enrollment.findOne({
      student: studentId,
      'progress.completedTests.test': testId,
    });

    if (!enrollment) {
      return res.status(404).json({
        status: 'error',
        message: 'Test result not found',
      });
    }

    const testResult = enrollment.progress.completedTests.find(
      (t) => t.test.toString() === testId
    );

    res.json({
      status: 'success',
      data: {
        result: testResult,
      },
    });
  } catch (error) {
    next(error);
  }
};

