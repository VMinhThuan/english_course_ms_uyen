import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import jwt from 'jsonwebtoken';
import User from '../src/models/User.js';
import TestModel from '../src/models/Test.js';
import { jwtConfig } from '../src/configs/jwt.js';
import { verifyToken } from '../src/middlewares/auth.js';
import { refreshToken } from '../src/controllers/authController.js';
import { getTestByLesson } from '../src/controllers/testController.js';
import { createProtectedUploadHandler } from '../src/middlewares/protectedUploads.js';
import {
  getStudentStatusError,
  getSuspendedAccountError,
  isTokenIssuedBeforeSuspension,
} from '../src/security/accountAccessPolicy.js';
import {
  evaluateMaterialAccess,
  isPathWithinRoot,
  isSafeExternalMaterialUrl,
  normalizeUploadRequestUrl,
} from '../src/security/materialAccessPolicy.js';
import { sanitizeLessonHtml, sanitizeLessonMediaUrl, sanitizeLessonRecord } from '../src/security/lessonHtml.js';
import {
  DOCUMENT_UPLOAD_EXTENSIONS,
  GENERAL_UPLOAD_EXTENSIONS,
  MAX_DOCX_IMPORT_BYTES,
  MAX_GENERAL_UPLOAD_BYTES,
  MAX_LESSON_ATTACHMENTS,
  MAX_TOEIC_IMPORT_BYTES,
  createSafeDiskStorage,
  createUpload,
  getSafeDisplayName,
  getSafeOriginalExtension,
  validateUploadSample,
  GENERAL_UPLOAD_POLICIES,
  TOEIC_UPLOAD_POLICIES,
} from '../src/utils/uploadValidation.js';

test('student status policy blocks suspended, inactive, pending, and rejected accounts', () => {
  assert.equal(getSuspendedAccountError({ role: 'student', status: 'suspended' })?.code, 'ACCOUNT_SUSPENDED');
  assert.equal(getStudentStatusError({ role: 'student', status: 'suspended', isActive: false })?.code, 'ACCOUNT_SUSPENDED');
  assert.equal(getStudentStatusError({ role: 'student', status: 'active', isActive: false })?.code, 'ACCOUNT_NOT_ACTIVE');
  assert.equal(getStudentStatusError({ role: 'student', status: 'pending', isActive: true })?.code, 'ACCOUNT_PENDING');
  assert.equal(getStudentStatusError({ role: 'student', status: 'rejected', isActive: true })?.code, 'ACCOUNT_REJECTED');
  assert.equal(getStudentStatusError({ role: 'student', status: 'active', isActive: true }), null);
  assert.equal(getStudentStatusError({ role: 'teacher', status: 'suspended', isActive: true }), null);
});

