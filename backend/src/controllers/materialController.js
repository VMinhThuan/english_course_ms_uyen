import fs from 'node:fs/promises';
import path from 'node:path';
import Material from '../models/Material.js';
import Lesson from '../models/Lesson.js';
import Course from '../models/Course.js';
import mammoth from 'mammoth';
import { getStudentStatusError } from '../security/accountAccessPolicy.js';
import { sanitizeLessonHtml } from '../security/lessonHtml.js';
import {
  evaluateMaterialAccess,
  isPathWithinRoot,
  isSafeExternalMaterialUrl,
  normalizeUploadRequestUrl,
  resolveStoredUploadPath,
} from '../security/materialAccessPolicy.js';
import { getUploadDir } from '../utils/uploadConfig.js';
import { getSafeDisplayName } from '../utils/uploadValidation.js';
import {
  buildAttachmentContentDisposition,
  buildInlineContentDisposition,
  resolveMaterialDownloadMetadata,
  streamMaterialFile,
} from '../utils/materialDownload.js';
import { Readable } from 'node:stream';
import {
  deleteFromBlob,
  getPrivateBlob,
  getPrivateBlobMetadata,
  getPrivateBlobPathname,
  isPrivateBlobUrl,
  normalizePrivateBlobUrl,
  readPrivateBlobBuffer,
  readPrivateBlobSample,
} from '../utils/blobStorage.js';

const MAX_INLINE_PDF_BYTES = 25 * 1024 * 1024;
const MAX_INLINE_DOCUMENT_BYTES = 20 * 1024 * 1024;
const MAX_INLINE_MEDIA_BYTES = 50 * 1024 * 1024;
const DOCX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const INLINE_PREVIEW_TYPES = new Set([
  'application/pdf',
  DOCX_CONTENT_TYPE,
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/avif',
  'image/bmp',
  'audio/mpeg',
  'audio/mp4',
  'audio/wav',
  'audio/x-wav',
  'audio/ogg',
  'audio/webm',
  'audio/aac',
  'audio/flac',
]);

const sendError = (res, statusCode, code, message) =>
  res.status(statusCode).json({ status: 'error', code, message });

const parseBooleanField = (value, defaultValue) => {
  if (value === undefined) return defaultValue;
  if (value === true || String(value).toLowerCase() === 'true') return true;
  if (value === false || String(value).toLowerCase() === 'false') return false;
  return null;
};

const validateMaterialUrl = (value, { allowExistingUrl = '' } = {}) => {
  if (typeof value !== 'string' || !value.trim()) return null;
  const url = value.trim();
  const privateBlobUrl = normalizePrivateBlobUrl(url);
  if (privateBlobUrl) return privateBlobUrl;
  if (url.startsWith('/uploads/')) {
    const normalized = normalizeUploadRequestUrl(url);
    if (!normalized) return null;
    if (normalized === allowExistingUrl) return normalized;
    if (normalized.startsWith('/uploads/private/') || normalized.startsWith('/uploads/public/')) return null;
    return normalized;
  }
  return isSafeExternalMaterialUrl(url) ? url : null;
};

const materialFilePath = (material) => resolveStoredUploadPath(material, getUploadDir());
const sameId = (left, right) => String(left?._id || left || '') === String(right?._id || right || '');
const isTeacherOwner = (user, course) =>
  user?.role === 'teacher' && sameId(course?.teacher, user._id);

const safeExternalUrlForStudent = (material) =>
  material.allowDownload
  && !isPrivateBlobUrl(material.fileUrl)
  && isSafeExternalMaterialUrl(material.fileUrl)
    ? material.fileUrl
    : '';

const hasLocalMaterialFile = async (material) => {
  const filePath = materialFilePath(material);
  if (!filePath || !isPathWithinRoot(getUploadDir(), filePath)) return false;

  try {
    const [rootRealPath, fileRealPath, stat] = await Promise.all([
      fs.realpath(getUploadDir()),
      fs.realpath(filePath),
      fs.stat(filePath),
    ]);
    return isPathWithinRoot(rootRealPath, fileRealPath) && stat.isFile();
  } catch {
    return false;
  }
};

