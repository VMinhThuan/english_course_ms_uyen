import assert from 'node:assert/strict';
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(scriptDir, '..');
const projectRoot = path.resolve(frontendRoot, '..');
const backendRoot = path.join(projectRoot, 'backend');
const frontendRequire = createRequire(path.join(frontendRoot, 'package.json'));
const backendRequire = createRequire(path.join(backendRoot, 'package.json'));
const { chromium } = frontendRequire('playwright');
const { MongoMemoryServer } = backendRequire('mongodb-memory-server');
const mongoose = backendRequire('mongoose');
const express = backendRequire('express');
const cors = backendRequire('cors');
const jwt = backendRequire('jsonwebtoken');
const openPort = () => new Promise((resolve, reject) => {
  const server = net.createServer();
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const available = server.address().port;
    server.close(() => resolve(available));
  });
});

const frontendPort = await openPort();
const apiPort = await openPort();
const frontendUrl = `http://127.0.0.1:${frontendPort}`;
const apiUrl = `http://127.0.0.1:${apiPort}`;
const databaseName = `phase5_picker_e2e_${crypto.randomUUID().replaceAll('-', '')}`;
const originalJwtSecret = process.env.JWT_SECRET;
const originalNodeEnv = process.env.NODE_ENV;
const testJwtSecret = `phase5-picker-e2e-${crypto.randomUUID()}`;
let mongoServer;
let apiServer;
let viteProcess;
let browser;
let setupError;

