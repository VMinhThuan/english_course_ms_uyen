import express from 'express';
import multer from 'multer';
import { verifyToken, checkRole } from '../middlewares/auth.js';
import {
  confirmQuestionImport,
  getQuestionImportBatch,
  patchQuestionImportRow,
  uploadQuestionImportPreview,
} from '../controllers/questionImportController.js';
import { XLSX_IMPORT_LIMITS } from '../services/toeicPart5XlsxParser.js';

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: XLSX_IMPORT_LIMITS.maxFileBytes,
    files: 1,
    fields: 0,
    fieldNameSize: 100,
  },
});

const receiveWorkbook = (req, res, next) => upload.single('file')(req, res, (error) => {
  if (!error) return next();
  const tooLarge = error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE';
  return res.status(tooLarge ? 413 : 400).json({
    status: 'error',
    code: tooLarge ? 'FILE_TOO_LARGE' : error.code || 'INVALID_UPLOAD',
    message: tooLarge ? 'XLSX file exceeds the upload size limit.' : 'Upload must contain one file in form field "file".',
  });
});

router.use(verifyToken, checkRole('admin'));
router.post('/', receiveWorkbook, uploadQuestionImportPreview);
router.get('/:batchId', getQuestionImportBatch);
router.patch('/:batchId/rows/:rowNumber', patchQuestionImportRow);
router.post('/:batchId/confirm', confirmQuestionImport);

export default router;
