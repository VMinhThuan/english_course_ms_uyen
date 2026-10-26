import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import express from 'express';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { MongoMemoryServer } from 'mongodb-memory-server';
import lessonRoutes from '../src/routes/lessonRoutes.js';
import materialRoutes from '../src/routes/materialRoutes.js';
import vocabularyRoutes from '../src/routes/vocabularyRoutes.js';
import { protectPrivateUpload } from '../src/middlewares/protectedUploads.js';
import User from '../src/models/User.js';
import Course from '../src/models/Course.js';
import Lesson from '../src/models/Lesson.js';
import Material from '../src/models/Material.js';
import Vocabulary from '../src/models/Vocabulary.js';
import Enrollment from '../src/models/Enrollment.js';
import { getPrivateUploadDir } from '../src/utils/uploadConfig.js';

const unique = randomUUID().replaceAll('-', '');
const dbName = `phase4_learning_${unique}`;
let mongoServer;
let setupError;
let httpServer;
let baseUrl;
let teacher;
let student;
let unEnrolledStudent;
let admin;
let suspendedStudent;
let teacherToken;
let studentToken;
let unEnrolledToken;
let adminToken;
let suspendedToken;
let course;
let lesson;
let enrolledPdf;
let downloadDisabledPdf;
let corruptPdf;
let oversizedPdf;
let nonPdfMaterial;
let hiddenMaterial;
let unpublishedLessonMaterial;
let unpublishedCourseMaterial;
let mismatchedCourseMaterial;
let unresolvedCourseMaterial;
let externalPdf;
const ownedFiles = [];
const fixtureDirectory = path.join(getPrivateUploadDir(), `phase4-${unique}`);