const hasMaterialFile = async (material) => {
  const item = typeof material.toObject === 'function' ? material.toObject() : material;
  if (isPrivateBlobUrl(item.fileUrl)) return Boolean(await getPrivateBlobMetadata(item.fileUrl));
  return Boolean(isSafeExternalMaterialUrl(item.fileUrl) || await hasLocalMaterialFile(material));
};

const toStudentMaterial = async (material) => {
  const item = typeof material.toObject === 'function' ? material.toObject() : { ...material };
  delete item.filePath;
  item.hasFile = await hasMaterialFile(material);
  item.fileUrl = safeExternalUrlForStudent(item);
  return item;
};

const toAdminMaterialWithAvailability = async (material) => {
  const item = typeof material.toObject === 'function' ? material.toObject() : { ...material };
  delete item.filePath;
  item.hasFile = await hasMaterialFile(material);
  return item;
};

const cleanupMaterialFileIfUnreferenced = async (material) => {
  const blobPath = getPrivateBlobPathname(material.fileUrl);
  if (blobPath) {
    try {
      const otherMaterial = await Material.exists({
        _id: { $ne: material._id },
        fileUrl: material.fileUrl,
      });
      if (otherMaterial) return;
      const attachmentReference = await Lesson.exists({ 'attachments.url': material.fileUrl });
      if (attachmentReference) return;
      await deleteFromBlob(blobPath);
    } catch {
      console.error('Unable to remove an unreferenced material Blob.');
    }
    return;
  }

  const filePath = materialFilePath(material);
  if (!filePath || !isPathWithinRoot(getUploadDir(), filePath)) return;

  try {
    const otherMaterial = await Material.exists({
      _id: { $ne: material._id },
      $or: [{ filePath }, ...(material.fileUrl ? [{ fileUrl: material.fileUrl }] : [])],
    });
    if (otherMaterial) return;

    const attachmentReference = material.fileUrl
      ? await Lesson.exists({ 'attachments.url': material.fileUrl })
      : null;
    if (attachmentReference) return;

    await fs.unlink(filePath);
  } catch (error) {
    if (error.code !== 'ENOENT') console.error('Unable to remove an unreferenced material upload.');
  }
};

const findLessonForMaterial = async (lessonId) =>
  Lesson.findById(lessonId).populate({ path: 'course', select: 'teacher title status' });

const loadMaterialWithParents = (id) =>
  Material.findById(id)
    .populate({ path: 'lesson', populate: { path: 'course', select: 'teacher title status isPublished' } })
    .populate({ path: 'course', select: 'teacher title status isPublished' });

const canManageCourse = (user, course) =>
  user?.role === 'admin' || isTeacherOwner(user, course);

const materialDtoForAdmin = (material) => {
  const item = typeof material.toObject === 'function' ? material.toObject() : { ...material };
  delete item.filePath;
  return item;
};