test('protected middleware rechecks account state for an already-issued access token', async (t) => {
  const priorSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = randomBytes(32).toString('hex');
  t.after(() => {
    if (priorSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = priorSecret;
  });

  let user = { _id: 'student-1', role: 'student', status: 'active', isActive: true };
  t.mock.method(User, 'findById', () => ({ select: async () => user }));
  const token = jwt.sign({ userId: 'student-1' }, jwtConfig.secret, { expiresIn: '1h' });
  const makeResponse = () => ({
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    clearCookie(name, options) { (this.clearedCookies ||= []).push({ name, options }); return this; },
  });
  const run = async () => {
    const res = makeResponse();
    let nextCalled = false;
    await verifyToken({ headers: { authorization: `Bearer ${token}` } }, res, () => { nextCalled = true; });
    return { res, nextCalled };
  };

  const active = await run();
  assert.equal(active.nextCalled, true);
  assert.equal(active.res.statusCode, 200);

  user = { ...user, status: 'pending', isActive: true };
  const pending = await run();
  assert.equal(pending.nextCalled, false);
  assert.equal(pending.res.statusCode, 403);
  assert.equal(pending.res.body.code, 'ACCOUNT_PENDING');

  user = { ...user, status: 'rejected', isActive: true };
  const rejected = await run();
  assert.equal(rejected.nextCalled, false);
  assert.equal(rejected.res.statusCode, 403);
  assert.equal(rejected.res.body.code, 'ACCOUNT_REJECTED');

  user = { ...user, status: 'suspended', isActive: false, suspendedAt: new Date() };
  const suspended = await run();
  assert.equal(suspended.nextCalled, false);
  assert.equal(suspended.res.statusCode, 403);
  assert.equal(suspended.res.body.code, 'ACCOUNT_SUSPENDED');
  assert.equal(suspended.res.clearedCookies.length, 2);

  user = { ...user, status: 'active', isActive: true };
  const revoked = await run();
  assert.equal(revoked.nextCalled, false);
  assert.equal(revoked.res.statusCode, 401);
  assert.equal(revoked.res.body.code, 'SESSION_REVOKED');
});

test('refresh rejects inactive student states and clears both refresh-cookie paths', async (t) => {
  const priorSecret = process.env.JWT_REFRESH_SECRET;
  process.env.JWT_REFRESH_SECRET = randomBytes(32).toString('hex');
  t.after(() => {
    if (priorSecret === undefined) delete process.env.JWT_REFRESH_SECRET;
    else process.env.JWT_REFRESH_SECRET = priorSecret;
  });

  let user = { _id: 'student-1', role: 'student', status: 'suspended', isActive: false };
  t.mock.method(User, 'findById', async () => user);
  const refresh = jwt.sign({ userId: 'student-1' }, jwtConfig.refreshSecret, { expiresIn: '1h' });
  const res = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    clearCookie(name, options) { (this.clearedCookies ||= []).push({ name, options }); return this; },
  };

  await refreshToken({ cookies: { refreshToken: refresh } }, res, assert.fail);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, 'ACCOUNT_SUSPENDED');
  assert.deepEqual(res.clearedCookies.map(({ options }) => options.path), ['/', '/api/v1/auth']);

  user = { ...user, status: 'pending', isActive: true };
  const pendingRes = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    clearCookie() {},
  };
  await refreshToken({ cookies: { refreshToken: refresh } }, pendingRes, assert.fail);
  assert.equal(pendingRes.statusCode, 403);
  assert.equal(pendingRes.body.code, 'ACCOUNT_PENDING');
});

test('access and refresh tokens issued during or before a suspension are invalidated after reactivation', () => {
  const user = { role: 'student', status: 'active', suspendedAt: new Date('2026-10-20T10:00:00.900Z') };
  const suspendedSecond = Math.floor(new Date(user.suspendedAt).getTime() / 1000);
  assert.equal(isTokenIssuedBeforeSuspension(user, suspendedSecond), true);
  assert.equal(isTokenIssuedBeforeSuspension(user, suspendedSecond + 1), false);
  assert.equal(isTokenIssuedBeforeSuspension(user, undefined), true);
  assert.equal(isTokenIssuedBeforeSuspension({ role: 'student' }, suspendedSecond), false);
  assert.equal(isTokenIssuedBeforeSuspension({ role: 'student', suspendedAt: 'invalid' }, suspendedSecond), true);
});

