import express from 'express';
import mongoose from 'mongoose';
import {
  getStudentVocabularyCatalogChapter,
  listStudentVocabularyCatalogChapterVocabulary,
  listStudentVocabularyCatalogChapters,
  listStudentVocabularyCatalogTags,
  StudentVocabularyCatalogError,
} from '../services/studentVocabularyCatalogPrototype.js';

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function requireTrustedStudent(req, res, next) {
  const principal = req.user;
  if (!principal || !mongoose.isObjectIdOrHexString(principal._id || principal.id)) {
    return res.status(401).json({ status: 'error', code: 'AUTHENTICATION_REQUIRED', message: 'A verified Student identity is required.' });
  }
  if (principal.role !== 'student') {
    return res.status(403).json({ status: 'error', code: 'STUDENT_REQUIRED', message: 'Student access is required for this prototype.' });
  }
  return next();
}

/**
 * Read-only Student Catalog prototype. The application must inject trusted
 * authentication and keep this router unmounted until access policy approval.
 */
export function createStudentVocabularyCatalogPrototypeRouter({ authenticateStudent } = {}) {
  if (typeof authenticateStudent !== 'function') {
    throw new TypeError('Trusted authenticateStudent middleware is required for the prototype router.');
  }
  const router = express.Router();
  router.use(authenticateStudent, requireTrustedStudent);

  router.get('/tags', asyncRoute(async (req, res) => {
    const result = await listStudentVocabularyCatalogTags(req.query);
    return res.json({ status: 'success', data: result });
  }));
  router.get('/tags/:tagId/chapters', asyncRoute(async (req, res) => {
    const result = await listStudentVocabularyCatalogChapters(req.params.tagId, req.query);
    return res.json({ status: 'success', data: result });
  }));
  router.get('/chapters/:chapterId', asyncRoute(async (req, res) => {
    const result = await getStudentVocabularyCatalogChapter(req.params.chapterId);
    return res.json({ status: 'success', data: result });
  }));
  router.get('/chapters/:chapterId/vocabularies', asyncRoute(async (req, res) => {
    const result = await listStudentVocabularyCatalogChapterVocabulary(req.params.chapterId, req.query);
    return res.json({ status: 'success', data: result });
  }));

  router.use((error, _req, res, _next) => {
    if (error instanceof StudentVocabularyCatalogError) {
      return res.status(error.statusCode || 400).json({
        status: 'error', code: error.code, message: error.message,
      });
    }
    return res.status(500).json({
      status: 'error', code: 'STUDENT_CATALOG_UNAVAILABLE',
      message: 'The Vocabulary Catalog could not be loaded. Please try again.',
    });
  });

  return router;
}

export default createStudentVocabularyCatalogPrototypeRouter;
