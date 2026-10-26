import express from 'express';
import mongoose from 'mongoose';
import {
  addCatalogVocabularyMembership,
  archiveManagedVocabularyChapter,
  archiveManagedVocabularyTag,
  createManagedVocabularyChapter,
  createManagedVocabularyTag,
  getManagedVocabularyChapter,
  getVocabularyTag,
  listCatalogVocabularyOptions,
  listChapterMemberships,
  listManagedVocabularyChapters,
  listVocabularyTags,
  reorderChapterMemberships,
  updateManagedVocabularyChapter,
  updateManagedVocabularyTag,
  VocabularyCatalogManagementError,
} from '../services/vocabularyCatalogManagementPrototype.js';

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
 * Isolated Admin-only Catalog prototype. The caller must provide trusted auth;
 * this router is deliberately not imported by the application route tree.
 */
export function createVocabularyCatalogManagementPrototypeRouter({ authenticateAdmin } = {}) {
  if (typeof authenticateAdmin !== 'function') {
    throw new TypeError('Trusted authenticateAdmin middleware is required for the prototype router.');
  }
  const router = express.Router();
  router.use(authenticateAdmin, requireTrustedAdmin, express.json({ limit: '64kb', strict: true }));

  router.get('/tags', asyncRoute(async (req, res) => {
    const result = await listVocabularyTags(req.query);
    return res.json({ status: 'success', data: result });
  }));
  router.post('/tags', asyncRoute(async (req, res) => {
    const tag = await createManagedVocabularyTag(req.body);
    return res.status(201).json({ status: 'success', data: { tag } });
  }));
  router.get('/tags/:tagId', asyncRoute(async (req, res) => {
    const tag = await getVocabularyTag(req.params.tagId);
    return res.json({ status: 'success', data: { tag } });
  }));
  router.patch('/tags/:tagId', asyncRoute(async (req, res) => {
    const tag = await updateManagedVocabularyTag(req.params.tagId, req.body);
    return res.json({ status: 'success', data: { tag } });
  }));
  router.post('/tags/:tagId/archive', asyncRoute(async (req, res) => {
    const tag = await archiveManagedVocabularyTag(req.params.tagId, req.body, req.user._id || req.user.id);
    return res.json({ status: 'success', data: { tag } });
  }));

  router.get('/tags/:tagId/chapters', asyncRoute(async (req, res) => {
    const result = await listManagedVocabularyChapters(req.params.tagId, req.query);
    return res.json({ status: 'success', data: result });
  }));
  router.post('/tags/:tagId/chapters', asyncRoute(async (req, res) => {
    const chapter = await createManagedVocabularyChapter(req.params.tagId, req.body);
    return res.status(201).json({ status: 'success', data: { chapter } });
  }));
  router.get('/chapters/:chapterId', asyncRoute(async (req, res) => {
    const chapter = await getManagedVocabularyChapter(req.params.chapterId);
    return res.json({ status: 'success', data: { chapter } });
  }));
  router.patch('/chapters/:chapterId', asyncRoute(async (req, res) => {
    const chapter = await updateManagedVocabularyChapter(req.params.chapterId, req.body);
    return res.json({ status: 'success', data: { chapter } });
  }));
  router.post('/chapters/:chapterId/archive', asyncRoute(async (req, res) => {
    const chapter = await archiveManagedVocabularyChapter(req.params.chapterId, req.body, req.user._id || req.user.id);
    return res.json({ status: 'success', data: { chapter } });
  }));

  router.get('/chapters/:chapterId/memberships', asyncRoute(async (req, res) => {
    const result = await listChapterMemberships(req.params.chapterId, req.query);
    return res.json({ status: 'success', data: result });
  }));
  router.post('/chapters/:chapterId/memberships', asyncRoute(async (req, res) => {
    const result = await addCatalogVocabularyMembership(req.params.chapterId, req.body);
    return res.status(201).json({ status: 'success', data: result });
  }));
  router.post('/chapters/:chapterId/memberships/reorder', asyncRoute(async (req, res) => {
    const chapter = await reorderChapterMemberships(req.params.chapterId, req.body);
    return res.json({ status: 'success', data: { chapter } });
  }));
  router.get('/vocabulary-options', asyncRoute(async (req, res) => {
    const result = await listCatalogVocabularyOptions(req.query);
    return res.json({ status: 'success', data: result });
  }));

  router.use((error, _req, res, _next) => {
    if (error instanceof VocabularyCatalogManagementError) {
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
    return res.status(500).json({ status: 'error', code: 'CATALOG_MANAGEMENT_FAILED', message: 'The Vocabulary Catalog operation failed.' });
  });

  return router;
}

export default createVocabularyCatalogManagementPrototypeRouter;