try {
  assert.equal(mongoose.connection.readyState, 0, 'real-backend browser E2E requires its own disposable database');
  mongoServer = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1', dbName: databaseName } });
  const mongoUri = mongoServer.getUri(databaseName);
  assert.equal(new URL(mongoUri).hostname, '127.0.0.1');
  assert.equal(new URL(mongoUri).pathname.replaceAll('/', ''), databaseName);
  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000, autoIndex: true });
  process.env.JWT_SECRET = testJwtSecret;
  process.env.NODE_ENV = 'test';

  const [
    { default: User },
    { default: Question },
    { default: Assessment },
    { default: QuestionGroup },
    { default: Attempt },
    { default: QuestionBankSelectionBatch },
    { adminToeicRoutes },
    { errorHandler },
  ] = await Promise.all([
    import(pathToFileURL(path.join(backendRoot, 'src/models/User.js')).href),
    import(pathToFileURL(path.join(backendRoot, 'src/models/Question.js')).href),
    import(pathToFileURL(path.join(backendRoot, 'src/models/Assessment.js')).href),
    import(pathToFileURL(path.join(backendRoot, 'src/models/QuestionGroup.js')).href),
    import(pathToFileURL(path.join(backendRoot, 'src/models/Attempt.js')).href),
    import(pathToFileURL(path.join(backendRoot, 'src/models/QuestionBankSelectionBatch.js')).href),
    import(pathToFileURL(path.join(backendRoot, 'src/routes/toeicRoutes.js')).href),
    import(pathToFileURL(path.join(backendRoot, 'src/middlewares/errorHandler.js')).href),
  ]);
  await Promise.all([User.init(), Question.init(), Assessment.init(), QuestionGroup.init(), Attempt.init(), QuestionBankSelectionBatch.init()]);

  const admin = await User.create({
    email: `picker-e2e-${databaseName}@example.test`,
    password: 'synthetic-admin-password',
    role: 'admin',
    status: 'active',
    isActive: true,
  });
  const token = jwt.sign({ userId: admin._id }, testJwtSecret, { expiresIn: '10m' });
  const assessment = await Assessment.create({
    title: 'Real backend Part 5 picker check',
    type: 'exam',
    examFormat: 'toeic',
    toeicMode: 'mini_test',
    status: 'draft',
    durationMinutes: 30,
    createdBy: admin._id,
  });
  const source = await Question.create({
    questionText: 'The updated catalog _____ available next week.',
    type: 'single_choice',
    explanation: 'A singular subject takes the singular present verb.',
    options: [
      { id: 'A', text: 'become' }, { id: 'B', text: 'becomes' }, { id: 'C', text: 'becoming' }, { id: 'D', text: 'became' },
    ],
    correctAnswers: ['B'],
    score: 1,
    status: 'published',
    toeicPart: 5,
    createdBy: admin._id,
  });

  const api = express();
  api.use(cors({ origin: frontendUrl, credentials: true }));
  api.use(express.json({ limit: '1mb' }));
  api.use('/api/v1/admin', adminToeicRoutes);
  api.use(errorHandler);
  apiServer = api.listen(apiPort, '127.0.0.1');
  await new Promise((resolve, reject) => {
    apiServer.once('listening', resolve);
    apiServer.once('error', reject);
  });

  viteProcess = spawn(process.execPath, [path.join(frontendRoot, 'node_modules', 'vite', 'bin', 'vite.js'), '--host', '127.0.0.1', '--port', String(frontendPort), '--strictPort'], {
    cwd: frontendRoot,
    env: { ...process.env, VITE_API_URL: `${apiUrl}/api/v1`, BROWSER: 'none' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let viteOutput = '';
  viteProcess.stdout.on('data', (chunk) => { viteOutput += chunk.toString(); });
  viteProcess.stderr.on('data', (chunk) => { viteOutput += chunk.toString(); });
  const viteStartedAt = Date.now();
  while (Date.now() - viteStartedAt < 30000) {
    if (viteProcess.exitCode !== null) throw new Error(`Vite exited before ready: ${viteOutput}`);
    try { if ((await fetch(frontendUrl)).ok) break; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.ok(Date.now() - viteStartedAt < 30000, `Vite did not start: ${viteOutput}`);

  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1365, height: 950 } });
  await context.addInitScript((accessToken) => localStorage.setItem('accessToken', accessToken), token);
  await context.route('**/api/v1/auth/me', (route) => route.request().method() === 'GET'
    ? route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'success', data: { user: { _id: String(admin._id), role: 'admin', fullName: 'Synthetic Admin', email: admin.email, status: 'active', isActive: true } } }),
      })
    : route.continue());
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(`${frontendUrl}/admin/toeic-tests/${assessment._id}/edit`);
  await page.getByRole('heading', { name: assessment.title }).waitFor();
  await page.getByRole('button', { name: /Part 5:/ }).click();
  await page.getByRole('button', { name: 'Chọn câu từ Ngân hàng Part 5' }).click();
  const dialog = page.getByRole('dialog', { name: 'Chọn câu từ Ngân hàng Part 5' });
  await dialog.getByText(source.questionText).waitFor();
  await dialog.getByText(source.explanation).waitFor();
  await dialog.getByLabel('Chọn câu này').check();
  await dialog.getByRole('button', { name: 'Thêm 1 câu vào đề' }).click();
  await dialog.getByText('Đã thêm', { exact: true }).waitFor();
  await page.getByText('Hiện có 1 câu hỏi trong 1 nhóm của Part này.').waitFor();

  const savedAssessment = await Assessment.findById(assessment._id).lean();
  const savedGroup = await QuestionGroup.findOne({ assessment: assessment._id, partNumber: 5 }).lean();
  const savedClone = await Question.findOne({ bankTargetAssessmentId: assessment._id }).select('+bankSourceQuestionId +bankTargetAssessmentId +bankSourceSelectionBatchId').lean();
  const unchangedSource = await Question.findById(source._id).lean();
  assert.equal(savedAssessment.questions.length, 1);
  assert.equal(savedGroup.questionIds.length, 1);
  assert.equal(String(savedClone.bankSourceQuestionId), String(source._id));
  assert.equal(String(savedClone.questionGroup), String(savedGroup._id));
  assert.equal(savedClone.status, 'published');
  assert.equal(unchangedSource.questionGroup, undefined);
  assert.deepEqual(unchangedSource.correctAnswers, ['B']);
  assert.equal(await QuestionBankSelectionBatch.countDocuments({ assessment: assessment._id, status: 'completed' }), 1);
  assert.equal(pageErrors.length, 0, pageErrors.join('\n'));
  console.log(JSON.stringify({ status: 'passed', database: 'disposable loopback MongoMemoryServer', checks: ['real Admin auth guard', 'real eligible list endpoint', 'real selection endpoint', 'real Question clone/provenance', 'Assessment and QuestionGroup references', 'source Question unchanged', 'browser renders server response'] }));
} catch (error) {
  setupError = error;
  throw error;
} finally {
  if (browser) await browser.close();
  if (viteProcess && viteProcess.exitCode === null) {
    viteProcess.kill('SIGTERM');
    await new Promise((resolve) => viteProcess.once('exit', resolve));
  }
  if (apiServer?.listening) await new Promise((resolve) => apiServer.close(resolve));
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect().catch(() => {});
  if (mongoServer) await mongoServer.stop().catch(() => {});
  if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = originalJwtSecret;
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;
}
