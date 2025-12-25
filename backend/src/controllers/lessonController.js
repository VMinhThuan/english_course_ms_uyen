import Lesson from '../models/Lesson.js';
import Course from '../models/Course.js';

// @desc    Get lessons by course
// @route   GET /api/v1/lessons/course/:courseId
// @access  Private
export const getLessonsByCourse = async (req, res, next) => {
  try {
    const { courseId } = req.params;

    const lessons = await Lesson.find({ course: courseId })
      .sort({ order: 1 })
      .select('-__v');

    res.json({
      status: 'success',
      data: {
        lessons,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Create lesson
// @route   POST /api/v1/lessons
// @access  Private (Teacher/Admin)
export const createLesson = async (req, res, next) => {
  try {
    const { title, content, videoUrl, audioUrl, courseId, order, duration } =
      req.body;

    // Check if course exists and user is teacher/admin
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({
        status: 'error',
        message: 'Course not found',
      });
    }

    // Check if user is the teacher or admin
    if (
      req.user.role !== 'admin' &&
      course.teacher.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({
        status: 'error',
        message: 'Not authorized to create lesson for this course',
      });
    }

    const lesson = await Lesson.create({
      title,
      content,
      videoUrl,
      audioUrl,
      course: courseId,
      order: order || 0,
      duration: duration || 0,
      attachments: req.files
        ? req.files.map((file) => ({
            filename: file.filename,
            url: file.path,
            type: file.mimetype,
          }))
        : [],
    });

    res.status(201).json({
      status: 'success',
      message: 'Lesson created successfully',
      data: {
        lesson,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update lesson
// @route   PUT /api/v1/lessons/:id
// @access  Private (Teacher/Admin)
export const updateLesson = async (req, res, next) => {
  try {
    const { id } = req.params;
    const lesson = await Lesson.findById(id).populate('course');

    if (!lesson) {
      return res.status(404).json({
        status: 'error',
        message: 'Lesson not found',
      });
    }

    // Check authorization
    if (
      req.user.role !== 'admin' &&
      lesson.course.teacher.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({
        status: 'error',
        message: 'Not authorized to update this lesson',
      });
    }

    const updatedLesson = await Lesson.findByIdAndUpdate(
      id,
      {
        ...req.body,
        attachments: req.files
          ? req.files.map((file) => ({
              filename: file.filename,
              url: file.path,
              type: file.mimetype,
            }))
          : lesson.attachments,
      },
      { new: true, runValidators: true }
    );

    res.json({
      status: 'success',
      message: 'Lesson updated successfully',
      data: {
        lesson: updatedLesson,
      },
    });
  } catch (error) {
    next(error);
  }
};

