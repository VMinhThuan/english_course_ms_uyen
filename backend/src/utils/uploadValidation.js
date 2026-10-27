import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import multer from 'multer';

export const MiB = 1024 * 1024;
export const MAX_GENERAL_UPLOAD_BYTES = 50 * MiB;
export const MAX_TOEIC_IMPORT_BYTES = 30 * MiB;
export const MAX_DOCX_IMPORT_BYTES = 10 * MiB;
export const MAX_LESSON_ATTACHMENTS = 10;

const FILE_TYPES = Object.freeze({
  '.pdf': {
    signature: 'pdf', mime: 'application/pdf', mimes: ['application/pdf'],
  },
  '.doc': {
    signature: 'ole', mime: 'application/msword', mimes: ['application/msword', 'application/vnd.ms-word'],
  },
  '.docx': {
    signature: 'zip', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    mimes: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/zip', 'application/x-zip-compressed'],
  },
  '.xls': {
    signature: 'ole', mime: 'application/vnd.ms-excel', mimes: ['application/vnd.ms-excel'],
  },
  '.xlsx': {
    signature: 'zip', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    mimes: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/zip', 'application/x-zip-compressed'],
  },
  '.ppt': {
    signature: 'ole', mime: 'application/vnd.ms-powerpoint', mimes: ['application/vnd.ms-powerpoint'],
  },
  '.pptx': {
    signature: 'zip', mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    mimes: ['application/vnd.openxmlformats-officedocument.presentationml.presentation', 'application/zip', 'application/x-zip-compressed'],
  },
  '.txt': {
    signature: 'text', mime: 'text/plain', mimes: ['text/plain'],
  },
  '.csv': {
    signature: 'text', mime: 'text/csv', mimes: ['text/csv', 'application/csv', 'application/vnd.ms-excel'],
  },
  '.zip': {
    signature: 'zip', mime: 'application/zip', mimes: ['application/zip', 'application/x-zip-compressed'],
  },
  '.jpg': {
    signature: 'jpeg', mime: 'image/jpeg', mimes: ['image/jpeg'],
  },
  '.jpeg': {
    signature: 'jpeg', mime: 'image/jpeg', mimes: ['image/jpeg'],
  },
  '.png': {
    signature: 'png', mime: 'image/png', mimes: ['image/png'],
  },
  '.webp': {
    signature: 'webp', mime: 'image/webp', mimes: ['image/webp'],
  },
  '.mp3': {
    signature: 'mp3', mime: 'audio/mpeg', mimes: ['audio/mpeg', 'audio/mp3', 'audio/x-mpeg'],
  },
  '.m4a': {
    signature: 'm4a', mime: 'audio/mp4', mimes: ['audio/mp4', 'audio/m4a', 'audio/x-m4a'],
  },
  '.wav': {
    signature: 'wav', mime: 'audio/wav', mimes: ['audio/wav', 'audio/wave', 'audio/x-wav', 'audio/vnd.wave'],
  },
});

export const GENERAL_UPLOAD_EXTENSIONS = Object.freeze(Object.keys(FILE_TYPES));
export const MEDIA_UPLOAD_EXTENSIONS = Object.freeze([
  '.jpg', '.jpeg', '.png', '.webp', '.mp3', '.m4a', '.wav',
]);
export const DOCUMENT_UPLOAD_EXTENSIONS = Object.freeze([
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.csv', '.zip',
  '.jpg', '.jpeg', '.png', '.webp', '.mp3', '.m4a', '.wav',
]);

export const GENERAL_UPLOAD_POLICIES = Object.freeze({
  attachments: Object.freeze({ extensions: DOCUMENT_UPLOAD_EXTENSIONS }),
  file: Object.freeze({ extensions: DOCUMENT_UPLOAD_EXTENSIONS }),
});

export const MEDIA_UPLOAD_POLICIES = Object.freeze({
  file: Object.freeze({ extensions: MEDIA_UPLOAD_EXTENSIONS }),
});

export const DOCX_UPLOAD_POLICIES = Object.freeze({
  file: Object.freeze({ extensions: Object.freeze(['.docx']) }),
});

export const TOEIC_UPLOAD_POLICIES = Object.freeze({
  file: Object.freeze({ extensions: Object.freeze(['.pdf']) }),
  pageImages: Object.freeze({ extensions: Object.freeze(['.jpg', '.jpeg']) }),
});

export class UploadPolicyError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'UploadPolicyError';
    this.code = code;
  }
}

export const getSafeOriginalExtension = (originalName) => {
  const leafName = String(originalName || '').replace(/\\/g, '/').split('/').pop() || '';
  return path.extname(leafName).toLowerCase();
};

