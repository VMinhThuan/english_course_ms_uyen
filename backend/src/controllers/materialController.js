import Material from '../models/Material.js';
import Lesson from '../models/Lesson.js';
import Course from '../models/Course.js';
import fs from 'fs';
import path from 'path';

// @desc    Admin create material
// @route   POST /api/v1/admin/materials
// @access  Private (Admin/Teacher)
export const createMaterial = async (req, res, next) => {
  try {
    const { title, description, lessonId, lesson: lessonParam, allowDownload, status } = req.body;
    const targetLessonId = lessonId || lessonParam;

    if (!targetLessonId) {
      return res.status(400).json({
        status: 'error',
        message: 'Lesson ID is required',
      });
    }

    // Validate lesson relationship & parent course
    const parentLesson = await Lesson.findById(targetLessonId).populate('course');
    if (!parentLesson) {
      return res.status(404).json({
        status: 'error',
        message: 'Referenced lesson does not exist',
      });
    }

    if (
      req.user.role !== 'admin' &&
      parentLesson.course &&
      parentLesson.course.teacher &&
      parentLesson.course.teacher.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({
        status: 'error',
        message: 'Not authorized to add materials to this course',
      });
    }

    let fileUrl = req.body.fileUrl || '';
    let filePath = req.body.filePath || '';
    let fileType = req.body.fileType || 'document';
    let fileSize = req.body.fileSize || 0;

    if (req.file) {
      filePath = req.file.path;
      fileUrl = `/uploads/${req.file.filename}`;
      fileType = req.file.mimetype || fileType;
      fileSize = req.file.size || fileSize;
    }

    if (!fileUrl && !filePath) {
      return res.status(400).json({
        status: 'error',
        message: 'File or fileUrl is required for material',
      });
    }

    const material = await Material.create({
      title: title || (req.file ? req.file.originalname : 'Material'),
      description: description || '',
      lesson: parentLesson._id,
      course: parentLesson.course?._id || parentLesson.course,
      fileUrl: fileUrl || `/uploads/${path.basename(filePath)}`,
      filePath: filePath,
      fileType: fileType,
      fileSize: fileSize,
      allowDownload: allowDownload === undefined ? true : Boolean(allowDownload),
      status: status || 'published',
    });

    res.status(201).json({
      status: 'success',
      message: 'Material created successfully',
      data: {
        material,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Admin get all materials
// @route   GET /api/v1/admin/materials
// @access  Private (Admin/Teacher)
export const getAdminMaterials = async (req, res, next) => {
  try {
    const { lesson, lessonId, course, courseId, status, search } = req.query;

    const filter = {};
    const targetLesson = lessonId || lesson;
    const targetCourse = courseId || course;

    // RBAC: If teacher, constrain to teacher's own courses
    if (req.user.role !== 'admin') {
      const teacherCourses = await Course.find({ teacher: req.user._id }).select('_id');
      const teacherCourseIds = teacherCourses.map((c) => c._id);
      if (targetCourse) {
        if (!teacherCourseIds.some((id) => id.toString() === targetCourse.toString())) {
          return res.json({
            status: 'success',
            data: {
              materials: [],
            },
          });
        }
        filter.course = targetCourse;
      } else {
        filter.course = { $in: teacherCourseIds };
      }
    } else if (targetCourse) {
      filter.course = targetCourse;
    }

    if (targetLesson) filter.lesson = targetLesson;
    if (status) filter.status = status;
    if (search) {
      filter.title = { $regex: search, $options: 'i' };
    }

    const materials = await Material.find(filter)
      .populate('lesson', 'title status')
      .populate('course', 'title teacher')
      .sort({ createdAt: -1 });

    res.json({
      status: 'success',
      data: {
        materials,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Admin get material by ID
// @route   GET /api/v1/admin/materials/:id
// @access  Private (Admin/Teacher)
export const getAdminMaterialById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const material = await Material.findById(id)
      .populate('lesson', 'title status')
      .populate('course', 'title teacher');

    if (!material) {
      return res.status(404).json({
        status: 'error',
        message: 'Material not found',
      });
    }

    if (
      req.user.role !== 'admin' &&
      material.course &&
      material.course.teacher &&
      material.course.teacher.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({
        status: 'error',
        message: 'Not authorized to view this material',
      });
    }

    res.json({
      status: 'success',
      data: {
        material,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Admin update material
// @route   PUT /api/v1/admin/materials/:id
// @access  Private (Admin/Teacher)
export const updateMaterial = async (req, res, next) => {
  try {
    const { id } = req.params;
    const material = await Material.findById(id).populate('course');

    if (!material) {
      return res.status(404).json({
        status: 'error',
        message: 'Material not found',
      });
    }

    if (
      req.user.role !== 'admin' &&
      material.course &&
      material.course.teacher &&
      material.course.teacher.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({
        status: 'error',
        message: 'Not authorized to update this material',
      });
    }

    const updates = { ...req.body };

    // If lesson is updated, validate it
    if (updates.lesson || updates.lessonId) {
      const targetLessonId = updates.lessonId || updates.lesson;
      const parentLesson = await Lesson.findById(targetLessonId).populate('course');
      if (!parentLesson) {
        return res.status(404).json({
          status: 'error',
          message: 'Referenced lesson does not exist',
        });
      }
      if (
        req.user.role !== 'admin' &&
        parentLesson.course &&
        parentLesson.course.teacher &&
        parentLesson.course.teacher.toString() !== req.user._id.toString()
      ) {
        return res.status(403).json({
          status: 'error',
          message: 'Not authorized to move material to this lesson',
        });
      }
      updates.lesson = parentLesson._id;
      updates.course = parentLesson.course?._id || parentLesson.course;
    }

    if (req.file) {
      // Cleanup old physical file if exists
      if (material.filePath && fs.existsSync(material.filePath)) {
        try {
          fs.unlinkSync(material.filePath);
        } catch (err) {
          console.error(`Error deleting old material file: ${material.filePath}`, err);
        }
      }
      updates.filePath = req.file.path;
      updates.fileUrl = `/uploads/${req.file.filename}`;
      updates.fileType = req.file.mimetype;
      updates.fileSize = req.file.size;
    }

    const updatedMaterial = await Material.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true,
    });

    res.json({
      status: 'success',
      message: 'Material updated successfully',
      data: {
        material: updatedMaterial,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Admin delete material (with physical file cleanup)
// @route   DELETE /api/v1/admin/materials/:id
// @access  Private (Admin/Teacher)
export const deleteMaterial = async (req, res, next) => {
  try {
    const { id } = req.params;
    const material = await Material.findById(id).populate('course');

    if (!material) {
      return res.status(404).json({
        status: 'error',
        message: 'Material not found',
      });
    }

    if (
      req.user.role !== 'admin' &&
      material.course &&
      material.course.teacher &&
      material.course.teacher.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({
        status: 'error',
        message: 'Not authorized to delete this material',
      });
    }

    // Safely remove physical file
    if (material.filePath && fs.existsSync(material.filePath)) {
      try {
        fs.unlinkSync(material.filePath);
      } catch (err) {
        console.error(`Error deleting material file: ${material.filePath}`, err);
      }
    }

    await Material.findByIdAndDelete(id);

    res.json({
      status: 'success',
      message: 'Material and physical file deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Student get materials by lesson
// @route   GET /api/v1/lessons/:lessonId/materials
// @access  Private (Student/Admin)
export const getStudentMaterialsByLesson = async (req, res, next) => {
  try {
    const { lessonId } = req.params;

    const lesson = await Lesson.findById(lessonId);
    if (!lesson) {
      return res.status(404).json({
        status: 'error',
        message: 'Lesson not found',
      });
    }

    // Security check for student
    if (req.user && req.user.role === 'student' && lesson.status !== 'published') {
      return res.status(404).json({
        status: 'error',
        message: 'Lesson not found',
      });
    }

    const materials = await Material.find({
      lesson: lessonId,
      status: 'published',
    }).select('-filePath -__v');

    res.json({
      status: 'success',
      data: {
        materials,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Student secure material download
// @route   GET /api/v1/materials/:id/download
// @access  Private (Active Student)
export const downloadMaterial = async (req, res, next) => {
  try {
    const { id } = req.params;
    const material = await Material.findById(id);

    if (!material) {
      return res.status(404).json({
        status: 'error',
        message: 'Material not found',
      });
    }

    // 1. Validate material status
    if (material.status !== 'published') {
      return res.status(403).json({
        status: 'error',
        message: 'Material is not published',
      });
    }

    // 2. Validate parent lesson status & access
    const parentLesson = await Lesson.findById(material.lesson);
    if (!parentLesson || parentLesson.status !== 'published') {
      return res.status(403).json({
        status: 'error',
        message: 'Parent lesson is not accessible',
      });
    }

    // 3. Validate download permission
    if (!material.allowDownload) {
      return res.status(403).json({
        status: 'error',
        code: 'MATERIAL_DOWNLOAD_NOT_ALLOWED',
        message: 'Tài liệu này không cho phép tải xuống.',
      });
    }

    // Serve file
    if (material.filePath && fs.existsSync(material.filePath)) {
      return res.download(material.filePath, material.title || path.basename(material.filePath));
    } else {
      // Fallback redirect if served via URL
      return res.redirect(material.fileUrl);
    }
  } catch (error) {
    next(error);
  }
};
