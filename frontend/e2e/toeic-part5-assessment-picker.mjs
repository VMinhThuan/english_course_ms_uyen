import assert from 'node:assert/strict';
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(scriptDir, '..');
const requireFrontend = createRequire(path.join(frontendRoot, 'package.json'));
const { chromium } = requireFrontend('playwright');
const port = await new Promise((resolve, reject) => {
  const server = net.createServer();
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const available = server.address().port;
    server.close(() => resolve(available));
  });
});
const baseUrl = `http://127.0.0.1:${port}`;
const assessmentId = 'assessment-picker-0001';
const sourceQuestions = Array.from({ length: 11 }, (_, index) => ({
  _id: `source-question-${String(index + 1).padStart(4, '0')}`,
  questionText: `Needle question ${index + 1}: The team _____ on Mondays.`,
  type: 'single_choice',
  toeicPart: 5,
  status: 'published',
  options: [
    { id: 'A', text: 'meet' }, { id: 'B', text: 'meets' }, { id: 'C', text: 'meeting' }, { id: 'D', text: 'met' },
  ],
  correctAnswers: ['B'],
  explanation: 'The singular subject takes the present-tense verb ending in -s.',
  alreadyInAssessment: false,
}));
let assessment = {
  _id: assessmentId,
  title: 'Synthetic TOEIC assessment',
  description: '',
  type: 'exam',
  examFormat: 'toeic',
  toeicMode: 'mini_test',
  status: 'draft',
  durationMinutes: 30,
  attemptLimit: 0,
  showCorrectAnswers: true,
  questions: [],
  questionGroups: [],
  parts: [],
};
let viteProcess;
let browser;
let releasePost;
let postStarted;
let markPostStarted;
let postRequest;
const postStartedPromise = new Promise((resolve) => { markPostStarted = resolve; });
const postGate = new Promise((resolve) => { releasePost = resolve; });
const apiLog = [];

const reply = (route, status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

const wireApi = async (context, role = 'admin') => {
  await context.addInitScript(() => localStorage.setItem('accessToken', 'phase5-assessment-picker-token'));
  await context.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = url.pathname;
    if (pathname.endsWith('/auth/me')) {
      await reply(route, 200, { status: 'success', data: { user: { _id: `picker-${role}`, role, fullName: 'Picker Admin', email: `${role}@example.test`, status: 'active', isActive: true } } });
      return;
    }
    if (pathname === `/api/v1/admin/toeic-tests/${assessmentId}` && request.method() === 'GET') {
      await reply(route, 200, { status: 'success', data: { assessment } });
      return;
    }
    if (pathname === `/api/v1/admin/toeic-tests/${assessmentId}/question-bank/part5` && request.method() === 'GET') {
      const query = Object.fromEntries(url.searchParams);
      apiLog.push({ kind: 'eligible-list', query });
      let filtered = sourceQuestions;
      if (query.search) filtered = filtered.filter((question) => question.questionText.toLowerCase().includes(query.search.toLowerCase()));
      const page = Number(query.page) || 1;
      const limit = Number(query.limit) || 10;
      const questions = filtered.slice((page - 1) * limit, page * limit);
      await reply(route, 200, { status: 'success', data: { questions, pagination: { total: filtered.length, page, pages: Math.max(1, Math.ceil(filtered.length / limit)), limit } } });
      return;
    }
    if (pathname === `/api/v1/admin/toeic-tests/${assessmentId}/question-bank/part5/selections` && request.method() === 'POST') {
      postRequest = { body: request.postDataJSON(), headers: request.headers() };
      apiLog.push({ kind: 'select', ...postRequest });
      postStarted = true;
      markPostStarted();
      await postGate;
      const source = sourceQuestions.find((question) => question._id === postRequest.body.questionIds[0]);
      const clone = {
        ...source,
        _id: 'assessment-clone-0001',
        questionNumber: 1,
        order: 1,
        questionGroup: 'assessment-group-0001',
      };
      assessment = {
        ...assessment,
        questions: [{ question: clone._id, score: 1 }],
        questionGroups: [{
          _id: 'assessment-group-0001', partNumber: 5, type: 'single', title: 'Câu hỏi từ Ngân hàng Part 5', order: 1, questionIds: [clone],
        }],
      };
      await reply(route, 200, { status: 'success', data: {
        batch: { _id: 'selection-batch-0001', status: 'completed' },
        results: [{ sourceQuestionId: source._id, questionId: clone._id, status: 'ADDED', code: 'ADDED', issues: [] }],
        assessment,
      } });
      return;
    }
    await reply(route, 404, { status: 'error', code: 'MOCK_UNHANDLED', message: `No mock for ${request.method()} ${pathname}` });
  });
};

