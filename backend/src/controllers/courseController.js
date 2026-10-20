import mongoose from 'mongoose';
import Course from '../models/Course.js';
import Review from '../models/Review.js';
import Rating from '../models/Rating.js';
import Instructor from '../models/Instructor.js';
import Lesson from '../models/Lesson.js';
import Material from '../models/Material.js';
import Vocabulary from '../models/Vocabulary.js';
import LearningProgress from '../models/LearningProgress.js';
import Enrollment from '../models/Enrollment.js';
import fs from 'fs';
import { isPathWithinRoot, resolveStoredUploadPath } from '../security/materialAccessPolicy.js';
import { sanitizeLessonRecord } from '../security/lessonHtml.js';
import { getUploadDir } from '../utils/uploadConfig.js';

const removeMaterialFileIfUnreferenced = async (material) => {
  const uploadRoot = getUploadDir();
  const filePath = resolveStoredUploadPath(material, uploadRoot);
  if (!filePath || !isPathWithinRoot(uploadRoot, filePath)) return;

  const otherMaterial = await Material.exists({
    _id: { $ne: material._id },
    $or: [{ filePath }, ...(material.fileUrl ? [{ fileUrl: material.fileUrl }] : [])],
  });
  if (otherMaterial) return;
  if (material.fileUrl && await Lesson.exists({ 'attachments.url': material.fileUrl })) return;

  if (fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
    } catch {
      console.error('Failed to delete an unreferenced course material file.');
    }
  }
};