try {
  assert.equal(mongoose.connection.readyState, 0, 'test must start with a disconnected Mongoose connection');
  mongoServer = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1', dbName } });
  const isolatedUri = mongoServer.getUri(dbName);
  const parsedUri = new URL(isolatedUri);
  assert.equal(parsedUri.hostname, '127.0.0.1', 'test MongoDB must bind to loopback only');
  assert.equal(parsedUri.pathname.replaceAll('/', ''), dbName, 'test must use a disposable unique database');
  await mongoose.connect(isolatedUri, { serverSelectionTimeoutMS: 5000, autoIndex: true });
  await Promise.all([User.init(), Course.init(), Lesson.init(), Material.init(), Vocabulary.init(), Enrollment.init()]);

  process.env.JWT_SECRET = `phase4-access-${unique}`;
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use('/api/v1/lessons', lessonRoutes);
  app.use('/api/v1/materials', materialRoutes);
  app.use('/api/v1/vocabulary', vocabularyRoutes);
  app.use('/uploads/private', protectPrivateUpload);
  app.use((error, _req, res, _next) => res.status(500).json({ status: 'error', message: 'Internal test error' }));
  httpServer = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    httpServer.once('listening', resolve);
    httpServer.once('error', reject);
  });
  baseUrl = `http://127.0.0.1:${httpServer.address().port}`;

  teacher = await User.create({
    email: `phase4-teacher-${unique}@example.test`, password: 'teacher-password', role: 'teacher', status: 'active', isActive: true,
  });
  student = await User.create({
    email: `phase4-student-${unique}@example.test`, password: 'student-password', role: 'student', status: 'active', isActive: true,
  });
  unEnrolledStudent = await User.create({
    email: `phase4-outsider-${unique}@example.test`, password: 'student-password', role: 'student', status: 'active', isActive: true,
  });
  admin = await User.create({
    email: `phase4-admin-${unique}@example.test`, password: 'admin-password', role: 'admin', status: 'active', isActive: true,
  });
  suspendedStudent = await User.create({
    email: `phase4-suspended-${unique}@example.test`, password: 'student-password', role: 'student', status: 'suspended', isActive: false,
    suspendedAt: new Date(),
  });
  teacherToken = jwt.sign({ userId: teacher._id }, process.env.JWT_SECRET, { expiresIn: '10m' });
  studentToken = jwt.sign({ userId: student._id }, process.env.JWT_SECRET, { expiresIn: '10m' });
  unEnrolledToken = jwt.sign({ userId: unEnrolledStudent._id }, process.env.JWT_SECRET, { expiresIn: '10m' });
  adminToken = jwt.sign({ userId: admin._id }, process.env.JWT_SECRET, { expiresIn: '10m' });
  suspendedToken = jwt.sign({ userId: suspendedStudent._id }, process.env.JWT_SECRET, { expiresIn: '10m' });

  course = await Course.create({
    title: `Phase 4 Learning ${unique.slice(0, 8)}`, description: 'Isolated Phase 4 test course', teacher: teacher._id,
    level: 'Beginner', englishType: 'TOEIC', isPublished: true,
  });
  lesson = await Lesson.create({
    title: 'Vocabulary lesson', content: 'Lesson body', course: course._id, status: 'published', topic: 'Work', order: 1,
  });
  await Enrollment.create({ student: student._id, course: course._id });
  await Enrollment.create({ student: suspendedStudent._id, course: course._id });

  await fs.mkdir(fixtureDirectory, { recursive: true });
  const pdfPath = path.join(fixtureDirectory, 'authorized.pdf');
  const blockedPdfPath = path.join(fixtureDirectory, 'download-disabled.pdf');
  const corruptPath = path.join(fixtureDirectory, 'corrupt.pdf');
  const oversizedPath = path.join(fixtureDirectory, 'oversized.pdf');
  ownedFiles.push(pdfPath, blockedPdfPath, corruptPath, oversizedPath);
  await fs.writeFile(pdfPath, Buffer.from('%PDF-1.7\nPhase 4 preview fixture\n%%EOF', 'ascii'));
  await fs.writeFile(blockedPdfPath, Buffer.from('%PDF-1.7\nNo student file access\n%%EOF', 'ascii'));
  await fs.writeFile(corruptPath, Buffer.from('not a PDF', 'ascii'));
  await fs.writeFile(oversizedPath, Buffer.from('%PDF-', 'ascii'));
  await fs.truncate(oversizedPath, 25 * 1024 * 1024 + 1);

  const createMaterial = (overrides) => Material.create({
    title: 'Bài đọc.pdf', originalName: 'Bài đọc.pdf', fileType: 'application/pdf', status: 'published',
    lesson: lesson._id, course: course._id, allowDownload: true,
    fileUrl: `/uploads/private/${path.basename(overrides.filePath)}`,
    fileSize: 100,
    ...overrides,
  });
  enrolledPdf = await createMaterial({ filePath: pdfPath });
  downloadDisabledPdf = await createMaterial({ filePath: blockedPdfPath, allowDownload: false });
  corruptPdf = await createMaterial({ filePath: corruptPath });
  oversizedPdf = await createMaterial({ filePath: oversizedPath });
  nonPdfMaterial = await createMaterial({ filePath: corruptPath, title: 'readme.txt', originalName: 'readme.txt', fileType: 'text/plain' });
  hiddenMaterial = await createMaterial({ filePath: pdfPath, status: 'hidden' });
  const unpublishedLesson = await Lesson.create({ title: 'Hidden lesson', course: course._id, status: 'hidden' });
  unpublishedLessonMaterial = await Material.create({
    title: 'Hidden lesson PDF', originalName: 'hidden.pdf', fileType: 'application/pdf', status: 'published', allowDownload: true,
    lesson: unpublishedLesson._id, course: course._id, filePath: pdfPath, fileUrl: `/uploads/private/${path.basename(pdfPath)}`,
  });
  const unpublishedCourse = await Course.create({
    title: `Phase 4 Unpublished ${unique.slice(0, 8)}`, description: 'Unpublished test course', teacher: teacher._id,
    level: 'Beginner', englishType: 'TOEIC', isPublished: false,
  });
  const unpublishedCourseLesson = await Lesson.create({
    title: 'Published lesson in unpublished course', course: unpublishedCourse._id, status: 'published',
  });
  unpublishedCourseMaterial = await Material.create({
    title: 'Unpublished course PDF', originalName: 'unpublished-course.pdf', fileType: 'application/pdf', status: 'published', allowDownload: true,
    lesson: unpublishedCourseLesson._id, course: unpublishedCourse._id, filePath: pdfPath,
    fileUrl: '/uploads/private/unpublished-course.pdf',
  });
  await Enrollment.create({ student: student._id, course: unpublishedCourse._id });
  const otherCourse = await Course.create({
    title: `Phase 4 Other ${unique.slice(0, 8)}`, description: 'Mismatched relation test course', teacher: teacher._id,
    level: 'Beginner', englishType: 'TOEIC', isPublished: true,
  });
  mismatchedCourseMaterial = await Material.create({
    title: 'Mismatched course PDF', originalName: 'mismatched.pdf', fileType: 'application/pdf', status: 'published', allowDownload: true,
    lesson: lesson._id, course: otherCourse._id, filePath: pdfPath, fileUrl: '/uploads/private/mismatched-course.pdf',
  });
  unresolvedCourseMaterial = await Material.create({
    title: 'Unresolved course PDF', originalName: 'unresolved-course.pdf', fileType: 'application/pdf', status: 'published', allowDownload: true,
    lesson: lesson._id, course: new mongoose.Types.ObjectId(), filePath: pdfPath, fileUrl: '/uploads/private/unresolved-course.pdf',
  });
  externalPdf = await createMaterial({ filePath: '', fileUrl: 'https://example.test/material.pdf' });
} catch (error) {
  setupError = error;
  if (httpServer?.listening) await new Promise((resolve) => httpServer.close(resolve));
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect().catch(() => {});
  if (mongoServer) await mongoServer.stop().catch(() => {});
  for (const file of ownedFiles) await fs.unlink(file).catch(() => {});
  await fs.rmdir(fixtureDirectory).catch(() => {});
}