const launchVite = async () => {
  viteProcess = spawn(process.execPath, [path.join(frontendRoot, 'node_modules', 'vite', 'bin', 'vite.js'), '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    cwd: frontendRoot,
    env: { ...process.env, BROWSER: 'none' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  viteProcess.stdout.on('data', (chunk) => { output += chunk.toString(); });
  viteProcess.stderr.on('data', (chunk) => { output += chunk.toString(); });
  const startedAt = Date.now();
  while (Date.now() - startedAt < 30000) {
    if (viteProcess.exitCode !== null) throw new Error(`Vite exited before ready: ${output}`);
    try { if ((await fetch(baseUrl)).ok) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for Vite: ${output}`);
};

try {
  await launchVite();
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1365, height: 950 } });
  await wireApi(context, 'admin');
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(`${baseUrl}/admin/toeic-tests/${assessmentId}/edit`);
  await page.getByRole('heading', { name: 'Synthetic TOEIC assessment' }).waitFor();
  await page.getByRole('button', { name: /Part 5:/ }).click();
  await page.getByRole('button', { name: 'Chọn câu từ Ngân hàng Part 5' }).click();
  const dialog = page.getByRole('dialog', { name: 'Chọn câu từ Ngân hàng Part 5' });
  await dialog.waitFor();
  await dialog.getByRole('searchbox', { name: 'Tìm nội dung câu hỏi' }).fill('Needle');
  await dialog.getByText('Trang 1 / 2').waitFor();
  assert.ok(apiLog.some((entry) => entry.kind === 'eligible-list' && entry.query.search === 'Needle' && entry.query.page === '1'));
  await dialog.getByRole('button', { name: 'Sau' }).click();
  await dialog.getByText('Trang 2 / 2').waitFor();
  await dialog.getByText('Needle question 11:', { exact: false }).waitFor();
  await dialog.getByText('The singular subject takes the present-tense verb ending in -s.').waitFor();
  await dialog.getByLabel('Chọn câu này').check();
  await dialog.getByRole('button', { name: 'Thêm 1 câu vào đề' }).click();
  await postStartedPromise;
  await dialog.getByText('Đang thêm...').waitFor();
  await page.getByText('Hiện có 0 câu hỏi trong 0 nhóm của Part này.').waitFor();
  assert.equal(postStarted, true);
  releasePost();
  await dialog.getByText('Đã thêm', { exact: true }).waitFor();
  await page.getByText('Hiện có 1 câu hỏi trong 1 nhóm của Part này.').waitFor();
  assert.equal(postRequest.body.questionIds.length, 1);
  assert.equal(postRequest.body.questionIds[0], sourceQuestions[10]._id);
  assert.ok(postRequest.headers['idempotency-key']);
  assert.equal(pageErrors.length, 0, pageErrors.join('\n'));

  const teacherContext = await browser.newContext({ viewport: { width: 1365, height: 950 } });
  await wireApi(teacherContext, 'teacher');
  const teacherPage = await teacherContext.newPage();
  await teacherPage.goto(`${baseUrl}/admin/toeic-tests/${assessmentId}/edit`);
  await teacherPage.getByRole('heading', { name: 'Synthetic TOEIC assessment' }).waitFor();
  await teacherPage.getByRole('button', { name: /Part 5:/ }).click();
  assert.equal(await teacherPage.getByRole('button', { name: 'Chọn câu từ Ngân hàng Part 5' }).count(), 0, 'Teacher retains legacy Builder but does not see the new bank picker');
  await teacherContext.close();
  console.log(JSON.stringify({ status: 'passed', checks: ['admin picker', 'search', 'pagination', 'A-D answer and explanation display', 'server-confirmed update', 'idempotency header', 'no page errors'] }));
} finally {
  releasePost?.();
  if (browser) await browser.close();
  if (viteProcess && viteProcess.exitCode === null) {
    viteProcess.kill('SIGTERM');
    await new Promise((resolve) => viteProcess.once('exit', resolve));
  }
}
