import path from 'path';
import multer from 'multer';
import { getUploadDir } from '../utils/uploadConfig.js';

const UPLOAD_DIR = getUploadDir();

// Allowed MIME types and extensions
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'audio/mpeg',
  'audio/mp3',
  'audio/x-m4a',
  'audio/m4a',
  'audio/mp4',
  'audio/wav',
];

const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.mp3', '.m4a', '.wav'];

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const cleanBasename = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `${cleanBasename}-${uniqueSuffix}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();

  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return cb(new Error(`Extension file không được hỗ trợ: ${ext}`), false);
  }

  if (!ALLOWED_MIME_TYPES.includes(file.mimetype) && !file.mimetype.startsWith('audio/') && !file.mimetype.startsWith('image/')) {
    return cb(new Error(`Định dạng MIME không hợp lệ: ${file.mimetype}`), false);
  }

  cb(null, true);
};

export const uploadMediaMiddleware = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max file size
  },
}).single('file');

export const handleMediaUpload = (req, res, next) => {
  uploadMediaMiddleware(req, res, (err) => {
    if (err) {
      return res.status(400).json({
        status: 'error',
        message: err.message || 'Lỗi khi upload file media',
      });
    }

    if (!req.file) {
      return res.status(400).json({
        status: 'error',
        message: 'Vui lòng đính kèm file media (hình ảnh hoặc âm thanh)',
      });
    }

    const fileUrl = `/uploads/${req.file.filename}`;
    const fileType = req.file.mimetype.startsWith('audio/') ? 'audio' : 'image';

    res.json({
      status: 'success',
      message: 'Upload file thành công',
      data: {
        fileUrl,
        filename: req.file.filename,
        originalName: req.file.originalname,
        fileType,
        size: req.file.size,
      },
    });
  });
};
