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
const apiLog = [];
const createQuestion = (index) => ({
  _id: `part5-question-${String(index).padStart(2, '0')}`,
  questionText: `Part 5 question ${String(index).padStart(2, '0')} _____.`,
  type: 'single_choice',
  toeicPart: 5,
  options: [{ id: 'A', text: 'option A' }, { id: 'B', text: 'option B' }, { id: 'C', text: 'option C' }, { id: 'D', text: 'option D' }],
  correctAnswers: ['A'],
  explanation: 'Synthetic explanation for browser UI coverage.',
  score: 1,
  topic: 'TOEIC Part 5',
  status: index === 1 ? 'published' : 'draft',
  createdAt: new Date(Date.UTC(2026, 0, 24 - index)).toISOString(),
  updatedAt: new Date(Date.UTC(2026, 0, 24 - index)).toISOString(),
});
const questions = Array.from({ length: 22 }, (_, index) => createQuestion(index + 1));
questions[0] = {
  ...questions[0],
  _id: 'part5-legacy-incomplete',
  questionText: 'Legacy incomplete question _____.',
  correctAnswers: [],
  explanation: '',
  status: 'published',
};
const foreignPart = { ...createQuestion(90), _id: 'foreign-part-1', questionText: 'DO NOT SHOW PART 1 DISTRACTOR', toeicPart: 1 };
const unclassified = { ...createQuestion(91), _id: 'unclassified-question', questionText: 'DO NOT SHOW UNCLASSIFIED DISTRACTOR', toeicPart: undefined };
let genericQuestion = null;
let viteProcess;
let browser;
let nextQuestionId = 1;

