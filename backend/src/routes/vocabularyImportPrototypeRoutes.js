import express from 'express';
import multer from 'multer';
import mongoose from 'mongoose';
import {
  DOCX_UPLOAD_POLICIES,
  MAX_DOCX_IMPORT_BYTES,
  getSafeOriginalExtension,
  validateUploadSample,
} from '../utils/uploadValidation.js';
import {
  VocabularyImportWorkflowError,
  createVocabularyImportBatch,
  confirmVocabularyImportDraft,
  editVocabularyImportCandidate,
  getVocabularyImportBatch,
  getVocabularyImportCandidate,
  listVocabularyImportCandidates,
  reviewVocabularyImportCandidate,
} from '../services/vocabularyImportWorkflowPrototype.js';
import {
  getVocabularyImportCatalogMapping,
  listVocabularyImportBatchHistory,
  requireBatchCatalogMapping,
  saveVocabularyImportCatalogMapping,
  VocabularyImportCatalogMappingError,
} from '../services/vocabularyImportCatalogMappingPrototype.js';
import { VocabularyCatalogManagementError } from '../services/vocabularyCatalogManagementPrototype.js';

const routerJson = express.json({ limit: '128kb', strict: true });
const allowedDocxMimes = new Set([
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/zip',
  'application/x-zip-compressed',
  'application/octet-stream',
]);
const MAX_FILES_PER_BATCH = 5;
const MAX_BATCH_BYTES = 25 * 1024 * 1024;

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function uploadFailure(error, res) {
  if (error instanceof multer.MulterError) {
    const tooLarge = error.code === 'LIMIT_FILE_SIZE' || error.code === 'LIMIT_FIELD_VALUE';
    return res.status(tooLarge ? 413 : 400).json({
      status: 'error',
      code: tooLarge ? 'FILE_TOO_LARGE' : (error.code || 'INVALID_UPLOAD'),
      message: tooLarge ? 'DOCX upload exceeded the configured size limit.' : 'Upload must contain up to five DOCX files and at most one metadata field.',
    });
  }
  return res.status(400).json({
    status: 'error',
    code: error?.code || 'INVALID_UPLOAD',
    message: 'DOCX upload was rejected by the file policy.',
  });
}

function createDocxUploadMiddleware() {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_DOCX_IMPORT_BYTES, files: MAX_FILES_PER_BATCH, fields: 1, fieldSize: 128, headerPairs: 50 },
    fileFilter(_req, file, callback) {
      const extension = getSafeOriginalExtension(file.originalname);
      const mime = String(file.mimetype || '').split(';', 1)[0].trim().toLowerCase();
      if (!DOCX_UPLOAD_POLICIES.file.extensions.includes(extension) || !allowedDocxMimes.has(mime)) {
        const error = new Error('Unsupported upload type.');
        error.code = 'FILE_TYPE_NOT_ALLOWED';
        return callback(error);
      }
      return callback(null, true);
    },
  });

  return (req, res, next) => upload.array('files', MAX_FILES_PER_BATCH)(req, res, (error) => {
    if (error) return uploadFailure(error, res);
    if (!Array.isArray(req.files) || req.files.length < 1) {
      return res.status(400).json({ status: 'error', code: 'FILE_REQUIRED', message: 'Attach at least one DOCX file using the files field.' });
    }
    const totalBytes = req.files.reduce((sum, file) => sum + file.size, 0);
    if (totalBytes > MAX_BATCH_BYTES) {
      return res.status(413).json({ status: 'error', code: 'BATCH_UPLOAD_TOO_LARGE', message: 'Combined DOCX batch size exceeded 25 MiB.' });
    }
    for (const file of req.files) {
      const validation = validateUploadSample({
        originalName: file.originalname,
        mimetype: file.mimetype,
        sample: file.buffer.subarray(0, 8192),
      }, DOCX_UPLOAD_POLICIES.file);
      if (!validation.valid) {
        return res.status(400).json({ status: 'error', code: validation.code, message: 'File name, MIME type and ZIP signature must identify a DOCX package.' });
      }
    }
    return next();
  });
}

function requireTrustedAdmin(req, res, next) {
  const principal = req.user;
  if (!principal || !mongoose.isObjectIdOrHexString(principal._id || principal.id)) {
    return res.status(401).json({ status: 'error', code: 'AUTHENTICATION_REQUIRED', message: 'A verified Admin identity is required.' });
  }
  if (principal.role !== 'admin') {
    return res.status(403).json({ status: 'error', code: 'ADMIN_REQUIRED', message: 'Admin access is required.' });
  }
  return next();
}

/**
 * Isolated V3A prototype router. It is intentionally not imported by app.js or any
 * production router. The caller must supply trusted authentication middleware that
 * populates req.user; request body/query role values are never consulted.
 */
