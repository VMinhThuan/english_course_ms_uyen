import express from 'express';
import multer from 'multer';
import { verifyToken, checkRole } from '../middlewares/auth.js';
import { XLSX_IMPORT_LIMITS } from '../services/toeicPart5XlsxParser.js';
import { confirmExerciseImportPreview, getExerciseImportPreview, uploadExerciseImportPreview } from '../controllers/exerciseImportController.js';

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: XLSX_IMPORT_LIMITS.maxFileBytes, files: 1, fields: 0, fieldNameSize: 100 },
});

const receiveWorkbook = (req, res, next) => upload.single('file')(req, res, (error) => {
  if (!error) return next();
  const tooLarge = error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE';
  return res.status(tooLarge ? 413 : 400).json({
    status: 'error',
    code: tooLarge ? 'FILE_TOO_LARGE' : error.code || 'INVALID_UPLOAD',
    message: tooLarge ? 'File Excel vượt quá giới hạn 8 MiB.' : 'Hãy gửi một file trong trường "file".',
  });
});

router.use(verifyToken, checkRole('admin'));
router.post('/:exerciseType/preview', receiveWorkbook, uploadExerciseImportPreview);
router.get('/:batchId', getExerciseImportPreview);
router.post('/:batchId/confirm', confirmExerciseImportPreview);

export default router;