export const getSafeDisplayName = (originalName) => {
  const leafName = String(originalName || '').replace(/\\/g, '/').split('/').pop() || '';
  const cleaned = leafName.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 255);
  return cleaned || 'upload';
};

export const getUploadFileInfo = (originalName, policy) => {
  const extension = getSafeOriginalExtension(originalName);
  const fileInfo = FILE_TYPES[extension];
  if (!policy?.extensions?.includes(extension) || !fileInfo) return null;
  return {
    extension,
    mimeType: fileInfo.mime,
    allowedMimeTypes: fileInfo.mimes,
  };
};

export const createSafeDiskStorage = ({ directory, prefix }) => multer.diskStorage({
  destination: (req, file, callback) => {
    try {
      const destination = typeof directory === 'function' ? directory(req, file) : directory;
      fs.mkdir(destination, { recursive: true })
        .then(() => callback(null, destination))
        .catch((error) => callback(error));
    } catch (error) {
      callback(error);
    }
  },
  filename: (req, file, callback) => {
    const extension = getSafeOriginalExtension(file.originalname);
    const safePrefix = String(prefix || file.fieldname || 'upload').replace(/[^a-z0-9_-]/gi, '-');
    callback(null, `${safePrefix}-${Date.now()}-${randomUUID()}${extension}`);
  },
});

const normalizedMime = (value) => String(value || '').split(';', 1)[0].trim().toLowerCase();

const isMimeCompatible = (file, fileInfo) => {
  const mime = normalizedMime(file.mimetype);
  return mime === 'application/octet-stream' || fileInfo.mimes.includes(mime);
};

const detectSignature = (sample) => {
  if (!sample?.length) return 'empty';
  if (sample.subarray(0, 5).toString('ascii') === '%PDF-') return 'pdf';
  if (sample.length >= 8 && sample.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (sample.length >= 3 && sample[0] === 0xff && sample[1] === 0xd8 && sample[2] === 0xff) return 'jpeg';
  if (sample.length >= 12 && sample.toString('ascii', 0, 4) === 'RIFF' && sample.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  if (sample.length >= 12 && sample.toString('ascii', 0, 4) === 'RIFF' && sample.toString('ascii', 8, 12) === 'WAVE') return 'wav';
  if (sample.length >= 12 && sample.toString('ascii', 4, 8) === 'ftyp') return 'm4a';
  if (sample.length >= 3 && sample.toString('ascii', 0, 3) === 'ID3') return 'mp3';
  if (sample.length >= 2 && sample[0] === 0xff && (sample[1] & 0xe0) === 0xe0 && (sample[1] & 0x06) !== 0) return 'mp3';
  if (sample.length >= 4 && sample.toString('ascii', 0, 4) === 'PK\x03\x04') return 'zip';
  if (sample.length >= 4 && sample.toString('ascii', 0, 4) === 'PK\x05\x06') return 'zip';
  if (sample.length >= 8 && sample.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))) return 'ole';
  if (sample.length >= 2 && sample[0] === 0x4d && sample[1] === 0x5a) return 'executable';
  if (sample.length >= 4 && sample.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]))) return 'executable';
  if (sample.subarray(0, 2).toString('ascii') === '#!') return 'executable';
  if (!sample.includes(0)) return 'text';
  return 'unknown';
};

export const validateUploadSample = ({ originalName, mimetype, sample }, policy) => {
  const extension = getSafeOriginalExtension(originalName);
  const fileInfo = FILE_TYPES[extension];
  if (!policy?.extensions?.includes(extension) || !fileInfo) {
    return { valid: false, code: 'FILE_TYPE_NOT_ALLOWED', message: 'Định dạng tệp không được hỗ trợ.' };
  }
  if (!isMimeCompatible({ mimetype }, fileInfo)) {
    return { valid: false, code: 'FILE_CONTENT_INVALID', message: 'MIME của tệp không khớp với phần mở rộng.' };
  }

  const signature = detectSignature(sample);
  if (signature !== fileInfo.signature) {
    return { valid: false, code: 'FILE_CONTENT_INVALID', message: 'Nội dung tệp không khớp với định dạng đã khai báo.' };
  }
  return { valid: true, detectedMimeType: fileInfo.mime, signature };
};

const collectUploadedFiles = (req) => {
  const files = [];
  if (req.file) files.push(req.file);
  if (Array.isArray(req.files)) files.push(...req.files);
  if (req.files && !Array.isArray(req.files)) {
    for (const value of Object.values(req.files)) {
      if (Array.isArray(value)) files.push(...value);
    }
  }
  return [...new Map(files.filter(Boolean).map((file) => [file.path || file, file])).values()];
};

