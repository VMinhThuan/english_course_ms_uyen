import { ExerciseImportError, createExerciseImportPreview, confirmExerciseImport, getExerciseImportBatch } from '../services/exerciseImportService.js';

const respondError = (error, res, next) => {
  if (error instanceof ExerciseImportError) {
    return res.status(error.statusCode).json({ status: 'error', code: error.code, message: error.message });
  }
  return next(error);
};

const validBatchId = (value) => /^[a-f\d]{24}$/i.test(String(value || ''));

export const uploadExerciseImportPreview = async (req, res, next) => {
  try {
    if (!req.file?.buffer) return res.status(400).json({ status: 'error', code: 'FILE_REQUIRED', message: 'Hãy chọn một file .xlsx để xem trước.' });
    const batch = await createExerciseImportPreview({
      exerciseType: req.params.exerciseType,
      buffer: req.file.buffer,
      originalFileName: req.file.originalname,
      uploadedBy: req.user._id,
    });
    return res.status(201).json({ status: 'success', data: { batch } });
  } catch (error) {
    return respondError(error, res, next);
  }
};

export const getExerciseImportPreview = async (req, res, next) => {
  try {
    if (!validBatchId(req.params.batchId)) {
      return res.status(404).json({ status: 'error', code: 'BATCH_NOT_FOUND', message: 'Không tìm thấy phiên xem trước import.' });
    }
    const batch = await getExerciseImportBatch(req.params.batchId);
    if (String(batch.uploadedBy) !== String(req.user._id)) {
      return res.status(404).json({ status: 'error', code: 'BATCH_NOT_FOUND', message: 'Không tìm thấy phiên xem trước import.' });
    }
    return res.json({ status: 'success', data: { batch } });
  } catch (error) {
    return respondError(error, res, next);
  }
};

export const confirmExerciseImportPreview = async (req, res, next) => {
  try {
    if (!validBatchId(req.params.batchId)) {
      return res.status(404).json({ status: 'error', code: 'BATCH_NOT_FOUND', message: 'Không tìm thấy phiên import.' });
    }
    const batch = await confirmExerciseImport({ batchId: req.params.batchId, confirmedBy: req.user._id });
    return res.json({ status: 'success', data: { batch } });
  } catch (error) {
    return respondError(error, res, next);
  }
};
