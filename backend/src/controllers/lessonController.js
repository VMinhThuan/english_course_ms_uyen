import Lesson from '../models/Lesson.js';
import Course from '../models/Course.js';
import Material from '../models/Material.js';
import Vocabulary from '../models/Vocabulary.js';
import LearningProgress from '../models/LearningProgress.js';
import fs from 'fs';
import path from 'path';
import { sanitizeLessonHtml, sanitizeLessonMediaUrl, sanitizeLessonRecord } from '../security/lessonHtml.js';
import { isPathWithinRoot, isSafeExternalMaterialUrl, resolveStoredUploadPath } from '../security/materialAccessPolicy.js';
import { getUploadDir } from '../utils/uploadConfig.js';
import { getSafeDisplayName, MAX_LESSON_ATTACHMENTS } from '../utils/uploadValidation.js';
import {
  deleteFromBlob,
  getPrivateBlobMetadata,
  getPrivateBlobPathname,
  normalizePrivateBlobUrl,
} from '../utils/blobStorage.js';

const isTeacherCourseOwner = (user, course) =>
  user?.role === 'teacher'
  && String(course?.teacher?._id || course?.teacher || '') === String(user._id);

const LESSON_DIFFICULTY_LEVELS = new Set(['beginner', 'intermediate', 'advanced']);
const parseLessonDifficulty = (value) => {
  if (value === undefined) return { valid: true, value: undefined };
  if (value === null || value === '') return { valid: true, value: null };
  if (typeof value !== 'string') return { valid: false };
  const normalized = value.trim().toLowerCase();
  return LESSON_DIFFICULTY_LEVELS.has(normalized)
    ? { valid: true, value: normalized }
    : { valid: false };
};

const prepareLessonAttachments = async (value) => {
  if (!Array.isArray(value)) return { error: 'Danh sách tệp đính kèm không hợp lệ.' };
  if (value.length > MAX_LESSON_ATTACHMENTS) {
    return { error: `Mỗi bài học chỉ hỗ trợ tối đa ${MAX_LESSON_ATTACHMENTS} tệp đính kèm.` };
  }

  const attachments = await Promise.all(value.map(async (attachment) => {
    const url = normalizePrivateBlobUrl(attachment?.url);
    if (!url) return null;
    const metadata = await getPrivateBlobMetadata(url);
    if (!metadata) return null;
    const pathname = getPrivateBlobPathname(url);
    return {
      filename: path.posix.basename(pathname),
      originalName: getSafeDisplayName(attachment.originalName),
      url,
      type: metadata.contentType || String(attachment.type || 'application/octet-stream'),
    };
  }));
  if (attachments.some((attachment) => !attachment)) {
    return { error: 'Một hoặc nhiều tệp đính kèm chưa được tải lên Blob hoặc không hợp lệ.' };
  }
  return { attachments };
};

const invalidDifficultyResponse = (res) => res.status(400).json({
  status: 'error',
  code: 'INVALID_LESSON_DIFFICULTY',
  message: 'Mức độ bài học không hợp lệ. Hãy chọn Cơ bản, Trung cấp, Nâng cao hoặc để trống.',
});