export function createVocabularyImportPrototypeRouter({ authenticateAdmin, requireCatalogMappingForConfirm = false } = {}) {
  if (typeof authenticateAdmin !== 'function') {
    throw new TypeError('Trusted authenticateAdmin middleware is required for the prototype router.');
  }
  const router = express.Router();
  router.use(authenticateAdmin, requireTrustedAdmin, routerJson);

  router.get('/', asyncRoute(async (req, res) => {
    const result = await listVocabularyImportBatchHistory(req.query);
    return res.json({ status: 'success', data: result });
  }));

  router.post('/', createDocxUploadMiddleware(), asyncRoute(async (req, res) => {
    if (Object.keys(req.body || {}).some((field) => field !== 'sourceFolder')) {
      return res.status(400).json({ status: 'error', code: 'INVALID_UPLOAD_FIELDS', message: 'Only sourceFolder metadata is accepted.' });
    }
    const result = await createVocabularyImportBatch({
      files: req.files,
      sourceFolder: req.body?.sourceFolder,
      actorId: req.user._id || req.user.id,
    });
    return res.status(result.idempotent ? 200 : 201).json({ status: 'success', data: result });
  }));

  router.get('/:batchId', asyncRoute(async (req, res) => {
    const batch = await getVocabularyImportBatch(req.params.batchId);
    return res.json({ status: 'success', data: batch });
  }));

  router.get('/:batchId/catalog-mapping', asyncRoute(async (req, res) => {
    const result = await getVocabularyImportCatalogMapping(req.params.batchId);
    return res.json({ status: 'success', data: result });
  }));

  router.put('/:batchId/catalog-mapping', asyncRoute(async (req, res) => {
    const result = await saveVocabularyImportCatalogMapping(req.params.batchId, req.body);
    return res.json({ status: 'success', data: result });
  }));

  router.get('/:batchId/candidates', asyncRoute(async (req, res) => {
    const result = await listVocabularyImportCandidates(req.params.batchId, req.query);
    return res.json({ status: 'success', data: result });
  }));

  router.get('/:batchId/candidates/:candidateId', asyncRoute(async (req, res) => {
    const result = await getVocabularyImportCandidate({ batchId: req.params.batchId, candidateId: req.params.candidateId });
    return res.json({ status: 'success', data: result });
  }));

  router.patch('/:batchId/candidates/:candidateId', asyncRoute(async (req, res) => {
    const candidate = await editVocabularyImportCandidate({
      batchId: req.params.batchId,
      candidateId: req.params.candidateId,
      actorId: req.user._id || req.user.id,
      body: req.body,
    });
    return res.json({ status: 'success', data: candidate });
  }));

  router.post('/:batchId/candidates/:candidateId/review', asyncRoute(async (req, res) => {
    const candidate = await reviewVocabularyImportCandidate({
      batchId: req.params.batchId,
      candidateId: req.params.candidateId,
      actorId: req.user._id || req.user.id,
      body: req.body,
    });
    return res.json({ status: 'success', data: candidate });
  }));

  router.post('/:batchId/confirm', asyncRoute(async (req, res) => {
    if (requireCatalogMappingForConfirm) {
      const mapping = await requireBatchCatalogMapping(req.params.batchId);
      if (!mapping) {
        return res.status(409).json({
          status: 'error',
          code: 'CATALOG_MAPPING_REQUIRED',
          message: 'Map every DOCX to an explicit Tag and Chapter before Confirm.',
        });
      }
    }
    const result = await confirmVocabularyImportDraft({
      batchId: req.params.batchId,
      actorId: req.user._id || req.user.id,
      body: req.body,
    });
    return res.json({ status: 'success', data: result });
  }));

  router.use((error, _req, res, _next) => {
    if (error instanceof VocabularyImportWorkflowError) {
      return res.status(error.statusCode).json({
        status: 'error',
        code: error.code,
        message: error.message,
        ...(error.rowErrors.length ? { rowErrors: error.rowErrors } : {}),
      });
    }
    if (error instanceof VocabularyImportCatalogMappingError || error instanceof VocabularyCatalogManagementError) {
      return res.status(error.statusCode || 400).json({
        status: 'error', code: error.code, message: error.message,
        ...(error.details ? { details: error.details } : {}),
      });
    }
    if (error?.type === 'entity.too.large') {
      return res.status(413).json({ status: 'error', code: 'PAYLOAD_TOO_LARGE', message: 'JSON payload exceeded the configured size limit.' });
    }
    if (error instanceof SyntaxError && error.status === 400) {
      return res.status(400).json({ status: 'error', code: 'INVALID_JSON', message: 'Request body must be valid JSON.' });
    }
    // Do not return parser internals, source text, stack traces or MongoDB details.
    return res.status(500).json({ status: 'error', code: 'IMPORT_WORKFLOW_FAILED', message: 'The vocabulary import operation failed.' });
  });

  return router;
}

export default createVocabularyImportPrototypeRouter;
