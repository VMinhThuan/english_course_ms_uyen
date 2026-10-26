import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
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
const evidenceDir = process.env.PHASE5_EVIDENCE_DIR
  ? path.resolve(process.env.PHASE5_EVIDENCE_DIR)
  : path.join(projectRoot, 'docs/audits/toeic-phase5/evidence');
const backendRequire = createRequire(path.join(backendRoot, 'package.json'));
const frontendRequire = createRequire(path.join(frontendRoot, 'package.json'));
const { MongoMemoryServer } = backendRequire('mongodb-memory-server');
const mongoose = backendRequire('mongoose');
const { chromium } = frontendRequire('playwright');
const PDFDocument = backendRequire('pdfkit');

const results = [];
const apiResponses = [];
let lastPage = null;
const environment = {
  database: 'MongoMemoryServer on 127.0.0.1, random database name',
  browser: process.env.PHASE5_HEADLESS === 'false' ? 'Chrome via Playwright, headed' : 'Chrome via Playwright, headless',
  externalNetwork: 'Blocked by browser context route policy',
  apiResponses,
};
let browserConsoleErrorCount = 0;
let browserConsoleWarningCount = 0;
let browserPageErrorCount = 0;
let blockedExternalRequestCount = 0;
const browserConsoleErrorCategories = {};
let serverErrorCount = 0;
const serverErrorSamples = [];
let serverOutput = '';
let viteOutput = '';
let navigationTiming = null;
let viteProcess;
let backendServer;
let browser;
let mongoServer;
let originalCwd = process.cwd();
let isolatedRoot;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const progress = (message) => process.stderr.write(`[phase5-e2e] ${message}\n`);

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitForHttp(url, child, getOutput, timeoutMs = 30000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (child?.exitCode !== null && child?.exitCode !== undefined) {
      throw new Error(`Vite exited with code ${child.exitCode}: ${getOutput().slice(-1000)}`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) return response;
    } catch {}
    await wait(250);
  }
  throw new Error(`Timed out waiting for local endpoint: ${new URL(url).pathname}`);
}