test('material access separates preview from download and exposes published resources to active students', () => {
  const user = { _id: 'student-1', role: 'student', status: 'active', isActive: true };
  const material = { status: 'published', allowDownload: true, course: 'course-1' };
  const lesson = { status: 'published', course: 'course-1' };
  const course = { _id: 'course-1', teacher: 'teacher-1', isPublished: true };

  assert.deepEqual(evaluateMaterialAccess({ user, material, lesson, course }), { allowed: true });
  assert.equal(evaluateMaterialAccess({ user, material: { ...material, allowDownload: false }, lesson, course }).code, 'MATERIAL_DOWNLOAD_NOT_ALLOWED');
  assert.deepEqual(evaluateMaterialAccess({
    user, material: { ...material, allowDownload: false }, lesson, course, allowPreview: true,
  }), { allowed: true });
  assert.equal(evaluateMaterialAccess({ user, material: { ...material, status: 'hidden' }, lesson, course }).statusCode, 404);
  assert.equal(evaluateMaterialAccess({ user, material, lesson, course: { ...course, isPublished: false } }).statusCode, 404);
  assert.equal(evaluateMaterialAccess({ user, material, lesson, course: { _id: 'course-1' } }).statusCode, 404);
  assert.equal(evaluateMaterialAccess({ user, material: { ...material, course: undefined }, lesson, course }).statusCode, 404);
  assert.equal(evaluateMaterialAccess({ user, material, lesson: { status: 'published' }, course }).statusCode, 404);
  assert.equal(evaluateMaterialAccess({
    user, material: { ...material, course: 'another-course' }, lesson, course,
  }).statusCode, 404);
  assert.equal(evaluateMaterialAccess({ user: { ...user, status: 'suspended', isActive: false }, material, lesson, course }).code, 'ACCOUNT_SUSPENDED');
});

test('direct private upload URL enforces authentication, publication, and download rights', async (t) => {
  const uploadRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'phase1-private-upload-'));
  t.after(() => fs.rm(uploadRoot, { recursive: true, force: true }));
  await fs.mkdir(path.join(uploadRoot, 'private'));
  await fs.writeFile(path.join(uploadRoot, 'private', 'lesson.pdf'), '%PDF-1.7 sample');

  let auth = { error: { statusCode: 401, code: 'UNAUTHORIZED', message: 'Unauthorized' } };
  const reference = {
    material: {
      title: 'Lesson handout', status: 'published', allowDownload: true,
      fileUrl: '/uploads/private/lesson.pdf', course: 'course-1',
    },
    lesson: { status: 'published', course: 'course-1' },
    course: { _id: 'course-1', teacher: 'teacher-1', isPublished: true },
  };
  const handler = createProtectedUploadHandler({
    privateOnly: true,
    connect: async () => {},
    resolveReference: async () => reference,
    authenticate: async () => auth,
    uploadRoot,
  });
  const makeResponse = () => ({
    statusCode: 200,
    headers: {},
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    end() { this.ended = true; return this; },
    set(headers) { Object.assign(this.headers, headers); return this; },
    download(filePath, filename, options) { this.downloaded = { filePath, filename, options }; return this; },
    clearCookie() {},
  });
  const request = { originalUrl: '/uploads/private/lesson.pdf', headers: {} };
  const invoke = async () => {
    const res = makeResponse();
    let nextCalled = false;
    await handler(request, res, () => { nextCalled = true; });
    return { res, nextCalled };
  };

  const anonymous = await invoke();
  assert.equal(anonymous.res.statusCode, 401);
  assert.equal(anonymous.res.downloaded, undefined);

  auth = { error: { statusCode: 403, code: 'ACCOUNT_SUSPENDED', message: 'Suspended' } };
  const suspended = await invoke();
  assert.equal(suspended.res.statusCode, 403);
  assert.equal(suspended.res.body.code, 'ACCOUNT_SUSPENDED');

  auth = { user: { _id: 'student-1', role: 'student', status: 'active', isActive: true } };
  const approvedStudent = await invoke();
  assert.equal(approvedStudent.res.statusCode, 200);
  assert.ok(approvedStudent.res.downloaded);

  reference.material.status = 'draft';
  const unpublished = await invoke();
  assert.equal(unpublished.res.statusCode, 404);

  reference.material.status = 'published';
  reference.material.allowDownload = false;
  const downloadDisabled = await invoke();
  assert.equal(downloadDisabled.res.statusCode, 403);
  assert.equal(downloadDisabled.res.body.code, 'MATERIAL_DOWNLOAD_NOT_ALLOWED');

  reference.material.allowDownload = true;
  const authorized = await invoke();
  assert.equal(authorized.res.downloaded.filePath, path.join(uploadRoot, 'private', 'lesson.pdf'));
  assert.equal(authorized.res.headers['Cache-Control'], 'private, no-store');
  assert.equal(authorized.res.headers['X-Content-Type-Options'], 'nosniff');
});