// @desc    Admin create material
// @route   POST /api/v1/admin/materials
// @access  Private (Admin/Teacher)
export const createMaterial = async (req, res, next) => {
  try {
    const {
      title,
      description,
      lessonId,
      lesson: lessonParam,
      allowDownload,
      status,
    } = req.body;
    const targetLessonId = lessonId || lessonParam;
    if (!targetLessonId) return sendError(res, 400, 'LESSON_REQUIRED', 'Lesson ID is required.');

    const parentLesson = await findLessonForMaterial(targetLessonId);
    if (!parentLesson) return sendError(res, 404, 'LESSON_NOT_FOUND', 'Referenced lesson does not exist.');
    if (!canManageCourse(req.user, parentLesson.course)) {
      return sendError(res, 403, 'FORBIDDEN', 'Not authorized to add materials to this course.');
    }

    let fileUrl;
    let filePath = '';
    let originalName = '';
    let fileType = 'external';
    let fileSize = 0;
    let displayTitle = typeof title === 'string' ? title.trim() : '';
    if (req.file) {
      filePath = req.file.path;
      originalName = getSafeDisplayName(req.file.originalname);
      fileUrl = '/uploads/private/' + encodeURIComponent(req.file.filename);
      fileType = req.file.detectedMimeType || 'application/octet-stream';
      fileSize = req.file.size;
      if (!displayTitle) displayTitle = getSafeDisplayName(req.file.originalname);
    } else {
      if (typeof req.body.fileUrl !== 'string' || !req.body.fileUrl.trim()) {
        return sendError(res, 400, 'FILE_REQUIRED', 'Vui lòng tải lên tệp hoặc nhập URL tài liệu.');
      }
      fileUrl = validateMaterialUrl(req.body.fileUrl);
      if (!fileUrl) {
        return sendError(res, 400, 'MATERIAL_URL_NOT_ALLOWED', 'Tệp phải là URL HTTPS hoặc đường dẫn tải lên hợp lệ.');
      }
      if (isPrivateBlobUrl(fileUrl)) {
        const blobMetadata = await getPrivateBlobMetadata(fileUrl);
        if (!blobMetadata) return sendError(res, 404, 'MATERIAL_FILE_NOT_FOUND', 'Không tìm thấy tệp trong Blob.');
        originalName = getSafeDisplayName(req.body.originalName || path.basename(new URL(fileUrl).pathname));
        fileType = blobMetadata.contentType || 'application/octet-stream';
        fileSize = blobMetadata.size || 0;
      }
    }

    const parsedAllowDownload = parseBooleanField(allowDownload, true);
    if (parsedAllowDownload === null) {
      return sendError(res, 400, 'INVALID_ALLOW_DOWNLOAD', 'Giá trị quyền tải xuống không hợp lệ.');
    }
    if (status !== undefined && !['published', 'hidden'].includes(status)) {
      return sendError(res, 400, 'INVALID_MATERIAL_STATUS', 'Trạng thái tài liệu không hợp lệ.');
    }

    const material = await Material.create({
      title: displayTitle || 'Material',
      description: typeof description === 'string' ? description : '',
      lesson: parentLesson._id,
      course: parentLesson.course?._id || parentLesson.course,
      fileUrl,
      filePath,
      originalName,
      fileType,
      fileSize,
      allowDownload: parsedAllowDownload,
      status: status || 'published',
    });
    if (req.file) req.uploadsPersisted = true;

    return res.status(201).json({
      status: 'success',
      message: 'Material created successfully',
      data: { material: materialDtoForAdmin(material) },
    });
  } catch (error) {
    return next(error);
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

    if (req.user.role !== 'admin') {
      const teacherCourseIds = (await Course.find({ teacher: req.user._id }).select('_id')).map((item) => item._id);
      if (targetCourse) {
        if (!teacherCourseIds.some((id) => sameId(id, targetCourse))) {
          return res.json({ status: 'success', data: { materials: [] } });
        }
      }
      const teacherLessons = await Lesson.find({
        course: targetCourse || { $in: teacherCourseIds },
      }).select('_id');
      const teacherLessonIds = teacherLessons.map((lesson) => lesson._id);
      if (targetLesson && !teacherLessonIds.some((id) => sameId(id, targetLesson))) {
        return res.json({ status: 'success', data: { materials: [] } });
      }
      filter.lesson = targetLesson || { $in: teacherLessonIds };
    } else if (targetCourse) {
      filter.course = targetCourse;
    }

    if (targetLesson) filter.lesson = targetLesson;
    if (status) filter.status = status;
    if (search) filter.title = { $regex: search, $options: 'i' };

    const materials = await Material.find(filter)
      .select('-__v')
      .populate('lesson', 'title status')
      .populate('course', 'title teacher')
      .sort({ createdAt: -1 });

    const responseMaterials = await Promise.all(materials.map(toAdminMaterialWithAvailability));

    return res.json({ status: 'success', data: { materials: responseMaterials } });
  } catch (error) {
    return next(error);
  }
};

