import Course from '../models/Course.js';

// @desc    Get all courses
// @route   GET /api/v1/courses
// @access  Public
export const getCourses = async (req, res, next) => {
  try {
    const { level, category, search } = req.query;
    const query = { isPublished: true };

    if (level) query.level = level;
    if (category) query.category = category;
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ];
    }

    const courses = await Course.find(query)
      .populate('teacher', 'fullName email')
      .select('-students')
      .sort({ createdAt: -1 });

    res.json({
      status: 'success',
      data: {
        courses,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get course by ID
// @route   GET /api/v1/courses/:id
// @access  Public
export const getCourseById = async (req, res, next) => {
  try {
    const course = await Course.findById(req.params.id)
      .populate('teacher', 'fullName email avatar')
      .select('-students');

    if (!course) {
      return res.status(404).json({
        status: 'error',
        message: 'Course not found',
      });
    }

    res.json({
      status: 'success',
      data: {
        course,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Create course
// @route   POST /api/v1/courses
// @access  Private (Teacher/Admin)
export const createCourse = async (req, res, next) => {
  try {
    const course = await Course.create({
      ...req.body,
      teacher: req.user._id,
    });

    res.status(201).json({
      status: 'success',
      message: 'Course created successfully',
      data: {
        course,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update course
// @route   PUT /api/v1/courses/:id
// @access  Private (Teacher/Admin)
export const updateCourse = async (req, res, next) => {
  try {
    const course = await Course.findById(req.params.id);

    if (!course) {
      return res.status(404).json({
        status: 'error',
        message: 'Course not found',
      });
    }

    // Check authorization
    if (
      req.user.role !== 'admin' &&
      course.teacher.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({
        status: 'error',
        message: 'Not authorized to update this course',
      });
    }

    const updatedCourse = await Course.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    res.json({
      status: 'success',
      message: 'Course updated successfully',
      data: {
        course: updatedCourse,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete course
// @route   DELETE /api/v1/courses/:id
// @access  Private (Admin)
export const deleteCourse = async (req, res, next) => {
  try {
    const course = await Course.findById(req.params.id);

    if (!course) {
      return res.status(404).json({
        status: 'error',
        message: 'Course not found',
      });
    }

    await Course.findByIdAndDelete(req.params.id);

    res.json({
      status: 'success',
      message: 'Course deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

