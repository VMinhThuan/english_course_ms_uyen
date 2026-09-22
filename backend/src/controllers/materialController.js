import Material from '../models/Material.js';
import Lesson from '../models/Lesson.js';
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

    // Validate lesson relationship
    const parentLesson = await Lesson.findById(targetLessonId);
    if (!parentLesson) {
      return res.status(404).json({
        status: 'error',
        message: 'Referenced lesson does not exist',
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
      course: parentLesson.course, // Derived strictly from backend
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

    if (targetLesson) filter.lesson = targetLesson;
    if (targetCourse) filter.course = targetCourse;
    if (status) filter.status = status;
    if (search) {
      filter.title = { $regex: search, $options: 'i' };
    }

    const materials = await Material.find(filter)
      .populate('lesson', 'title status')
      .populate('course', 'title')
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
      .populate('course', 'title');

    if (!material) {
      return res.status(404).json({
        status: 'error',
        message: 'Material not found',
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
    const material = await Material.findById(id);

    if (!material) {
      return res.status(404).json({
        status: 'error',
        message: 'Material not found',
      });
    }

    const updates = { ...req.body };

    // If lesson is updated, validate it
    if (updates.lesson || updates.lessonId) {
      const targetLessonId = updates.lessonId || updates.lesson;
      const parentLesson = await Lesson.findById(targetLessonId);
      if (!parentLesson) {
        return res.status(404).json({
          status: 'error',
          message: 'Referenced lesson does not exist',
        });
      }
      updates.lesson = parentLesson._id;
      updates.course = parentLesson.course; // Keep course in sync
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
    const material = await Material.findById(id);

    if (!material) {
      return res.status(404).json({
        status: 'error',
        message: 'Material not found',
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