const reply = (route, status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

const wireApi = async (context, role) => {
  await context.addInitScript(() => localStorage.setItem('accessToken', 'phase4-ui-test-token'));
  await context.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = url.pathname;
    if (pathname.endsWith('/auth/me')) {
      await reply(route, 200, { status: 'success', data: { user: { _id: `phase4-${role}`, role, fullName: `Test ${role}`, email: `${role}@example.test`, status: 'active', isActive: true } } });
      return;
    }
    if (pathname.endsWith('/admin/questions') && request.method() === 'GET') {
      const query = Object.fromEntries(url.searchParams);
      apiLog.push({ role, method: 'GET', ...query });
      let filtered = role === 'admin' ? questions.filter((question) => Number(question.toeicPart) === 5) : genericQuestion ? [genericQuestion] : [];
      if (query.search) filtered = filtered.filter((question) => question.questionText.toLowerCase().includes(query.search.toLowerCase()));
      if (query.status) filtered = filtered.filter((question) => question.status === query.status);
      const total = filtered.length;
      const page = Math.max(1, Number(query.page) || 1);
      const limit = Math.max(1, Number(query.limit) || (role === 'admin' ? 20 : 100));
      const sorted = [...filtered].sort((left, right) => String(right.createdAt || '').localeCompare(String(left.createdAt || '')));
      const result = sorted.slice((page - 1) * limit, page * limit);
      if (role === 'admin' && page === 1 && !query.search && !query.status) result.push(foreignPart, unclassified);
      await reply(route, 200, { status: 'success', data: { questions: result, pagination: { total, page, pages: Math.max(1, Math.ceil(total / limit)), limit } } });
      return;
    }
    if (pathname.endsWith('/admin/questions') && request.method() === 'POST') {
      const body = request.postDataJSON();
      apiLog.push({ role, method: 'POST', body });
      if (role === 'admin') {
        const created = { _id: `created-part5-${nextQuestionId++}`, ...body, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
        questions.push(created);
        await reply(route, 201, { status: 'success', data: { question: created } });
      } else {
        genericQuestion = { _id: 'teacher-generic-question', ...body, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
        await reply(route, 201, { status: 'success', data: { question: genericQuestion } });
      }
      return;
    }
    const questionMatch = pathname.match(/^\/api\/v1\/admin\/questions\/([^/]+)$/);
    if (questionMatch && request.method() === 'PUT') {
      const body = request.postDataJSON();
      apiLog.push({ role, method: 'PUT', id: questionMatch[1], body });
      if (role === 'admin') {
        const index = questions.findIndex((question) => question._id === questionMatch[1]);
        if (index < 0) return reply(route, 404, { status: 'error', message: 'Question not found.' });
        questions[index] = { ...questions[index], ...body, _id: questionMatch[1], updatedAt: new Date().toISOString() };
        await reply(route, 200, { status: 'success', data: { question: questions[index] } });
      } else {
        genericQuestion = { ...genericQuestion, ...body, _id: questionMatch[1] };
        await reply(route, 200, { status: 'success', data: { question: genericQuestion } });
      }
      return;
    }
    if (questionMatch && request.method() === 'DELETE') {
      apiLog.push({ role, method: 'DELETE', id: questionMatch[1] });
      await reply(route, 200, { status: 'success', message: 'Question deleted.' });
      return;
    }
    await reply(route, 404, { status: 'error', code: 'MOCK_UNHANDLED', message: `No UI mock for ${request.method()} ${pathname}` });
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

const run = async () => {
  await launchVite();
  browser = await chromium.launch({ headless: true });
  const errors = [];
  const adminContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await wireApi(adminContext, 'admin');
  const page = await adminContext.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${baseUrl}/admin/questions?toeicPart=3&page=2`);
  await page.getByRole('heading', { name: 'Ngân hàng Part 5' }).waitFor();
  await page.getByRole('link', { name: 'Ngân hàng Part 5' }).waitFor();
  await page.getByText('Trang 2 / 2').waitFor();
  assert.equal(new URL(page.url()).searchParams.get('toeicPart'), '5', 'Admin URL is scoped to Part 5 even if it began with another part');
  assert.ok(apiLog.some((entry) => entry.role === 'admin' && entry.method === 'GET' && entry.toeicPart === '5' && entry.page === '2'));
  assert.equal(await page.getByText(/DO NOT SHOW/).count(), 0, 'other/unclassified Parts are hidden even when the API response includes them');

  await page.getByRole('button', { name: 'Đặt lại bộ lọc' }).click();
  await page.getByText('Trang 1 / 2').waitFor();
  assert.equal(new URL(page.url()).searchParams.get('toeicPart'), '5', 'reset retains Part 5 scope');
  await page.getByRole('button', { name: 'Sau' }).click();
  await page.getByText('Trang 2 / 2').waitFor();
  assert.ok(apiLog.some((entry) => entry.role === 'admin' && entry.method === 'GET' && entry.toeicPart === '5' && entry.page === '2'));

  await page.getByRole('combobox', { name: 'Lọc trạng thái câu hỏi' }).selectOption('draft');
  await page.waitForFunction(() => new URL(window.location.href).searchParams.get('status') === 'draft');
  await page.waitForTimeout(100);
  await page.getByText('Trang 1 / 2').waitFor();
  assert.ok(apiLog.some((entry) => entry.role === 'admin' && entry.method === 'GET' && entry.toeicPart === '5' && entry.status === 'draft'), JSON.stringify(apiLog.filter((entry) => entry.role === 'admin' && entry.method === 'GET')));
  await page.getByRole('button', { name: 'Đặt lại bộ lọc' }).click();

  await page.getByRole('button', { name: 'Thêm câu hỏi' }).click();
  const form = page.getByRole('form', { name: 'Biểu mẫu câu hỏi Part 5' });
  assert.equal(await form.locator('.admin-p5-option-row').count(), 4, 'Part 5 form always has exactly A-D');
  const createsBeforeInvalid = apiLog.filter((entry) => entry.role === 'admin' && entry.method === 'POST').length;
  await form.getByRole('button', { name: 'Tạo Bản nháp' }).click();
  await form.getByText('Vui lòng nhập nội dung câu hỏi.').waitFor();
  await form.getByText('Hãy chọn chính xác một đáp án đúng A, B, C hoặc D.').waitFor();
  await form.getByText('Vui lòng nhập lời giải thích.').waitFor();
  assert.equal(apiLog.filter((entry) => entry.role === 'admin' && entry.method === 'POST').length, createsBeforeInvalid, 'invalid form is blocked before API submission');

  await form.getByLabel('Nội dung câu hỏi').fill('Admin-created Part 5 question _____.');
  await form.getByPlaceholder('Nội dung phương án A').fill('careful');
  await form.getByPlaceholder('Nội dung phương án B').fill('carefully');
  await form.getByPlaceholder('Nội dung phương án C').fill('carefulness');
  await form.getByPlaceholder('Nội dung phương án D').fill('carefulnesses');
  await form.getByRole('radio', { name: 'Chọn B là đáp án đúng' }).check();
  await form.getByLabel('Lời giải thích').fill('A verb is modified by an adverb.');
  await form.getByRole('button', { name: 'Tạo Bản nháp' }).click();
  await page.getByText('Admin-created Part 5 question _____.').waitFor();
  const created = apiLog.findLast((entry) => entry.role === 'admin' && entry.method === 'POST');
  assert.equal(created.body.toeicPart, 5);
  assert.equal(created.body.type, 'single_choice');
  assert.deepEqual(created.body.options.map((option) => option.id), ['A', 'B', 'C', 'D']);
  assert.deepEqual(created.body.correctAnswers, ['B']);
  assert.equal(created.body.status, 'draft');
  assert.ok(created.body.explanation);

  await page.locator('tr').filter({ hasText: 'Admin-created Part 5 question _____.' }).getByRole('button', { name: 'Sửa' }).click();
  const editForm = page.getByRole('form', { name: 'Biểu mẫu câu hỏi Part 5' });
  await editForm.getByLabel('Nội dung câu hỏi').fill('Admin-updated Part 5 question _____.');
  await editForm.getByLabel('Trạng thái').selectOption('published');
  await editForm.getByRole('button', { name: 'Lưu thay đổi' }).click();
  const update = apiLog.findLast((entry) => entry.role === 'admin' && entry.method === 'PUT');
  assert.equal(update.id, created.body._id || `created-part5-${nextQuestionId - 1}`, 'editing calls update on the existing Question ID');
  assert.equal(update.body.toeicPart, 5);
  assert.equal(update.body.status, 'published');

  await page.getByLabel('Tìm câu hỏi Part 5').fill('Legacy incomplete');
  await page.getByText(/Cần hoàn thiện:.*đáp án đúng.*lời giải thích/).waitFor();
  await page.locator('tr').filter({ hasText: 'Legacy incomplete question _____.' }).getByRole('button', { name: 'Sửa' }).click();
  const legacyForm = page.getByRole('form', { name: 'Biểu mẫu câu hỏi Part 5' });
  await legacyForm.getByText(/Câu hỏi cũ đang/).waitFor();
  await legacyForm.getByLabel('Lời giải thích').fill('Admin reviewed explanation.');
  await legacyForm.getByRole('button', { name: 'Lưu thay đổi' }).click();
  await legacyForm.getByText(/Hãy chọn chính xác một đáp án đúng/).waitFor();
  assert.ok(!apiLog.some((entry) => entry.role === 'admin' && entry.method === 'PUT' && entry.id === 'part5-legacy-incomplete'), 'legacy answer is not guessed or submitted without Admin choice');

  await page.getByRole('button', { name: 'Hủy' }).click();
  await page.getByLabel('Tìm câu hỏi Part 5').fill('');
  await page.getByRole('link', { name: 'Import Excel' }).click();
  await page.getByRole('heading', { name: 'Import Excel Part 5' }).waitFor();
  const backHref = await page.getByRole('link', { name: '← Ngân hàng Part 5' }).getAttribute('href');
  assert.equal(new URL(backHref, baseUrl).searchParams.get('toeicPart'), '5');
  assert.equal(await page.getByRole('link', { name: 'Mở Ngân hàng Part 5 · Bản nháp' }).count(), 0, 'Draft destination appears after an import result, not before confirm');

  const teacherContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await wireApi(teacherContext, 'teacher');
  const teacherPage = await teacherContext.newPage();
  await teacherPage.goto(`${baseUrl}/admin/questions`);
  await teacherPage.getByRole('heading', { name: 'Ngân hàng câu hỏi' }).waitFor();
  assert.equal(await teacherPage.getByRole('link', { name: 'Import Excel' }).count(), 0);
  await teacherPage.getByRole('button', { name: 'Thêm câu hỏi' }).click();
  const teacherForm = teacherPage.getByRole('form', { name: 'Biểu mẫu câu hỏi' });
  await teacherForm.getByLabel('Nội dung câu hỏi').fill('Teacher generic question.');
  await teacherForm.getByPlaceholder('Lựa chọn 1').fill('Yes');
  await teacherForm.getByPlaceholder('Lựa chọn 2').fill('No');
  await teacherForm.getByRole('radio', { name: 'Đáp án đúng a' }).check();
  await teacherForm.getByRole('button', { name: 'Lưu câu hỏi' }).click();
  const teacherCreate = apiLog.findLast((entry) => entry.role === 'teacher' && entry.method === 'POST');
  assert.equal(teacherCreate.body.options.length, 2, 'Teacher generic question behavior remains available');
  assert.equal(Object.hasOwn(teacherCreate.body, 'toeicPart'), false, 'Teacher form does not force Part 5');
  assert.ok(apiLog.some((entry) => entry.role === 'teacher' && entry.method === 'GET' && !Object.hasOwn(entry, 'toeicPart')));
  await teacherContext.close();

  const studentContext = await browser.newContext();
  await wireApi(studentContext, 'student');
  const studentPage = await studentContext.newPage();
  await studentPage.goto(`${baseUrl}/admin/questions`);
  await studentPage.waitForFunction(() => window.location.pathname === '/student/dashboard', null, { timeout: 10000 });
  assert.ok(!apiLog.some((entry) => entry.role === 'student' && entry.method === 'GET'), 'Student does not reach the admin bank API');
  await studentContext.close();

  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  await wireApi(mobileContext, 'admin');
  const mobilePage = await mobileContext.newPage();
  await mobilePage.goto(`${baseUrl}/admin/questions?toeicPart=5`);
  await mobilePage.getByRole('heading', { name: 'Ngân hàng Part 5' }).waitFor();
  const dimensions = await mobilePage.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
  assert.ok(dimensions.scrollWidth <= dimensions.clientWidth + 1, `mobile bank overflows horizontally: ${JSON.stringify(dimensions)}`);
  await mobileContext.close();

  assert.deepEqual(errors, [], 'no browser page errors');
  console.log(JSON.stringify({
    result: 'PASS',
    checks: [
      'Admin Part 5 label and forced query scope', 'reset/search/status/pagination scope', 'defensive hiding of other and unclassified Parts',
      'four-option create and field validation', 'same-ID update and per-question publish status', 'legacy warning without answer inference',
      'Import route and Draft destination contract', 'Teacher generic CRUD and Student route guard', 'mobile no-overflow check',
    ],
    adminQuestionRequests: apiLog.filter((entry) => entry.role === 'admin' && entry.method === 'GET').length,
    viewport: dimensions,
  }, null, 2));
};

try {
  await run();
} finally {
  if (browser) await browser.close().catch(() => {});
  if (viteProcess && viteProcess.exitCode === null) {
    viteProcess.kill('SIGTERM');
    await Promise.race([new Promise((resolve) => viteProcess.once('exit', resolve)), new Promise((resolve) => setTimeout(resolve, 5000))]);
    if (viteProcess.exitCode === null) viteProcess.kill('SIGKILL');
  }
}