// @desc    Admin get material by ID
// @route   GET /api/v1/admin/materials/:id
// @access  Private (Admin/Teacher)
export const getAdminMaterialById = async (req, res, next) => {
  try {
    const material = await Material.findById(req.params.id)
      .select('-__v')
      .populate({
        path: 'lesson',
        select: 'title status course',
        populate: { path: 'course', select: 'teacher' },
      })
      .populate('course', 'title teacher');
    if (!material) return sendError(res, 404, 'MATERIAL_NOT_FOUND', 'Material not found.');
    if (!canManageCourse(req.user, material.lesson?.course || material.course)) {
      return sendError(res, 403, 'FORBIDDEN', 'Not authorized to view this material.');
    }
    return res.json({ status: 'success', data: { material: await toAdminMaterialWithAvailability(material) } });
  } catch (error) {
    return next(error);
  }
};

// @desc    Admin update material
// @route   PUT /api/v1/admin/materials/:id
// @access  Private (Admin/Teacher)
export const updateMaterial = async (req, res, next) => {
  try {
    const material = await loadMaterialWithParents(req.params.id);
    if (!material) return sendError(res, 404, 'MATERIAL_NOT_FOUND', 'Material not found.');
    if (!canManageCourse(req.user, material.lesson?.course || material.course)) {
      return sendError(res, 403, 'FORBIDDEN', 'Not authorized to update this material.');
    }

    const updates = {};
    const allowedFields = ['title', 'description', 'status'];
    for (const field of allowedFields) {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) updates[field] = req.body[field];
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'allowDownload')) {
      const parsed = parseBooleanField(req.body.allowDownload, undefined);
      if (parsed === null || parsed === undefined) {
        return sendError(res, 400, 'INVALID_ALLOW_DOWNLOAD', 'Giá trị quyền tải xuống không hợp lệ.');
      }
      updates.allowDownload = parsed;
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'status') && !['published', 'hidden'].includes(req.body.status)) {
      return sendError(res, 400, 'INVALID_MATERIAL_STATUS', 'Trạng thái tài liệu không hợp lệ.');
    }

    const targetLessonId = req.body.lessonId || req.body.lesson;
    if (targetLessonId) {
      const parentLesson = await findLessonForMaterial(targetLessonId);
      if (!parentLesson) return sendError(res, 404, 'LESSON_NOT_FOUND', 'Referenced lesson does not exist.');
      if (!canManageCourse(req.user, parentLesson.course)) {
        return sendError(res, 403, 'FORBIDDEN', 'Not authorized to move material to this lesson.');
      }
      updates.lesson = parentLesson._id;
      updates.course = parentLesson.course?._id || parentLesson.course;
    }

    const oldMaterialSnapshot = {
      _id: material._id,
      filePath: material.filePath,
      fileUrl: material.fileUrl,
    };

    if (req.file) {
      updates.filePath = req.file.path;
      updates.originalName = getSafeDisplayName(req.file.originalname);
      updates.fileUrl = '/uploads/private/' + encodeURIComponent(req.file.filename);
      updates.fileType = req.file.detectedMimeType || 'application/octet-stream';
      updates.fileSize = req.file.size;
    } else if (Object.prototype.hasOwnProperty.call(req.body, 'fileUrl')) {
      const validatedUrl = validateMaterialUrl(req.body.fileUrl, { allowExistingUrl: material.fileUrl });
      if (!validatedUrl) {
        return sendError(res, 400, 'MATERIAL_URL_NOT_ALLOWED', 'Tệp phải là URL HTTPS hoặc đường dẫn tải lên hợp lệ.');
      }
      if (validatedUrl !== material.fileUrl) {
        updates.fileUrl = validatedUrl;
        updates.filePath = '';
        if (isPrivateBlobUrl(validatedUrl)) {
          const blobMetadata = await getPrivateBlobMetadata(validatedUrl);
          if (!blobMetadata) return sendError(res, 404, 'MATERIAL_FILE_NOT_FOUND', 'Không tìm thấy tệp trong Blob.');
          updates.originalName = getSafeDisplayName(
            req.body.originalName || material.originalName || path.basename(new URL(validatedUrl).pathname),
          );
          updates.fileType = blobMetadata.contentType || 'application/octet-stream';
          updates.fileSize = blobMetadata.size || 0;
        } else {
          updates.fileType = isSafeExternalMaterialUrl(validatedUrl) ? 'external' : 'application/octet-stream';
          updates.fileSize = 0;
        }
      }
    }

    await Object.assign(material, updates).save();
    if (req.file) req.uploadsPersisted = true;
    if (req.file || Object.prototype.hasOwnProperty.call(updates, 'fileUrl')) {
      await cleanupMaterialFileIfUnreferenced(oldMaterialSnapshot);
    }

    const updatedMaterial = await Material.findById(material._id)
      .select('-__v')
      .populate('lesson', 'title status')
      .populate('course', 'title teacher');
    return res.json({
      status: 'success',
      message: 'Material updated successfully',
      data: { material: await toAdminMaterialWithAvailability(updatedMaterial) },
    });
  } catch (error) {
    return next(error);
  }
};