function generateSlug(title) {
  const base = (title || 'course')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${base}-${Date.now().toString().slice(-4)}`;
}

// @desc    Get all courses (Public / Student: Published only)
// @route   GET /api/v1/courses
// @access  Public
export const getCourses = async (req, res, next) => {
  try {
    const { level, category, search, englishType, sortBy } = req.query;
    const query = { isPublished: true };

    if (level) {
      const levelMap = {
        beginner: 'Beginner',
        intermediate: 'Intermediate',
        advanced: 'Advanced',
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
    courses = courses.map((course) => {
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

// @desc    Get course by ID (Public)
// @route   GET /api/v1/courses/:id
// @access  Public
export const getCourseById = async (req, res, next) => {
  try {
    const { id } = req.params;

    let course;
    if (mongoose.Types.ObjectId.isValid(id)) {
      course = await Course.findById(id)
        .populate('teacher', 'fullName email avatar')
        .select('-students');
    } else {
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

    const reviews = await Review.find({ course: course._id, isApproved: true })
      .sort({ createdAt: -1 })
      .limit(10);

    const rating = await Rating.findOne({ course: course._id });

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
      reviews: reviews.map((r) => ({
        id: r._id.toString(),
        userName: r.userName,
        userAvatar: r.userAvatar,
        rating: r.rating,
        timeAgo: r.timeAgo,
        text: r.text,
      })),
      ratingDistribution: rating ? rating.ratings : { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
      instructors: instructors.map((i) => ({
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

// @desc    Get courses for Admin/Teacher (all courses or teacher-owned, includes draft)
// @route   GET /api/v1/admin/courses
// @access  Private (Teacher/Admin)
export const getAdminCourses = async (req, res, next) => {
  try {
    const { status, search, level, englishType } = req.query;
    const filter = {};

    // Teacher ownership restriction
    if (req.user.role !== 'admin') {
      filter.teacher = req.user._id;
    }

    // Status filter
    if (status === 'published') {
      filter.isPublished = true;
    } else if (status === 'draft') {
      filter.isPublished = false;
    }

    if (level && level !== 'all') {
      filter.level = level;
    }

    if (englishType && englishType !== 'all') {
      filter.englishType = englishType;
    }

    if (search && search.trim()) {
      filter.$or = [
        { title: { $regex: search.trim(), $options: 'i' } },
        { description: { $regex: search.trim(), $options: 'i' } },
      ];
    }

    const courses = await Course.find(filter)
      .populate('teacher', 'fullName email avatar')
      .sort({ createdAt: -1 });

    const coursesWithCounts = await Promise.all(
      courses.map(async (course) => {
        const lessonCount = await Lesson.countDocuments({ course: course._id });
        const enrolledCount = await Enrollment.countDocuments({ course: course._id });
        return {
          ...course.toObject(),
          lessonCount,
          enrolledCount: enrolledCount || course.students?.length || 0,
        };
      })
    );

    res.json({
      status: 'success',
      data: {
        courses: coursesWithCounts,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single course by ID for Admin/Teacher (includes draft)
// @route   GET /api/v1/admin/courses/:id
// @access  Private (Teacher/Admin)
export const getAdminCourseById = async (req, res, next) => {
  try {
    const { id } = req.params;
    let course;
    if (mongoose.Types.ObjectId.isValid(id)) {
      course = await Course.findById(id).populate('teacher', 'fullName email avatar');
    } else {
      course = await Course.findOne({ slug: id }).populate('teacher', 'fullName email avatar');
    }

    if (!course) {
      return res.status(404).json({
        status: 'error',
        message: 'Course not found',
      });
    }

    if (req.user.role !== 'admin' && course.teacher?._id?.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        status: 'error',
        message: 'Not authorized to view this course in admin',
      });
    }

    const lessons = await Lesson.find({ course: course._id }).sort({ order: 1, createdAt: 1 });
    const enrolledCount = await Enrollment.countDocuments({ course: course._id });

    res.json({
      status: 'success',
      data: {
        course: {
          ...course.toObject(),
          lessons: lessons.map((lesson) => sanitizeLessonRecord(lesson)),
          enrolledCount: enrolledCount || course.students?.length || 0,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Create course
// @route   POST /api/v1/courses OR /api/v1/admin/courses
// @access  Private (Teacher/Admin)
export const createCourse = async (req, res, next) => {
  try {
    const {
      title,
      description,
      thumbnail,
      image,
      price,
      discountedPrice,
      discount,
      level,
      category,
      englishType,
      skills,
      isPublished,
      slug: reqSlug,
    } = req.body;

    if (!title || !description || !level || !englishType) {
      return res.status(400).json({
        status: 'error',
        message: 'title, description, level, and englishType are required',
      });
    }

    const slug = reqSlug && reqSlug.trim() ? reqSlug.trim() : generateSlug(title);

    const course = await Course.create({
      title,
      description,
      slug,
      thumbnail: thumbnail || image || '',
      image: image || thumbnail || '',
      teacher: req.user._id,
      price: price ? Number(price) : 0,
      discountedPrice: discountedPrice ? Number(discountedPrice) : null,
      discount: discount ? Number(discount) : 0,
      level,
      category: category || 'general',
      englishType,
      skills: Array.isArray(skills) ? skills : (skills ? skills.split(',').map((s) => s.trim()) : []),
      isPublished: Boolean(isPublished),
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
// @route   PUT /api/v1/courses/:id OR /api/v1/admin/courses/:id
// @access  Private (Teacher/Admin)
export const updateCourse = async (req, res, next) => {
  try {
    const { id } = req.params;

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

    if (
      req.user.role !== 'admin' &&
      course.teacher.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({
        status: 'error',
        message: 'Not authorized to update this course',
      });
    }

    const updates = { ...req.body };
    if (updates.skills && typeof updates.skills === 'string') {
      updates.skills = updates.skills.split(',').map((s) => s.trim());
    }

    const updatedCourse = await Course.findByIdAndUpdate(
      course._id,
      updates,
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

// @desc    Update course publish status
// @route   PATCH /api/v1/admin/courses/:id/status
// @access  Private (Teacher/Admin)
export const updateCourseStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { isPublished } = req.body;

    if (typeof isPublished !== 'boolean') {
      return res.status(400).json({
        status: 'error',
        message: 'isPublished must be a boolean (true or false)',
      });
    }

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

    if (req.user.role !== 'admin' && course.teacher.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        status: 'error',
        message: 'Not authorized to update status of this course',
      });
    }

    course.isPublished = isPublished;
    await course.save();

    res.json({
      status: 'success',
      message: `Đã ${isPublished ? 'xuất bản' : 'chuyển thành bản nháp'} khóa học thành công!`,
      data: {
        course,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Reorder course lessons
// @route   PUT /api/v1/admin/courses/:id/reorder-lessons
// @access  Private (Teacher/Admin)
export const reorderCourseLessons = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { lessonIds } = req.body;

    if (!Array.isArray(lessonIds)) {
      return res.status(400).json({
        status: 'error',
        message: 'lessonIds must be an array of Lesson IDs',
      });
    }

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

    if (req.user.role !== 'admin' && course.teacher.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        status: 'error',
        message: 'Not authorized to reorder lessons for this course',
      });
    }

    const updatePromises = lessonIds.map((lessonId, index) =>
      Lesson.findOneAndUpdate(
        { _id: lessonId, course: course._id },
        { order: index + 1 },
        { new: true }
      )
    );

    await Promise.all(updatePromises);

    const updatedLessons = await Lesson.find({ course: course._id }).sort({ order: 1, createdAt: 1 });

    res.json({
      status: 'success',
      message: 'Cập nhật thứ tự bài học thành công',
      data: {
        lessons: updatedLessons.map((lesson) => sanitizeLessonRecord(lesson)),
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete course safely
// @route   DELETE /api/v1/courses/:id OR /api/v1/admin/courses/:id
// @access  Private (Teacher/Admin)
export const deleteCourse = async (req, res, next) => {
  try {
    const { id } = req.params;

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

    if (
      req.user.role !== 'admin' &&
      course.teacher.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({
        status: 'error',
        message: 'Not authorized to delete this course',
      });
    }

    // Safety check: Cannot delete if students are enrolled
    const enrolledCount = await Enrollment.countDocuments({ course: course._id });
    if (enrolledCount > 0 || (course.students && course.students.length > 0)) {
      return res.status(409).json({
        status: 'error',
        message: 'Không thể xóa khóa học đã có học viên đăng ký hoặc có tiến độ học tập.',
      });
    }

    // Safe Cascade cleanup
    const lessons = await Lesson.find({ course: course._id });
    for (const lesson of lessons) {
      const materials = await Material.find({ lesson: lesson._id });
      for (const mat of materials) {
        await removeMaterialFileIfUnreferenced(mat);
      }
      await Material.deleteMany({ lesson: lesson._id });
      await Vocabulary.deleteMany({ lesson: lesson._id });
      await LearningProgress.deleteMany({ lesson: lesson._id });
    }
    await Lesson.deleteMany({ course: course._id });

    // Cleanup materials directly associated with course
    const courseMaterials = await Material.find({ course: course._id });
    for (const mat of courseMaterials) {
      await removeMaterialFileIfUnreferenced(mat);
    }
    await Material.deleteMany({ course: course._id });

    await Course.findByIdAndDelete(course._id);

    res.json({
      status: 'success',
      message: 'Đã xóa khóa học và toàn bộ bài học, tài liệu liên quan thành công!',
    });
  } catch (error) {
    next(error);
  }
};
