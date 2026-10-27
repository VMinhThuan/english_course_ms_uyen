import {
  confirmQuestionImportBatch,
  createQuestionImportPreview,
  editQuestionImportRow,
  getQuestionImportPreview,
  QuestionImportServiceError,
} from '../services/questionImportService.js';
import { XLSX_IMPORT_LIMITS, XlsxImportError } from '../services/toeicPart5XlsxParser.js';
import { deleteFromBlob, getPrivateBlobMetadata, getPrivateBlobPathname, readPrivateBlobBuffer } from '../utils/blobStorage.js';
import { getSafeDisplayName } from '../utils/uploadValidation.js';

const getOwnedQuestionImportBlobPath = (value, userId) => {
  const pathname = getPrivateBlobPathname(value);
  if (!pathname) return null;
  const prefix = `uploads/question-import-xlsx/${String(userId || '')}/`;
  if (!pathname.startsWith(prefix)) return null;
  return /^[0-9a-f-]{36}\.xlsx$/i.test(pathname.slice(prefix.length)) ? pathname : null;
};

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
  let temporaryBlobPath = null;
  try {
    if (req.file && req.body?.blobPath) {
      return res.status(400).json({ status: 'error', code: 'UPLOAD_REFERENCE_INVALID', message: 'Chỉ gửi một nguồn tệp XLSX.' });
    }

    let buffer;
    let originalFileName;
    if (req.file) {
      buffer = req.file.buffer;
      originalFileName = getSafeDisplayName(req.file.originalname);
    } else if (req.body?.blobPath) {
      temporaryBlobPath = getOwnedQuestionImportBlobPath(req.body.blobPath, req.user?._id);
      if (!temporaryBlobPath) {
        return res.status(400).json({ status: 'error', code: 'UPLOAD_REFERENCE_INVALID', message: 'Tham chiếu XLSX không hợp lệ.' });
      }

      const metadata = await getPrivateBlobMetadata(temporaryBlobPath);
      if (!metadata) {
        return res.status(404).json({ status: 'error', code: 'UPLOADED_FILE_NOT_FOUND', message: 'Không tìm thấy file XLSX trong Blob.' });
      }
      if (!Number.isSafeInteger(metadata.size) || metadata.size <= 0 || metadata.size > XLSX_IMPORT_LIMITS.maxFileBytes) {
        return res.status(413).json({ status: 'error', code: 'FILE_TOO_LARGE', message: 'XLSX file exceeds the 8 MiB upload size limit.' });
      }

      const uploaded = await readPrivateBlobBuffer(temporaryBlobPath, XLSX_IMPORT_LIMITS.maxFileBytes);
      if (!uploaded) {
        return res.status(404).json({ status: 'error', code: 'UPLOADED_FILE_NOT_FOUND', message: 'Không tìm thấy file XLSX trong Blob.' });
      }
      buffer = uploaded.buffer;
      originalFileName = getSafeDisplayName(req.body.originalFileName || req.body.originalName || 'toeic-part5-import.xlsx');
    } else {
      return res.status(400).json({ status: 'error', code: 'FILE_REQUIRED', message: 'XLSX file is required in form field "file".' });
    }

    if (buffer.length > XLSX_IMPORT_LIMITS.maxFileBytes) {
      return res.status(413).json({ status: 'error', code: 'FILE_TOO_LARGE', message: 'XLSX file exceeds the 8 MiB upload size limit.' });
    }
    if (!originalFileName.toLowerCase().endsWith('.xlsx')) {
      return res.status(400).json({ status: 'error', code: 'FILE_TYPE_NOT_ALLOWED', message: 'Chỉ chấp nhận file .xlsx.' });
    }

    const result = await createQuestionImportPreview({
      buffer,
      originalFileName,
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
  } finally {
    if (temporaryBlobPath) {
      await deleteFromBlob(temporaryBlobPath).catch(() => {
        console.error('Unable to remove a temporary Part 5 XLSX Blob.');
      });
    }
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