const cleanupFiles = async (files) => {
  await Promise.all(files.map(async (file) => {
    if (!file?.path) return;
    try {
      await fs.unlink(file.path);
    } catch (error) {
      if (error.code !== 'ENOENT') return;
    }
  }));
};

const readFileSample = async (file) => {
  if (Buffer.isBuffer(file.buffer)) return file.buffer.subarray(0, 8192);
  if (!file.path) return Buffer.alloc(0);
  const handle = await fs.open(file.path, 'r');
  try {
    const sample = Buffer.alloc(8192);
    const { bytesRead } = await handle.read(sample, 0, sample.length, 0);
    return sample.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
};

const getStableUploadError = (error) => {
  if (error instanceof UploadPolicyError) return error;
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE' || error.code === 'LIMIT_FIELD_VALUE') {
      return new UploadPolicyError('FILE_TOO_LARGE', 'Dung lượng tệp hoặc trường dữ liệu vượt quá giới hạn cho phép.');
    }
    if (error.code === 'LIMIT_UNEXPECTED_FILE' || error.code === 'LIMIT_FILE_COUNT') {
      return new UploadPolicyError('FILE_TYPE_NOT_ALLOWED', 'Trường tải lên hoặc số lượng tệp không được hỗ trợ.');
    }
    return new UploadPolicyError('UPLOAD_FAILED', 'Không thể tiếp nhận tệp tải lên.');
  }
  if (error) return new UploadPolicyError('UPLOAD_FAILED', 'Không thể lưu tệp tải lên.');
  return null;
};

export const createUpload = ({ storage, policies, maxFileSize, maxFiles, maxFieldSize }) => {
  const uploader = multer({
    storage,
    fileFilter: (req, file, callback) => {
      const policy = policies[file.fieldname];
      const extension = getSafeOriginalExtension(file.originalname);
      const fileInfo = FILE_TYPES[extension];
      if (!policy || !policy.extensions.includes(extension) || !fileInfo) {
        return callback(new UploadPolicyError('FILE_TYPE_NOT_ALLOWED', 'Định dạng tệp không được hỗ trợ.'));
      }
      if (!isMimeCompatible(file, fileInfo)) {
        return callback(new UploadPolicyError('FILE_CONTENT_INVALID', 'MIME của tệp không khớp với phần mở rộng.'));
      }
      return callback(null, true);
    },
    limits: {
      fileSize: maxFileSize,
      ...(Number.isFinite(maxFiles) ? { files: maxFiles } : {}),
      ...(Number.isFinite(maxFieldSize) ? { fieldSize: maxFieldSize } : {}),
    },
  });

  const wrap = (handler, requiredFields = []) => (req, res, next) => {
    handler(req, res, async (uploadError) => {
      const files = collectUploadedFiles(req);
      const stableError = getStableUploadError(uploadError);
      if (stableError) {
        await cleanupFiles(files);
        const statusCode = stableError.code === 'UPLOAD_FAILED' ? 500 : 400;
        return res.status(statusCode).json({
          status: 'error',
          code: stableError.code,
          message: stableError.message,
        });
      }

      const missingField = requiredFields.find((fieldName) => !files.some((file) => file.fieldname === fieldName));
      if (missingField) {
        await cleanupFiles(files);
        return res.status(400).json({
          status: 'error',
          code: 'FILE_REQUIRED',
          message: 'Vui lòng đính kèm tệp cần tải lên.',
        });
      }

      for (const file of files) {
        try {
          const policy = policies[file.fieldname];
          const result = validateUploadSample({
            originalName: file.originalname,
            mimetype: file.mimetype,
            sample: await readFileSample(file),
          }, policy);
          if (!result.valid) {
            await cleanupFiles(files);
            return res.status(400).json({ status: 'error', code: result.code, message: result.message });
          }
          file.detectedMimeType = result.detectedMimeType;
        } catch {
          await cleanupFiles(files);
          return res.status(500).json({
            status: 'error',
            code: 'UPLOAD_FAILED',
            message: 'Không thể kiểm tra tệp tải lên.',
          });
        }
      }

      let responseFinished = false;
      res.once('finish', () => {
        responseFinished = true;
        if (res.statusCode >= 400 && req.uploadsPersisted !== true) void cleanupFiles(files);
      });
      res.once('close', () => {
        if (!responseFinished && req.uploadsPersisted !== true) void cleanupFiles(files);
      });
      next();
    });
  };

  return {
    single: (fieldName, options = {}) => wrap(uploader.single(fieldName), options.required ? [fieldName] : []),
    array: (fieldName, maxCount, options = {}) => wrap(uploader.array(fieldName, maxCount), options.required ? [fieldName] : []),
    fields: (fields, options = {}) => wrap(uploader.fields(fields), options.requiredFields || []),
  };
};