// @desc    Admin delete material (with physical file cleanup)
// @route   DELETE /api/v1/admin/materials/:id
// @access  Private (Admin/Teacher)
export const deleteMaterial = async (req, res, next) => {
  try {
    const material = await loadMaterialWithParents(req.params.id);
    if (!material) return sendError(res, 404, 'MATERIAL_NOT_FOUND', 'Material not found.');
    if (!canManageCourse(req.user, material.lesson?.course || material.course)) {
      return sendError(res, 403, 'FORBIDDEN', 'Not authorized to delete this material.');
    }

    const snapshot = { _id: material._id, filePath: material.filePath, fileUrl: material.fileUrl };
    await Material.findByIdAndDelete(material._id);
    await cleanupMaterialFileIfUnreferenced(snapshot);
    return res.json({ status: 'success', message: 'Material and unreferenced physical file deleted successfully' });
  } catch (error) {
    return next(error);
  }
};

// @desc    Student get materials by lesson
// @route   GET /api/v1/lessons/:lessonId/materials
// @access  Private (Student/Admin)
export const getStudentMaterialsByLesson = async (req, res, next) => {
  try {
    const lesson = await Lesson.findById(req.params.lessonId)
      .populate({ path: 'course', select: 'teacher title status isPublished' });
    if (!lesson) return sendError(res, 404, 'LESSON_NOT_FOUND', 'Lesson not found.');

    if (req.user.role === 'student') {
      const statusError = getStudentStatusError(req.user);
      if (statusError) return sendError(res, statusError.statusCode, statusError.code, statusError.message);
      if (lesson.status !== 'published' || !lesson.course || lesson.course.isPublished !== true) return sendError(res, 404, 'LESSON_NOT_FOUND', 'Lesson not found.');
    } else if (req.user.role === 'teacher') {
      if (!isTeacherOwner(req.user, lesson.course)) return sendError(res, 403, 'FORBIDDEN', 'Access denied.');
    } else if (req.user.role !== 'admin') {
      return sendError(res, 403, 'FORBIDDEN', 'Access denied.');
    }

    const materials = await Material.find({ lesson: lesson._id, course: lesson.course?._id || lesson.course, status: 'published' })
      .select('-__v')
      .sort({ createdAt: -1 });
    const responseMaterials = await Promise.all(materials.map(
      req.user.role === 'student' ? toStudentMaterial : toAdminMaterialWithAvailability
    ));
    return res.json({ status: 'success', data: { materials: responseMaterials } });
  } catch (error) {
    return next(error);
  }
};

