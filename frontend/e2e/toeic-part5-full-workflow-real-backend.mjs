import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { deflateRawSync } from 'node:zlib';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(scriptDir, '..');
const projectRoot = path.resolve(frontendRoot, '..');
const backendRoot = path.join(projectRoot, 'backend');
const frontendRequire = createRequire(path.join(frontendRoot, 'package.json'));
const backendRequire = createRequire(path.join(backendRoot, 'package.json'));
const { chromium } = frontendRequire('playwright');
const { MongoMemoryServer } = backendRequire('mongodb-memory-server');
const mongoose = backendRequire('mongoose');

const unique = randomUUID().replaceAll('-', '');
const databaseName = `p5_fullflow_${unique}`;
const password = `test-${randomUUID()}`;
const adminEmail = `p5-admin-${unique}@example.test`;
const teacherEmail = `p5-teacher-${unique}@example.test`;
const studentEmail = `p5-student-${unique}@example.test`;
const testWorkbookPath = path.join(projectRoot, 'local-assets', 'toeic-part5', 'toeic.xlsx');
const evidenceDir = process.env.PHASE6A_1_EVIDENCE_DIR
  ? path.resolve(projectRoot, process.env.PHASE6A_1_EVIDENCE_DIR)
  : path.join(projectRoot, 'docs', 'toeic-part5', 'phase6', 'evidence');

let mongoServer;
let backendServer;
let viteProcess;
let browser;
let backendOrigin;
let frontendOrigin;
let models;
const apiResponses = [];
const apiErrors = [];

const getPort = () => new Promise((resolve, reject) => {
  const server = net.createServer();
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const port = server.address().port;
    server.close(() => resolve(port));
  });
});

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let value = n;
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[n] = value >>> 0;
  }
  return table;
})();

