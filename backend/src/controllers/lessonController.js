import Lesson from '../models/Lesson.js';
import Course from '../models/Course.js';
import Material from '../models/Material.js';
import Vocabulary from '../models/Vocabulary.js';
import LearningProgress from '../models/LearningProgress.js';
import fs from 'fs';
import path from 'path';

// @desc    Get lessons by course
// @route   GET /api/v1/lessons/course/:courseId
// @access  Private
export const getLessonsByCourse = async (req, res, next) => {
  try {
    const { courseId } = req.params;

    const filter = { course: courseId };
    // Students only see published lessons
    if (req.user && req.user.role === 'student') {
      filter.status = 'published';
    }

    const lessons = await Lesson.find(filter)
      .sort({ order: 1, createdAt: 1 })
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

// @desc    Get single lesson by ID with attached materials & vocabulary
// @route   GET /api/v1/lessons/:id
// @access  Private
export const getLessonById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const lesson = await Lesson.findById(id).populate('course', 'title');

    if (!lesson) {
      return res.status(404).json({
        status: 'error',
        message: 'Lesson not found',
      });
    }

    // Security Gate: Students must NOT access draft or hidden lessons
    if (req.user && req.user.role === 'student' && lesson.status !== 'published') {
      return res.status(404).json({
        status: 'error',
        message: 'Lesson not found',
      });
    }

    // Fetch published materials & vocabulary for this lesson
    const materials = await Material.find({
      lesson: id,
      status: 'published',
    }).select('-__v');

    const vocabulary = await Vocabulary.find({
      lesson: id,
      status: 'published',
    }).select('-__v');

    res.json({
      status: 'success',
      data: {
        lesson,
        materials,
        vocabulary,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Create lesson
// @route   POST /api/v1/lessons OR /api/v1/admin/lessons
// @access  Private (Teacher/Admin)
export const createLesson = async (req, res, next) => {
  try {
    const { title, content, description, topic, status, courseId, course, order, duration, videoUrl, audioUrl } = req.body;
    const targetCourseId = courseId || course;

    if (!targetCourseId) {
      return res.status(400).json({
        status: 'error',
        message: 'Course ID is required',
      });
    }

    const courseDoc = await Course.findById(targetCourseId);
    if (!courseDoc) {
      return res.status(404).json({
        status: 'error',
        message: 'Course not found',
      });
    }

    if (
      req.user.role !== 'admin' &&
      courseDoc.teacher &&
      courseDoc.teacher.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({
        status: 'error',
        message: 'Not authorized to create lesson for this course',
      });
    }

    const lesson = await Lesson.create({
      title,
      content: content || '',
      description: description || '',
      topic: topic || 'General',
      status: status || 'draft',
      videoUrl: videoUrl || '',
      audioUrl: audioUrl || '',
      course: targetCourseId,
      order: order || 0,
      duration: duration || 0,
      attachments: req.files
        ? req.files.map((file) => ({
            filename: file.filename,
            url: `/uploads/${file.filename}`,
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
// @route   PUT /api/v1/lessons/:id OR /api/v1/admin/lessons/:id
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

    if (
      req.user.role !== 'admin' &&
      lesson.course &&
      lesson.course.teacher &&
      lesson.course.teacher.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({
        status: 'error',
        message: 'Not authorized to update this lesson',
      });
    }

    // Validate course if supplied
    if (req.body.courseId || req.body.course) {
      const targetCourseId = req.body.courseId || req.body.course;
      const cDoc = await Course.findById(targetCourseId);
      if (!cDoc) {
        return res.status(404).json({
          status: 'error',
          message: 'Referenced course not found',
        });
      }
      req.body.course = targetCourseId;
    }

    const updatedLesson = await Lesson.findByIdAndUpdate(
      id,
      {
        ...req.body,
        attachments: req.files
          ? req.files.map((file) => ({
              filename: file.filename,
              url: `/uploads/${file.filename}`,
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

// @desc    Standardized lesson status update
// @route   PATCH /api/v1/admin/lessons/:id/status
// @access  Private (Admin/Teacher)
export const updateLessonStatus = async (req, res, next) => {
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

    const lesson = await Lesson.findById(id).populate('course');
    if (!lesson) {
      return res.status(404).json({
        status: 'error',
        message: 'Lesson not found',
      });
    }

    if (
      req.user.role !== 'admin' &&
      lesson.course &&
      lesson.course.teacher &&
      lesson.course.teacher.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({
        status: 'error',
        message: 'Not authorized to update status of this lesson',
      });
    }

    lesson.status = status;
    await lesson.save();

    res.json({
      status: 'success',
      message: `Lesson status updated to ${status}`,
      data: {
        lesson,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete lesson with cascade cleanup
// @route   DELETE /api/v1/lessons/:id OR /api/v1/admin/lessons/:id
// @access  Private (Teacher/Admin)
export const deleteLesson = async (req, res, next) => {
  try {
    const { id } = req.params;
    const lesson = await Lesson.findById(id).populate('course');

    if (!lesson) {
      return res.status(404).json({
        status: 'error',
        message: 'Lesson not found',
      });
    }

    if (
      req.user.role !== 'admin' &&
      lesson.course &&
      lesson.course.teacher &&
      lesson.course.teacher.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({
        status: 'error',
        message: 'Not authorized to delete this lesson',
      });
    }

    // 1. Cascade cleanup Materials & physical files
    const materials = await Material.find({ lesson: id });
    for (const mat of materials) {
      if (mat.filePath && fs.existsSync(mat.filePath)) {
        try {
          fs.unlinkSync(mat.filePath);
        } catch (err) {
          console.error(`Failed to delete physical file: ${mat.filePath}`, err);
        }
      }
    }
    await Material.deleteMany({ lesson: id });

    // 2. Cascade cleanup Vocabulary
    await Vocabulary.deleteMany({ lesson: id });

    // 3. Cascade cleanup LearningProgress
    await LearningProgress.deleteMany({ lesson: id });

    // 4. Delete Lesson
    await Lesson.findByIdAndDelete(id);

    res.json({
      status: 'success',
      message: 'Lesson and all associated materials, vocabulary, and progress deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};
