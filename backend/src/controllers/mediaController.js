import { getPublicUploadDir } from '../utils/uploadConfig.js';
import {
  createSafeDiskStorage,
  createUpload,
  MEDIA_UPLOAD_POLICIES,
  MAX_GENERAL_UPLOAD_BYTES,
  getSafeDisplayName,
} from '../utils/uploadValidation.js';

const mediaUpload = createUpload({
  storage: createSafeDiskStorage({ directory: getPublicUploadDir, prefix: 'media' }),
  policies: MEDIA_UPLOAD_POLICIES,
  maxFileSize: MAX_GENERAL_UPLOAD_BYTES,
  maxFiles: 1,
});

export const uploadMediaMiddleware = mediaUpload.single('file', { required: true });

export const handleMediaUpload = (req, res) => {
  req.uploadsPersisted = true;
  const fileUrl = `/uploads/public/${req.file.filename}`;
  const fileType = req.file.detectedMimeType.startsWith('audio/') ? 'audio' : 'image';

  return res.json({
    status: 'success',
    message: 'Upload file thành công',
    data: {
      fileUrl,
      filename: req.file.filename,
      originalName: getSafeDisplayName(req.file.originalname),
      fileType,
      mimeType: req.file.detectedMimeType,
      size: req.file.size,
    },
  });
};