const crc32 = (buffer) => {
  let value = 0xffffffff;
  for (const byte of buffer) value = crcTable[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
};

const zipEntries = (entries) => {
  const localParts = [];
  const centralParts = [];
  let localOffset = 0;
  for (const [name, contents] of entries) {
    const nameBytes = Buffer.from(name, 'utf8');
    const data = Buffer.isBuffer(contents) ? contents : Buffer.from(contents, 'utf8');
    const compressed = deflateRawSync(data);
    const checksum = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    localParts.push(local, nameBytes, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(localOffset, 42);
    centralParts.push(central, nameBytes);
    localOffset += local.length + nameBytes.length + compressed.length;
  }
  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(localOffset, 16);
  return Buffer.concat([...localParts, centralDirectory, end]);
};

const xmlEscape = (value) => String(value)
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&apos;');

const columnName = (number) => {
  let value = number;
  let name = '';
  while (value > 0) {
    const remainder = (value - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    value = Math.floor((value - 1) / 26);
  }
  return name;
};

const makeSyntheticXlsx = () => {
  const rows = [
    ['The manager _____ the report.', 'carefully', 'quickly', 'careful', 'carelessness', 'A', 'An adverb modifies the verb.'],
    ['The manager _____ the report.', 'carefully', 'quickly', 'careful', 'carelessness', 'A', 'An adverb modifies the verb.'],
    ['The office _____ at nine.', 'opens', 'opening', 'open', 'opened', '', 'A present-tense verb completes the sentence.'],
  ];
  const allRows = [['Câu hỏi', 'A', 'B', 'C', 'D', 'Đáp án đúng', 'Lời giải thích'], ...rows];
  const worksheetRows = allRows.map((values, rowIndex) => `<row r="${rowIndex + 1}">${values.map((value, columnIndex) => `<c r="${columnName(columnIndex + 1)}${rowIndex + 1}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`).join('')}</row>`).join('');
  const worksheetXml = `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:G4"/><sheetData>${worksheetRows}</sheetData></worksheet>`;
  const contentTypes = `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/></Types>`;
  const workbook = `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="TOEIC" sheetId="1" r:id="rId1"/></sheets></workbook>`;
  const relationships = `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`;
  return zipEntries([
    ['[Content_Types].xml', contentTypes],
    ['xl/workbook.xml', workbook],
    ['xl/_rels/workbook.xml.rels', relationships],
    ['xl/worksheets/sheet1.xml', worksheetXml],
  ]);
};

const startVite = async (port) => {
  viteProcess = spawn(process.execPath, [path.join(frontendRoot, 'node_modules', 'vite', 'bin', 'vite.js'), '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    cwd: frontendRoot,
    env: { ...process.env, BROWSER: 'none', VITE_API_URL: `${backendOrigin}/api/v1` },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  viteProcess.stdout.on('data', (chunk) => { output += chunk.toString(); });
  viteProcess.stderr.on('data', (chunk) => { output += chunk.toString(); });
  const startedAt = Date.now();
  while (Date.now() - startedAt < 30000) {
    if (viteProcess.exitCode !== null) throw new Error(`Vite exited before ready: ${output}`);
    try { if ((await fetch(frontendOrigin)).ok) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for Vite: ${output}`);
};

const apiLogin = async (email) => {
  const response = await fetch(`${backendOrigin}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(response.status, 200, `test role login failed for ${email}`);
  const json = await response.json();
  return json.data.accessToken;
};

const apiRequest = async (token, route, init = {}) => fetch(`${backendOrigin}/api/v1${route}`, {
  ...init,
  headers: { ...(init.headers || {}), authorization: `Bearer ${token}`, ...(init.body ? { 'content-type': 'application/json' } : {}) },
});

const assertNoHorizontalOverflow = async (page, label) => {
  const sizes = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }));
  assert.ok(sizes.content <= sizes.viewport + 1, `${label} overflows horizontally: ${JSON.stringify(sizes)}`);
  return sizes;
};

const createAssessmentThroughUi = async (page, title) => {
  await page.goto(`${frontendOrigin}/admin/toeic-tests/new`);
  await page.locator('input[placeholder^="Ví dụ: ETS TOEIC"]').fill(title);
  await page.locator('select').first().selectOption('mini_test');
  await page.locator('input[type="number"]').first().fill('5');
  await page.getByRole('button', { name: /Tạo Đề & Bắt Đầu Xây Dựng Câu Hỏi/ }).click();
  await page.waitForURL(/\/admin\/toeic-tests\/[^/]+\/edit/, { timeout: 20000 });
  await page.getByRole('button', { name: /Part 5:/ }).waitFor({ timeout: 20000 });
  const match = page.url().match(/\/admin\/toeic-tests\/([^/]+)\/edit/);
  assert.ok(match, 'Assessment Builder did not navigate to the created Draft');
  return match[1];
};

const runCustomerWorkbookPreview = process.env.PHASE6B_RUN_ACTUAL_WORKBOOK === 'true';

const main = async () => {
  assert.equal(mongoose.connection.readyState, 0, 'full workflow E2E requires a fresh isolated database connection');
  const recoveryChecks = {};
  if (runCustomerWorkbookPreview) await fs.access(testWorkbookPath);
  mongoServer = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1', dbName: databaseName } });
  const mongoUri = mongoServer.getUri(databaseName);
  assert.equal(new URL(mongoUri).hostname, '127.0.0.1', 'test MongoDB must bind to loopback only');
  assert.equal(new URL(mongoUri).pathname.replaceAll('/', ''), databaseName, 'test database name must be unique');

  process.env.MONGODB_URI = mongoUri;
  process.env.JWT_SECRET = `p5-fullflow-${unique}`;
  process.env.JWT_REFRESH_SECRET = `p5-fullflow-refresh-${unique}`;
  process.env.NODE_ENV = 'test';
  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000, autoIndex: true });

  const [{ default: app }, userModule, questionModule, assessmentModule, groupModule, attemptModule, importBatchModule, importRowModule, selectionBatchModule] = await Promise.all([
    import(pathToFileURL(path.join(backendRoot, 'src/app.js')).href),
    import(pathToFileURL(path.join(backendRoot, 'src/models/User.js')).href),
    import(pathToFileURL(path.join(backendRoot, 'src/models/Question.js')).href),
    import(pathToFileURL(path.join(backendRoot, 'src/models/Assessment.js')).href),
    import(pathToFileURL(path.join(backendRoot, 'src/models/QuestionGroup.js')).href),
    import(pathToFileURL(path.join(backendRoot, 'src/models/Attempt.js')).href),
    import(pathToFileURL(path.join(backendRoot, 'src/models/QuestionImportBatch.js')).href),
    import(pathToFileURL(path.join(backendRoot, 'src/models/QuestionImportRow.js')).href),
    import(pathToFileURL(path.join(backendRoot, 'src/models/QuestionBankSelectionBatch.js')).href),
  ]);
  models = {
    User: userModule.default,
    Question: questionModule.default,
    Assessment: assessmentModule.default,
    QuestionGroup: groupModule.default,
    Attempt: attemptModule.default,
    QuestionImportBatch: importBatchModule.default,
    QuestionImportRow: importRowModule.default,
    QuestionBankSelectionBatch: selectionBatchModule.default,
  };
  await Promise.all(Object.values(models).map((model) => model.init()));

  const [admin, teacher, student] = await Promise.all([
    models.User.create({ email: adminEmail, password, role: 'admin', status: 'active', isActive: true, fullName: 'Synthetic Admin' }),
    models.User.create({ email: teacherEmail, password, role: 'teacher', status: 'active', isActive: true, fullName: 'Synthetic Teacher' }),
    models.User.create({ email: studentEmail, password, role: 'student', status: 'active', isActive: true, fullName: 'Synthetic Student' }),
  ]);

  const backendPort = await getPort();
  const frontendPort = await getPort();
  backendOrigin = `http://127.0.0.1:${backendPort}`;
  frontendOrigin = `http://127.0.0.1:${frontendPort}`;
  backendServer = app.listen(backendPort, '127.0.0.1');
  await new Promise((resolve, reject) => { backendServer.once('listening', resolve); backendServer.once('error', reject); });
  await startVite(frontendPort);

  browser = await chromium.launch({ headless: true });
  const adminContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const adminPage = await adminContext.newPage();
  adminPage.setDefaultTimeout(15000);
  const browserErrors = [];
  adminPage.on('pageerror', (error) => browserErrors.push(error.message));
  adminPage.on('response', (response) => {
    const url = new URL(response.url());
    if (url.pathname.startsWith('/api/v1/')) {
      apiResponses.push({ method: response.request().method(), path: url.pathname, status: response.status() });
      if (response.status() >= 400) response.json().then((body) => apiErrors.push({ path: url.pathname, status: response.status(), code: body.code, message: body.message })).catch(() => {});
    }
  });

  // Step 1: Admin signs in against the real auth route.
  await adminPage.goto(`${frontendOrigin}/login`);
  await adminPage.getByLabel('Email hoặc tên đăng nhập').fill(adminEmail);
  await adminPage.getByRole('textbox', { name: 'Mật khẩu' }).fill(password);
  await adminPage.getByRole('button', { name: /Đăng nhập/ }).click();
  await adminPage.waitForURL(/\/admin(?:\/|$)/, { timeout: 20000 });

  if (runCustomerWorkbookPreview) {
    // Step 2: preview the actual customer workbook in the one-use test database only.
    await adminPage.goto(`${frontendOrigin}/admin/questions/import-part5`);
    await adminPage.locator('input[type="file"]').setInputFiles(testWorkbookPath);
    await adminPage.getByRole('button', { name: 'Phân tích file' }).click();
    await adminPage.getByRole('heading', { name: 'toeic.xlsx' }).waitFor({ timeout: 30000 });
    await adminPage.locator('.p5-import__summary .p5-import__metric strong').nth(5).waitFor({ timeout: 15000 });
    const realMetrics = await adminPage.locator('.p5-import__summary .p5-import__metric strong').allTextContents();
    assert.deepEqual(realMetrics.slice(0, 5), ['75', '68', '7', '0', '0'], `real workbook preview metrics missing or changed: ${JSON.stringify({ realMetrics, apiResponses: apiResponses.slice(-8), pageUrl: adminPage.url(), summaryCount: await adminPage.locator('.p5-import__summary').count() })}`);
    const realBatchId = new URL(adminPage.url()).searchParams.get('batchId');
    assert.ok(realBatchId, 'actual workbook preview must be persisted as a test-only ImportBatch');
    const realRows = await models.QuestionImportRow.find({ batchId: realBatchId }).lean();
    assert.equal(realRows.length, 75);
    assert.equal(realRows.filter((row) => row.status === 'VALID').length, 68);
    assert.equal(realRows.filter((row) => row.status === 'INVALID').length, 7);
    assert.deepEqual(realRows.filter((row) => row.status === 'INVALID').map((row) => row.rowNumber).sort((a, b) => a - b), [61, 65, 68, 71, 72, 73, 74]);
    assert.ok(realRows.filter((row) => row.status === 'INVALID').every((row) => row.issues.some((issue) => issue.code === 'MISSING_ANSWER')));
    assert.equal(await models.Question.countDocuments({}), 0, 'customer workbook Preview must not create Questions');
    assert.equal(await models.Assessment.countDocuments({}), 0, 'customer workbook Preview must not create Assessments');
    assert.equal(await models.QuestionGroup.countDocuments({}), 0, 'customer workbook Preview must not create QuestionGroups');
    assert.equal(await models.Attempt.countDocuments({}), 0, 'customer workbook Preview must not create Attempts');

  } else {
    console.log('[phase6b] Customer workbook preview skipped; only synthetic workbook fixtures are enabled.');
  }

  // Seed malformed legacy records only in this disposable DB for picker eligibility checks.
  const legacyQuestion = (overrides) => ({
    questionText: 'Legacy incomplete fixture.',
    type: 'single_choice',
    options: [{ id: 'A', text: 'one' }, { id: 'B', text: 'two' }, { id: 'C', text: 'three' }, { id: 'D', text: 'four' }],
    correctAnswers: ['A'], explanation: 'Synthetic explanation.', score: 1, status: 'published', toeicPart: 5, createdBy: admin._id,
    ...overrides,
  });
  await models.Question.create([
    legacyQuestion({ questionText: 'Legacy missing answer.', correctAnswers: [] }),
    legacyQuestion({ questionText: 'Legacy missing explanation.', explanation: '' }),
    legacyQuestion({ questionText: 'Other TOEIC part fixture.', toeicPart: 6 }),
  ]);

  const studentToken = await apiLogin(studentEmail);
  const teacherToken = await apiLogin(teacherEmail);

  // Step 3–9: synthetic workbook drives actual import UI/API; edit the invalid row before Confirm.
  await adminPage.setViewportSize({ width: 390, height: 844 });
  await adminPage.goto(`${frontendOrigin}/admin/questions/import-part5`);
  await adminPage.locator('input[type="file"]').setInputFiles({
    name: 'phase6-synthetic-part5.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: makeSyntheticXlsx(),
  });
  await adminPage.getByRole('button', { name: 'Phân tích file' }).click();
  await adminPage.getByRole('heading', { name: 'phase6-synthetic-part5.xlsx' }).waitFor({ timeout: 20000 });
  await adminPage.locator('.p5-import__summary .p5-import__metric strong').nth(5).waitFor({ timeout: 15000 });
  assert.deepEqual(await adminPage.locator('.p5-import__summary .p5-import__metric strong').allTextContents(), ['3', '1', '1', '0', '1', '0']);
  await adminPage.getByText('MISSING_ANSWER').waitFor();
  const editRow = adminPage.locator('.p5-import__row').filter({ hasText: 'Dòng Excel 4' });
  await editRow.getByRole('button', { name: 'Sửa dòng' }).click();
  const editDialog = adminPage.getByRole('dialog', { name: 'Chỉnh sửa dòng Excel 4' });
  await editDialog.waitFor();
  const editBounds = await editDialog.boundingBox();
  assert.ok(editBounds && editBounds.width <= 390, 'import edit dialog must fit mobile viewport');
  await editDialog.getByRole('radio', { name: 'Đặt B là đáp án đúng' }).check();
  await editDialog.getByRole('button', { name: 'Lưu và kiểm tra lại' }).click();
  await adminPage.getByText('Dòng 4 đã được backend kiểm tra lại.').waitFor();
  assert.equal(await adminPage.locator('.p5-import__summary .p5-import__metric strong').nth(1).textContent(), '2');
  await adminPage.getByRole('checkbox', { name: 'Chọn dòng Excel 2' }).check();
  await adminPage.getByRole('checkbox', { name: 'Chọn dòng Excel 4' }).check();
  await adminPage.getByRole('button', { name: 'Import 2 câu hỏi' }).click();
  const confirmDialog = adminPage.getByRole('dialog');
  await confirmDialog.waitFor();
  const confirmBounds = await confirmDialog.boundingBox();
  assert.ok(confirmBounds && confirmBounds.width <= 390, 'import confirm dialog must fit mobile viewport');
  const importConfirmRoute = (url) => new URL(url).pathname.endsWith('/confirm');
  let importConfirmResponseDropped = false;
  await adminPage.route(importConfirmRoute, async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    const response = await route.fetch();
    assert.equal(response.status(), 200, 'backend should commit import before the simulated connection loss');
    importConfirmResponseDropped = true;
    await route.abort('failed');
  });
  await confirmDialog.getByRole('button', { name: 'Tạo 2 Draft' }).click();
  await adminPage.locator('.p5-import__alert--error').filter({ hasText: 'Mất kết nối khi Confirm' }).waitFor();
  assert.equal(importConfirmResponseDropped, true);
  const syntheticBatchId = new URL(adminPage.url()).searchParams.get('batchId');
  assert.ok(syntheticBatchId, 'the preview URL should retain its batch ID for recovery');
  const committedImportRows = await models.QuestionImportRow.find({ batchId: syntheticBatchId, rowNumber: { $in: [2, 4] } }).lean();
  assert.equal(committedImportRows.length, 2);
  assert.ok(committedImportRows.every((row) => row.importState === 'IMPORTED'));
  await adminPage.locator('.p5-import__alert--error').getByRole('button', { name: 'Tải lại batch' }).click();
  await adminPage.getByRole('heading', { name: 'Kết quả xử lý' }).waitFor();
  await adminPage.getByText('Đã nhập trước đó', { exact: true }).first().waitFor();
  recoveryChecks.importLostResponseReload = 'reloaded batch shows committed rows as already imported';
  await adminPage.unroute(importConfirmRoute);
  await assertNoHorizontalOverflow(adminPage, 'Part 5 Import UI at 390px');

  const syntheticQuestions = await models.Question.find({ createdBy: admin._id, toeicPart: 5, importBatchId: { $exists: true } })
    .select('+importBatchId +importRowNumber +importFingerprintVersion')
    .sort({ importRowNumber: 1 }).lean();
  assert.equal(syntheticQuestions.length, 2);
  assert.deepEqual(syntheticQuestions.map((question) => question.status), ['draft', 'draft']);
  assert.ok(syntheticQuestions.every((question) => question.type === 'single_choice' && question.options.length === 4 && question.correctAnswers.length === 1 && question.explanation.trim()));
  assert.deepEqual(syntheticQuestions.map((question) => question.importRowNumber), [2, 4]);
  assert.equal(await models.Assessment.countDocuments({}), 0, 'Question Bank import must not create an Assessment');
  assert.equal(await models.QuestionGroup.countDocuments({}), 0, 'Question Bank import must not create a QuestionGroup');

  // Step 10–12: roles are checked by real backend; Admin reviews and publishes each Draft in the UI.
  const teacherList = await apiRequest(teacherToken, '/questions?toeicPart=5');
  assert.equal(teacherList.status, 200, 'Teacher retains existing generic bank read permission');
  const teacherPublish = await apiRequest(teacherToken, `/questions/${syntheticQuestions[0]._id}`, {
    method: 'PATCH', body: JSON.stringify({ status: 'published' }),
  });
  assert.equal(teacherPublish.status, 403, 'Teacher must not publish an imported Draft');
  assert.equal((await models.Question.findById(syntheticQuestions[0]._id)).status, 'draft');

  await adminPage.setViewportSize({ width: 1440, height: 1000 });
  await adminPage.goto(`${frontendOrigin}/admin/questions?toeicPart=5&status=draft`);
  await adminPage.getByRole('heading', { name: 'Ngân hàng Part 5' }).waitFor();
  for (const question of syntheticQuestions) {
    const row = adminPage.locator('tr').filter({ hasText: question.questionText });
    await row.getByRole('button', { name: 'Sửa' }).click();
    const edit = adminPage.getByRole('form', { name: 'Biểu mẫu câu hỏi Part 5' });
    await edit.getByLabel('Trạng thái').selectOption('published');
    await edit.getByRole('button', { name: 'Lưu thay đổi' }).click();
    await adminPage.locator('.admin-toast').filter({ hasText: 'Đã cập nhật câu hỏi Part 5.' }).waitFor();
  }
  const publishedQuestions = await models.Question.find({ _id: { $in: syntheticQuestions.map((question) => question._id) } }).lean();
  assert.ok(publishedQuestions.every((question) => question.status === 'published'));

  // Teacher cannot use the Admin-only picker; Student cannot query the bank/import APIs.
  const primaryAssessmentId = await createAssessmentThroughUi(adminPage, 'Phase 6 Synthetic TOEIC Part 5 E2E');
  assert.equal((await models.Assessment.findById(primaryAssessmentId)).status, 'draft');
  const teacherPicker = await apiRequest(teacherToken, `/admin/toeic-tests/${primaryAssessmentId}/question-bank/part5`);
  assert.equal(teacherPicker.status, 403);
  const studentBank = await apiRequest(studentToken, '/questions?toeicPart=5');
  assert.equal(studentBank.status, 403);
  const studentImport = await apiRequest(studentToken, '/admin/question-import-batches', { method: 'POST' });
  assert.equal(studentImport.status, 403);
  const studentUnpublished = await apiRequest(studentToken, `/toeic/tests/${primaryAssessmentId}`);
  assert.equal(studentUnpublished.status, 404, 'Student cannot access an unpublished Assessment by direct ID');

  // Step 13–17: select from the real bank picker at mobile width, persist independent copies.
  await adminPage.setViewportSize({ width: 390, height: 844 });
  await adminPage.getByRole('button', { name: /Part 5:/ }).click();
  await adminPage.getByRole('button', { name: /Chọn câu từ Ngân hàng Part 5/ }).click();
  const picker = adminPage.getByRole('dialog', { name: 'Chọn câu từ Ngân hàng Part 5' });
  await picker.waitFor();
  await assertNoHorizontalOverflow(adminPage, 'Part 5 Assessment picker at 390px');
  const pickerBounds = await picker.boundingBox();
  assert.ok(pickerBounds && pickerBounds.width <= 390, `picker dialog must fit mobile viewport: ${JSON.stringify(pickerBounds)}`);
  for (const question of publishedQuestions) {
    await picker.locator('.p5-bank-card').filter({ hasText: question.questionText }).getByRole('checkbox', { name: 'Chọn câu này' }).check();
  }
  const selectionRoute = (url) => new URL(url).pathname.endsWith('/selections');
  let selectionResponseDropped = false;
  const selectionIdempotencyKeys = [];
  await adminPage.route(selectionRoute, async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    selectionIdempotencyKeys.push((await route.request().allHeaders())['idempotency-key']);
    const response = await route.fetch();
    assert.equal(response.status(), 200, 'backend should commit selection before the simulated connection loss');
    if (!selectionResponseDropped) {
      selectionResponseDropped = true;
      await route.abort('failed');
      return;
    }
    await route.fulfill({ response });
  });
  await picker.getByRole('button', { name: 'Thêm 2 câu vào đề' }).click();
  await picker.locator('.p5-bank-error').waitFor();
  assert.equal(selectionResponseDropped, true);
  assert.equal(await models.Question.countDocuments({ bankTargetAssessmentId: primaryAssessmentId }), 2, 'first request must already have committed exactly two copies');
  await picker.getByRole('button', { name: 'Thêm 2 câu vào đề' }).click();
  await picker.locator('.p5-bank-results').waitFor();
  assert.equal(selectionIdempotencyKeys.length, 2);
  assert.equal(selectionIdempotencyKeys[0], selectionIdempotencyKeys[1], 'in-page retry must reuse its idempotency key');
  recoveryChecks.pickerSameKeyRetry = 'same key replayed committed selection without duplicates';
  const pickerOutcome = await picker.locator('.p5-bank-results, .p5-bank-error').innerText();
  assert.match(pickerOutcome, /Đã thêm/, `picker did not add selected bank Questions: ${pickerOutcome}; API errors: ${JSON.stringify(apiErrors)}; recent responses: ${JSON.stringify(apiResponses.slice(-12))}; browser errors: ${JSON.stringify(browserErrors)}`);
  assert.equal(await picker.locator('.p5-bank-results > div').count(), 2);
  await adminPage.unroute(selectionRoute);
  await picker.getByRole('button', { name: 'Đóng', exact: true }).click();
  const primaryAssessment = await models.Assessment.findById(primaryAssessmentId).lean();
  assert.equal(primaryAssessment.status, 'draft');
  assert.equal(primaryAssessment.questions.length, 2);
  assert.equal(primaryAssessment.questionGroups.length, 1);
  assert.equal(primaryAssessment.totalScore, 2);
  const primaryGroup = await models.QuestionGroup.findById(primaryAssessment.questionGroups[0]).lean();
  assert.equal(primaryGroup.partNumber, 5);
  assert.equal(primaryGroup.questionIds.length, 2);
  const primaryCopies = await models.Question.find({ _id: { $in: primaryGroup.questionIds } }).sort({ questionNumber: 1 }).lean();
  assert.deepEqual(primaryCopies.map((question) => question.questionNumber), [1, 2]);
  assert.deepEqual(primaryCopies.map((question) => question.order), [1, 2]);
  assert.ok(primaryCopies.every((question) => question.score === 1));
  assert.ok(primaryCopies.every((question) => String(question.questionGroup) === String(primaryGroup._id)));
  assert.deepEqual(primaryAssessment.questions.map((entry) => String(entry.question)), primaryGroup.questionIds.map(String));
  const eligibleList = await apiRequest((await adminPage.evaluate(() => localStorage.getItem('accessToken'))), `/admin/toeic-tests/${primaryAssessmentId}/question-bank/part5`);
  assert.equal(eligibleList.status, 200);
  const eligibleBody = await eligibleList.json();
  assert.equal(eligibleBody.data.questions.length, 2, 'legacy invalid and other-Part fixtures must not appear in the picker');
  assert.ok(eligibleBody.data.questions.every((question) => publishedQuestions.some((source) => String(source._id) === question._id)));

  // Reuse one bank source in a second Assessment and verify copy isolation.
  const secondaryAssessmentId = await createAssessmentThroughUi(adminPage, 'Phase 6 Secondary Assessment Reuse Check');
  await adminPage.setViewportSize({ width: 1440, height: 1000 });
  await adminPage.getByRole('button', { name: /Part 5:/ }).click();
  await adminPage.getByRole('button', { name: /Chọn câu từ Ngân hàng Part 5/ }).click();
  const secondPicker = adminPage.getByRole('dialog', { name: 'Chọn câu từ Ngân hàng Part 5' });
  await secondPicker.waitFor();
  const reusedSource = publishedQuestions[0];
  await secondPicker.locator('.p5-bank-card').filter({ hasText: reusedSource.questionText }).getByRole('checkbox', { name: 'Chọn câu này' }).check();
  await secondPicker.getByRole('button', { name: 'Thêm 1 câu vào đề' }).click();
  await secondPicker.locator('.p5-bank-results').getByText('Đã thêm', { exact: true }).waitFor();
  await secondPicker.getByRole('button', { name: 'Đóng', exact: true }).click();
  const secondaryAssessment = await models.Assessment.findById(secondaryAssessmentId).lean();
  const secondaryCopyId = secondaryAssessment.questions[0].question;
  assert.notEqual(String(secondaryCopyId), String(primaryCopies[0]._id));
  assert.equal(await models.Question.countDocuments({ bankSourceQuestionId: reusedSource._id }), 2);

  // Close the browser context after the server commits another selection but before its response is released.
  const recoveryContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const recoveryPage = await recoveryContext.newPage();
  recoveryPage.setDefaultTimeout(15000);
  await recoveryPage.goto(`${frontendOrigin}/login`);
  await recoveryPage.getByLabel('Email hoặc tên đăng nhập').fill(adminEmail);
  await recoveryPage.getByRole('textbox', { name: 'Mật khẩu' }).fill(password);
  await recoveryPage.getByRole('button', { name: /Đăng nhập/ }).click();
  await recoveryPage.waitForURL(/\/admin(?:\/|$)/, { timeout: 20000 });
  await recoveryPage.goto(`${frontendOrigin}/admin/toeic-tests/${secondaryAssessmentId}/edit`);
  await recoveryPage.getByRole('button', { name: /Part 5:/ }).click();
  await recoveryPage.getByRole('button', { name: /Chọn câu từ Ngân hàng Part 5/ }).click();
  const recoveryPicker = recoveryPage.getByRole('dialog', { name: 'Chọn câu từ Ngân hàng Part 5' });
  await recoveryPicker.waitFor();
  const closeRecoverySource = publishedQuestions[1];
  await recoveryPicker.locator('.p5-bank-card').filter({ hasText: closeRecoverySource.questionText }).getByRole('checkbox', { name: 'Chọn câu này' }).check();
  let releaseSelectionResponse;
  let signalSelectionCommitted;
  const responseGate = new Promise((resolve) => { releaseSelectionResponse = resolve; });
  const selectionCommitted = new Promise((resolve) => { signalSelectionCommitted = resolve; });
  await recoveryPage.route(selectionRoute, async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    const response = await route.fetch();
    signalSelectionCommitted(response.status());
    await responseGate;
    await route.abort('failed').catch(() => {});
  });
  await recoveryPicker.getByRole('button', { name: 'Thêm 1 câu vào đề' }).click();
  assert.equal(await selectionCommitted, 200);
  assert.equal(await models.Question.countDocuments({ bankTargetAssessmentId: secondaryAssessmentId, bankSourceQuestionId: closeRecoverySource._id }), 1);
  const closingRecoveryContext = recoveryContext.close({ reason: 'Simulated Admin browser close after server commit and before response.' });
  releaseSelectionResponse();
  await closingRecoveryContext;

  const reopenedContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const reopenedPage = await reopenedContext.newPage();
  reopenedPage.setDefaultTimeout(15000);
  await reopenedPage.goto(`${frontendOrigin}/login`);
  await reopenedPage.getByLabel('Email hoặc tên đăng nhập').fill(adminEmail);
  await reopenedPage.getByRole('textbox', { name: 'Mật khẩu' }).fill(password);
  await reopenedPage.getByRole('button', { name: /Đăng nhập/ }).click();
  await reopenedPage.waitForURL(/\/admin(?:\/|$)/, { timeout: 20000 });
  await reopenedPage.goto(`${frontendOrigin}/admin/toeic-tests/${secondaryAssessmentId}/edit`);
  await reopenedPage.getByRole('button', { name: /Part 5:/ }).click();
  const reopenedGroupEditors = reopenedPage.getByRole('button', { name: 'Chỉnh sửa', exact: true });
  await reopenedGroupEditors.nth(1).waitFor();
  assert.equal(await reopenedGroupEditors.count(), 2);
  await reopenedGroupEditors.nth(1).click();
  const recoveredQuestionInput = reopenedPage.getByPlaceholder('Nhập nội dung câu hỏi...').first();
  await recoveredQuestionInput.waitFor();
  assert.equal(await recoveredQuestionInput.inputValue(), closeRecoverySource.questionText);
  const secondaryAfterReopen = await models.Assessment.findById(secondaryAssessmentId).lean();
  assert.equal(secondaryAfterReopen.questions.length, 2);
  assert.equal(await models.Question.countDocuments({ bankTargetAssessmentId: secondaryAssessmentId }), 2);
  assert.equal(await models.QuestionGroup.countDocuments({ assessment: secondaryAssessmentId, partNumber: 5 }), 2);
  recoveryChecks.pickerBrowserContextClose = 'reopened Assessment shows the committed copy exactly once';
  await reopenedContext.close();

  assert.equal(await models.QuestionBankSelectionBatch.collection.countDocuments({}), 3);

  // Source mutation/deletion in the test DB must not cascade into Assessment copies.
  const sourceBeforeDelete = await models.Question.findById(reusedSource._id).lean();
  await models.Question.updateOne({ _id: reusedSource._id }, { $set: { questionText: 'Source changed after selection.' } });
  await models.Question.deleteOne({ _id: reusedSource._id });
  const sourceCopiesAfterDelete = await models.Question.find({ bankSourceQuestionId: reusedSource._id }).lean();
  assert.equal(sourceCopiesAfterDelete.length, 2);
  assert.ok(sourceCopiesAfterDelete.every((copy) => copy.questionText === sourceBeforeDelete.questionText));

  // Publish the selected Assessment through the Builder's existing workflow.
  await adminPage.setViewportSize({ width: 1440, height: 1000 });
  await adminPage.goto(`${frontendOrigin}/admin/toeic-tests/${primaryAssessmentId}/edit`);
  await adminPage.getByRole('button', { name: /Xuất Bản Đề Thi/ }).waitFor();
  adminPage.once('dialog', (dialog) => dialog.accept());
  await adminPage.getByRole('button', { name: /Xuất Bản Đề Thi/ }).click();
  await adminPage.getByText('Xuất bản đề thi TOEIC thành công!', { exact: false }).waitFor({ timeout: 15000 });
  assert.equal((await models.Assessment.findById(primaryAssessmentId)).status, 'published');
  assert.equal((await models.Assessment.findById(secondaryAssessmentId)).status, 'draft');

  const indexes = {
    questions: await models.Question.collection.indexes(),
    importBatches: await models.QuestionImportBatch.collection.indexes(),
    importRows: await models.QuestionImportRow.collection.indexes(),
    selectionBatches: await models.QuestionBankSelectionBatch.collection.indexes(),
    assessments: await models.Assessment.collection.indexes(),
  };
  assert.ok(indexes.questions.some((index) => index.name === 'uniq_question_import_stem_options_fingerprint' && index.unique));
  assert.ok(indexes.questions.some((index) => index.name === 'uniq_question_bank_source_per_assessment' && index.unique));
  assert.ok(indexes.importBatches.some((index) => index.name === 'uniq_question_import_file_sha256' && index.unique));
  assert.ok(indexes.importRows.some((index) => index.unique && index.key.batchId === 1 && index.key.rowNumber === 1));
  assert.ok(indexes.selectionBatches.some((index) => index.unique && index.key.assessment === 1 && index.key.idempotencyKey === 1));

  // Step 18–24: student signs in, starts, navigates, autosaves, reloads, submits, sees policy-approved review.
  const studentContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const studentPage = await studentContext.newPage();
  studentPage.setDefaultTimeout(15000);
  studentPage.on('pageerror', (error) => browserErrors.push(error.message));
  studentPage.on('response', (response) => {
    const url = new URL(response.url());
    if (url.pathname.startsWith('/api/v1/')) {
      apiResponses.push({ method: response.request().method(), path: url.pathname, status: response.status() });
      if (response.status() >= 400) response.json().then((body) => apiErrors.push({ path: url.pathname, status: response.status(), code: body.code, message: body.message })).catch(() => {});
    }
  });
  await studentPage.goto(`${frontendOrigin}/login`);
  await studentPage.getByLabel('Email hoặc tên đăng nhập').fill(studentEmail);
  await studentPage.getByRole('textbox', { name: 'Mật khẩu' }).fill(password);
  await studentPage.getByRole('button', { name: /Đăng nhập/ }).click();
  await studentPage.waitForURL(/\/student\/dashboard/);
  const studentDraftAttempt = await apiRequest(await studentPage.evaluate(() => localStorage.getItem('accessToken')), `/toeic/tests/${secondaryAssessmentId}`);
  assert.equal(studentDraftAttempt.status, 404, 'Student cannot directly open the secondary Draft Assessment');

  await studentPage.goto(`${frontendOrigin}/student/toeic/${primaryAssessmentId}`);
  await studentPage.getByRole('button', { name: /BẮT ĐẦU BÀI THI/ }).click();
  await studentPage.waitForURL(/\/student\/toeic\/attempt\//, { timeout: 20000 });
  const attemptId = studentPage.url().split('/').at(-1);
  const answerResponse = await apiRequest(await studentPage.evaluate(() => localStorage.getItem('accessToken')), `/toeic/attempts/${attemptId}`);
  assert.equal(answerResponse.status, 200);
  const beforeSubmitBody = await answerResponse.json();
  assert.ok(beforeSubmitBody.data.attempt.questionSnapshots.every((question) => !('correctAnswers' in question) && !('explanation' in question)));
  assert.equal(beforeSubmitBody.data.attempt.questionSnapshots.length, 2);

  await studentPage.getByRole('button', { name: 'Part 5' }).click();
  const firstQuestion = studentPage.getByRole('group', { name: /Câu 1,/ });
  const secondQuestion = studentPage.getByRole('group', { name: /Câu 2,/ });
  await firstQuestion.getByLabel('carefully').check();
  await secondQuestion.getByLabel('open', { exact: true }).check();
  await studentPage.getByText('✓ Đã lưu').waitFor({ timeout: 10000 });
  const attemptBeforeReload = await models.Attempt.findById(attemptId).lean();
  const snapshotTextBeforeEdit = attemptBeforeReload.questionSnapshots.map((question) => question.questionText);

  // Change a target copy after the Attempt snapshot is captured; past Attempt grading stays snapshot-based.
  await models.Question.updateOne({ _id: primaryCopies[0]._id }, { $set: { questionText: 'Assessment copy changed after attempt start.', correctAnswers: ['D'] } });
  await studentPage.reload();
  await studentPage.getByRole('button', { name: 'Part 5' }).click();
  await firstQuestion.getByLabel('carefully').waitFor();
  assert.equal(await firstQuestion.getByLabel('carefully').isChecked(), true, 'autosaved answer must resume after reload');
  assert.equal(await secondQuestion.getByLabel('open', { exact: true }).isChecked(), true, 'second autosaved answer must resume after reload');
  const afterReloadResponse = await apiRequest(await studentPage.evaluate(() => localStorage.getItem('accessToken')), `/toeic/attempts/${attemptId}`);
  const afterReloadBody = await afterReloadResponse.json();
  assert.deepEqual(afterReloadBody.data.attempt.questionSnapshots.map((question) => question.questionText), snapshotTextBeforeEdit);
  assert.ok(afterReloadBody.data.attempt.questionSnapshots.every((question) => !('correctAnswers' in question) && !('explanation' in question)));
  await assertNoHorizontalOverflow(studentPage, 'Student TOEIC exam at 390px');

  await studentPage.getByRole('button', { name: 'NỘP BÀI' }).click();
  const submitDialog = studentPage.getByText('Xác Nhận Nộp Bài Thi').locator('..');
  await submitDialog.waitFor();
  await studentPage.getByRole('button', { name: 'Xác nhận nộp bài' }).click();
  await studentPage.waitForURL(/\/student\/toeic\/results\//, { timeout: 20000 });
  await studentPage.getByText('Xem Lại Chi Tiết Đáp Án').waitFor();
  await studentPage.locator('.assessment-review-card__explanation').filter({ hasText: 'An adverb modifies the verb.' }).waitFor();

  const completedAttempt = await models.Attempt.findById(attemptId).lean();
  assert.equal(completedAttempt.status, 'completed');
  assert.equal(completedAttempt.correctCount, 1);
  assert.equal(completedAttempt.incorrectCount, 1);
  assert.equal(completedAttempt.unansweredCount, 0);
  assert.equal(completedAttempt.score, 1);
  assert.equal(completedAttempt.maxScore, 2);
  assert.deepEqual(completedAttempt.questionSnapshots.map((question) => question.questionText), snapshotTextBeforeEdit);
  assert.equal(completedAttempt.questionSnapshots[0].correctAnswers[0], 'A');
  assert.equal(completedAttempt.questionSnapshots[1].correctAnswers[0], 'B');
  assert.equal(completedAttempt.answers[completedAttempt.questionSnapshots[0].questionId][0], 'A');
  assert.equal(completedAttempt.answers[completedAttempt.questionSnapshots[1].questionId][0], 'C');
  assert.ok(completedAttempt.questionSnapshots.every((question) => question.explanation));
  assert.equal(await models.Attempt.countDocuments({ assessment: primaryAssessmentId, student: student._id }), 1);
  await assertNoHorizontalOverflow(studentPage, 'Student TOEIC result at 390px');

  await fs.mkdir(evidenceDir, { recursive: true });
  await studentPage.screenshot({ path: path.join(evidenceDir, 'full-workflow-student-result-mobile.png'), fullPage: true });
  await adminPage.setViewportSize({ width: 1440, height: 1000 });
  await adminPage.screenshot({ path: path.join(evidenceDir, 'full-workflow-assessment-builder.png'), fullPage: true });

  assert.deepEqual(browserErrors, [], `browser runtime errors: ${browserErrors.join('; ')}`);
  const allIndexes = Object.values(indexes).flat();
  const failedApiResponses = apiResponses.filter((entry) => entry.status >= 500);
  assert.deepEqual(failedApiResponses, [], `unexpected API 5xx: ${JSON.stringify(failedApiResponses)}`);
  const statuses = (method, predicate) => apiResponses.filter((entry) => entry.method === method && predicate(entry.path)).map((entry) => entry.status);
  console.log(JSON.stringify({
    status: 'PASS',
    browser: 'Playwright Chromium desktop and 390px mobile viewport',
    backend: 'full Express app and real routes; actual Admin/Student login; MongoMemoryServer bound to loopback',
    actualWorkbookPreview: runCustomerWorkbookPreview ? 'RUN' : 'NOT_RUN_CUSTOMER_WORKBOOK_EXCLUDED',
    syntheticWorkflow: { previewRows: 3, editedRows: [4], importedQuestions: 2, publishedQuestions: 2, primaryAssessmentCopies: 2, secondAssessmentReuseCopies: 1, secondAssessmentCrashRecoveryCopies: 1 },
    browserRecovery: recoveryChecks,
    assessmentIntegrity: { groupQuestions: primaryGroup.questionIds.length, assessmentQuestionReferences: primaryAssessment.questions.length, totalScore: primaryAssessment.totalScore, attemptStatus: completedAttempt.status, score: completedAttempt.score, maxScore: completedAttempt.maxScore, correct: completedAttempt.correctCount, incorrect: completedAttempt.incorrectCount, snapshotPreservedAfterCopyEdit: true, sourceDeletionDidNotCascade: true },
    security: { teacherGenericReadStatus: teacherList.status, teacherImportedDraftPublishStatus: teacherPublish.status, teacherPickerStatus: teacherPicker.status, studentBankStatus: studentBank.status, studentImportStatus: studentImport.status, unpublishedAssessmentDirectAccessStatus: studentUnpublished.status },
    indexesVerified: allIndexes.length,
    apiResponses: apiResponses.length,
    apiRouteStatusEvidence: {
      adminLogin: statuses('POST', (route) => route === '/api/v1/auth/login').slice(0, 1),
      workbookAndSyntheticPreviews: statuses('POST', (route) => route === '/api/v1/admin/question-import-batches'),
      rowRevalidation: statuses('PATCH', (route) => route.includes('/admin/question-import-batches/') && route.includes('/rows/')),
      importConfirms: statuses('POST', (route) => route.endsWith('/confirm')),
      assessmentCreates: statuses('POST', (route) => route === '/api/v1/admin/toeic-tests'),
      pickerReads: statuses('GET', (route) => route.includes('/question-bank/part5')),
      pickerSelections: statuses('POST', (route) => route.endsWith('/selections')),
      corsPreflightForSelection: statuses('OPTIONS', (route) => route.endsWith('/selections')),
      assessmentPublish: statuses('POST', (route) => route.endsWith('/publish')),
      studentAttemptStart: statuses('POST', (route) => /\/api\/v1\/toeic\/tests\/[^/]+\/start$/.test(route)),
      studentAttemptReads: statuses('GET', (route) => /\/api\/v1\/toeic\/attempts\/[^/]+$/.test(route)),
      studentAutosaves: statuses('PATCH', (route) => route.includes('/api/v1/toeic/attempts/')),
      studentSubmits: statuses('POST', (route) => route.endsWith('/submit')),
    },
    browserErrors: browserErrors.length,
    isolatedDatabase: databaseName,
    evidence: [
      path.relative(projectRoot, path.join(evidenceDir, 'full-workflow-student-result-mobile.png')),
      path.relative(projectRoot, path.join(evidenceDir, 'full-workflow-assessment-builder.png')),
    ],
  }, null, 2));
  await adminContext.close();
  await studentContext.close();
};

try {
  await main();
} finally {
  if (browser) await browser.close().catch(() => {});
  if (viteProcess && viteProcess.exitCode === null) viteProcess.kill('SIGTERM');
  if (backendServer?.listening) await new Promise((resolve) => backendServer.close(resolve));
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect().catch(() => {});
  if (mongoServer) await mongoServer.stop().catch(() => {});
}