const getAuthorizedMaterialFile = async (req, res, { preview = false } = {}) => {
  const material = await loadMaterialWithParents(req.params.id);
    if (!material || !material.lesson) {
      sendError(res, 404, 'MATERIAL_NOT_FOUND', 'Material not found.');
      return null;
    }

    const course = material.lesson.course || material.course;
    const decision = evaluateMaterialAccess({
      user: req.user,
      material,
      lesson: material.lesson,
      course,
      allowPreview: preview,
    });
    if (!decision.allowed) {
      sendError(res, decision.statusCode, decision.code, decision.message);
      return null;
    }

    const externalUrl = isSafeExternalMaterialUrl(material.fileUrl) ? material.fileUrl : null;
    const blobPath = getPrivateBlobPathname(material.fileUrl);
    const filePath = materialFilePath(material);
    if (!filePath && !blobPath) {
      if (externalUrl && !preview) {
        res.set('Cache-Control', 'private, no-store');
        res.redirect(302, externalUrl);
        return null;
      }
      sendError(
        res,
        preview && externalUrl ? 415 : 404,
        preview && externalUrl ? 'MATERIAL_PREVIEW_UNAVAILABLE' : 'MATERIAL_FILE_NOT_FOUND',
        preview && externalUrl ? 'Tài liệu ngoài hệ thống không hỗ trợ xem trước an toàn.' : 'Material file not found.'
      );
      return null;
    }

    let fileStat;
    let blobMetadata = null;
    if (blobPath) {
      blobMetadata = await getPrivateBlobMetadata(blobPath);
      if (!blobMetadata) {
        sendError(res, 404, 'MATERIAL_FILE_NOT_FOUND', 'Material file not found.');
        return null;
      }
      fileStat = { size: blobMetadata.size };
    } else {
      if (!isPathWithinRoot(getUploadDir(), filePath)) {
        sendError(res, 404, 'MATERIAL_FILE_NOT_FOUND', 'Material file not found.');
        return null;
      }
      try {
        const [rootRealPath, fileRealPath, stat] = await Promise.all([
          fs.realpath(getUploadDir()),
          fs.realpath(filePath),
          fs.stat(filePath),
        ]);
        if (!isPathWithinRoot(rootRealPath, fileRealPath) || !stat.isFile()) {
          sendError(res, 404, 'MATERIAL_FILE_NOT_FOUND', 'Material file not found.');
          return null;
        }
        fileStat = stat;
      } catch (error) {
        if (error.code === 'ENOENT') {
          sendError(res, 404, 'MATERIAL_FILE_NOT_FOUND', 'Material file not found.');
          return null;
        }
        throw error;
      }
    }

    const metadata = resolveMaterialDownloadMetadata({
      originalName: material.originalName,
      title: material.title,
      filePath: filePath || material.originalName || blobPath,
      fileType: blobMetadata?.contentType || material.fileType,
    });
    if (preview) {
      if (!INLINE_PREVIEW_TYPES.has(metadata.contentType)) {
        sendError(res, 415, 'MATERIAL_PREVIEW_UNSUPPORTED', 'Định dạng này chưa hỗ trợ xem trực tiếp. Hãy tải tệp xuống để xem.');
        return null;
      }
      const maxBytes = metadata.contentType === 'application/pdf'
        ? MAX_INLINE_PDF_BYTES
        : metadata.contentType === DOCX_CONTENT_TYPE
          ? MAX_INLINE_DOCUMENT_BYTES
          : MAX_INLINE_MEDIA_BYTES;
      if (fileStat.size > maxBytes) {
        sendError(res, 413, 'MATERIAL_PREVIEW_TOO_LARGE', 'Tệp quá lớn để xem trực tiếp trên trình duyệt. Hãy tải tệp xuống để xem.');
        return null;
      }
      if (metadata.contentType === 'application/pdf' || metadata.contentType === DOCX_CONTENT_TYPE) {
        if (blobPath) {
          const sample = await readPrivateBlobSample(blobPath, 8);
          const validSignature = metadata.contentType === 'application/pdf'
            ? sample?.sample.subarray(0, 5).toString('ascii') === '%PDF-'
            : sample?.sample.length >= 2 && sample.sample[0] === 0x50 && sample.sample[1] === 0x4b;
          if (!validSignature) {
            sendError(res, 415, 'MATERIAL_PREVIEW_UNSUPPORTED', 'Tệp không đúng định dạng hoặc bị hỏng.');
            return null;
          }
        } else {
          const handle = await fs.open(filePath, 'r');
          try {
            const signature = Buffer.alloc(5);
            const { bytesRead } = await handle.read(signature, 0, signature.length, 0);
            const validSignature = metadata.contentType === 'application/pdf'
              ? bytesRead === 5 && signature.toString('ascii') === '%PDF-'
              : bytesRead >= 2 && signature[0] === 0x50 && signature[1] === 0x4b;
            if (!validSignature) {
              sendError(res, 415, 'MATERIAL_PREVIEW_UNSUPPORTED', 'Tệp không đúng định dạng hoặc bị hỏng.');
              return null;
            }
          } finally {
            await handle.close();
          }
        }
      }
    }

    return { filePath, blobPath, fileStat, ...metadata };
};

