import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, '../..');
const backendRoot = path.join(projectRoot, 'backend');
const frontendRoot = path.join(projectRoot, 'frontend');
const backendRequire = createRequire(path.join(backendRoot, 'package.json'));
const frontendRequire = createRequire(path.join(frontendRoot, 'package.json'));
const mongoose = backendRequire('mongoose');
const { MongoMemoryReplSet } = backendRequire('mongodb-memory-server');
const { chromium } = frontendRequire('playwright');
const HOST = '127.0.0.1';

let replicaSet;
let backendServer;
let viteProcess;
let browser;
let viteOutput = '';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, HOST, resolve); });
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitForHttp(url, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (viteProcess?.exitCode !== null && viteProcess?.exitCode !== undefined) throw new Error(`Vite exited: ${viteOutput.slice(-1000)}`);
    try { if ((await fetch(url)).ok) return; } catch {}
    await wait(200);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function startVite(port, apiUrl) {
  viteProcess = spawn(process.execPath, [path.join(frontendRoot, 'node_modules/vite/bin/vite.js'), '--host', HOST, '--port', String(port), '--strictPort'], {
    cwd: frontendRoot,
    env: {
      PATH: process.env.PATH,
      Path: process.env.Path,
      SystemRoot: process.env.SystemRoot,
      TEMP: process.env.TEMP || os.tmpdir(),
      TMP: process.env.TMP || os.tmpdir(),
      NODE_ENV: 'test',
      VITE_API_URL: `${apiUrl}/api/v1`,
      CI: 'true',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  viteProcess.stdout.on('data', (chunk) => { viteOutput = (viteOutput + chunk).slice(-6000); });
  viteProcess.stderr.on('data', (chunk) => { viteOutput = (viteOutput + chunk).slice(-6000); });
  return `http://${HOST}:${port}`;
}

async function login(page, frontendUrl, identifier, password, destination) {
  await page.goto(`${frontendUrl}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('#login-identifier').fill(identifier);
  await page.locator('#login-password').fill(password);
  await page.getByRole('button', { name: 'Đăng nhập →' }).click();
  await page.waitForURL((url) => url.pathname === destination, { timeout: 12000 });
}

async function apiRequest(apiUrl, path, { method = 'GET', token, body } = {}) {
  const response = await fetch(`${apiUrl}/api/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body === undefined || body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: body instanceof FormData ? body : JSON.stringify(body) }),
  });
  let payload = null;
  try { payload = await response.json(); } catch {}
  assert.ok(response.ok, `${method} ${path} failed ${response.status}: ${JSON.stringify(payload)}`);
  return payload.data;
}

async function main() {
  const databaseName = `vocabulary_application_ui_${randomUUID().replaceAll('-', '')}_test`;
  replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1, ip: HOST, dbName: databaseName } });
  const uri = replicaSet.getUri(databaseName);
  assert.equal(new URL(uri).hostname, HOST);
  process.env.MONGODB_URI = uri;
  process.env.JWT_SECRET = `vocabulary-ui-access-${randomUUID()}`;
  process.env.JWT_REFRESH_SECRET = `vocabulary-ui-refresh-${randomUUID()}`;
  process.env.NODE_ENV = 'test';
  process.env.FRONTEND_URL = `http://${HOST}`;

  const [{ default: connectDB }, { default: app }, { default: User }, { syntheticPublicationDocx }] = await Promise.all([
    import(pathToFileURL(path.join(backendRoot, 'src/configs/database.js'))),
    import(pathToFileURL(path.join(backendRoot, 'src/app.js'))),
    import(pathToFileURL(path.join(backendRoot, 'src/models/User.js'))),
    import(pathToFileURL(path.join(backendRoot, 'tests/helpers/vocabularyPublicationV5aHarness.js'))),
  ]);
  await connectDB();
  const [admin, teacher, student] = await Promise.all([
    User.create({ email: 'vocabulary.ui.admin@example.test', username: 'vocabulary.ui.admin', password: 'VocabularyUi!2026', role: 'admin', status: 'active', isActive: true }),
    User.create({ email: 'vocabulary.ui.teacher@example.test', username: 'vocabulary.ui.teacher', password: 'VocabularyUi!2026', role: 'teacher', status: 'active', isActive: true }),
    User.create({ email: 'vocabulary.ui.student@example.test', username: 'vocabulary.ui.student', password: 'VocabularyUi!2026', role: 'student', status: 'active', isActive: true }),
  ]);
  await User.init();

  backendServer = await new Promise((resolve, reject) => {
    const listener = app.listen(0, HOST, () => resolve(listener));
    listener.once('error', reject);
  });
  const apiUrl = `http://${HOST}:${backendServer.address().port}`;
  const jwt = backendRequire('jsonwebtoken');
  const adminToken = jwt.sign({ userId: admin._id }, process.env.JWT_SECRET, { expiresIn: '10m' });
  const tag = (await apiRequest(apiUrl, '/admin/vocabulary-catalog/tags', {
    method: 'POST', token: adminToken, body: { name: 'Application UI Catalog', slug: 'application-ui-catalog', description: 'Published catalog fixture' },
  })).tag;
  const chapter = (await apiRequest(apiUrl, `/admin/vocabulary-catalog/tags/${tag._id}/chapters`, {
    method: 'POST', token: adminToken, body: { title: 'Application UI Chapter', chapterNumber: 1, description: 'Published chapter fixture' },
  })).chapter;
  const form = new FormData();
  form.append('files', new Blob([syntheticPublicationDocx()], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), 'Application UI.docx');
  form.append('sourceFolder', 'TOEIC EASY START');
  const batch = (await apiRequest(apiUrl, '/admin/vocabulary-import-batches', { method: 'POST', token: adminToken, body: form })).batch;
  const mapping = await apiRequest(apiUrl, `/admin/vocabulary-import-batches/${batch._id}/catalog-mapping`, { token: adminToken });
  await apiRequest(apiUrl, `/admin/vocabulary-import-batches/${batch._id}/catalog-mapping`, {
    method: 'PUT', token: adminToken, body: { expectedVersion: null, targetTagId: tag._id, entries: mapping.mapping.entries.map((entry) => ({ sourceFileIdentity: entry.sourceFileIdentity, chapterAction: 'EXISTING', targetChapterId: chapter._id })) },
  });
  const candidatePage = await apiRequest(apiUrl, `/admin/vocabulary-import-batches/${batch._id}/candidates?page=1&limit=20`, { token: adminToken });
  for (const candidate of candidatePage.items) {
    const edited = await apiRequest(apiUrl, `/admin/vocabulary-import-batches/${batch._id}/candidates/${candidate._id}`, {
      method: 'PATCH', token: adminToken, body: { expectedVersion: candidate.version, reason: 'Browser application fixture edit.', changes: { word: `integrate ${candidate._id.toString().slice(-6)}` } },
    });
    await apiRequest(apiUrl, `/admin/vocabulary-import-batches/${batch._id}/candidates/${candidate._id}/review`, {
      method: 'POST', token: adminToken, body: { expectedVersion: edited.version, decision: 'APPROVE', reason: 'Browser application fixture review.', duplicateDecision: 'KEEP_SEPARATE' },
    });
  }
  const currentBatch = await apiRequest(apiUrl, `/admin/vocabulary-import-batches/${batch._id}`, { token: adminToken });
  await apiRequest(apiUrl, `/admin/vocabulary-import-batches/${batch._id}/confirm`, {
    method: 'POST', token: adminToken, body: { expectedVersion: currentBatch.version, candidateIds: candidatePage.items.map((candidate) => candidate._id) },
  });
  const reviewedTag = (await apiRequest(apiUrl, `/admin/vocabulary-publication/tags/${tag._id}/review`, {
    method: 'POST', token: adminToken, body: { expectedVersion: tag.version, decision: 'APPROVE', reason: 'Browser fixture tag review.' },
  })).entity;
  const reviewedChapter = (await apiRequest(apiUrl, `/admin/vocabulary-publication/chapters/${chapter._id}/review`, {
    method: 'POST', token: adminToken, body: { expectedVersion: chapter.version, decision: 'APPROVE', reason: 'Browser fixture chapter review.' },
  })).entity;
  await apiRequest(apiUrl, `/admin/vocabulary-publication/tags/${tag._id}/publish`, {
    method: 'POST', token: adminToken, body: { expectedVersion: reviewedTag.version, idempotencyKey: 'vocabulary-ui-tag-publish' },
  });
  await apiRequest(apiUrl, `/admin/vocabulary-publication/chapters/${chapter._id}/publish`, {
    method: 'POST', token: adminToken, body: { expectedVersion: reviewedChapter.version, idempotencyKey: 'vocabulary-ui-chapter-publish' },
  });
  const summary = await apiRequest(apiUrl, `/admin/vocabulary-publication/tags/${tag._id}/summary`, { token: adminToken });
  for (const row of summary.chapters[0].items) {
    await apiRequest(apiUrl, `/admin/vocabulary-publication/vocabularies/${row.vocabularyId}/publish`, {
      method: 'POST', token: adminToken, body: { expectedVersion: row.version, membershipId: row.membershipId, idempotencyKey: `vocabulary-ui-word-${row.vocabularyId}` },
    });
  }
  const frontendUrl = startVite(await freePort(), apiUrl);
  await Promise.all([waitForHttp(`${apiUrl}/health`), waitForHttp(frontendUrl)]);
  browser = await chromium.launch({ headless: process.env.VOCABULARY_APPLICATION_HEADLESS !== 'false' });

  const studentContext = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const studentPage = await studentContext.newPage();
  await login(studentPage, frontendUrl, 'vocabulary.ui.student', 'VocabularyUi!2026', '/student/dashboard');
  await studentPage.goto(`${frontendUrl}/student/vocabulary-catalog`, { waitUntil: 'domcontentloaded' });
  await studentPage.getByRole('heading', { name: 'Từ vựng theo chủ đề' }).waitFor({ timeout: 12000 });
  await studentPage.getByRole('button', { name: /Application UI Catalog/ }).waitFor({ timeout: 12000 });
  const chapterLink = studentPage.getByRole('link', { name: /Mở Application UI Chapter/ });
  await chapterLink.waitFor({ timeout: 12000 });
  await chapterLink.click();
  await studentPage.getByRole('heading', { name: 'Application UI Chapter' }).waitFor({ timeout: 12000 });
  await studentPage.getByRole('button', { name: 'Lật flashcard Application UI Chapter' }).click();
  await studentPage.locator('.chapter-flash-word-list h3').first().waitFor({ timeout: 12000 });
  await studentPage.setViewportSize({ width: 390, height: 844 });
  const mobileLayout = await studentPage.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
  assert.ok(mobileLayout.scrollWidth <= mobileLayout.width + 1, JSON.stringify(mobileLayout));
  await studentContext.close();

  const adminContext = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const adminPage = await adminContext.newPage();
  await login(adminPage, frontendUrl, 'vocabulary.ui.admin', 'VocabularyUi!2026', '/admin');
  await adminPage.goto(`${frontendUrl}/admin/vocabulary/catalog`, { waitUntil: 'domcontentloaded' });
  await adminPage.getByRole('heading', { name: 'Quản lý Tag & Chapter' }).waitFor({ timeout: 12000 });
  await adminPage.getByText('Application UI Catalog', { exact: true }).waitFor({ timeout: 12000 });
  await adminPage.goto(`${frontendUrl}/admin/vocabulary/import`, { waitUntil: 'domcontentloaded' });
  await adminPage.getByRole('heading', { name: 'Nhập Word & kiểm duyệt' }).waitFor({ timeout: 12000 });
  await adminPage.goto(`${frontendUrl}/admin/vocabulary/publication`, { waitUntil: 'domcontentloaded' });
  await adminPage.getByRole('heading', { name: 'Publish có bằng chứng' }).waitFor({ timeout: 12000 });
  await adminContext.close();

  const teacherContext = await browser.newContext();
  const teacherPage = await teacherContext.newPage();
  await login(teacherPage, frontendUrl, 'vocabulary.ui.teacher', 'VocabularyUi!2026', '/admin');
  await teacherPage.goto(`${frontendUrl}/admin/vocabulary/catalog`, { waitUntil: 'domcontentloaded' });
  await teacherPage.waitForURL((url) => url.pathname === '/admin', { timeout: 12000 });
  await teacherContext.close();

  assert.equal(await mongoose.model('Enrollment').countDocuments({ student: student._id }), 0);
  assert.equal(String(admin.role), 'admin');
  assert.equal(String(teacher.role), 'teacher');
  console.log(JSON.stringify({ suite: 'vocabulary-application-browser', result: 'PASS', scenarios: ['student-catalog-desktop-mobile', 'chapter-flashcard', 'admin-catalog-import-publication-routes', 'teacher-admin-catalog-denied', 'student-no-enrollment'] }));
}

let exitCode = 0;
try {
  await main();
} catch (error) {
  exitCode = 1;
  console.error(error?.stack || error);
} finally {
  try { await browser?.close(); } catch {}
  try { if (viteProcess?.kill('SIGTERM')) await wait(500); } catch {}
  try { await new Promise((resolve) => backendServer?.close(resolve) || resolve()); } catch {}
  try { if (mongoose.connection.readyState !== 0) await mongoose.disconnect(); } catch {}
  try { await replicaSet?.stop(); } catch {}
}
process.exitCode = exitCode;