function startVite(urlPort, apiUrl) {
  const viteScript = path.join(frontendRoot, 'node_modules/vite/bin/vite.js');
  const env = {
    PATH: process.env.PATH,
    Path: process.env.Path,
    SystemRoot: process.env.SystemRoot,
    TEMP: process.env.TEMP || os.tmpdir(),
    TMP: process.env.TMP || os.tmpdir(),
    NODE_ENV: 'test',
    VITE_API_URL: `${apiUrl}/api/v1`,
    CI: 'true',
  };
  viteProcess = spawn(process.execPath, [viteScript, '--host', '127.0.0.1', '--port', String(urlPort), '--strictPort'], {
    cwd: frontendRoot,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  viteProcess.stdout.on('data', (chunk) => { viteOutput = (viteOutput + chunk.toString()).slice(-6000); });
  viteProcess.stderr.on('data', (chunk) => { viteOutput = (viteOutput + chunk.toString()).slice(-6000); });
  return `http://127.0.0.1:${urlPort}`;
}

function addPageTelemetry(page) {
  page.on('console', (message) => {
    if (message.type() === 'error') {
      browserConsoleErrorCount += 1;
      const text = message.text();
      const category = text.includes('ERR_BLOCKED_BY_CLIENT')
        ? 'blocked_by_test_network_policy'
        : text.startsWith('Failed to load resource')
          ? 'resource_load_error'
          : text.toLowerCase().includes('favicon')
            ? 'favicon_error'
            : 'other_console_error';
      browserConsoleErrorCategories[category] = (browserConsoleErrorCategories[category] || 0) + 1;
    } else if (message.type() === 'warning') {
      browserConsoleWarningCount += 1;
    }
  });
  page.on('pageerror', () => { browserPageErrorCount += 1; });
  page.on('response', (response) => {
    try {
      const url = new URL(response.url());
      if (url.hostname === '127.0.0.1' && url.pathname.startsWith('/api/v1/')) {
        apiResponses.push({ method: response.request().method(), path: url.pathname, status: response.status() });
      }
    } catch {}
  });
}

async function newContext(viewport = { width: 1440, height: 1000 }) {
  const context = await browser.newContext({ viewport, acceptDownloads: true });
  await context.route('**/*', async (route) => {
    const requestUrl = route.request().url();
    try {
      const parsed = new URL(requestUrl);
      if (['127.0.0.1', 'localhost'].includes(parsed.hostname) || ['data:', 'blob:'].includes(parsed.protocol)) {
        await route.continue();
      } else {
        blockedExternalRequestCount += 1;
        await route.abort('blockedbyclient');
      }
    } catch {
      await route.abort('blockedbyclient');
    }
  });
  const page = await context.newPage();
  lastPage = page;
  addPageTelemetry(page);
  return { context, page };
}

async function captureFailureDiagnostics(id) {
  if (!lastPage || lastPage.isClosed()) return {};
  const diagnostic = await lastPage.evaluate(() => {
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    };
    const label = (element) => (element.getAttribute('aria-label') || element.innerText || element.getAttribute('title') || '').trim().replace(/\s+/g, ' ').slice(0, 140);
    return {
      pathname: location.pathname,
      title: document.title,
      viewport: { width: innerWidth, height: innerHeight },
      headings: [...document.querySelectorAll('h1,h2,h3')].filter(visible).map(label).filter(Boolean).slice(0, 12),
      visibleButtons: [...document.querySelectorAll('button,[role="button"]')].filter(visible).map(label).filter(Boolean).slice(0, 20),
      visibleLinks: [...document.querySelectorAll('a[href]')].filter(visible).map(label).filter(Boolean).slice(0, 16),
      alerts: [...document.querySelectorAll('[role="alert"],.auth-global-error,.vocab-error')].filter(visible).map(label).filter(Boolean).slice(0, 8),
      dialogs: [...document.querySelectorAll('[role="dialog"],.bottom-sheet-content')].filter(visible).length,
    };
  });
  const screenshot = `${id.toLowerCase()}-failure.png`;
  await lastPage.screenshot({ path: path.join(evidenceDir, screenshot), fullPage: true, animations: 'disabled' });
  const jsonName = `${id.toLowerCase()}-failure-ui.json`;
  await fs.writeFile(path.join(evidenceDir, jsonName), `${JSON.stringify(diagnostic, null, 2)}\n`, 'utf8');
  return { diagnostic_screenshot: screenshot, diagnostic_ui: jsonName };
}

async function runCase(id, title, action) {
  const startedAt = Date.now();
  const apiStart = apiResponses.length;
  try {
    const details = await action();
    if (details && typeof details === 'object' && details.status === 'BLOCKED') {
      results.push({ test_case_id: id, title, status: 'BLOCKED', duration_ms: Date.now() - startedAt, actual_result: details.actual_result || 'The environment could not verify the expected result.', api_responses: apiResponses.slice(apiStart) });
      console.log(`[phase5-e2e] ${id}: BLOCKED (${Date.now() - startedAt}ms)`);
    } else {
      results.push({ test_case_id: id, title, status: 'PASS', duration_ms: Date.now() - startedAt, actual_result: details || 'Expected result observed.', api_responses: apiResponses.slice(apiStart) });
      console.log(`[phase5-e2e] ${id}: PASS (${Date.now() - startedAt}ms)`);
    }
  } catch (error) {
    const message = String(error?.message || 'Assertion failed').split('\n')[0].slice(0, 180);
    const location = String(error?.stack || '').split('\n').find((line) => line.includes('phase5-browser.mjs'))?.trim();
    let diagnostics = {};
    try { diagnostics = await captureFailureDiagnostics(id); } catch (diagnosticError) { diagnostics = { diagnostic_error: String(diagnosticError?.message || 'Could not capture browser state').split('\n')[0].slice(0, 120) }; }
    results.push({ test_case_id: id, title, status: 'FAIL', duration_ms: Date.now() - startedAt, actual_result: `${message}${location ? ` (${location.slice(0, 160)})` : ''}`, api_responses: apiResponses.slice(apiStart), ...diagnostics });
    console.log(`[phase5-e2e] ${id}: FAIL (${Date.now() - startedAt}ms) ${message}`);
  }
}

async function login(page, uiUrl, identifier, password, expectedPath) {
  await page.goto(`${uiUrl}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('#login-identifier').fill(identifier);
  await page.locator('#login-password').fill(password);
  await page.getByRole('button', { name: 'Đăng nhập →' }).click();
  await page.waitForURL((url) => url.pathname === expectedPath, { timeout: 12000 });
}

async function makeSyntheticPdf() {
  const document = new PDFDocument({ size: 'LETTER', margin: 72 });
  const chunks = [];
  const completed = new Promise((resolve, reject) => {
    document.on('data', (chunk) => chunks.push(chunk));
    document.once('end', resolve);
    document.once('error', reject);
  });
  document.fontSize(24).text('Synthetic Phase 5 PDF - Page 1', 72, 72);
  document.addPage();
  document.fontSize(18).text('Synthetic Phase 5 PDF - Page 2', 72, 72);
  document.addPage();
  document.fontSize(18).text('Synthetic Phase 5 PDF - Page 3', 72, 72);
  document.end();
  await completed;
  return Buffer.concat(chunks);
}

async function seedFixtures() {
  progress('Importing model modules');
  const [{ default: User }, { default: Course }, { default: Enrollment }, { default: Lesson }, { default: Material }, { default: Vocabulary }, { default: LearningProgress }, { default: Question }, { default: Assessment }, { default: Attempt }] = await Promise.all([
    import(pathToFileURL(path.join(backendRoot, 'src/models/User.js'))),
    import(pathToFileURL(path.join(backendRoot, 'src/models/Course.js'))),
    import(pathToFileURL(path.join(backendRoot, 'src/models/Enrollment.js'))),
    import(pathToFileURL(path.join(backendRoot, 'src/models/Lesson.js'))),
    import(pathToFileURL(path.join(backendRoot, 'src/models/Material.js'))),
    import(pathToFileURL(path.join(backendRoot, 'src/models/Vocabulary.js'))),
    import(pathToFileURL(path.join(backendRoot, 'src/models/LearningProgress.js'))),
    import(pathToFileURL(path.join(backendRoot, 'src/models/Question.js'))),
    import(pathToFileURL(path.join(backendRoot, 'src/models/Assessment.js'))),
    import(pathToFileURL(path.join(backendRoot, 'src/models/Attempt.js'))),
  ]);

  const admin = await User.create({ email: 'phase5.admin@example.test', username: 'phase5.admin', password: 'SyntheticPhase5!2026', fullName: 'Phase Five Admin', role: 'admin', status: 'active', isActive: true });
  progress('Seeded admin fixture');
  const teacher = await User.create({ email: 'phase5.teacher@example.test', username: 'phase5.teacher', password: 'SyntheticPhase5!2026', fullName: 'Phase Five Teacher', role: 'teacher', status: 'active', isActive: true });
  const student = await User.create({ email: 'phase5.student@example.test', username: 'phase5.student', password: 'SyntheticPhase5!2026', fullName: 'Phase Five Student', role: 'student', status: 'active', isActive: true, approvedAt: new Date(), approvedBy: admin._id });
  const suspended = await User.create({ email: 'phase5.suspended@example.test', username: 'phase5.suspended', password: 'SyntheticPhase5!2026', fullName: 'Suspended Fixture', role: 'student', status: 'suspended', isActive: false, suspendedAt: new Date(), suspendedBy: admin._id });
  const profileStudent = await User.create({ email: 'phase5.profile@example.test', username: 'phase5.profile', password: 'SyntheticPhase5!2026', fullName: 'Phase Five Profile Student', role: 'student', status: 'active', isActive: true, approvedAt: new Date(), approvedBy: admin._id });
  const lockStudent = await User.create({ email: 'phase5.lock@example.test', username: 'phase5.lock', password: 'SyntheticPhase5!2026', fullName: 'Phase Five Lock Student', role: 'student', status: 'active', isActive: true, approvedAt: new Date(), approvedBy: admin._id });
  const unicodeStudent = await User.create({ email: 'phase5.unicode@example.test', username: 'phase5.unicode', password: 'SyntheticPhase5!2026', fullName: 'Nguyễn Văn Minh', role: 'student', status: 'active', isActive: true, approvedAt: new Date(), approvedBy: admin._id });
  progress('Seeded teacher and student fixtures');

  progress('Creating course fixture');
  const course = await Course.create({ title: 'Phase 5 TOEIC Synthetic Course', description: 'Synthetic course fixture for isolated end-to-end checks.', teacher: teacher._id, level: 'Beginner', englishType: 'TOEIC', isPublished: true, category: 'general' });
  progress('Created course fixture');
  progress('Creating lesson fixtures');
  const lesson = await Lesson.create({
    title: 'Phase 5 Reading Lesson',
    description: 'Synthetic lesson content used only in the isolated test database.',
    content: '<h2>Reading practice</h2><p>Students review a short notice and answer questions.</p><script>window.__phase5_xss = true</script><img src="x" onerror="window.__phase5_xss = true">',
    course: course._id,
    topic: 'Unit 1',
    difficulty: 'beginner',
    status: 'published',
    order: 1,
    duration: 15,
  });
  const nextLesson = await Lesson.create({ title: 'Phase 5 Follow-up Lesson', description: 'Second synthetic lesson for navigation.', content: '<p>Follow-up reading.</p>', course: course._id, topic: 'Unit 1', difficulty: 'intermediate', status: 'published', order: 2, duration: 20 });
  progress('Created lesson fixtures');
  progress('Creating enrollment fixture');
  await Enrollment.create({ student: student._id, course: course._id, progress: 40, completedLessons: [] });
  progress('Created enrollment fixture');
  progress('Creating learning progress fixture');
  await LearningProgress.create({ student: student._id, lesson: lesson._id, course: course._id, status: 'in_progress', progress: 0 });
  progress('Created learning progress fixture');

  const privateDir = path.join(isolatedRoot, 'uploads', 'private');
  await fs.mkdir(privateDir, { recursive: true });
  const pdfPath = path.join(privateDir, 'phase5-synthetic.pdf');
  const pdfBytes = await makeSyntheticPdf();
  await fs.writeFile(pdfPath, pdfBytes);
  const downloadable = await Material.create({ title: 'Phase 5 practice.pdf', description: 'Synthetic PDF fixture.', lesson: lesson._id, course: course._id, fileUrl: '/uploads/private/phase5-synthetic.pdf', filePath: pdfPath, originalName: 'phase5-practice.pdf', fileType: 'application/pdf', fileSize: (await fs.stat(pdfPath)).size, allowDownload: true, status: 'published' });
  const restricted = await Material.create({ title: 'Phase 5 restricted.pdf', description: 'Synthetic restricted file fixture.', lesson: lesson._id, course: course._id, fileUrl: '/uploads/private/phase5-synthetic.pdf', filePath: pdfPath, originalName: 'phase5-restricted.pdf', fileType: 'application/pdf', fileSize: (await fs.stat(pdfPath)).size, allowDownload: false, status: 'published' });
  progress('Created material fixtures');

  await Vocabulary.create([
    { word: 'accommodate', meaning: 'đáp ứng; cung cấp chỗ ở', partOfSpeech: 'verb', pronunciation: '/əˈkɑːmədeɪt/', exampleEnglish: 'The room can accommodate twelve guests.', exampleVietnamese: 'Căn phòng có thể đáp ứng chỗ cho mười hai khách.', lesson: lesson._id, course: course._id, topic: 'Unit 1', order: 1, status: 'published' },
    { word: 'appointment', meaning: 'cuộc hẹn', partOfSpeech: 'noun', exampleEnglish: 'Please confirm your appointment.', exampleVietnamese: 'Vui lòng xác nhận cuộc hẹn.', lesson: nextLesson._id, course: course._id, topic: 'Unit 1', order: 2, status: 'published' },
  ]);
  progress('Created vocabulary fixtures');

  const questionA = await Question.create({ questionText: 'Which option means that a room has enough space for guests?', type: 'single_choice', options: [{ id: 'a', text: 'Reject' }, { id: 'b', text: 'Accommodate' }], correctAnswers: ['b'], score: 1, lesson: lesson._id, status: 'published', createdBy: admin._id });
  const questionB = await Question.create({ questionText: 'A meeting time is also called an _____.', type: 'single_choice', options: [{ id: 'a', text: 'appointment' }, { id: 'b', text: 'invoice' }], correctAnswers: ['a'], score: 1, lesson: lesson._id, status: 'published', createdBy: admin._id });
  const incompleteQuestions = await Question.create(Array.from({ length: 20 }, (_, index) => ({
    questionText: `Phase 5 incomplete-answer question ${index + 1}`,
    type: 'single_choice',
    options: [{ id: 'a', text: 'Answer A' }, { id: 'b', text: 'Answer B' }],
    correctAnswers: ['a'],
    score: 1,
    lesson: lesson._id,
    status: 'published',
    order: index + 1,
    createdBy: admin._id,
  })));
  progress('Created question fixtures');
  const assessment = await Assessment.create({
    title: 'Phase 5 Standard Reading Check',
    description: 'Synthetic assessment for attempt, autosave, refresh and scoring checks.',
    type: 'exam',
    lesson: lesson._id,
    course: course._id,
    questions: [{ question: questionA._id, score: 1 }, { question: questionB._id, score: 1 }],
    durationMinutes: 5,
    passScore: 50,
    status: 'published',
    availableFrom: new Date(Date.now() - 60_000),
    availableUntil: new Date(Date.now() + 60 * 60_000),
    attemptLimit: 0,
    showCorrectAnswers: true,
    examFormat: 'standard',
    createdBy: admin._id,
  });
  const homework = await Assessment.create({
    title: 'Phase 5 Homework',
    description: 'Synthetic homework with a submission deadline.',
    type: 'exercise',
    lesson: lesson._id,
    course: course._id,
    questions: [{ question: questionA._id, score: 1 }],
    durationMinutes: 15,
    passScore: 0,
    status: 'published',
    availableFrom: new Date(Date.now() - 60_000),
    availableUntil: new Date(Date.now() + 48 * 60 * 60_000),
    attemptLimit: 0,
    showCorrectAnswers: true,
    examFormat: 'standard',
    createdBy: admin._id,
  });
  const incompleteAssessment = await Assessment.create({
    title: 'Phase 5 Incomplete Questions Check',
    description: 'Synthetic 20-question test for the incomplete-answer warning.',
    type: 'exam',
    lesson: lesson._id,
    course: course._id,
    questions: incompleteQuestions.map((question) => ({ question: question._id, score: 1 })),
    durationMinutes: 30,
    passScore: 50,
    status: 'published',
    availableFrom: new Date(Date.now() - 60_000),
    availableUntil: new Date(Date.now() + 48 * 60 * 60_000),
    attemptLimit: 0,
    showCorrectAnswers: true,
    examFormat: 'standard',
    createdBy: admin._id,
  });
  const timerWarningAssessment = await Assessment.create({
    title: 'Phase 5 Timer Warning Check',
    description: 'Synthetic assessment for timer threshold regression.',
    type: 'exam',
    lesson: lesson._id,
    course: course._id,
    questions: [{ question: questionA._id, score: 1 }],
    durationMinutes: 5,
    passScore: 50,
    status: 'published',
    availableFrom: new Date(Date.now() + 60 * 60_000),
    availableUntil: new Date(Date.now() + 2 * 60 * 60_000),
    attemptLimit: 0,
    showCorrectAnswers: true,
    examFormat: 'standard',
    createdBy: admin._id,
  });
  const autoSubmitAssessment = await Assessment.create({
    title: 'Phase 5 Auto Submit Check',
    description: 'Synthetic assessment for automatic timeout submission.',
    type: 'exam',
    lesson: lesson._id,
    course: course._id,
    questions: [{ question: questionA._id, score: 1 }],
    durationMinutes: 5,
    passScore: 50,
    status: 'published',
    availableFrom: new Date(Date.now() + 60 * 60_000),
    availableUntil: new Date(Date.now() + 2 * 60 * 60_000),
    attemptLimit: 0,
    showCorrectAnswers: true,
    examFormat: 'standard',
    createdBy: admin._id,
  });
  const hiddenAnswerAssessment = await Assessment.create({
    title: 'Phase 5 Hidden Answer Check',
    description: 'Synthetic assessment for the answer-visibility policy.',
    type: 'exam',
    lesson: lesson._id,
    course: course._id,
    questions: [{ question: questionA._id, score: 1 }, { question: questionB._id, score: 1 }],
    durationMinutes: 5,
    passScore: 50,
    status: 'published',
    availableFrom: new Date(Date.now() + 60 * 60_000),
    availableUntil: new Date(Date.now() + 2 * 60 * 60_000),
    attemptLimit: 0,
    showCorrectAnswers: false,
    examFormat: 'standard',
    createdBy: admin._id,
  });
  progress('Seeded course, lessons, materials, vocabulary and assessments');

  for (const model of [User, Course, Enrollment, Lesson, Material, Vocabulary, LearningProgress, Question, Assessment, Attempt]) {
    await model.init();
    progress(`Initialized ${model.modelName} indexes`);
  }
  return { User, Course, Enrollment, Lesson, Material, Vocabulary, LearningProgress, Question, Assessment, Attempt, admin, teacher, student, suspended, profileStudent, lockStudent, unicodeStudent, course, lesson, nextLesson, downloadable, restricted, assessment, homework, incompleteAssessment, timerWarningAssessment, autoSubmitAssessment, hiddenAnswerAssessment, pdfPath, pdfSize: pdfBytes.length, pdfSha256: createHash('sha256').update(pdfBytes).digest('hex') };
}

async function main() {
  progress('Preparing isolated test directory');
  await fs.mkdir(evidenceDir, { recursive: true });
  isolatedRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'toeic-phase5-e2e-'));
  process.chdir(isolatedRoot);

  progress('Starting MongoMemoryServer on loopback');
  const dbName = `toeic_phase5_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  mongoServer = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1', dbName } });
  process.env.MONGODB_URI = mongoServer.getUri(dbName);
  process.env.JWT_SECRET = `phase5-${Math.random().toString(36).repeat(4)}`;
  process.env.JWT_REFRESH_SECRET = `phase5-refresh-${Math.random().toString(36).repeat(4)}`;
  process.env.JWT_EXPIRE = '1h';
  process.env.JWT_REFRESH_EXPIRE = '1d';
  process.env.NODE_ENV = 'test';
  process.env.FRONTEND_URL = 'http://127.0.0.1';
  process.env.VERCEL = '';

  const [{ default: connectDB }, { default: app }] = await Promise.all([
    import(pathToFileURL(path.join(backendRoot, 'src/configs/database.js'))),
    import(pathToFileURL(path.join(backendRoot, 'src/app.js'))),
  ]);
  progress('Connecting application models to the generated MongoMemoryServer URI');
  await connectDB();
  progress('Seeding synthetic fixtures');
  const fixtures = await seedFixtures();

  progress('Starting backend HTTP listener on loopback');
  backendServer = await new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
    server.once('error', reject);
  });
  const apiPort = backendServer.address().port;
  const apiUrl = `http://127.0.0.1:${apiPort}`;
  const vitePort = await freePort();
  progress('Starting Vite on loopback');
  const uiUrl = startVite(vitePort, apiUrl);
  await waitForHttp(`${apiUrl}/health`, null, () => '');
  await waitForHttp(uiUrl, viteProcess, () => viteOutput);
  const health = await fetch(`${apiUrl}/health`).then((response) => response.json());
  assert.equal(health.status, 'success');

  const originalServerLog = console.log;
  const originalServerError = console.error;
  console.log = () => {};
  console.error = (...args) => {
    serverErrorCount += 1;
    if (args[0] === '[protected-upload] UPLOAD_ACCESS_UNAVAILABLE' && args[1] && typeof args[1] === 'object') {
      serverErrorSamples.push({ event: args[0], errorName: args[1].errorName, errorCode: args[1].errorCode });
    }
  };
  try {
    progress('Launching isolated Chrome browser context');
    browser = await chromium.launch({ headless: process.env.PHASE5_HEADLESS !== 'false' });

    await runCase('AUTH_04', 'Unauthenticated protected-route redirect', async () => {
      const { context, page } = await newContext();
      const protectedRoutes = [
        '/student/dashboard',
        `/student/tests/${fixtures.assessment._id}`,
        `/student/courses/${fixtures.course._id}/lessons/${fixtures.lesson._id}`,
      ];
      for (const route of protectedRoutes) {
        await page.goto(`${uiUrl}${route}`, { waitUntil: 'domcontentloaded' });
        await page.waitForURL((url) => url.pathname === '/login', { timeout: 10000 });
        assert.equal(await page.evaluate(() => localStorage.getItem('accessToken')), null);
      }
      await page.screenshot({ path: path.join(evidenceDir, 'auth-guard-redirect.png'), fullPage: true });
      await context.close();
      return 'Direct dashboard, active test, and lesson URLs each redirected an unauthenticated browser to /login.';
    });

    const studentSession = await newContext();
    await runCase('AUTH_01', 'Student login to dashboard', async () => {
      await login(studentSession.page, uiUrl, 'phase5.student', 'SyntheticPhase5!2026', '/student/dashboard');
      await studentSession.page.getByRole('heading', { name: 'Xin chào, Phase Five Student!' }).waitFor({ timeout: 10000 });
      assert.ok(await studentSession.page.evaluate(() => Boolean(localStorage.getItem('accessToken'))));
      await studentSession.page.screenshot({ path: path.join(evidenceDir, 'student-dashboard-desktop.png'), fullPage: true });
      return 'Username login issued a browser session and rendered the student dashboard.';
    });

    await runCase('DASH_01', 'Student dashboard profile and progress', async () => {
      await studentSession.page.getByText('Phase Five Student', { exact: false }).first().waitFor({ timeout: 10000 });
      await studentSession.page.getByRole('img', { name: 'Ảnh đại diện Phase Five Student' }).waitFor({ timeout: 5000 });
      await studentSession.page.getByText('Tiến độ tổng thể').waitFor({ timeout: 10000 });
      assert.ok(await studentSession.page.locator('.dashboard-metrics-grid').count());
      const metricText = await studentSession.page.locator('.dashboard-metrics-grid .metric-card').nth(3).innerText();
      assert.match(metricText, /0%/);
      await studentSession.page.getByText('2', { exact: true }).first().waitFor({ timeout: 5000 });
      navigationTiming = await studentSession.page.evaluate(() => {
        const entry = performance.getEntriesByType('navigation')[0];
        return entry ? { dom_content_loaded_ms: Math.round(entry.domContentLoadedEventEnd), load_ms: Math.round(entry.loadEventEnd) } : null;
      });
      return 'Dashboard loaded profile and progress sections through the local HTTP API.';
    });

    await runCase('DASH_02', 'Dashboard lists recently updated lessons and materials', async () => {
      await studentSession.page.goto(`${uiUrl}/student/dashboard`, { waitUntil: 'domcontentloaded' });
      await studentSession.page.getByRole('heading', { name: 'Bài học mới' }).waitFor({ timeout: 10000 });
      await studentSession.page.getByRole('heading', { name: 'Tài liệu mới' }).waitFor({ timeout: 10000 });
      const discoverySections = studentSession.page.locator('.dashboard-discovery-grid .dashboard-section-card');
      await discoverySections.nth(0).getByRole('link', { name: /Phase 5 Reading Lesson/ }).waitFor({ timeout: 10000 });
      await discoverySections.nth(1).getByRole('link', { name: /Phase 5 practice\.pdf/ }).waitFor({ timeout: 10000 });
      const token = await studentSession.page.evaluate(() => localStorage.getItem('accessToken'));
      const dashboardResponse = await fetch(`${apiUrl}/api/v1/progress/student-dashboard`, { headers: { Authorization: `Bearer ${token}` } });
      const dashboardBody = await dashboardResponse.json();
      assert.equal(dashboardResponse.status, 200);
      assert.ok(dashboardBody.data.recentLessons.some((item) => item._id === String(fixtures.lesson._id)));
      assert.ok(dashboardBody.data.recentMaterials.some((item) => item._id === String(fixtures.downloadable._id)));
      assert.ok(dashboardBody.data.recentMaterials.every((item) => !('fileUrl' in item) && !('filePath' in item)));
      await studentSession.page.screenshot({ path: path.join(evidenceDir, 'student-dashboard-recent-content.png'), fullPage: true });
      return 'Dashboard displayed the recently updated published lesson and material using safe metadata without file URLs or filesystem paths.';
    });

    await runCase('DASH_03', 'Dashboard shows uncompleted work and upcoming deadlines', async () => {
      await studentSession.page.goto(`${uiUrl}/student/dashboard`, { waitUntil: 'domcontentloaded' });
      const taskSection = studentSession.page.locator('.dashboard-two-columns:not(.dashboard-discovery-grid) .dashboard-section-card').first();
      await taskSection.getByRole('heading', { name: 'Nhiệm vụ cần làm' }).waitFor({ timeout: 10000 });
      await taskSection.getByText('Phase 5 Homework', { exact: true }).waitFor({ timeout: 10000 });
      await taskSection.getByText('Phase 5 Standard Reading Check', { exact: true }).waitFor({ timeout: 10000 });
      assert.equal(await taskSection.getByText(/Phase 5 (Timer Warning|Auto Submit|Hidden Answer) Check/).count(), 0, 'Future assessments should not appear as work due now.');
      await taskSection.getByText('Chưa làm', { exact: true }).first().waitFor({ timeout: 5000 });
      assert.equal(await taskSection.getByText(/Hạn nộp:/).count(), 3);
      await studentSession.page.screenshot({ path: path.join(evidenceDir, 'student-dashboard-pending-tasks.png'), fullPage: true });
      return 'Dashboard listed the unsubmitted homework and exam with their configured deadlines.';
    });

    await runCase('AUTH_05', 'Student cannot open admin routes', async () => {
      await studentSession.page.goto(`${uiUrl}/admin/students`, { waitUntil: 'domcontentloaded' });
      await studentSession.page.waitForURL((url) => url.pathname === '/student/dashboard', { timeout: 10000 });
      return 'Student role was redirected away from the admin route.';
    });

    await runCase('E2E_MY_COURSES', 'Student course list shows enrolled course', async () => {
      await studentSession.page.goto(`${uiUrl}/student/my-courses`, { waitUntil: 'domcontentloaded' });
      await studentSession.page.getByRole('heading', { name: 'Khóa học của tôi' }).waitFor({ timeout: 10000 });
      await studentSession.page.getByText('Phase 5 TOEIC Synthetic Course', { exact: false }).waitFor({ timeout: 10000 });
      await studentSession.page.screenshot({ path: path.join(evidenceDir, 'student-courses-desktop.png'), fullPage: true });
      return 'Enrolled synthetic course was returned by the real API and rendered.';
    });

    await runCase('LESS_02', 'Lesson content and HTML sanitization', async () => {
      await studentSession.page.goto(`${uiUrl}/student/courses/${fixtures.course._id}/lessons/${fixtures.lesson._id}`, { waitUntil: 'domcontentloaded' });
      await studentSession.page.getByRole('heading', { name: 'Phase 5 Reading Lesson', level: 1 }).waitFor({ timeout: 12000 });
      await studentSession.page.getByText('Reading practice').waitFor({ timeout: 10000 });
      const sanitization = await studentSession.page.locator('.lesson-content').evaluate((element) => ({ scripts: element.querySelectorAll('script').length, eventHandlers: element.querySelectorAll('[onerror], [onclick], [onload]').length }));
      assert.equal(sanitization.scripts, 0);
      assert.equal(sanitization.eventHandlers, 0);
      assert.equal(await studentSession.page.evaluate(() => window.__phase5_xss), undefined);
      await studentSession.page.screenshot({ path: path.join(evidenceDir, 'lesson-desktop.png'), fullPage: true });
      return 'Lesson rendered; embedded script and event-handler attributes were removed before insertion.';
    });

    await runCase('LESS_03', 'Revisit lesson and preserve navigation', async () => {
      await fixtures.LearningProgress.updateOne({ student: fixtures.student._id, lesson: fixtures.lesson._id }, { $set: { status: 'completed', progress: 100 } });
      await studentSession.page.reload({ waitUntil: 'domcontentloaded' });
      await studentSession.page.getByRole('heading', { name: 'Phase 5 Reading Lesson', level: 1 }).waitFor({ timeout: 12000 });
      await studentSession.page.getByRole('link', { name: 'Bài tiếp theo: Phase 5 Follow-up Lesson' }).waitFor({ timeout: 10000 });
      return 'The same published lesson reloaded with the next-lesson action present.';
    });

    await runCase('DOC_01', 'Preview authorized PDF material', async () => {
      await studentSession.page.goto(`${uiUrl}/student/courses/${fixtures.course._id}/lessons/${fixtures.lesson._id}`, { waitUntil: 'domcontentloaded' });
      const pdfRow = studentSession.page.locator('.lesson-material-item').filter({ hasText: 'Phase 5 practice.pdf' });
      const canvas = pdfRow.getByTestId('pdf-preview-canvas');
      await canvas.waitFor({ timeout: 10000 });
      await studentSession.page.waitForFunction((materialName) => [...document.querySelectorAll('.lesson-material-item')]
        .find((row) => row.textContent.includes(materialName))
        ?.querySelector('[data-testid="pdf-preview-canvas"]')?.dataset.renderedPage === '1', 'Phase 5 practice.pdf', { timeout: 10000 });
      await pdfRow.getByRole('status').getByText('Trang 1 / 3').waitFor({ timeout: 5000 });
      const firstPage = await canvas.evaluate((element) => {
        const context = element.getContext('2d');
        const pixels = context.getImageData(0, 0, element.width, element.height).data;
        let nonWhitePixels = 0;
        for (let index = 0; index < pixels.length; index += 16) {
          if (pixels[index] < 235 || pixels[index + 1] < 235 || pixels[index + 2] < 235) nonWhitePixels += 1;
        }
        return { width: element.width, height: element.height, nonWhitePixels };
      });
      assert.ok(firstPage.width > 0 && firstPage.height > 0);
      assert.ok(firstPage.nonWhitePixels > 25, `PDF page canvas should contain rendered content: ${JSON.stringify(firstPage)}`);
      await pdfRow.getByRole('button', { name: 'Trang tiếp theo' }).click();
      await studentSession.page.waitForFunction((materialName) => [...document.querySelectorAll('.lesson-material-item')]
        .find((row) => row.textContent.includes(materialName))
        ?.querySelector('[data-testid="pdf-preview-canvas"]')?.dataset.renderedPage === '2', 'Phase 5 practice.pdf', { timeout: 10000 });
      await pdfRow.getByRole('status').getByText('Trang 2 / 3').waitFor({ timeout: 5000 });
      await pdfRow.getByRole('button', { name: 'Trang trước' }).click();
      await studentSession.page.waitForFunction((materialName) => [...document.querySelectorAll('.lesson-material-item')]
        .find((row) => row.textContent.includes(materialName))
        ?.querySelector('[data-testid="pdf-preview-canvas"]')?.dataset.renderedPage === '1', 'Phase 5 practice.pdf', { timeout: 10000 });
      await pdfRow.locator('.pdf-document-preview').screenshot({ path: path.join(evidenceDir, 'lesson-pdf-preview.png') });
      return `PDF.js rendered page 1 with nonblank canvas pixels (${firstPage.width}×${firstPage.height}); navigation rendered page 2 of 3 and returned to page 1.`;
    });

    await runCase('DOC_02', 'Download authorized PDF material', async () => {
      const downloadPromise = studentSession.page.waitForEvent('download', { timeout: 10000 });
      await studentSession.page.getByRole('button', { name: /Tải xuống/ }).click();
      const download = await downloadPromise;
      assert.match(download.suggestedFilename(), /\.pdf$/i);
      const downloadPath = path.join(isolatedRoot, 'downloaded-phase5.pdf');
      await download.saveAs(downloadPath);
      const downloadedBytes = await fs.readFile(downloadPath);
      assert.equal(downloadedBytes.subarray(0, 5).toString('ascii'), '%PDF-');
      assert.equal(downloadedBytes.length, fixtures.pdfSize);
      const downloadedSha256 = createHash('sha256').update(downloadedBytes).digest('hex');
      assert.equal(downloadedSha256, fixtures.pdfSha256);
      return `Browser downloaded the exact authorized three-page PDF fixture (${downloadedBytes.length} bytes, SHA-256 matched).`;
    });

    await runCase('VOC_01', 'Vocabulary chapter and flashcard interaction', async () => {
      await studentSession.page.goto(`${uiUrl}/student/vocabulary`, { waitUntil: 'domcontentloaded' });
      await studentSession.page.getByRole('heading', { name: 'Từ vựng theo chapter', level: 1 }).waitFor({ timeout: 10000 });
      const chapterCards = studentSession.page.locator('.chapter-card');
      await chapterCards.first().waitFor({ timeout: 10000 });
      assert.equal(await chapterCards.count(), 2, 'The Unit 1 book should show both fixture chapters.');
      await chapterCards.first().click();
      const chapterFlashcard = studentSession.page.locator('.chapter-flashcard');
      await chapterFlashcard.waitFor({ timeout: 10000 });
      await studentSession.page.getByRole('button', { name: /Lưu chapter/ }).click();
      await studentSession.page.getByRole('button', { name: /Đã lưu chapter/ }).waitFor({ timeout: 5000 });
      await chapterFlashcard.click();
      const wordList = studentSession.page.locator('.chapter-flash-word-list');
      await wordList.locator('.chapter-flash-word-term h3').filter({ hasText: /^accommodate/ }).waitFor({ timeout: 5000 });
      await wordList.getByText('/əˈkɑːmədeɪt/', { exact: true }).waitFor({ timeout: 5000 });
      await wordList.getByText('đáp ứng; cung cấp chỗ ở', { exact: true }).waitFor({ timeout: 5000 });
      await wordList.locator('.chapter-flash-word-examples p').filter({ hasText: 'The room can accommodate twelve guests.' }).waitFor({ timeout: 5000 });
      await studentSession.page.getByRole('button', { name: 'Chapter tiếp theo' }).click();
      await studentSession.page.locator('.chapter-flash-word-list .chapter-flash-word-term h3').filter({ hasText: /^appointment/ }).waitFor({ timeout: 5000 });
      await studentSession.page.screenshot({ path: path.join(evidenceDir, 'flashcard-desktop.png'), fullPage: true });
      return 'Chapter list, chapter bookmark, flip-to-word-list content and next-chapter navigation rendered for the two Unit 1 fixtures.';
    });

    await runCase('VOC_02', 'Search vocabulary by keyword', async () => {
      await studentSession.page.goto(`${uiUrl}/student/vocabulary`, { waitUntil: 'domcontentloaded' });
      const searchBox = studentSession.page.getByRole('searchbox', { name: 'Tìm chapter hoặc từ vựng' });
      await searchBox.fill('APPOINTMENT');
      await studentSession.page.waitForFunction(() => document.querySelectorAll('.chapter-card').length === 1 && document.querySelector('.chapter-card')?.getAttribute('aria-label')?.includes('1 từ'));
      assert.match(await studentSession.page.locator('.chapter-card').getAttribute('aria-label'), /1 từ/);
      await searchBox.fill('CUOC HEN');
      await studentSession.page.waitForFunction(() => document.querySelectorAll('.chapter-card').length === 1 && document.querySelector('.chapter-card')?.getAttribute('aria-label')?.includes('1 từ'));
      assert.match(await studentSession.page.locator('.chapter-card').getAttribute('aria-label'), /1 từ/);
      return 'Search matched uppercase English and accent-insensitive Vietnamese meaning; each query narrowed the book to the single chapter containing the matching word.';
    });

    await runCase('DOC_03', 'Deny download when material policy forbids it', async () => {
      await studentSession.page.goto(`${uiUrl}/student/courses/${fixtures.course._id}/lessons/${fixtures.lesson._id}`, { waitUntil: 'domcontentloaded' });
      const restrictedRow = studentSession.page.locator('.lesson-material-item').filter({ hasText: 'Phase 5 restricted.pdf' });
      await restrictedRow.waitFor({ timeout: 10000 });
      const restrictedCanvas = restrictedRow.getByTestId('pdf-preview-canvas');
      await restrictedCanvas.waitFor({ timeout: 10000 });
      await studentSession.page.waitForFunction(() => {
        const canvas = [...document.querySelectorAll('[data-testid="pdf-preview-canvas"]')]
          .find((element) => element.closest('.lesson-material-item')?.textContent?.includes('Phase 5 restricted.pdf'));
        return canvas?.dataset.renderedPage === '1';
      }, null, { timeout: 10000 });
      assert.equal(await restrictedRow.getByRole('button', { name: /Tải xuống/ }).count(), 0);
      const token = await studentSession.page.evaluate(() => localStorage.getItem('accessToken'));
      const preview = await fetch(`${apiUrl}/api/v1/materials/${fixtures.restricted._id}/preview`, { headers: { Authorization: `Bearer ${token}` } });
      assert.equal(preview.status, 200);
      assert.match(preview.headers.get('content-type') || '', /^application\/pdf(?:;|$)/i);
      assert.match(preview.headers.get('content-disposition') || '', /^inline;/i);
      await preview.arrayBuffer();
      const response = await fetch(`${apiUrl}/api/v1/materials/${fixtures.restricted._id}/download`, { headers: { Authorization: `Bearer ${token}` } });
      assert.equal(response.status, 403);
      return 'The authorized Student rendered the restricted PDF inline, the row exposed no Download button, Preview returned HTTP 200 and Download returned HTTP 403.';
    });

    await runCase('EXAM_01', 'Assessment start, autosave, refresh and scoring', async () => {
      lastPage = studentSession.page;
      await studentSession.page.goto(`${uiUrl}/student/assessments`, { waitUntil: 'domcontentloaded' });
      await studentSession.page.getByRole('heading', { name: 'Bài tập & đề thi' }).waitFor({ timeout: 10000 });
      const assessmentCard = studentSession.page.locator('.assessment-card').filter({ hasText: 'Phase 5 Standard Reading Check' });
      await assessmentCard.getByText('Synthetic assessment for attempt, autosave, refresh and scoring checks.').waitFor({ timeout: 5000 });
      await assessmentCard.getByText('2', { exact: true }).waitFor({ timeout: 5000 });
      await assessmentCard.getByText('5', { exact: true }).waitFor({ timeout: 5000 });
      await assessmentCard.getByText('Điểm đạt: 50%', { exact: true }).waitFor({ timeout: 5000 });
      await assessmentCard.getByRole('link', { name: /Bắt đầu làm bài/ }).click();
      await studentSession.page.locator('.test-screen--active').waitFor({ timeout: 12000 });
      const timer = studentSession.page.locator('.test-timer-badge');
      await studentSession.page.waitForFunction(() => /^\d{2}:\d{2}$/.test(document.querySelector('.test-timer-badge span')?.textContent?.trim() || ''), null, { timeout: 5000 });
      const initialTimer = (await timer.innerText()).trim();
      assert.match(initialTimer, /^\d{2}:\d{2}$/);
      await studentSession.page.waitForFunction((previous) => {
        const current = document.querySelector('.test-timer-badge span')?.textContent?.trim() || '';
        return /^\d{2}:\d{2}$/.test(current) && current !== previous;
      }, initialTimer, { timeout: 5000 });
      const questionCards = studentSession.page.locator('.question-card');
      await questionCards.nth(0).locator('input[type="radio"]').nth(1).check();
      await questionCards.nth(1).locator('input[type="radio"]').nth(0).check();
      await studentSession.page.locator('.test-title-box').getByText(/Đã lưu/).waitFor({ timeout: 7000 });
      await studentSession.page.screenshot({ path: path.join(evidenceDir, 'assessment-desktop-before-refresh.png'), fullPage: true });
      await studentSession.page.reload({ waitUntil: 'domcontentloaded' });
      await studentSession.page.getByRole('button', { name: 'Tiếp tục làm bài' }).click();
      await studentSession.page.locator('.test-screen--active').waitFor({ timeout: 12000 });
      assert.equal(await studentSession.page.locator('.question-card').nth(0).locator('input[type="radio"]').nth(1).isChecked(), true);
      assert.equal(await studentSession.page.locator('.question-card').nth(1).locator('input[type="radio"]').nth(0).isChecked(), true);
      await studentSession.page.getByRole('button', { name: 'Nộp Bài Kiểm Tra' }).click();
      await studentSession.page.getByRole('heading', { name: 'Xác Nhận Nộp Bài' }).waitFor({ timeout: 5000 });
      await studentSession.page.getByRole('button', { name: 'Xác Nhận Nộp Bài' }).click();
      await studentSession.page.getByRole('heading', { name: 'Kết Quả Bài Kiểm Tra' }).waitFor({ timeout: 12000 });
      await studentSession.page.getByText('100%', { exact: true }).waitFor({ timeout: 5000 });
      await studentSession.page.getByText('Điểm: 2 / 2', { exact: true }).waitFor({ timeout: 5000 });
      await studentSession.page.getByText(/Điểm đạt: .* · ĐẠT/).waitFor({ timeout: 5000 });
      await studentSession.page.getByText('Thời gian làm bài', { exact: true }).waitFor({ timeout: 5000 });
      await studentSession.page.getByText(/^\d+ phút \d+ giây$/, { exact: true }).waitFor({ timeout: 5000 });
      await studentSession.page.getByText('Which option means that a room has enough space for guests?', { exact: false }).waitFor({ timeout: 5000 });
      await studentSession.page.getByText('A meeting time is also called an _____.', { exact: false }).waitFor({ timeout: 5000 });
      assert.ok(await studentSession.page.locator('.assessment-review-card__option--correct').count() >= 2, 'Configured result should mark both correct options.');
      const storedAttempt = await fixtures.Attempt.findOne({ student: fixtures.student._id, assessment: fixtures.assessment._id }).lean();
      assert.equal(storedAttempt.status, 'submitted');
      assert.equal(storedAttempt.score, 2);
      assert.equal(storedAttempt.correctCount, 2);
      await studentSession.page.screenshot({ path: path.join(evidenceDir, 'assessment-result-desktop.png'), fullPage: true });
      return 'Both answers persisted across refresh; submission produced 2/2 and a terminal database record.';
    });

    await runCase('EXAM_03', 'Confirm submission lists unanswered questions', async () => {
      const { context, page } = await newContext({ width: 1920, height: 1080 });
      await login(page, uiUrl, 'phase5.student', 'SyntheticPhase5!2026', '/student/dashboard');
      await page.goto(`${uiUrl}/student/tests/${fixtures.incompleteAssessment._id}`, { waitUntil: 'domcontentloaded' });
      await page.locator('.test-screen--active').waitFor({ timeout: 12000 });
      const questionCards = page.locator('.question-card');
      assert.equal(await questionCards.count(), 20);
      const unansweredIndexes = new Set([4, 7, 11, 18]);
      for (let index = 0; index < 20; index += 1) {
        if (!unansweredIndexes.has(index)) await questionCards.nth(index).locator('input[type="radio"]').first().check();
      }
      await page.getByText('Đã làm 16/20 câu').waitFor({ timeout: 10000 });
      await page.getByText('Đã làm 16/20 câu (80%)', { exact: false }).waitFor({ timeout: 5000 });
      assert.equal(await page.getByRole('progressbar', { name: 'Tiến độ làm bài' }).getAttribute('aria-valuenow'), '80');
      await page.locator('.test-title-box').getByText(/Đã lưu/).waitFor({ timeout: 10000 });
      await page.getByRole('button', { name: 'Nộp Bài Kiểm Tra' }).click();
      const confirmation = page.locator('.modal-content');
      await confirmation.getByText('16 / 20', { exact: false }).waitFor({ timeout: 5000 });
      await confirmation.getByText(/Câu chưa trả lời: 5, 8, 12, 19/).waitFor({ timeout: 5000 });
      await page.screenshot({ path: path.join(evidenceDir, 'assessment-unanswered-16-of-20.png'), fullPage: true });
      await context.close();
      return 'Submission confirmation reported 16/20 answered and explicitly listed unanswered questions 5, 8, 12 and 19.';
    });

    await runCase('EXAM_05', 'Result includes score, counts, duration and pass classification', async () => {
      const resultPage = studentSession.page;
      lastPage = resultPage;
      await resultPage.getByRole('heading', { name: 'Kết Quả Bài Kiểm Tra' }).waitFor({ timeout: 5000 });
      await resultPage.getByText('Điểm: 2 / 2', { exact: true }).waitFor({ timeout: 5000 });
      await resultPage.getByText('2', { exact: true }).first().waitFor({ timeout: 5000 });
      await resultPage.getByText('Câu Đúng', { exact: true }).waitFor({ timeout: 5000 });
      await resultPage.getByText(/Điểm đạt: .* · ĐẠT/).waitFor({ timeout: 5000 });
      await resultPage.getByText('Thời gian làm bài', { exact: true }).waitFor({ timeout: 5000 });
      await resultPage.getByText(/^\d+ phút \d+ giây$/, { exact: true }).waitFor({ timeout: 5000 });
      return 'The result view showed score/max score, correct count, elapsed time and pass classification.';
    });

    await runCase('EXAM_06', 'Hidden-answer configuration conceals the answer key', async () => {
      await fixtures.Assessment.updateOne({ _id: fixtures.hiddenAnswerAssessment._id }, { $set: { availableFrom: new Date(Date.now() - 60_000) } });
      const { context, page } = await newContext();
      await login(page, uiUrl, 'phase5.student', 'SyntheticPhase5!2026', '/student/dashboard');
      await page.goto(`${uiUrl}/student/tests/${fixtures.hiddenAnswerAssessment._id}`, { waitUntil: 'domcontentloaded' });
      await page.locator('.test-screen--active').waitFor({ timeout: 12000 });
      const questions = page.locator('.question-card');
      await questions.nth(0).locator('input[type="radio"]').nth(0).check();
      await questions.nth(1).locator('input[type="radio"]').nth(1).check();
      await page.locator('.test-title-box').getByText(/Đã lưu/).waitFor({ timeout: 7000 });
      await page.getByRole('button', { name: 'Nộp Bài Kiểm Tra' }).click();
      await page.getByRole('heading', { name: 'Xác Nhận Nộp Bài' }).waitFor({ timeout: 5000 });
      await page.getByRole('button', { name: 'Xác Nhận Nộp Bài' }).click();
      await page.getByRole('heading', { name: 'Kết Quả Bài Kiểm Tra' }).waitFor({ timeout: 12000 });
      assert.equal(await page.locator('.assessment-review-card--options .assessment-review-card__option--correct').count(), 0);
      assert.equal(await page.getByText('Đáp án đúng', { exact: false }).count(), 0);
      await page.screenshot({ path: path.join(evidenceDir, 'assessment-hidden-answer-result.png'), fullPage: true });
      await context.close();
      return 'With showCorrectAnswers disabled, the submitted result did not render correct-answer labels or highlighted correct options.';
    });

    await runCase('DASH_04', 'Dashboard shows completed assessment result', async () => {
      lastPage = studentSession.page;
      await studentSession.page.goto(`${uiUrl}/student/dashboard`, { waitUntil: 'domcontentloaded' });
      await studentSession.page.getByRole('heading', { name: 'Kết Quả Làm Bài Gần Đây' }).waitFor({ timeout: 10000 });
      const resultRow = studentSession.page.locator('.result-item').filter({ hasText: 'Phase 5 Standard Reading Check' });
      await resultRow.waitFor({ timeout: 10000 });
      assert.match(await resultRow.locator('.result-score-tag').innerText(), /2\s*\/\s*2/);
      assert.match(await resultRow.innerText(), /\d{1,2}\/\d{1,2}\/\d{4}/);
      return 'Dashboard showed the completed assessment title, 2/2 score, pass result and submitted date.';
    });

    await runCase('EXAM_02', 'Countdown timer warns in red below five minutes', async () => {
      await fixtures.Assessment.updateOne({ _id: fixtures.timerWarningAssessment._id }, { $set: { availableFrom: new Date(Date.now() - 60_000) } });
      const { context, page } = await newContext();
      await login(page, uiUrl, 'phase5.student', 'SyntheticPhase5!2026', '/student/dashboard');
      await page.goto(`${uiUrl}/student/tests/${fixtures.timerWarningAssessment._id}`, { waitUntil: 'domcontentloaded' });
      await page.locator('.test-screen--active').waitFor({ timeout: 12000 });
      const attempt = await fixtures.Attempt.findOne({ student: fixtures.student._id, assessment: fixtures.timerWarningAssessment._id });
      await fixtures.Attempt.updateOne({ _id: attempt._id }, { $set: { deadlineAt: new Date(Date.now() + 179_000) } });
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.locator('.test-screen--active').waitFor({ timeout: 12000 });
      const timer = page.locator('.test-timer-badge');
      await page.waitForFunction(() => /^\d{2}:\d{2}$/.test(document.querySelector('.test-timer-badge span')?.textContent?.trim() || ''), null, { timeout: 5000 });
      await page.waitForFunction(() => document.querySelector('.test-timer-badge')?.getAttribute('style')?.includes('var(--brand-danger-bg)'), null, { timeout: 5000 });
      const timerText = await timer.locator('span').innerText();
      const [minutes, seconds] = timerText.split(':').map(Number);
      assert.ok(minutes * 60 + seconds > 0 && minutes * 60 + seconds < 180, `Expected a visible timer under three minutes, got ${timerText}.`);
      await context.close();
      return 'Server deadline under three minutes rendered the warning timer in the danger color; the remaining time stayed minute-second formatted.';
    });

    await runCase('EXAM_04', 'Assessment auto-submits when the server deadline expires', async () => {
      await fixtures.Assessment.updateOne({ _id: fixtures.autoSubmitAssessment._id }, { $set: { availableFrom: new Date(Date.now() - 60_000) } });
      const { context, page } = await newContext();
      await login(page, uiUrl, 'phase5.student', 'SyntheticPhase5!2026', '/student/dashboard');
      await page.goto(`${uiUrl}/student/tests/${fixtures.autoSubmitAssessment._id}`, { waitUntil: 'domcontentloaded' });
      await page.locator('.test-screen--active').waitFor({ timeout: 12000 });
      const attempt = await fixtures.Attempt.findOne({ student: fixtures.student._id, assessment: fixtures.autoSubmitAssessment._id });
      await fixtures.Attempt.updateOne({ _id: attempt._id }, { $set: { deadlineAt: new Date(Date.now() + 5000) } });
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.locator('.test-screen--active').waitFor({ timeout: 12000 });
      await page.getByRole('heading', { name: 'Kết Quả Bài Kiểm Tra' }).waitFor({ timeout: 15000 });
      const completedAttempt = await fixtures.Attempt.findById(attempt._id).lean();
      assert.equal(completedAttempt.status, 'submitted');
      assert.equal(completedAttempt.isExpired, true);
      await page.screenshot({ path: path.join(evidenceDir, 'assessment-auto-submit.png'), fullPage: true });
      await context.close();
      return 'Timer expiry automatically submitted the attempt; the isolated database recorded a terminal expired result.';
    });

    await runCase('HIST_01', 'History lists the submitted assessment and result', async () => {
      lastPage = studentSession.page;
      await studentSession.page.goto(`${uiUrl}/student/history`, { waitUntil: 'domcontentloaded' });
      await studentSession.page.getByRole('heading', { name: 'Lịch sử làm bài' }).waitFor({ timeout: 10000 });
      const historyRows = studentSession.page.locator('.history-table tbody tr');
      const expectedSubmittedCount = await fixtures.Attempt.countDocuments({ student: fixtures.student._id, status: 'submitted' });
      assert.equal(await historyRows.count(), expectedSubmittedCount, 'History should list every submitted attempt.');
      assert.ok(expectedSubmittedCount >= 3, 'Expected multiple submitted attempts.');
      for (const title of ['Phase 5 Standard Reading Check', 'Phase 5 Hidden Answer Check', 'Phase 5 Auto Submit Check']) {
        const row = historyRows.filter({ hasText: title });
        await row.waitFor({ timeout: 10000 });
        assert.equal(await row.locator('td').count(), 8);
        const rowText = await row.innerText();
        assert.match(rowText, /\d{1,2}:\d{2}.*\d{1,2}\/\d{1,2}\/\d{4}/, 'Missing submitted date/time for ' + title + '.');
        assert.match(rowText, /\d+\s*\/\s*\d+/, 'Missing score/max score for ' + title + '.');
        assert.match(rowText, /Đạt|Chưa đạt/, 'Missing pass classification for ' + title + '.');
        assert.match(rowText, /\d+\s+phút/, 'Missing duration for ' + title + '.');
      }
      await studentSession.page.getByRole('columnheader', { name: 'Ngày nộp bài' }).waitFor({ timeout: 5000 });
      await studentSession.page.getByRole('columnheader', { name: 'Thời gian' }).waitFor({ timeout: 5000 });
      await studentSession.page.screenshot({ path: path.join(evidenceDir, 'student-history.png'), fullPage: true });
      return 'History listed all ' + expectedSubmittedCount + ' submitted attempts with date/time, score/max score, pass result and duration.';
    });

    await runCase('AUTH_06', 'Logout clears browser session', async () => {
      lastPage = studentSession.page;
      const activeAttemptDialog = studentSession.page.getByRole('alertdialog');
      const deferActiveAttempts = activeAttemptDialog.getByRole('button', { name: 'Để sau' });
      if (await deferActiveAttempts.isVisible().catch(() => false)) await deferActiveAttempts.click();
      await studentSession.page.getByRole('button', { name: 'Đăng xuất' }).click();
      await studentSession.page.waitForURL((url) => url.pathname === '/login', { timeout: 10000 });
      assert.equal(await studentSession.page.evaluate(() => localStorage.getItem('accessToken')), null);
      await studentSession.page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => undefined);
      await studentSession.page.waitForURL((url) => url.pathname === '/login', { timeout: 10000 });
      assert.equal(await studentSession.page.evaluate(() => localStorage.getItem('accessToken')), null);
      await studentSession.page.screenshot({ path: path.join(evidenceDir, 'logout-login-page.png'), fullPage: true });
      return 'Logout cleared the local access token and returned the browser to /login.';
    });
    await studentSession.context.close();

    await runCase('AUTH_02', 'Invalid password is rejected on login screen', async () => {
      const { context, page } = await newContext();
      await page.goto(`${uiUrl}/login`, { waitUntil: 'domcontentloaded' });
      await page.locator('#login-identifier').fill('phase5.student');
      await page.locator('#login-password').fill('Wrong-Synthetic-Password');
      await page.getByRole('button', { name: 'Đăng nhập →' }).click();
      await page.locator('.auth-global-error').waitFor({ timeout: 10000 });
      assert.match(await page.locator('.auth-global-error').innerText(), /không chính xác/i);
      assert.equal(await page.evaluate(() => localStorage.getItem('accessToken')), null);
      await page.screenshot({ path: path.join(evidenceDir, 'login-invalid-credentials.png'), fullPage: true });
      await context.close();
      return 'Invalid password stayed on /login and displayed the expected Vietnamese error without a session token.';
    });

    await runCase('AUTH_03', 'Suspended student is blocked at login', async () => {
      const { context, page } = await newContext();
      await page.goto(`${uiUrl}/login`, { waitUntil: 'domcontentloaded' });
      await page.locator('#login-identifier').fill('phase5.suspended');
      await page.locator('#login-password').fill('SyntheticPhase5!2026');
      await page.getByRole('button', { name: 'Đăng nhập →' }).click();
      await page.waitForURL((url) => url.pathname === '/account-status', { timeout: 10000 });
      await page.locator('.auth-status-card h2').getByText('Tài khoản đang tạm khóa', { exact: true }).waitFor({ timeout: 5000 });
      assert.equal(await page.evaluate(() => localStorage.getItem('accessToken')), null);
      await page.getByText(/khóa|tạm ngưng/i).first().waitFor({ timeout: 5000 });
      await page.screenshot({ path: path.join(evidenceDir, 'account-suspended.png'), fullPage: true });
      await context.close();
      return 'Suspended account received an account-status page and was not issued a browser session.';
    });

    await runCase('ADM_U_01', 'Admin creates a student through the management screen', async () => {
      const { context, page } = await newContext();
      await login(page, uiUrl, 'phase5.admin', 'SyntheticPhase5!2026', '/admin');
      await page.goto(`${uiUrl}/admin/students`, { waitUntil: 'domcontentloaded' });
      await page.getByRole('heading', { name: 'Học viên' }).waitFor({ timeout: 10000 });
      await page.getByRole('button', { name: '+ Thêm học viên' }).click();
      const dialog = page.getByRole('dialog', { name: 'Thêm học viên' });
      await dialog.getByLabel('Họ và tên').fill('Phase Five Created Student');
      await dialog.getByLabel('Email').fill('phase5.created@example.test');
      await dialog.getByLabel('Tên đăng nhập').fill('phase5.created');
      await dialog.getByLabel('Mật khẩu ban đầu').fill('SyntheticCreated!2026');
      await dialog.getByRole('button', { name: 'Tạo tài khoản' }).click();
      await page.getByRole('status').filter({ hasText: 'Tài khoản đã được tạo' }).waitFor({ timeout: 10000 });
      const token = await page.evaluate(() => localStorage.getItem('accessToken'));
      const listResponse = await fetch(`${apiUrl}/api/v1/admin/students?status=ALL&page=1&limit=20`, { headers: { Authorization: `Bearer ${token}` } });
      const listPayload = await listResponse.json();
      const listedEmails = (listPayload.data?.students || []).map((item) => item.email);
      assert.ok(listedEmails.includes('phase5.created@example.test'), `Created student missing from refreshed API list: ${JSON.stringify({ status: listResponse.status, listedEmails })}`);
      const visibleStudentTable = await page.locator('.admin-table-container').innerText();
      assert.ok(visibleStudentTable.includes('phase5.created@example.test'), `Created student missing from UI table after successful refresh; URL=${page.url()}, table=${visibleStudentTable.slice(0, 500)}`);
      const createdUser = await fixtures.User.findOne({ email: 'phase5.created@example.test' }).lean();
      assert.equal(createdUser.role, 'student');
      assert.equal(createdUser.status, 'active');
      assert.notEqual(createdUser.password, 'SyntheticCreated!2026');
      const createdStudentSession = await newContext();
      await login(createdStudentSession.page, uiUrl, 'phase5.created', 'SyntheticCreated!2026', '/student/dashboard');
      await createdStudentSession.page.getByRole('heading', { name: 'Xin chào, Phase Five Created Student!' }).waitFor({ timeout: 10000 });
      await createdStudentSession.context.close();
      await page.screenshot({ path: path.join(evidenceDir, 'admin-student-created.png'), fullPage: true });
      await context.close();
      return 'Admin UI created an active student in the isolated DB; persisted password is hashed.';
    });

    await runCase('ADM_U_03', 'Admin student profile shows learning and exam history', async () => {
      const { context, page } = await newContext();
      await login(page, uiUrl, 'phase5.admin', 'SyntheticPhase5!2026', '/admin');
      await page.goto(`${uiUrl}/admin/students/${fixtures.student._id}`, { waitUntil: 'domcontentloaded' });
      await page.getByRole('heading', { name: 'Phase Five Student' }).waitFor({ timeout: 10000 });
      const learningPanel = page.locator('.student-detail-panel').filter({ hasText: 'Bài học và tiến độ' });
      await learningPanel.getByText('Phase 5 Reading Lesson', { exact: true }).waitFor({ timeout: 10000 });
      const attemptPanel = page.locator('.student-detail-panel').filter({ hasText: 'Lịch sử bài tập và bài kiểm tra' });
      await attemptPanel.getByText('Phase 5 Standard Reading Check', { exact: true }).waitFor({ timeout: 10000 });
      await attemptPanel.getByText('2 / 2', { exact: true }).waitFor({ timeout: 5000 });
      await page.screenshot({ path: path.join(evidenceDir, 'admin-student-detail.png'), fullPage: true });
      await context.close();
      return 'Admin profile showed the student lesson-progress row and the scored Standard assessment attempt.';
    });

    await runCase('ADM_U_04', 'Admin student search ignores Vietnamese accents and case', async () => {
      const { context, page } = await newContext();
      await login(page, uiUrl, 'phase5.admin', 'SyntheticPhase5!2026', '/admin');
      await page.goto(`${uiUrl}/admin/students`, { waitUntil: 'domcontentloaded' });
      await page.getByRole('heading', { name: 'Học viên' }).waitFor({ timeout: 10000 });
      const search = page.getByRole('textbox', { name: 'Tìm học viên' });
      const searchForm = page.locator('form.admin-search-bar');
      const unicodeRow = page.locator('.admin-data-table tbody tr').filter({ hasText: 'phase5.unicode@example.test' });
      await search.fill('nguyen van');
      await searchForm.getByRole('button', { name: 'Tìm kiếm', exact: true }).first().click();
      await unicodeRow.waitFor({ timeout: 10000 });
      await search.fill('NGUYỄN VĂN');
      await searchForm.getByRole('button', { name: 'Tìm kiếm', exact: true }).first().click();
      await unicodeRow.waitFor({ timeout: 10000 });
      await context.close();
      return 'The admin list matched the same Vietnamese full name with accentless lowercase and accented uppercase queries.';
    });

    await runCase('ADM_U_02', 'Suspension blocks an already-authenticated student', async () => {
      const studentContext = await newContext();
      await login(studentContext.page, uiUrl, 'phase5.lock', 'SyntheticPhase5!2026', '/student/dashboard');
      const { context: adminContext, page: adminPage } = await newContext();
      await login(adminPage, uiUrl, 'phase5.admin', 'SyntheticPhase5!2026', '/admin');
      await adminPage.goto(`${uiUrl}/admin/students/${fixtures.lockStudent._id}`, { waitUntil: 'domcontentloaded' });
      await adminPage.getByRole('button', { name: 'Tạm khóa tài khoản' }).click();
      const confirmDialog = adminPage.getByRole('dialog');
      await confirmDialog.getByRole('button', { name: 'Tạm khóa' }).click();
      await adminPage.getByText('Tạm khóa', { exact: true }).waitFor({ timeout: 10000 });
      const protectedRequest = await studentContext.page.evaluate(async (url) => {
        const token = localStorage.getItem('accessToken');
        const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        const body = await response.json();
        return { status: response.status, code: body.code };
      }, `${apiUrl}/api/v1/auth/me`);
      assert.equal(protectedRequest.status, 403);
      assert.equal(protectedRequest.code, 'ACCOUNT_SUSPENDED');
      await studentContext.page.reload({ waitUntil: 'domcontentloaded' });
      await studentContext.page.waitForFunction(() => window.location.pathname === '/account-status' && new URLSearchParams(window.location.search).get('status') === 'suspended', null, { timeout: 10000 });
      assert.equal(await studentContext.page.evaluate(() => localStorage.getItem('accessToken')), null);
      await studentContext.page.screenshot({ path: path.join(evidenceDir, 'account-suspended-active-session.png'), fullPage: true });
      await studentContext.context.close();
      await adminPage.getByRole('button', { name: 'Kích hoạt lại' }).click();
      await adminPage.getByRole('dialog').getByRole('button', { name: 'Kích hoạt tài khoản' }).click();
      await adminPage.getByRole('button', { name: 'Tạm khóa tài khoản' }).waitFor({ timeout: 10000 });
      const reactivatedSession = await newContext();
      await login(reactivatedSession.page, uiUrl, 'phase5.lock', 'SyntheticPhase5!2026', '/student/dashboard');
      await reactivatedSession.page.getByRole('heading', { name: 'Xin chào, Phase Five Lock Student!' }).waitFor({ timeout: 10000 });
      await reactivatedSession.context.close();
      await adminContext.close();
      return 'Suspension revoked the active session and blocked its protected API request; admin activation then allowed a fresh login.';
    });

    await runCase('PROF_01', 'Student changes password and signs in with the new password', async () => {
      const { context, page } = await newContext();
      await login(page, uiUrl, 'phase5.profile', 'SyntheticPhase5!2026', '/student/dashboard');
      await page.goto(`${uiUrl}/student/profile`, { waitUntil: 'domcontentloaded' });
      await page.getByRole('heading', { name: 'Đổi Mật Khẩu' }).waitFor({ timeout: 10000 });
      const passwordFields = page.locator('input[type="password"]');
      await passwordFields.nth(0).fill('SyntheticPhase5!2026');
      await passwordFields.nth(1).fill('SyntheticProfileNew!2026');
      await passwordFields.nth(2).fill('SyntheticProfileNew!2026');
      await page.getByRole('button', { name: 'Cập Nhật Mật Khẩu' }).click();
      await page.getByText('Đổi mật khẩu thành công!', { exact: true }).waitFor({ timeout: 10000 });
      const storedProfile = await fixtures.User.findById(fixtures.profileStudent._id).select('+password');
      assert.equal(await storedProfile.comparePassword('SyntheticProfileNew!2026'), true);
      await page.getByRole('button', { name: 'Đăng xuất' }).click();
      await page.waitForURL((url) => url.pathname === '/login', { timeout: 10000 });
      await login(page, uiUrl, 'phase5.profile', 'SyntheticProfileNew!2026', '/student/dashboard');
      await page.getByRole('heading', { name: 'Xin chào, Phase Five Profile Student!' }).waitFor({ timeout: 10000 });
      await context.close();
      return 'The current password was accepted, the new bcrypt password persisted, and the new password authenticated successfully.';
    });

    await runCase('PROF_02', 'Wrong current password is rejected without updating the hash', async () => {
      const { context, page } = await newContext();
      await login(page, uiUrl, 'phase5.profile', 'SyntheticProfileNew!2026', '/student/dashboard');
      await page.goto(`${uiUrl}/student/profile`, { waitUntil: 'domcontentloaded' });
      const passwordFields = page.locator('input[type="password"]');
      await passwordFields.nth(0).fill('WrongCurrentPassword');
      await passwordFields.nth(1).fill('AnotherProfileNew!2026');
      await passwordFields.nth(2).fill('AnotherProfileNew!2026');
      await page.getByRole('button', { name: 'Cập Nhật Mật Khẩu' }).click();
      await page.getByText('Mật khẩu hiện tại không chính xác', { exact: true }).waitFor({ timeout: 10000 });
      const storedProfile = await fixtures.User.findById(fixtures.profileStudent._id).select('+password');
      assert.equal(await storedProfile.comparePassword('SyntheticProfileNew!2026'), true);
      await context.close();
      return 'The incorrect current password was rejected and the previously accepted password remained valid.';
    });

    await runCase('REP_01', 'Admin reporting returns submitted attempt', async () => {
      const { context, page } = await newContext();
      await login(page, uiUrl, 'phase5.admin', 'SyntheticPhase5!2026', '/admin');
      await page.goto(`${uiUrl}/admin/results`, { waitUntil: 'domcontentloaded' });
      await page.getByRole('heading', { name: /Kết quả/ }).waitFor({ timeout: 10000 });
      await page.locator('#report-assessment').selectOption(String(fixtures.assessment._id));
      const resultRow = page.locator('.report-results-table tbody tr').filter({ hasText: 'Phase 5 Standard Reading Check' });
      await resultRow.waitFor({ timeout: 10000 });
      await resultRow.getByText('Phase Five Student', { exact: false }).waitFor({ timeout: 5000 });
      await page.screenshot({ path: path.join(evidenceDir, 'admin-results.png'), fullPage: true });
      await context.close();
      return 'Admin results screen listed the attempt saved by the student exam flow.';
    });

    await runCase('E2E_PRIVATE_FILE_DIRECT_URL', 'Private file URL rejects unauthenticated request', async () => {
      const response = await fetch(`${apiUrl}/uploads/private/phase5-synthetic.pdf`);
      const responseBody = await response.text();
      assert.ok([401, 403, 404].includes(response.status), `Unexpected private file status ${response.status}: ${responseBody.slice(0, 120)}`);
      return `Unauthenticated direct request was denied (HTTP ${response.status}).`;
    });

    await runCase('NON_SEC_02', 'Passwords are hashed at rest in the test database', async () => {
      const storedUser = await fixtures.User.findById(fixtures.student._id).select('+password').lean();
      assert.notEqual(storedUser.password, 'SyntheticPhase5!2026');
      assert.match(storedUser.password, /^\$2[aby]\$/);
      return 'Seeded login password is stored as a bcrypt hash, not plaintext.';
    });

    await runCase('NON_RESP_01', 'Dashboard at desktop, tablet and mobile widths', async () => {
      const { context, page } = await newContext({ width: 1440, height: 1000 });
      await login(page, uiUrl, 'phase5.student', 'SyntheticPhase5!2026', '/student/dashboard');
      const viewports = [{ width: 1920, height: 1080 }, { width: 768, height: 1024 }, { width: 375, height: 812 }, { width: 412, height: 915 }];
      const measurements = [];
      for (const viewport of viewports) {
        console.log(`[phase5-e2e] NON_RESP_01: checking ${viewport.width}x${viewport.height}`);
        await page.setViewportSize(viewport);
        await page.getByRole('heading', { name: 'Xin chào, Phase Five Student!' }).waitFor({ timeout: 10000 });
        measurements.push(await page.evaluate(() => ({ width: window.innerWidth, documentWidth: document.documentElement.scrollWidth })));
        await page.screenshot({ path: path.join(evidenceDir, `student-dashboard-${viewport.width}.png`) });
        console.log(`[phase5-e2e] NON_RESP_01: captured ${viewport.width}px viewport`);
      }
      assert.ok(measurements.every(({ width, documentWidth }) => documentWidth <= width + 1), JSON.stringify(measurements));
      await context.close();
      return `No horizontal overflow at ${measurements.map(({ width }) => `${width}px`).join(', ')} viewports.`;
    });

    await runCase('E2E_MOBILE_QUESTION_SHEET', 'Mobile question sheet opens and shows unanswered questions', async () => {
      const { context, page } = await newContext({ width: 390, height: 844 });
      await login(page, uiUrl, 'phase5.student', 'SyntheticPhase5!2026', '/student/dashboard');
      await page.goto(`${uiUrl}/student/tests/${fixtures.assessment._id}`, { waitUntil: 'domcontentloaded' });
      const resumeAttempt = page.getByRole('button', { name: 'Tiếp tục làm bài' });
      if (await resumeAttempt.isVisible().catch(() => false)) await resumeAttempt.click();
      await page.locator('.test-screen--active').waitFor({ timeout: 12000 });
      const trigger = page.getByRole('button', { name: /Danh Sách Câu/ });
      await trigger.waitFor({ timeout: 5000 });
      await trigger.click();
      await page.locator('.bottom-sheet-content').waitFor({ timeout: 5000 });
      await page.screenshot({ path: path.join(evidenceDir, 'assessment-mobile-question-sheet.png'), fullPage: true });
      await page.locator('.bottom-sheet-content .nav-tile[data-question-index="1"]').click();
      assert.equal(await page.locator('.bottom-sheet-content').count(), 0);
      await trigger.click();
      await page.locator('.bottom-sheet-content').getByRole('button', { name: 'Nộp Bài Kiểm Tra' }).click();
      await page.getByRole('heading', { name: 'Xác Nhận Nộp Bài' }).waitFor({ timeout: 5000 });
      await page.getByText(/Câu chưa trả lời: 1, 2/).waitFor({ timeout: 5000 });
      await page.screenshot({ path: path.join(evidenceDir, 'assessment-mobile-submit-warning.png'), fullPage: true });
      await context.close();
      return 'Mobile sheet navigated to a question and the submit modal listed both unanswered questions.';
    });

    environment.navigationTiming = navigationTiming;
    environment.browserConsoleErrorCount = browserConsoleErrorCount;
    environment.browserConsoleWarningCount = browserConsoleWarningCount;
    environment.browserConsoleErrorCategories = browserConsoleErrorCategories;
    environment.blockedExternalRequestCount = blockedExternalRequestCount;
    environment.browserPageErrorCount = browserPageErrorCount;
    environment.backendErrorCount = serverErrorCount;
    environment.backendErrorSamples = serverErrorSamples;
  } finally {
    console.log = originalServerLog;
    console.error = originalServerError;
  }
}