const request = async (route, { method = 'GET', token, body, headers = {} } = {}) => {
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return response;
};

test('Phase 4 isolated learning API integration', {
  skip: setupError ? `BLOCKED: disposable MongoDB/API setup failed (${setupError.message})` : false,
}, async (t) => {
  await t.test('lesson difficulty accepts the supported optional enum and preserves legacy unset values', async () => {
    const legacy = await Lesson.create({ title: 'Legacy no difficulty', course: course._id, status: 'draft' });
    assert.equal(legacy.difficulty, undefined);

    const createdResponse = await request('/api/v1/lessons', {
      method: 'POST', token: teacherToken,
      body: { title: 'New lesson', courseId: String(course._id), status: 'draft', difficulty: 'INTERMEDIATE' },
    });
    const createdBody = await createdResponse.json();
    assert.equal(createdResponse.status, 201);
    assert.equal(createdBody.data.lesson.difficulty, 'intermediate');

    const invalidResponse = await request('/api/v1/lessons', {
      method: 'POST', token: teacherToken,
      body: { title: 'Invalid difficulty', courseId: String(course._id), difficulty: 'expert' },
    });
    assert.equal(invalidResponse.status, 400);
    assert.equal((await invalidResponse.json()).code, 'INVALID_LESSON_DIFFICULTY');

    const updateResponse = await request(`/api/v1/lessons/${createdBody.data.lesson._id}`, {
      method: 'PUT', token: teacherToken, body: { difficulty: 'advanced' },
    });
    assert.equal(updateResponse.status, 200);
    assert.equal((await Lesson.findById(createdBody.data.lesson._id).lean()).difficulty, 'advanced');

    const clearResponse = await request(`/api/v1/lessons/${createdBody.data.lesson._id}`, {
      method: 'PUT', token: teacherToken, body: { difficulty: null },
    });
    assert.equal(clearResponse.status, 200);
    assert.equal((await Lesson.findById(createdBody.data.lesson._id).lean()).difficulty, null);

    const invalidUpdateResponse = await request(`/api/v1/lessons/${createdBody.data.lesson._id}`, {
      method: 'PUT', token: teacherToken, body: { difficulty: 'expert' },
    });
    assert.equal(invalidUpdateResponse.status, 400);
    assert.equal((await Lesson.findById(createdBody.data.lesson._id).lean()).difficulty, null);
    assert.equal((await Lesson.findById(legacy._id).lean()).difficulty, undefined);
  });

  await t.test('PDF preview and download have independent permissions across API and direct private URLs', async () => {
    const unauthenticated = await request(`/api/v1/materials/${enrolledPdf._id}/preview`);
    assert.equal(unauthenticated.status, 401);

    const outsiderPreview = await request(`/api/v1/materials/${enrolledPdf._id}/preview`, { token: unEnrolledToken });
    assert.equal(outsiderPreview.status, 200);
    assert.match(outsiderPreview.headers.get('content-disposition') || '', /^inline;/i);
    await outsiderPreview.arrayBuffer();
    const outsiderDownload = await request(`/api/v1/materials/${enrolledPdf._id}/download`, { token: unEnrolledToken });
    assert.equal(outsiderDownload.status, 200);
    assert.match(outsiderDownload.headers.get('content-disposition') || '', /^attachment;/i);
    await outsiderDownload.arrayBuffer();

    const allowedPreview = await request(`/api/v1/materials/${enrolledPdf._id}/preview`, { token: studentToken });
    assert.equal(allowedPreview.status, 200);
    assert.match(allowedPreview.headers.get('content-type') || '', /^application\/pdf(?:;|$)/i);
    assert.match(allowedPreview.headers.get('content-disposition') || '', /^inline;/i);
    assert.match(allowedPreview.headers.get('cache-control') || '', /private/i);
    assert.match(allowedPreview.headers.get('cache-control') || '', /no-store/i);
    assert.equal(allowedPreview.headers.get('x-content-type-options'), 'nosniff');
    assert.ok(Buffer.from(await allowedPreview.arrayBuffer()).subarray(0, 5).equals(Buffer.from('%PDF-')));
    assert.match(allowedPreview.headers.get('content-disposition') || '', /filename\*=UTF-8''.*\.pdf/i);

    const previewHead = await request(`/api/v1/materials/${enrolledPdf._id}/preview`, { method: 'HEAD', token: studentToken });
    assert.equal(previewHead.status, 200);
    assert.match(previewHead.headers.get('content-type') || '', /^application\/pdf(?:;|$)/i);
    assert.equal((await previewHead.arrayBuffer()).byteLength, 0);

    const previewRange = await request(`/api/v1/materials/${enrolledPdf._id}/preview`, {
      token: studentToken, headers: { Range: 'bytes=0-4' },
    });
    assert.equal(previewRange.status, 206);
    assert.equal(previewRange.headers.get('content-range'), `bytes 0-4/${Buffer.byteLength('%PDF-1.7\nPhase 4 preview fixture\n%%EOF', 'ascii')}`);
    assert.match(previewRange.headers.get('content-disposition') || '', /^inline;/i);
    assert.ok(Buffer.from(await previewRange.arrayBuffer()).equals(Buffer.from('%PDF-', 'ascii')));

    const downloadResponse = await request(`/api/v1/materials/${enrolledPdf._id}/download`, { token: studentToken });
    assert.equal(downloadResponse.status, 200);
    assert.match(downloadResponse.headers.get('content-disposition') || '', /^attachment;/i);
    assert.match(downloadResponse.headers.get('content-type') || '', /^application\/pdf(?:;|$)/i);
    assert.match(downloadResponse.headers.get('content-disposition') || '', /filename\*=UTF-8''.*\.pdf/i);
    assert.ok(Buffer.from(await downloadResponse.arrayBuffer()).equals(Buffer.from('%PDF-1.7\nPhase 4 preview fixture\n%%EOF', 'ascii')));

    const disabledPreview = await request(`/api/v1/materials/${downloadDisabledPdf._id}/preview`, { token: studentToken });
    assert.equal(disabledPreview.status, 200);
    assert.match(disabledPreview.headers.get('content-disposition') || '', /^inline;/i);
    assert.match(disabledPreview.headers.get('content-type') || '', /^application\/pdf(?:;|$)/i);
    assert.match(disabledPreview.headers.get('cache-control') || '', /no-store/i);
    assert.ok(Buffer.from(await disabledPreview.arrayBuffer()).subarray(0, 5).equals(Buffer.from('%PDF-')));
    const disabledPreviewHead = await request(`/api/v1/materials/${downloadDisabledPdf._id}/preview`, { method: 'HEAD', token: studentToken });
    assert.equal(disabledPreviewHead.status, 200);
    assert.equal((await disabledPreviewHead.arrayBuffer()).byteLength, 0);
    const disabledPreviewRange = await request(`/api/v1/materials/${downloadDisabledPdf._id}/preview`, {
      token: studentToken, headers: { Range: 'bytes=0-4' },
    });
    assert.equal(disabledPreviewRange.status, 206);
    assert.match(disabledPreviewRange.headers.get('content-disposition') || '', /^inline;/i);
    assert.ok(Buffer.from(await disabledPreviewRange.arrayBuffer()).equals(Buffer.from('%PDF-', 'ascii')));

    const disabledDownload = await request(`/api/v1/materials/${downloadDisabledPdf._id}/download`, { token: studentToken });
    assert.equal(disabledDownload.status, 403);
    assert.equal((await disabledDownload.json()).code, 'MATERIAL_DOWNLOAD_NOT_ALLOWED');
    const disabledDownloadHead = await request(`/api/v1/materials/${downloadDisabledPdf._id}/download`, { method: 'HEAD', token: studentToken });
    assert.equal(disabledDownloadHead.status, 403);
    const disabledDownloadRange = await request(`/api/v1/materials/${downloadDisabledPdf._id}/download`, {
      token: studentToken, headers: { Range: 'bytes=0-4' },
    });
    assert.equal(disabledDownloadRange.status, 403);

    const directAnonymous = await request(downloadDisabledPdf.fileUrl);
    assert.equal(directAnonymous.status, 401);
    const directDisabled = await request(downloadDisabledPdf.fileUrl, { token: studentToken });
    assert.equal(directDisabled.status, 403);
    const directDisabledHead = await request(downloadDisabledPdf.fileUrl, { method: 'HEAD', token: studentToken });
    assert.equal(directDisabledHead.status, 403);
    const directDisabledRange = await request(downloadDisabledPdf.fileUrl, {
      token: studentToken, headers: { Range: 'bytes=0-4' },
    });
    assert.equal(directDisabledRange.status, 403);

    for (const token of [teacherToken, adminToken]) {
      const privilegedPreview = await request(`/api/v1/materials/${downloadDisabledPdf._id}/preview`, { token });
      assert.equal(privilegedPreview.status, 200);
      assert.match(privilegedPreview.headers.get('content-disposition') || '', /^inline;/i);
      await privilegedPreview.arrayBuffer();
      const privilegedDownload = await request(`/api/v1/materials/${downloadDisabledPdf._id}/download`, { token });
      assert.equal(privilegedDownload.status, 200);
      assert.match(privilegedDownload.headers.get('content-disposition') || '', /^attachment;/i);
      await privilegedDownload.arrayBuffer();
    }

    const suspendedPreview = await request(`/api/v1/materials/${enrolledPdf._id}/preview`, { token: suspendedToken });
    assert.equal(suspendedPreview.status, 403);
    assert.equal((await suspendedPreview.json()).code, 'ACCOUNT_SUSPENDED');
    const suspendedDownload = await request(`/api/v1/materials/${enrolledPdf._id}/download`, { token: suspendedToken });
    assert.equal(suspendedDownload.status, 403);
    assert.equal((await suspendedDownload.json()).code, 'ACCOUNT_SUSPENDED');

    const corruptResponse = await request(`/api/v1/materials/${corruptPdf._id}/preview`, { token: studentToken });
    assert.equal(corruptResponse.status, 415);
    assert.equal((await corruptResponse.json()).code, 'MATERIAL_PREVIEW_UNSUPPORTED');
    const oversizedResponse = await request(`/api/v1/materials/${oversizedPdf._id}/preview`, { token: studentToken });
    assert.equal(oversizedResponse.status, 413);
    assert.equal((await oversizedResponse.json()).code, 'MATERIAL_PREVIEW_TOO_LARGE');

    const nonPdfResponse = await request(`/api/v1/materials/${nonPdfMaterial._id}/preview`, { token: studentToken });
    assert.equal(nonPdfResponse.status, 415);
    assert.equal((await nonPdfResponse.json()).code, 'MATERIAL_PREVIEW_UNSUPPORTED');

    const hiddenResponse = await request(`/api/v1/materials/${hiddenMaterial._id}/preview`, { token: studentToken });
    assert.equal(hiddenResponse.status, 404);
    const hiddenDownload = await request(`/api/v1/materials/${hiddenMaterial._id}/download`, { token: studentToken });
    assert.equal(hiddenDownload.status, 404);
    const unpublishedLessonResponse = await request(`/api/v1/materials/${unpublishedLessonMaterial._id}/preview`, { token: studentToken });
    assert.equal(unpublishedLessonResponse.status, 404);
    const unpublishedLessonDownload = await request(`/api/v1/materials/${unpublishedLessonMaterial._id}/download`, { token: studentToken });
    assert.equal(unpublishedLessonDownload.status, 404);
    const unpublishedCoursePreview = await request(`/api/v1/materials/${unpublishedCourseMaterial._id}/preview`, { token: studentToken });
    assert.equal(unpublishedCoursePreview.status, 404);
    const unpublishedCourseDownload = await request(`/api/v1/materials/${unpublishedCourseMaterial._id}/download`, { token: studentToken });
    assert.equal(unpublishedCourseDownload.status, 404);
    const mismatchedCoursePreview = await request(`/api/v1/materials/${mismatchedCourseMaterial._id}/preview`, { token: studentToken });
    assert.equal(mismatchedCoursePreview.status, 404);
    const mismatchedCourseDownload = await request(`/api/v1/materials/${mismatchedCourseMaterial._id}/download`, { token: studentToken });
    assert.equal(mismatchedCourseDownload.status, 404);
    const unresolvedCoursePreview = await request(`/api/v1/materials/${unresolvedCourseMaterial._id}/preview`, { token: studentToken });
    assert.equal(unresolvedCoursePreview.status, 404);
    const unresolvedCourseDownload = await request(`/api/v1/materials/${unresolvedCourseMaterial._id}/download`, { token: studentToken });
    assert.equal(unresolvedCourseDownload.status, 404);

    const externalPreview = await request(`/api/v1/materials/${externalPdf._id}/preview`, { token: studentToken });
    assert.equal(externalPreview.status, 415);
    assert.equal((await externalPreview.json()).code, 'MATERIAL_PREVIEW_UNAVAILABLE');
  });

  await t.test('student vocabulary search is accent-insensitive, topic-filtered, stable, and paginated', async () => {
    await Vocabulary.insertMany([
      { word: 'appointment', meaning: 'cuộc hẹn', lesson: lesson._id, course: course._id, topic: 'Work', status: 'published' },
      { word: 'apply', meaning: 'nộp đơn', lesson: lesson._id, course: course._id, topic: 'Work', status: 'published' },
      { word: 'arrange', meaning: 'sắp xếp', lesson: lesson._id, course: course._id, topic: 'Work', status: 'published' },
      { word: 'banana', meaning: 'chuối', lesson: lesson._id, course: course._id, topic: 'Food', status: 'published' },
      { word: 'archive', meaning: 'lưu hồ sơ', lesson: lesson._id, course: course._id, topic: 'Work', status: 'hidden' },
    ]);

    const firstResponse = await request('/api/v1/vocabulary?search=cuoc%20hen&topic=Work&page=1&limit=2&sort=word_asc', { token: studentToken });
    assert.equal(firstResponse.status, 200);
    const first = await firstResponse.json();
    assert.deepEqual(first.data.vocabulary.map((item) => item.word), ['appointment']);

    const pageOneResponse = await request('/api/v1/vocabulary?topic=Work&page=1&limit=2&sort=word_asc', { token: studentToken });
    const pageOne = await pageOneResponse.json();
    assert.equal(pageOneResponse.status, 200);
    assert.deepEqual(pageOne.data.vocabulary.map((item) => item.word), ['apply', 'appointment']);
    assert.equal(pageOne.data.pagination.total, 3);
    assert.equal(pageOne.data.pagination.pages, 2);

    const pageTwoResponse = await request('/api/v1/vocabulary?topic=Work&page=2&limit=2&sort=word_asc', { token: studentToken });
    const pageTwo = await pageTwoResponse.json();
    assert.deepEqual(pageTwo.data.vocabulary.map((item) => item.word), ['arrange']);

    const descendingResponse = await request('/api/v1/vocabulary?topic=Work&sort=word_desc', { token: studentToken });
    const descending = await descendingResponse.json();
    assert.deepEqual(descending.data.vocabulary.map((item) => item.word), ['arrange', 'appointment', 'apply']);

    const malformedRegexResponse = await request('/api/v1/vocabulary?search=%2A.%2A', { token: studentToken });
    assert.equal(malformedRegexResponse.status, 200);
    assert.equal((await malformedRegexResponse.json()).data.pagination.total, 0);

    const invalidSortResponse = await request('/api/v1/vocabulary?sort=random', { token: studentToken });
    assert.equal(invalidSortResponse.status, 400);
    assert.equal((await invalidSortResponse.json()).code, 'INVALID_VOCABULARY_SORT');

    const legacyResponse = await request(`/api/v1/vocabulary/lesson/${lesson._id}?topic=Work`, { token: studentToken });
    const legacyBody = await legacyResponse.json();
    assert.equal(legacyResponse.status, 200);
    assert.equal(legacyBody.data.vocabulary.length, 3);
    assert.equal(legacyBody.data.pagination, undefined);
  });
});

test('Phase 4 isolated API cleanup', async () => {
  if (httpServer?.listening) await new Promise((resolve) => httpServer.close(resolve));
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect().catch(() => {});
  if (mongoServer) await mongoServer.stop().catch(() => {});
  for (const file of ownedFiles) await fs.unlink(file).catch(() => {});
  await fs.rmdir(fixtureDirectory).catch(() => {});
});