const cleanupReplacedLessonAttachments = async (oldAttachments, newAttachments, lessonId) => {
  const retainedUrls = new Set((newAttachments || []).map((attachment) => attachment.url));
  for (const attachment of oldAttachments || []) {
    if (!attachment?.url || retainedUrls.has(attachment.url)) continue;
    const blobPath = getPrivateBlobPathname(attachment.url);
    if (blobPath) {
      try {
        const [otherLessonReference, materialReference] = await Promise.all([
          Lesson.exists({ _id: { $ne: lessonId }, 'attachments.url': attachment.url }),
          Material.exists({ 'fileUrl': attachment.url }),
        ]);
        if (!otherLessonReference && !materialReference) await deleteFromBlob(blobPath);
      } catch {
        console.error('Unable to clean up a replaced lesson Blob attachment.');
      }
      continue;
    }
    const filePath = resolveStoredUploadPath({ fileUrl: attachment.url }, getUploadDir());
    if (!filePath || !isPathWithinRoot(getUploadDir(), filePath)) continue;
    const relativePath = path.relative(getUploadDir(), filePath);
    const isPrivateAttachment = relativePath.startsWith('private' + path.sep);
    const isLegacyLessonAttachment = path.dirname(relativePath) === '.'
      && path.basename(filePath).startsWith('attachments-');
    if (!isPrivateAttachment && !isLegacyLessonAttachment) continue;

    try {
      const [otherLessonReference, materialReference] = await Promise.all([
        Lesson.exists({ _id: { $ne: lessonId }, 'attachments.url': attachment.url }),
        Material.exists({ $or: [{ fileUrl: attachment.url }, { filePath }] }),
      ]);
      if (otherLessonReference || materialReference) continue;
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch {
      console.error('Unable to clean up a replaced lesson attachment.');
    }
  }
};

const cleanupDeletedLessonFiles = async (lesson, materials) => {
  const files = [
    ...(materials || []).map((material) => ({
      _id: material._id,
      filePath: material.filePath,
      fileUrl: material.fileUrl,
    })),
    ...(lesson.attachments || []).map((attachment) => ({ fileUrl: attachment.url })),
  ];

  for (const file of files) {
    const blobPath = getPrivateBlobPathname(file.fileUrl);
    if (blobPath) {
      try {
        const [materialReference, lessonReference] = await Promise.all([
          Material.exists({ fileUrl: file.fileUrl }),
          Lesson.exists({ _id: { $ne: lesson._id }, 'attachments.url': file.fileUrl }),
        ]);
        if (!materialReference && !lessonReference) await deleteFromBlob(blobPath);
      } catch {
        console.error('Unable to clean up an unreferenced lesson Blob.');
      }
      continue;
    }
    const filePath = resolveStoredUploadPath(file, getUploadDir());
    if (!filePath || !isPathWithinRoot(getUploadDir(), filePath)) continue;
    try {
      const [materialReference, lessonReference] = await Promise.all([
        Material.exists({
          $or: [
            { filePath },
            ...(file.fileUrl ? [{ fileUrl: file.fileUrl }] : []),
          ],
        }),
        file.fileUrl
          ? Lesson.exists({ _id: { $ne: lesson._id }, 'attachments.url': file.fileUrl })
          : null,
      ]);
      if (materialReference || lessonReference) continue;
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch {
      console.error('Unable to clean up an unreferenced lesson file.');
    }
  }
};

// @desc    Get lessons by course
// @route   GET /api/v1/lessons/course/:courseId
// @access  Private
export const getLessonsByCourse = async (req, res, next) => {
  try {
    const { courseId } = req.params;

    const filter = { course: courseId };
    // Students and guests only see published lessons
    if (!req.user || req.user.role === 'student') {
      filter.status = 'published';
    }

    const lessons = await Lesson.find(filter)
      .sort({ order: 1, createdAt: 1 })
      .select('-__v');
    const courseForMedia = req.user?.role === 'teacher'
      ? await Course.findById(courseId).select('teacher')
      : null;
    const canViewPrivateCourseMedia = req.user?.role === 'admin'
      || (req.user?.role === 'teacher'
        && String(courseForMedia?.teacher || '') === String(req.user._id));
    const lessonRecords = lessons.map((lesson) => {
      const record = sanitizeLessonRecord(lesson, {
        includeAttachments: Boolean(canViewPrivateCourseMedia && req.user),
      });
      if (req.user?.role === 'teacher' && !canViewPrivateCourseMedia) {
        record.audioUrl = '';
        record.videoUrl = '';
      }
      return record;
    });

    res.json({
      status: 'success',
      data: {
        lessons: lessonRecords,
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
    const lesson = await Lesson.findById(id).populate('course', 'title teacher');

    if (!lesson) {
      return res.status(404).json({
        status: 'error',
        message: 'Lesson not found',
      });
    }

    if (req.user?.role === 'teacher' && !isTeacherCourseOwner(req.user, lesson.course)) {
      return res.status(403).json({
        status: 'error',
        code: 'FORBIDDEN',
        message: 'Not authorized to view this lesson.',
      });
    }

    // Security Gate: Students must NOT access draft or hidden lessons
    if (req.user && req.user.role === 'student' && lesson.status !== 'published') {
      return res.status(404).json({
        status: 'error',
        message: 'Lesson not found',
      });
    }

    // Approved students can use every published lesson, independently of enrollment. Student
    // DTOs never expose local storage paths, and external URLs still require allowDownload.
    const materialRecords = await Material.find({
      lesson: id,
      status: 'published',
    }).select('-__v');

    const materials = materialRecords.map((material) => {
      if (req.user?.role !== 'student') return material;
      const safeMaterial = material.toObject();
      const canExposeExternalUrl = req.user.status === 'active'
        && material.allowDownload
        && isSafeExternalMaterialUrl(material.fileUrl);
      safeMaterial.fileUrl = canExposeExternalUrl ? material.fileUrl : '';
      delete safeMaterial.filePath;
      return safeMaterial;
    }).filter((material) => req.user?.role !== 'student' || req.user.status === 'active');

    const vocabulary = await Vocabulary.find({
      lesson: id,
      status: 'published',
      catalogOnly: { $ne: true },
    }).select('-__v');

    res.json({
      status: 'success',
      data: {
        lesson: sanitizeLessonRecord(lesson),
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
    const difficulty = parseLessonDifficulty(req.body.difficulty);
    if (!difficulty.valid) return invalidDifficultyResponse(res);
    const attachmentResult = await prepareLessonAttachments(req.body.attachments || []);
    if (attachmentResult.error) {
      return res.status(400).json({ status: 'error', code: 'INVALID_LESSON_ATTACHMENTS', message: attachmentResult.error });
    }
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
      content: sanitizeLessonHtml(content || ''),
      description: description || '',
      topic: topic || 'General',
      ...(difficulty.value !== undefined ? { difficulty: difficulty.value } : {}),
      status: status || 'draft',
      videoUrl: sanitizeLessonMediaUrl(videoUrl || ''),
      audioUrl: sanitizeLessonMediaUrl(audioUrl || ''),
      course: targetCourseId,
      order: order || 0,
      duration: duration || 0,
      attachments: attachmentResult.attachments,
    });

    res.status(201).json({
      status: 'success',
      message: 'Lesson created successfully',
      data: {
        lesson: sanitizeLessonRecord(lesson),
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

    const updates = { ...req.body };
    const hasNewAttachments = Array.isArray(req.body.attachments) && req.body.attachments.length > 0;
    let newAttachments = null;
    if (hasNewAttachments) {
      const attachmentResult = await prepareLessonAttachments(req.body.attachments);
      if (attachmentResult.error) {
        return res.status(400).json({ status: 'error', code: 'INVALID_LESSON_ATTACHMENTS', message: attachmentResult.error });
      }
      newAttachments = attachmentResult.attachments;
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'difficulty')) {
      const difficulty = parseLessonDifficulty(updates.difficulty);
      if (!difficulty.valid) return invalidDifficultyResponse(res);
      updates.difficulty = difficulty.value;
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'content')) {
      updates.content = sanitizeLessonHtml(updates.content);
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'videoUrl')) {
      updates.videoUrl = sanitizeLessonMediaUrl(updates.videoUrl);
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'audioUrl')) {
      updates.audioUrl = sanitizeLessonMediaUrl(updates.audioUrl);
    }

    const previousAttachments = lesson.attachments.map((attachment) => ({
      url: attachment.url,
      filename: attachment.filename,
    }));
    const updatedLesson = await Lesson.findByIdAndUpdate(
      id,
      {
        ...updates,
        attachments: newAttachments || lesson.attachments,
      },
      { new: true, runValidators: true }
    );
    if (newAttachments) {
      await cleanupReplacedLessonAttachments(previousAttachments, updatedLesson.attachments, lesson._id);
    }

    res.json({
      status: 'success',
      message: 'Lesson updated successfully',
      data: {
        lesson: sanitizeLessonRecord(updatedLesson),
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
        lesson: sanitizeLessonRecord(lesson),
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

    // 1. Remove lesson-owned records. Physical files are cleaned after references are gone,
    // and only when no other lesson/material still points to the same stored file.
    const materials = await Material.find({ lesson: id });
    await Material.deleteMany({ lesson: id });

    // 2. Cascade cleanup Vocabulary
    await Vocabulary.deleteMany({ lesson: id, catalogOnly: { $ne: true } });

    // 3. Cascade cleanup LearningProgress
    await LearningProgress.deleteMany({ lesson: id });

    // 4. Delete Lesson
    await Lesson.findByIdAndDelete(id);
    await cleanupDeletedLessonFiles(lesson, materials);

    res.json({
      status: 'success',
      message: 'Lesson and all associated materials, vocabulary, and progress deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};
