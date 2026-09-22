import mongoose from 'mongoose';
import Course from '../models/Course.js';
import Review from '../models/Review.js';
import Rating from '../models/Rating.js';
import Instructor from '../models/Instructor.js';

// @desc    Get all courses
// @route   GET /api/v1/courses
// @access  Public
export const getCourses = async (req, res, next) => {
  try {
    const { level, category, search, englishType, sortBy } = req.query;
    const query = { isPublished: true };

    if (level) {
      // Convert to capitalized format
      const levelMap = {
        'beginner': 'Beginner',
        'intermediate': 'Intermediate',
        'advanced': 'Advanced',
      };
      query.level = levelMap[level.toLowerCase()] || level;
    }
    if (category && category !== 'all') query.category = category;
    if (englishType && englishType !== 'all') query.englishType = englishType;
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ];
    }

    let courses = await Course.find(query)
      .populate('teacher', 'fullName email avatar')
      .select('-students')
      .sort({ createdAt: -1 });

    // Transform courses to match frontend format
    courses = courses.map(course => {
      const courseObj = course.toObject();
      return {
        id: courseObj.slug || courseObj._id.toString(),
        _id: courseObj._id.toString(),
        slug: courseObj.slug,
        title: courseObj.title,
        description: courseObj.description,
        level: courseObj.level,
        teacherName: courseObj.teacher?.fullName || 'Unknown',
        priceLabel: courseObj.discountedPrice 
          ? `$${courseObj.discountedPrice}` 
          : courseObj.price === 0 
            ? 'Free' 
            : `$${courseObj.price}`,
        price: courseObj.discountedPrice || courseObj.price,
        originalPrice: courseObj.price,
        discountedPrice: courseObj.discountedPrice,
        discount: courseObj.discount,
        rating: courseObj.rating,
        ratingCount: courseObj.ratingCount,
        category: courseObj.category,
        englishType: courseObj.englishType,
        skills: courseObj.skills || [],
        image: courseObj.image || courseObj.thumbnail,
        modules: courseObj.modules,
        hoursLeft: courseObj.hoursLeft,
      };
    });

    // Apply sorting
    if (sortBy) {
      if (sortBy === 'price-low') {
        courses.sort((a, b) => a.price - b.price);
      } else if (sortBy === 'price-high') {
        courses.sort((a, b) => b.price - a.price);
      } else if (sortBy === 'rating') {
        courses.sort((a, b) => b.rating - a.rating);
      } else if (sortBy === 'reviews') {
        courses.sort((a, b) => b.ratingCount - a.ratingCount);
      }
    }

    res.json({
      success: true,
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
    const { id } = req.params;
    
    // Check if id is a valid ObjectId, if not, search by slug
    let course;
    if (mongoose.Types.ObjectId.isValid(id)) {
      course = await Course.findById(id)
        .populate('teacher', 'fullName email avatar')
        .select('-students');
    } else {
      // Search by slug
      course = await Course.findOne({ slug: id })
        .populate('teacher', 'fullName email avatar')
        .select('-students');
    }

    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found',
      });
    }

    // Get reviews for this course
    const reviews = await Review.find({ course: course._id, isApproved: true })
      .sort({ createdAt: -1 })
      .limit(10);

    // Get rating distribution
    const rating = await Rating.findOne({ course: course._id });

    // Get instructors for this course (all instructors for now, can filter by course later)
    const instructors = await Instructor.find({ isActive: true })
      .populate('user', 'fullName email avatar')
      .limit(10);

    const courseObj = course.toObject();
    const courseData = {
      id: courseObj.slug || courseObj._id.toString(),
      _id: courseObj._id.toString(),
      slug: courseObj.slug,
      title: courseObj.title,
      description: courseObj.description,
      level: courseObj.level,
      teacherName: courseObj.teacher?.fullName || 'Unknown',
      price: courseObj.price,
      discountedPrice: courseObj.discountedPrice,
      discount: courseObj.discount,
      rating: courseObj.rating,
      ratingCount: courseObj.ratingCount,
      englishType: courseObj.englishType,
      skills: courseObj.skills || [],
      modules: courseObj.modules,
      hoursLeft: courseObj.hoursLeft,
      image: courseObj.image || courseObj.thumbnail,
      teacher: courseObj.teacher,
      reviews: reviews.map(r => ({
        id: r._id.toString(),
        userName: r.userName,
        userAvatar: r.userAvatar,
        rating: r.rating,
        timeAgo: r.timeAgo,
        text: r.text,
      })),
      ratingDistribution: rating ? rating.ratings : { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
      instructors: instructors.map(i => ({
        id: i._id.toString(),
        name: i.name,
        title: i.title,
        specialization: i.specialization,
        experience: i.experience,
        bio: i.bio,
        rating: i.rating,
        students: i.students,
        courses: i.courses,
        avatar: i.avatar,
      })),
    };

    res.json({
      success: true,
      data: {
        course: courseData,
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
    const { id } = req.params;
    
    // Check if id is a valid ObjectId, if not, search by slug
    let course;
    if (mongoose.Types.ObjectId.isValid(id)) {
      course = await Course.findById(id);
    } else {
      course = await Course.findOne({ slug: id });
    }

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

    const courseId = course._id;
    const updatedCourse = await Course.findByIdAndUpdate(
      courseId,
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
    const { id } = req.params;
    
    // Check if id is a valid ObjectId, if not, search by slug
    let course;
    if (mongoose.Types.ObjectId.isValid(id)) {
      course = await Course.findById(id);
    } else {
      course = await Course.findOne({ slug: id });
    }

    if (!course) {
      return res.status(404).json({
        status: 'error',
        message: 'Course not found',
      });
    }

    await Course.findByIdAndDelete(course._id);

    res.json({
      status: 'success',
      message: 'Course deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

