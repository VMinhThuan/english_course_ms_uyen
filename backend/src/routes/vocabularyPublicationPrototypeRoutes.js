import express from 'express';
import mongoose from 'mongoose';
import {
  archiveVocabularyChapter,
  archiveVocabularyTag,
  getVocabularyPublicationEligibility,
  getVocabularyPublicationTagSummary,
  hideCatalogVocabulary,
  listVocabularyPublicationAudit,
  publishCatalogVocabulary,
  publishVocabularyChapter,
  publishVocabularyTag,
  reviewVocabularyChapter,
  reviewVocabularyTag,
  VocabularyPublicationError,
} from '../services/vocabularyPublicationWorkflowPrototype.js';

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
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
 * Isolated publication prototype. It accepts only an injected trusted Admin
 * principal and must remain unmounted from the application route tree.
 */
export function createVocabularyPublicationPrototypeRouter({ authenticateAdmin } = {}) {
  if (typeof authenticateAdmin !== 'function') {
    throw new TypeError('Trusted authenticateAdmin middleware is required for the publication prototype router.');
  }
  const router = express.Router();
  router.use(authenticateAdmin, requireTrustedAdmin, express.json({ limit: '32kb', strict: true }));

  router.get('/eligibility/:entityType/:entityId', asyncRoute(async (req, res) => {
    const result = await getVocabularyPublicationEligibility(req.params.entityType.toUpperCase(), req.params.entityId, {
      membershipId: req.query.membershipId,
    });
    return res.json({ status: 'success', data: result });
  }));
  router.get('/tags/:tagId/summary', asyncRoute(async (req, res) => {
    const result = await getVocabularyPublicationTagSummary(req.params.tagId);
    return res.json({ status: 'success', data: result });
  }));
  router.get('/audit', asyncRoute(async (req, res) => {
    const result = await listVocabularyPublicationAudit(req.query);
    return res.json({ status: 'success', data: result });
  }));

  router.post('/tags/:tagId/review', asyncRoute(async (req, res) => {
    const result = await reviewVocabularyTag(req.params.tagId, req.user._id || req.user.id, req.body);
    return res.json({ status: 'success', data: result });
  }));
  router.post('/tags/:tagId/publish', asyncRoute(async (req, res) => {
    const result = await publishVocabularyTag(req.params.tagId, req.user._id || req.user.id, req.body);
    return res.json({ status: 'success', data: result });
  }));
  router.post('/tags/:tagId/archive', asyncRoute(async (req, res) => {
    const result = await archiveVocabularyTag(req.params.tagId, req.user._id || req.user.id, req.body);
    return res.json({ status: 'success', data: result });
  }));

  router.post('/chapters/:chapterId/review', asyncRoute(async (req, res) => {
    const result = await reviewVocabularyChapter(req.params.chapterId, req.user._id || req.user.id, req.body);
    return res.json({ status: 'success', data: result });
  }));
  router.post('/chapters/:chapterId/publish', asyncRoute(async (req, res) => {
    const result = await publishVocabularyChapter(req.params.chapterId, req.user._id || req.user.id, req.body);
    return res.json({ status: 'success', data: result });
  }));
  router.post('/chapters/:chapterId/archive', asyncRoute(async (req, res) => {
    const result = await archiveVocabularyChapter(req.params.chapterId, req.user._id || req.user.id, req.body);
    return res.json({ status: 'success', data: result });
  }));

  router.post('/vocabularies/:vocabularyId/publish', asyncRoute(async (req, res) => {
    const result = await publishCatalogVocabulary(req.params.vocabularyId, req.user._id || req.user.id, req.body);
    return res.json({ status: 'success', data: result });
  }));
  router.post('/vocabularies/:vocabularyId/hide', asyncRoute(async (req, res) => {
    const result = await hideCatalogVocabulary(req.params.vocabularyId, req.user._id || req.user.id, req.body);
    return res.json({ status: 'success', data: result });
  }));

  router.use((error, _req, res, _next) => {
    if (error instanceof VocabularyPublicationError) {
      return res.status(error.statusCode || 400).json({
        status: 'error', code: error.code, message: error.message,
        ...(error.details ? { details: error.details } : {}),
      });
    }
    if (error?.type === 'entity.too.large') {
      return res.status(413).json({ status: 'error', code: 'PAYLOAD_TOO_LARGE', message: 'Request body exceeded the configured limit.' });
    }
    if (error instanceof SyntaxError && error.status === 400) {
      return res.status(400).json({ status: 'error', code: 'INVALID_JSON', message: 'Request body must be valid JSON.' });
    }
    return res.status(500).json({ status: 'error', code: 'PUBLICATION_FAILED', message: 'The Vocabulary Publication operation failed.' });
  });

  return router;
}

export default createVocabularyPublicationPrototypeRouter;
