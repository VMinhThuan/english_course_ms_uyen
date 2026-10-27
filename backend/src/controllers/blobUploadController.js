import { randomUUID } from 'node:crypto';
import { deleteFromBlob, isBlobConfigured, readPrivateBlobSample, createPrivateBlobUploadUrl, createPrivateBlobReadUrl } from '../utils/blobStorage.js';
import {
  GENERAL_UPLOAD_POLICIES,
  MAX_GENERAL_UPLOAD_BYTES,
  MAX_TOEIC_IMPORT_BYTES,
  MEDIA_UPLOAD_POLICIES,
  TOEIC_UPLOAD_POLICIES,
  getSafeDisplayName,
  getUploadFileInfo,
  validateUploadSample,
} from '../utils/uploadValidation.js';
import { XLSX_IMPORT_LIMITS } from '../services/toeicPart5XlsxParser.js';

const UPLOAD_PURPOSES = Object.freeze({
  media: { field: 'file', policy: MEDIA_UPLOAD_POLICIES.file, maxBytes: MAX_GENERAL_UPLOAD_BYTES },
  material: { field: 'file', policy: GENERAL_UPLOAD_POLICIES.file, maxBytes: MAX_GENERAL_UPLOAD_BYTES },
  'lesson-attachment': { field: 'attachments', policy: GENERAL_UPLOAD_POLICIES.attachments, maxBytes: MAX_GENERAL_UPLOAD_BYTES },
  'toeic-pdf': { field: 'file', policy: TOEIC_UPLOAD_POLICIES.file, maxBytes: MAX_TOEIC_IMPORT_BYTES },
  'toeic-page-image': { field: 'pageImages', policy: TOEIC_UPLOAD_POLICIES.pageImages, maxBytes: MAX_TOEIC_IMPORT_BYTES },
  'question-import-xlsx': {
    field: 'file',
    policy: { extensions: ['.xlsx'] },
    maxBytes: XLSX_IMPORT_LIMITS.maxFileBytes,
  },
});

const fail = (res, statusCode, code, message) =>
  res.status(statusCode).json({ status: 'error', code, message });

const getUserId = (user) => String(user?._id || '');

const getExpectedPath = ({ purpose, userId, pathname, extension }) => {
  const prefix = `uploads/${purpose}/${userId}/`;
  if (!pathname.startsWith(prefix)) return false;
  const leaf = pathname.slice(prefix.length);
  const escapedExtension = extension.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^[0-9a-f-]{36}${escapedExtension}$`, 'i').test(leaf);
};

export const createBlobUploadTicket = async (req, res, next, forcedPurpose) => {
  try {
    if (!isBlobConfigured()) {
      return fail(res, 503, 'BLOB_STORAGE_UNAVAILABLE', 'Vercel Blob chưa được cấu hình cho môi trường này.');
    }

    const purpose = forcedPurpose || req.body?.purpose;
    const config = UPLOAD_PURPOSES[purpose];
    if (!config) return fail(res, 400, 'UPLOAD_PURPOSE_NOT_ALLOWED', 'Mục đích tải tệp không hợp lệ.');

    const originalName = getSafeDisplayName(req.body?.originalName || req.body?.fileName);
    const fileInfo = getUploadFileInfo(originalName, config.policy);
    if (!fileInfo) return fail(res, 400, 'FILE_TYPE_NOT_ALLOWED', 'Định dạng tệp không được hỗ trợ.');

    const size = Number(req.body?.size);
    if (!Number.isSafeInteger(size) || size <= 0 || size > config.maxBytes) {
      return fail(res, 400, 'FILE_TOO_LARGE', `Dung lượng tệp vượt quá ${Math.floor(config.maxBytes / 1024 / 1024)} MiB.`);
    }

    const declaredMimeType = String(req.body?.mimeType || '').split(';', 1)[0].trim().toLowerCase();
    if (declaredMimeType && declaredMimeType !== 'application/octet-stream'
      && !fileInfo.allowedMimeTypes.includes(declaredMimeType)) {
      return fail(res, 400, 'FILE_CONTENT_INVALID', 'MIME của tệp không khớp với phần mở rộng.');
    }

    const userId = getUserId(req.user);
    if (!userId) return fail(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    const pathname = `uploads/${purpose}/${userId}/${randomUUID()}${fileInfo.extension}`;
    const validUntil = Date.now() + 15 * 60 * 1000;
    const uploadUrl = await createPrivateBlobUploadUrl(pathname, {
      allowedContentTypes: [fileInfo.mimeType],
      maximumSizeInBytes: config.maxBytes,
      validUntil,
    });

    return res.json({
      status: 'success',
      data: {
        purpose,
        pathname,
        originalName,
        contentType: fileInfo.mimeType,
        size,
        uploadUrl,
        validUntil,
      },
    });
  } catch (error) {
    return next(error);
  }
};

export const createMediaUploadTicket = (req, res, next) =>
  createBlobUploadTicket(req, res, next, 'media');

export const completeBlobUpload = async (req, res, next, forcedPurpose) => {
  try {
    if (!isBlobConfigured()) {
      return fail(res, 503, 'BLOB_STORAGE_UNAVAILABLE', 'Vercel Blob chưa được cấu hình cho môi trường này.');
    }

    const purpose = forcedPurpose || req.body?.purpose;
    const config = UPLOAD_PURPOSES[purpose];
    const originalName = getSafeDisplayName(req.body?.originalName || req.body?.fileName);
    const fileInfo = config && getUploadFileInfo(originalName, config.policy);
    const pathname = String(req.body?.pathname || '');
    const userId = getUserId(req.user);
    if (!config || !fileInfo || !getExpectedPath({ purpose, userId, pathname, extension: fileInfo.extension })) {
      return fail(res, 400, 'UPLOAD_REFERENCE_INVALID', 'Tham chiếu tải lên không hợp lệ.');
    }

    let uploaded;
    try {
      uploaded = await readPrivateBlobSample(pathname);
    } catch (error) {
      return next(error);
    }
    if (!uploaded) return fail(res, 404, 'UPLOADED_FILE_NOT_FOUND', 'Không tìm thấy tệp vừa tải lên.');

    const { blob, sample } = uploaded;
    if (!Number.isSafeInteger(blob.size) || blob.size <= 0 || blob.size > config.maxBytes) {
      await deleteFromBlob(pathname).catch(() => {});
      return fail(res, 400, 'FILE_TOO_LARGE', `Dung lượng tệp vượt quá ${Math.floor(config.maxBytes / 1024 / 1024)} MiB.`);
    }

    const validation = validateUploadSample({
      originalName,
      mimetype: blob.contentType,
      sample,
    }, config.policy);
    if (!validation.valid || validation.detectedMimeType !== fileInfo.mimeType) {
      await deleteFromBlob(pathname).catch(() => {});
      return fail(res, 400, validation.code || 'FILE_CONTENT_INVALID', validation.message || 'Nội dung tệp không đúng định dạng.');
    }

    const previewUrl = await createPrivateBlobReadUrl(pathname);
    return res.json({
      status: 'success',
      data: {
        purpose,
        pathname,
        storageUrl: blob.url,
        previewUrl,
        originalName,
        mimeType: validation.detectedMimeType,
        fileType: validation.detectedMimeType.startsWith('audio/')
          ? 'audio'
          : validation.detectedMimeType.startsWith('image/') ? 'image' : 'document',
        size: blob.size,
      },
    });
  } catch (error) {
    return next(error);
  }
};