test('unreferenced public images remain static and unknown private files remain unavailable', async (t) => {
  const uploadRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'phase1-public-upload-'));
  t.after(() => fs.rm(uploadRoot, { recursive: true, force: true }));
  await fs.mkdir(path.join(uploadRoot, 'public'));
  await fs.writeFile(path.join(uploadRoot, 'public', 'media.jpg'), Buffer.from([0xff, 0xd8, 0xff]));

  const handler = createProtectedUploadHandler({
    publicOnly: true,
    connect: async () => {},
    resolveReference: async () => null,
    uploadRoot,
  });
  const res = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    end() { this.ended = true; return this; },
  };
  let nextCalled = false;
  await handler({ originalUrl: '/uploads/public/media.jpg' }, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, 200);

  const legacyHandler = createProtectedUploadHandler({
    privateOnly: true,
    connect: async () => {},
    resolveReference: async () => null,
    uploadRoot,
  });
  const denied = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    end() { this.ended = true; return this; },
  };
  await legacyHandler({ originalUrl: '/uploads/private/orphan.pdf' }, denied, () => assert.fail('Must not fall through'));
  assert.equal(denied.statusCode, 404);
});

test('admins and owning teachers keep existing management access without granting another teacher access', () => {
  const hidden = { status: 'hidden', allowDownload: false };
  const draftLesson = { status: 'draft' };
  const course = { teacher: 'teacher-1' };
  assert.equal(evaluateMaterialAccess({ user: { _id: 'admin-1', role: 'admin' }, material: hidden, lesson: draftLesson, course }).allowed, true);
  assert.equal(evaluateMaterialAccess({ user: { _id: 'teacher-1', role: 'teacher' }, material: hidden, lesson: draftLesson, course }).allowed, true);
  assert.equal(evaluateMaterialAccess({ user: { _id: 'teacher-2', role: 'teacher' }, material: hidden, lesson: draftLesson, course }).code, 'FORBIDDEN');
});

test('upload URL normalization and path containment reject traversal', () => {
  assert.equal(normalizeUploadRequestUrl('/uploads/private/file.pdf'), '/uploads/private/file.pdf');
  assert.equal(normalizeUploadRequestUrl('/uploads/%2e%2e/secrets.txt'), null);
  assert.equal(normalizeUploadRequestUrl('/uploads/private%5c..%5csecret.txt'), null);
  const root = path.resolve('uploads');
  assert.equal(isPathWithinRoot(root, path.join(root, 'private', 'file.pdf')), true);
  assert.equal(isPathWithinRoot(root, path.resolve(root, '..', 'secret.txt')), false);
});

test('external material links accept HTTPS without credentials only', () => {
  assert.equal(isSafeExternalMaterialUrl('https://files.example.com/document.pdf'), true);
  assert.equal(isSafeExternalMaterialUrl('http://files.example.com/document.pdf'), false);
  assert.equal(isSafeExternalMaterialUrl('//files.example.com/document.pdf'), false);
  assert.equal(isSafeExternalMaterialUrl('https://user:secret@files.example.com/document.pdf'), false);
  assert.equal(isSafeExternalMaterialUrl('https:files.example.com/document.pdf'), false);
  assert.equal(isSafeExternalMaterialUrl('https://files.example.com/a b.pdf'), false);
});

