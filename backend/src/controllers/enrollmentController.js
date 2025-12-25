import Enrollment from '../models/Enrollment.js';
import Course from '../models/Course.js';

// @desc    Enroll in a course
// @route   POST /api/v1/enrollments
// @access  Private (Student)
export const enrollCourse = async (req, res, next) => {
  try {
    const { courseId } = req.body;
    const studentId = req.user._id;

    // Check if course exists
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({
        status: 'error',
        message: 'Course not found',
      });
    }

    // Check if already enrolled
    const existingEnrollment = await Enrollment.findOne({
      student: studentId,
      course: courseId,
    });

    if (existingEnrollment) {
      return res.status(400).json({
        status: 'error',
        message: 'Already enrolled in this course',
      });
    }

    // Create enrollment
    const enrollment = await Enrollment.create({
      student: studentId,
      course: courseId,
    });

    // Add student to course
    course.students.push(studentId);
    await course.save();

    res.status(201).json({
      status: 'success',
      message: 'Enrolled in course successfully',
      data: {
        enrollment,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get my enrolled courses
// @route   GET /api/v1/enrollments/my-courses
// @access  Private (Student)
export const getMyCourses = async (req, res, next) => {
  try {
    const studentId = req.user._id;

    const enrollments = await Enrollment.find({ student: studentId })
      .populate('course', 'title description thumbnail teacher level')
      .populate('course.teacher', 'fullName email')
      .sort({ enrolledAt: -1 });

    res.json({
      status: 'success',
      data: {
        enrollments,
      },
    });
  } catch (error) {
    next(error);
  }
};