let exitCode = 0;
try {
  await main();
} catch (error) {
  exitCode = 1;
  results.push({ test_case_id: 'HARNESS', title: 'E2E harness setup', status: 'BLOCKED', actual_result: String(error?.message || 'Harness setup failed').split('\n')[0].slice(0, 300) });
  environment.harnessError = String(error?.message || 'Harness setup failed').split('\n')[0].slice(0, 300);
  environment.viteStartupOutput = viteOutput.slice(-1000);
} finally {
  try { await browser?.close(); } catch {}
  try { await new Promise((resolve) => viteProcess?.kill('SIGTERM') ? setTimeout(resolve, 500) : resolve()); } catch {}
  try { await new Promise((resolve) => backendServer?.close(resolve)); } catch {}
  try { await mongoose.disconnect(); } catch {}
  try { await mongoServer?.stop(); } catch {}
  try { process.chdir(originalCwd); } catch {}
  try { if (isolatedRoot) await fs.rm(isolatedRoot, { recursive: true, force: true }); } catch {}
  const summary = {
    generatedAt: new Date().toISOString(),
    status: exitCode ? 'BLOCKED' : results.some((result) => result.status === 'FAIL') ? 'FAIL' : results.some((result) => result.status === 'BLOCKED') ? 'BLOCKED' : 'PASS',
    passed: results.filter((result) => result.status === 'PASS').length,
    failed: results.filter((result) => result.status === 'FAIL').length,
    blocked: results.filter((result) => result.status === 'BLOCKED').length,
    results,
    environment,
  };
  await fs.mkdir(evidenceDir, { recursive: true });
  await fs.writeFile(path.join(evidenceDir, 'browser-e2e-results.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(summary, null, 2));
}
if (exitCode || results.some((result) => result.status === 'FAIL' || result.status === 'BLOCKED')) process.exitCode = 1;