test('lesson HTML sanitizer preserves supported rich text and strips active content', () => {
  const safe = sanitizeLessonHtml(
    '<h2>Title</h2><p>Text <strong>bold</strong></p><ul><li>Item</li></ul>' +
    '<table><tr><th>Head</th><td>Cell</td></tr></table>' +
    '<a href="https://example.com" target="_blank">Link</a>' +
    '<img src="https://example.com/p.png" alt="photo">'
  );
  for (const tag of ['<h2>', '<p>', '<strong>', '<ul>', '<li>', '<table>', '<th>', '<td>', '<a', '<img']) {
    assert.ok(safe.includes(tag), 'Expected rich text tag ' + tag);
  }
  assert.ok(!safe.includes('target='));
  assert.ok(!safe.includes('javascript:'));

  const unsafe = sanitizeLessonHtml(
    '<script>alert(1)</script><p onclick="alert(2)">Text</p>' +
    '<a href="javascript:alert(3)" onmouseover="alert(4)">Bad</a>' +
    '<img src="x" onerror="alert(5)"><iframe src="https://evil.test"></iframe>'
  );
  assert.ok(!unsafe.includes('script'));
  assert.ok(!unsafe.includes('alert'));
  assert.ok(!unsafe.includes('onclick'));
  assert.ok(!unsafe.includes('onerror'));
  assert.ok(!unsafe.includes('iframe'));

  const uriSchemeRegression = sanitizeLessonHtml(
    '<form action="javascript:alert(1)"><button formaction="javascript:alert(2)">Submit</button></form>' +
    '<object data="javascript:alert(3)"></object><video poster="javascript:alert(4)"></video>' +
    '<meta http-equiv="refresh" content="0;url=javascript:alert(5)">' +
    '<svg><animate attributeName="href" values="javascript:alert(6)"></animate></svg>' +
    '<noscript><img src="x" onerror="alert(7)"></noscript>'
  );
  assert.doesNotMatch(uriSchemeRegression, /javascript:|formaction|http-equiv|<svg|<animate|onerror|alert\(/i);
});

test('Express JSON middleware rejects trailing bytes after a compressed body without crashing the server', async (t) => {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.get('/health', (_req, res) => res.status(200).send('ok'));
  app.post('/json', (req, res) => res.json({ received: req.body }));
  app.use((_error, _req, res, _next) => res.status(400).end());

  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const compressedBodyWithTrailingBytes = Buffer.concat([
    gzipSync(Buffer.from('{"valid":true}')),
    Buffer.from('trailing bytes'),
  ]);
  const malformed = await fetch(`${baseUrl}/json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' },
    body: compressedBodyWithTrailingBytes,
  });
  assert.equal(malformed.status, 400);

  const health = await fetch(`${baseUrl}/health`);
  assert.equal(health.status, 200);
  assert.equal(await health.text(), 'ok');
});

test('lesson HTML sanitizer handles malformed, empty, and non-string legacy values', () => {
  assert.equal(sanitizeLessonHtml(''), '');
  assert.equal(sanitizeLessonHtml(null), '');
  const malformed = sanitizeLessonHtml('<p><b>Legacy text');
  assert.ok(malformed.includes('Legacy text'));
  assert.ok(malformed.includes('</b>'));
});

test('lesson media URL sanitizer allows safe HTTPS and local uploads only', () => {
  assert.equal(sanitizeLessonMediaUrl('https://cdn.example.com/lesson.mp4'), 'https://cdn.example.com/lesson.mp4');
  assert.equal(sanitizeLessonMediaUrl('/uploads/public/lesson.mp3'), '/uploads/public/lesson.mp3');
  assert.equal(sanitizeLessonMediaUrl('javascript:alert(1)'), '');
  assert.equal(sanitizeLessonMediaUrl('http://cdn.example.com/lesson.mp4'), '');
  assert.equal(sanitizeLessonMediaUrl('/uploads/../secret.mp4'), '');
});

test('public lesson discovery sanitizes legacy HTML and hides private attachment URLs', () => {
  const lesson = sanitizeLessonRecord({
    title: 'Public lesson',
    content: '<p>Legacy lesson</p><img src=x onerror=alert(1)>',
    attachments: [{ url: '/uploads/private/lesson-123.pdf' }],
  }, { includeAttachments: false });
  assert.equal(lesson.content.includes('onerror'), false);
  assert.equal('attachments' in lesson, false);
});

test('legacy test API sanitizes populated lesson content and hides student attachment URLs', async (t) => {
  const lesson = {
    toObject: () => ({
      title: 'Legacy lesson',
      content: '<p>Allowed</p><img src=x onerror=alert(1)>',
      attachments: [{ url: '/uploads/private/lesson-123.pdf' }],
    }),
  };
  const testDocument = {
    lesson,
    questions: [{ toObject: () => ({ question: 'Q', correctAnswer: 'A' }) }],
    toObject: () => ({
      _id: 'test-1',
      lesson: lesson.toObject(),
      questions: [{ question: 'Q', correctAnswer: 'A' }],
    }),
  };
  t.mock.method(TestModel, 'findOne', () => ({ populate: async () => testDocument }));
  const res = {
    json(body) { this.body = body; return this; },
  };

  await getTestByLesson({ params: { lessonId: 'lesson-1' }, user: { role: 'student' } }, res, assert.fail);
  const returnedLesson = res.body.data.test.lesson;
  assert.equal(returnedLesson.content.includes('onerror'), false);
  assert.equal('attachments' in returnedLesson, false);
  assert.equal(res.body.data.test.questions[0].correctAnswer, undefined);
});

test('upload validation checks route allowlists, declared MIME, signatures, and stable size policy', () => {
  const validPdf = validateUploadSample({
    originalName: 'lesson.pdf',
    mimetype: 'application/pdf',
    sample: Buffer.from('%PDF-1.7 sample'),
  }, GENERAL_UPLOAD_POLICIES.file);
  assert.equal(validPdf.valid, true);
  assert.equal(validPdf.detectedMimeType, 'application/pdf');

  const fakeExtension = validateUploadSample({
    originalName: 'lesson.pdf',
    mimetype: 'application/pdf',
    sample: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  }, GENERAL_UPLOAD_POLICIES.file);
  assert.equal(fakeExtension.code, 'FILE_CONTENT_INVALID');

  const fakeMime = validateUploadSample({
    originalName: 'lesson.pdf',
    mimetype: 'text/html',
    sample: Buffer.from('%PDF-1.7 sample'),
  }, GENERAL_UPLOAD_POLICIES.file);
  assert.equal(fakeMime.code, 'FILE_CONTENT_INVALID');

  const wrongRouteType = validateUploadSample({
    originalName: 'lesson.html',
    mimetype: 'text/html',
    sample: Buffer.from('<script>alert(1)</script>'),
  }, TOEIC_UPLOAD_POLICIES.file);
  assert.equal(wrongRouteType.code, 'FILE_TYPE_NOT_ALLOWED');

  assert.equal(validateUploadSample({
    originalName: 'page-12.jpg',
    mimetype: 'image/jpeg',
    sample: Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  }, TOEIC_UPLOAD_POLICIES.pageImages).valid, true);
  assert.equal(MAX_GENERAL_UPLOAD_BYTES, 50 * 1024 * 1024);
  assert.equal(MAX_TOEIC_IMPORT_BYTES, 30 * 1024 * 1024);
  assert.equal(MAX_DOCX_IMPORT_BYTES, 10 * 1024 * 1024);
  assert.equal(MAX_LESSON_ATTACHMENTS, 10);
  assert.ok(GENERAL_UPLOAD_EXTENSIONS.includes('.pdf'));
  assert.ok(DOCUMENT_UPLOAD_EXTENSIONS.includes('.mp3'));
});

test('multipart upload middleware returns stable errors and cleans rejected or failed files', async (t) => {
  const uploadRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'phase1-multipart-'));
  const app = express();
  const upload = createUpload({
    storage: createSafeDiskStorage({ directory: uploadRoot, prefix: 'test' }),
    policies: GENERAL_UPLOAD_POLICIES,
    maxFileSize: 16,
    maxFiles: 1,
    maxFieldSize: 4,
  });
  app.post('/upload', upload.single('file', { required: true }), (req, res) => {
    if (req.query.fail === '1') return res.status(400).json({ status: 'error', code: 'TEST_CONTROLLER_FAILURE' });
    req.uploadsPersisted = true;
    return res.status(201).json({ filename: req.file.filename });
  });
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  t.after(async () => {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await fs.rm(uploadRoot, { recursive: true, force: true });
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}/upload`;
  const sendFile = async ({ name, type = 'application/pdf', bytes, url = baseUrl, fieldValue }) => {
    const form = new FormData();
    form.append('file', new Blob([bytes], { type }), name);
    if (fieldValue !== undefined) form.append('title', fieldValue);
    return fetch(url, { method: 'POST', body: form });
  };
  const readError = async (response) => response.json();

  const wrongExtension = await sendFile({ name: 'payload.exe', type: 'application/octet-stream', bytes: 'MZ' });
  assert.equal(wrongExtension.status, 400);
  assert.equal((await readError(wrongExtension)).code, 'FILE_TYPE_NOT_ALLOWED');

  const spoofedMime = await sendFile({ name: 'lesson.pdf', type: 'text/plain', bytes: '%PDF-1.7' });
  assert.equal(spoofedMime.status, 400);
  assert.equal((await readError(spoofedMime)).code, 'FILE_CONTENT_INVALID');

  const fakeContent = await sendFile({ name: 'lesson.pdf', bytes: 'not a pdf' });
  assert.equal(fakeContent.status, 400);
  assert.equal((await readError(fakeContent)).code, 'FILE_CONTENT_INVALID');
  assert.deepEqual(await fs.readdir(uploadRoot), []);

  const oversized = await sendFile({ name: 'large.pdf', bytes: Buffer.alloc(32, 'A') });
  assert.equal(oversized.status, 400);
  assert.equal((await readError(oversized)).code, 'FILE_TOO_LARGE');
  assert.deepEqual(await fs.readdir(uploadRoot), []);

  const oversizedField = await sendFile({ name: 'lesson.pdf', bytes: '%PDF-1.7', fieldValue: 'oversize' });
  assert.equal(oversizedField.status, 400);
  assert.equal((await readError(oversizedField)).code, 'FILE_TOO_LARGE');
  assert.deepEqual(await fs.readdir(uploadRoot), []);

  const missing = await fetch(baseUrl, { method: 'POST', body: new FormData() });
  assert.equal(missing.status, 400);
  assert.equal((await readError(missing)).code, 'FILE_REQUIRED');

  const controllerFailure = await sendFile({ name: '..\\..\\lesson.pdf', bytes: '%PDF-1.7', url: `${baseUrl}?fail=1` });
  assert.equal(controllerFailure.status, 400);
  assert.equal((await readError(controllerFailure)).code, 'TEST_CONTROLLER_FAILURE');
  assert.deepEqual(await fs.readdir(uploadRoot), []);

  const valid = await sendFile({ name: '..\\..\\lesson.pdf', bytes: '%PDF-1.7' });
  assert.equal(valid.status, 201);
  const { filename } = await valid.json();
  assert.match(filename, /^test-\d+-[0-9a-f-]{36}\.pdf$/i);
  assert.deepEqual(await fs.readdir(uploadRoot), [filename]);
});

test('upload names ignore client path components and preserve only a safe extension', () => {
  assert.equal(getSafeOriginalExtension('..\\..\\report.pdf'), '.pdf');
  assert.equal(getSafeOriginalExtension('../../page.jpg'), '.jpg');
  assert.equal(getSafeDisplayName('..\\..\\report.pdf'), 'report.pdf');
  assert.equal(getSafeDisplayName(''), 'upload');
});
