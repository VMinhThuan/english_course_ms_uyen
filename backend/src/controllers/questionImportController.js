import {
  confirmQuestionImportBatch,
  createQuestionImportPreview,
  editQuestionImportRow,
  getQuestionImportPreview,
  QuestionImportServiceError,
} from '../services/questionImportService.js';
import { XlsxImportError } from '../services/toeicPart5XlsxParser.js';

const handleControllerError = (error, res, next) => {
  if (error instanceof QuestionImportServiceError || error instanceof XlsxImportError) {
    return res.status(error.statusCode).json({
      status: 'error',
      code: error.code,
      message: error.message,
      ...(error.data ? { data: error.data } : {}),
    });
  }
  return next(error);
};

export const uploadQuestionImportPreview = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ status: 'error', code: 'FILE_REQUIRED', message: 'XLSX file is required in form field "file".' });
    }
    const result = await createQuestionImportPreview({
      buffer: req.file.buffer,
      originalFileName: req.file.originalname,
      actorId: req.user._id,
    });
    return res.status(result.inProgress ? 202 : result.reused ? 200 : 201).json({
      status: 'success',
      message: result.inProgress
        ? 'Import preview is being prepared.'
        : result.reused ? 'An existing preview for this file was returned; no Questions were created.' : 'XLSX preview is ready; no Questions were created.',
      data: result,
    });
  } catch (error) {
    return handleControllerError(error, res, next);
  }
};

export const getQuestionImportBatch = async (req, res, next) => {
  try {
    const result = await getQuestionImportPreview(req.params.batchId);
    return res.json({ status: 'success', data: result });
  } catch (error) {
    return handleControllerError(error, res, next);
  }
};

export const patchQuestionImportRow = async (req, res, next) => {
  try {
    const rowNumber = Number(req.params.rowNumber);
    if (!Number.isInteger(rowNumber) || rowNumber < 1) {
      return res.status(400).json({ status: 'error', code: 'INVALID_ROW_NUMBER', message: 'rowNumber must be a positive integer.' });
    }
    const updates = req.body?.values ?? req.body;
    const result = await editQuestionImportRow({
      batchId: req.params.batchId,
      rowNumber,
      updates,
    });
    return res.json({ status: 'success', message: 'Row was revalidated.', data: result });
  } catch (error) {
    return handleControllerError(error, res, next);
  }
};

export const confirmQuestionImport = async (req, res, next) => {
  try {
    const result = await confirmQuestionImportBatch({
      batchId: req.params.batchId,
      rowNumbers: req.body?.rowNumbers,
      actorId: req.user._id,
    });
    const hasFailure = result.results.some((row) => ['FAILED', 'INVALID', 'NEEDS_REVIEW', 'DUPLICATE', 'ROW_NOT_FOUND', 'ROW_IN_PROGRESS'].includes(row.status));
    return res.status(hasFailure ? 207 : 200).json({
      status: hasFailure ? 'partial' : 'success',
      message: hasFailure ? 'Confirm finished with row-level outcomes.' : 'Selected rows were processed.',
      data: result,
    });
  } catch (error) {
    return handleControllerError(error, res, next);
  }
};