const streamMaterialResponse = async (file, res, disposition, next) => {
  const headers = {
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'Content-Type': file.contentType,
    ...(disposition === 'inline' ? { 'Content-Length': file.fileStat.size } : {}),
    'Content-Disposition': disposition === 'inline'
      ? buildInlineContentDisposition(file.filename)
      : buildAttachmentContentDisposition(file.filename),
  };

  if (file.blobPath) {
    try {
      const blob = await getPrivateBlob(file.blobPath);
      if (!blob) return sendError(res, 404, 'MATERIAL_FILE_NOT_FOUND', 'Material file not found.');
      res.set(headers);
      const stream = Readable.fromWeb(blob.stream);
      stream.once('error', (error) => {
        if (!res.headersSent) next(error);
        else res.destroy(error);
      });
      stream.pipe(res);
      return;
    } catch (error) {
      if (!res.headersSent) return next(error);
      return res.destroy(error);
    }
  }

  return streamMaterialFile(file.filePath, res, headers, (error) => {
    if (!res.headersSent) next(error);
    else res.destroy(error);
  });
};

// @desc    Secure material download
// @route   GET /api/v1/materials/:id/download
// @access  Private
export const downloadMaterial = async (req, res, next) => {
  try {
    const file = await getAuthorizedMaterialFile(req, res);
    if (!file) return;
    return await streamMaterialResponse(file, res, 'attachment', next);
  } catch (error) {
    return next(error);
  }
};

// @desc    Secure, bounded inline preview for PDFs, images, and audio.
// @route   GET /api/v1/materials/:id/preview
// @access  Private
export const previewMaterial = async (req, res, next) => {
  try {
    const file = await getAuthorizedMaterialFile(req, res, { preview: true });
    if (!file) return;
    return await streamMaterialResponse(file, res, 'inline', next);
  } catch (error) {
    return next(error);
  }
};

// @desc    Convert a DOCX material to sanitized HTML for an inline lesson preview.
// @route   GET /api/v1/materials/:id/render
// @access  Private
export const renderMaterial = async (req, res, next) => {
  try {
    const file = await getAuthorizedMaterialFile(req, res, { preview: true });
    if (!file) return;
    if (file.contentType !== DOCX_CONTENT_TYPE) {
      return sendError(res, 415, 'MATERIAL_RENDER_UNSUPPORTED', 'Chỉ hỗ trợ render tài liệu DOCX.');
    }

    const blobFile = file.blobPath ? await readPrivateBlobBuffer(file.blobPath, MAX_INLINE_DOCUMENT_BYTES) : null;
    if (file.blobPath && !blobFile) {
      return sendError(res, 404, 'MATERIAL_FILE_NOT_FOUND', 'Material file not found.');
    }
    const buffer = blobFile?.buffer || await fs.readFile(file.filePath);
    const converted = await mammoth.convertToHtml({ buffer });
    const html = sanitizeLessonHtml(converted.value || '');
    if (!html.trim()) {
      return sendError(res, 422, 'MATERIAL_RENDER_EMPTY', 'Tài liệu DOCX không có nội dung để hiển thị.');
    }

    res.set({
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; img-src https:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    });
    return res.json({ status: 'success', data: { html } });
  } catch (error) {
    return next(error);
  }
};
