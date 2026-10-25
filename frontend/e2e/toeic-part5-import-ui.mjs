import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(scriptDir, '..');
const projectRoot = path.resolve(frontendRoot, '..');
const docsEvidence = path.join(projectRoot, 'docs', 'toeic-part5', 'phase3', 'evidence');
const requireFrontend = createRequire(path.join(frontendRoot, 'package.json'));
const { chromium } = requireFrontend('playwright');
const PORT = await new Promise((resolve, reject) => {
  const server = net.createServer();
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const port = server.address().port;
    server.close(() => resolve(port));
  });
});
const baseUrl = `http://127.0.0.1:${PORT}`;
const batchId = 'mock-batch-000000000001';
const invalidRows = new Set([61, 65, 68, 71, 72, 73, 74]);
const duplicateRows = new Set([4, 6, 8]);
const reviewRows = new Set([9, 10, 11]);
const resultLog = [];
let uploadCount = 0;
let getBatchCount = 0;
let patchCount = 0;
let confirmCount = 0;
let abortNextConfirm = false;
let delayNextConfirmMs = 0;
let previewPollsRemaining = 0;
const uploadContentTypes = [];
let genericQuestion = null;
let currentBatch;
let currentRows;
let browser;
let viteProcess;

const syntheticRows = () => Array.from({ length: 75 }, (_, index) => {
  const rowNumber = index + 2;
  const status = invalidRows.has(rowNumber) ? 'INVALID' : duplicateRows.has(rowNumber) ? 'DUPLICATE' : reviewRows.has(rowNumber) ? 'NEEDS_REVIEW' : 'VALID';
  const missingAnswer = invalidRows.has(rowNumber);
  return {
    batchId,
    sheetName: 'TOEIC',
    rowNumber,
    sourceValues: { questionText: `Synthetic TOEIC question ${rowNumber} ______.`, optionA: 'local', optionB: 'locally', optionC: 'locality', optionD: 'localizing', correctAnswer: missingAnswer ? '' : 'A', explanation: 'Synthetic explanation for UI testing.' },
    values: { questionText: `Synthetic TOEIC question ${rowNumber} ______.`, options: [{ id: 'A', text: 'local' }, { id: 'B', text: 'locally' }, { id: 'C', text: 'locality' }, { id: 'D', text: 'localizing' }], correctAnswers: missingAnswer ? [] : ['A'], explanation: 'Synthetic explanation for UI testing.' },
    issues: missingAnswer ? [{ code: 'MISSING_ANSWER', field: 'correctAnswers', severity: 'error', message: 'Chưa chọn đáp án đúng.' }] : status === 'DUPLICATE' ? [{ code: 'DUPLICATE_IN_WORKBOOK', field: 'questionText', severity: 'warning', message: 'Dòng này trùng với một câu hỏi khác trong workbook.' }] : status === 'NEEDS_REVIEW' ? [{ code: 'WORKBOOK_CONTENT_CONFLICT', field: 'questionText', severity: 'warning', message: 'Cùng nội dung câu hỏi nhưng cần Admin rà soát.' }] : [],
    status,
    importState: 'PENDING',
    duplicateOfRowNumber: status === 'DUPLICATE' ? rowNumber - 1 : null,
    questionId: null,
    resultCode: '',
    resultMessage: '',
  };
});

const recount = () => {
  const rowCounts = { valid: 0, invalid: 0, duplicate: 0, needsReview: 0 };
  const resultCounts = { imported: 0, failed: 0 };
  for (const row of currentRows) {
    if (row.status === 'VALID') rowCounts.valid += 1;
    if (row.status === 'INVALID') rowCounts.invalid += 1;
    if (row.status === 'DUPLICATE') rowCounts.duplicate += 1;
    if (row.status === 'NEEDS_REVIEW') rowCounts.needsReview += 1;
    if (row.importState === 'IMPORTED') resultCounts.imported += 1;
    if (row.importState === 'FAILED') resultCounts.failed += 1;
  }
  currentBatch.rowCounts = rowCounts;
  currentBatch.resultCounts = resultCounts;
  currentBatch.totalRows = currentRows.length;
};

const detail = (extra = {}) => ({ batch: currentBatch, rows: currentRows, inProgress: false, ...extra });

const reply = (route, status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

const wireApi = async (context, role = 'admin') => {
  await context.addInitScript(() => localStorage.setItem('accessToken', 'mock-browser-token'));
  await context.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = url.pathname;
    if (pathname.endsWith('/auth/me')) {
      await reply(route, 200, { status: 'success', data: { user: { _id: `mock-${role}-id`, role, fullName: `Test ${role}`, email: `${role}@example.test`, status: 'active', isActive: true } } });
      return;
    }
    if (pathname.endsWith('/admin/questions') && request.method() === 'GET') {
      resultLog.push({ kind: 'bank-list', query: Object.fromEntries(url.searchParams) });
      await reply(route, 200, { status: 'success', data: { questions: genericQuestion ? [genericQuestion] : [] } });
      return;
    }
    if (pathname.endsWith('/admin/questions') && request.method() === 'POST') {
      const body = request.postDataJSON();
      genericQuestion = { _id: 'mock-generic-question-1', ...body };
      resultLog.push({ kind: 'bank-create', questionId: genericQuestion._id });
      await reply(route, 201, { status: 'success', data: { question: genericQuestion } });
      return;
    }
    const genericQuestionPath = pathname.match(/^\/api\/v1\/admin\/questions\/([^/]+)$/);
    if (genericQuestionPath && request.method() === 'PUT') {
      const body = request.postDataJSON();
      genericQuestion = { ...genericQuestion, ...body, _id: genericQuestionPath[1] };
      resultLog.push({ kind: 'bank-update', questionId: genericQuestion._id });
      await reply(route, 200, { status: 'success', data: { question: genericQuestion } });
      return;
    }
    if (genericQuestionPath && request.method() === 'DELETE') {
      resultLog.push({ kind: 'bank-delete', questionId: genericQuestionPath[1] });
      genericQuestion = null;
      await reply(route, 200, { status: 'success', message: 'Question deleted.' });
      return;
    }
    const importRoot = '/api/v1/admin/question-import-batches';
    if (pathname === importRoot && request.method() === 'POST') {
      uploadCount += 1;
      const uploadBody = request.postDataBuffer()?.toString('latin1') || '';
      const isReused = uploadBody.includes('reused.xlsx');
      const isProcessing = uploadBody.includes('processing.xlsx');
      const isCorrupt = uploadBody.includes('corrupt.xlsx');
      const isBackendTooLarge = uploadBody.includes('backend-too-large.xlsx');
      uploadContentTypes.push(request.headers()['content-type'] || '');
      if (isCorrupt) {
        await reply(route, 400, { status: 'error', code: 'INVALID_XLSX', message: 'Workbook is not a valid XLSX file.' });
        return;
      }
      if (isBackendTooLarge) {
        await reply(route, 413, { status: 'error', code: 'FILE_TOO_LARGE', message: 'XLSX file exceeds the upload size limit.' });
        return;
      }
      currentRows = isProcessing ? [] : syntheticRows();
      currentBatch = { _id: batchId, sourceFileName: isReused ? 'reused.xlsx' : isProcessing ? 'processing.xlsx' : 'synthetic-ui-fixture.xlsx', sheetName: 'TOEIC', state: isProcessing ? 'PREVIEW_BUILDING' : 'PREVIEW_READY', totalRows: 75, rowCounts: {}, resultCounts: {} };
      recount();
      if (isProcessing) previewPollsRemaining = 1;
      const status = isProcessing ? 202 : isReused ? 200 : 201;
      await reply(route, status, { status: 'success', message: 'Preview response.', data: detail({ reused: isReused, inProgress: isProcessing }) });
      return;
    }
    if (pathname === `${importRoot}/${batchId}` && request.method() === 'GET') {
      getBatchCount += 1;
      if (previewPollsRemaining > 0) {
        previewPollsRemaining -= 1;
        await reply(route, 200, { status: 'success', data: detail({ inProgress: true }) });
        return;
      }
      if (currentBatch.state === 'PREVIEW_BUILDING') {
        currentRows = syntheticRows();
        currentBatch.state = 'PREVIEW_READY';
        recount();
      }
      await reply(route, 200, { status: 'success', data: detail() });
      return;
    }
    const patchMatch = pathname.match(new RegExp(`^${importRoot}/${batchId}/rows/(\\d+)$`));
    if (patchMatch && request.method() === 'PATCH') {
      patchCount += 1;
      const rowNumber = Number(patchMatch[1]);
      const body = request.postDataJSON();
      const row = currentRows.find((item) => item.rowNumber === rowNumber);
      assert.ok(row, `mock row ${rowNumber} exists`);
      assert.deepEqual(Object.keys(body.values).sort(), ['correctAnswers', 'explanation', 'options', 'questionText']);
      row.values = body.values;
      row.status = body.values.correctAnswers.length === 1 && ['A', 'B', 'C', 'D'].includes(body.values.correctAnswers[0]) ? 'VALID' : 'INVALID';
      row.issues = row.status === 'VALID' ? [] : [{ code: 'MISSING_ANSWER', field: 'correctAnswers', severity: 'error', message: 'Chưa chọn đáp án đúng.' }];
      row.editedFields = ['questionText', 'options', 'correctAnswers', 'explanation'];
      recount();
      await reply(route, 200, { status: 'success', message: 'Row was revalidated.', data: detail({ editedRowNumber: rowNumber }) });
      return;
    }
    const confirmMatch = pathname.match(new RegExp(`^${importRoot}/${batchId}/confirm$`));
    if (confirmMatch && request.method() === 'POST') {
      confirmCount += 1;
      const body = request.postDataJSON();
      resultLog.push({ kind: 'confirm', rowNumbers: body.rowNumbers });
      if (delayNextConfirmMs) {
        const delayMs = delayNextConfirmMs;
        delayNextConfirmMs = 0;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
      if (abortNextConfirm) {
        abortNextConfirm = false;
        await route.abort('failed');
        return;
      }
      const results = body.rowNumbers.map((rowNumber, index) => {
        const row = currentRows.find((item) => item.rowNumber === rowNumber);
        if (index === 0) {
          row.importState = 'IMPORTED';
          row.questionId = 'question-draft-0001';
          row.resultCode = 'IMPORTED';
          row.resultMessage = 'Question created as draft.';
          return { rowNumber, status: 'IMPORTED', questionId: row.questionId };
        }
        if (index === 1) {
          row.importState = 'FAILED';
          row.resultCode = 'IMPORT_OPERATION_FAILED';
          row.resultMessage = 'Synthetic row failure.';
          return { rowNumber, status: 'FAILED', code: row.resultCode, message: row.resultMessage };
        }
        if (index === 2) {
          row.status = 'DUPLICATE';
          row.importState = 'DUPLICATE';
          row.resultCode = 'DUPLICATE_IN_BANK';
          row.resultMessage = 'Synthetic duplicate detected during confirm.';
          return { rowNumber, status: 'DUPLICATE', code: row.resultCode, message: row.resultMessage };
        }
        return { rowNumber, status: 'IMPORTED', questionId: `question-draft-${rowNumber}` };
      });
      recount();
      await reply(route, 207, { status: 'partial', message: 'Confirm finished with row-level outcomes.', data: detail({ results }) });
      return;
    }
    await reply(route, 404, { status: 'error', code: 'MOCK_UNHANDLED', message: `No UI mock for ${request.method()} ${pathname}` });
  });
};

const launchVite = async () => {
  viteProcess = spawn(process.execPath, [path.join(frontendRoot, 'node_modules', 'vite', 'bin', 'vite.js'), '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], {
    cwd: frontendRoot,
    env: { ...process.env, BROWSER: 'none' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  viteProcess.stdout.on('data', (chunk) => { output += chunk.toString(); });
  viteProcess.stderr.on('data', (chunk) => { output += chunk.toString(); });
  const start = Date.now();
  while (Date.now() - start < 30000) {
    if (viteProcess.exitCode !== null) throw new Error(`Vite exited before ready: ${output}`);
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for Vite: ${output}`);
};

const expectRoute = async (page, pathname) => {
  await page.waitForFunction((expected) => window.location.pathname === expected, pathname, { timeout: 10000 });
};

const run = async () => {
  await launchVite();
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: false });
  await wireApi(context, 'admin');
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto(`${baseUrl}/admin/questions/import-part5`);
  await page.getByRole('heading', { name: 'Import Excel Part 5' }).waitFor();

  const input = page.locator('input[type="file"]');
  await input.setInputFiles({ name: 'invalid.xls', mimeType: 'application/vnd.ms-excel', buffer: Buffer.from('synthetic') });
  await page.getByRole('alert').getByText(/\.xlsx/).waitFor();
  await input.setInputFiles({ name: 'too-large.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.alloc(8 * 1024 * 1024 + 1) });
  await page.getByRole('alert').getByText(/8 MiB/).waitFor();
  await input.setInputFiles({ name: 'synthetic-ui-fixture.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from('synthetic-only-not-a-workbook') });
  await page.getByRole('button', { name: 'Phân tích file' }).click();
  await page.getByText('Tổng số câu').waitFor();
  await page.getByRole('heading', { name: 'synthetic-ui-fixture.xlsx' }).waitFor();
  assert.equal(uploadCount, 1);
  assert.ok(uploadContentTypes[0].startsWith('multipart/form-data; boundary='), 'upload uses multipart with a browser-generated boundary');
  assert.equal(await page.locator('.p5-import__metric strong').first().textContent(), '75');
  resultLog.push({ kind: 'mock-preview', rows: 75, statuses: { valid: 62, invalid: 7, needsReview: 3, duplicate: 3 } });

  const duplicateFilter = page.locator('.p5-import__filters select');
  await duplicateFilter.selectOption('DUPLICATE');
  await page.getByRole('checkbox', { name: 'Chọn dòng Excel 4' }).waitFor();
  assert.equal(await page.getByRole('checkbox', { name: 'Chọn dòng Excel 4' }).isDisabled(), true);
  await duplicateFilter.selectOption('ALL');

  await page.getByLabel('Số dòng Excel').fill('61');
  await page.getByText('MISSING_ANSWER').waitFor();
  await page.getByRole('button', { name: 'Sửa dòng' }).click();
  await page.getByRole('dialog').getByRole('radio', { name: 'Đặt A là đáp án đúng' }).check();
  await page.getByRole('button', { name: 'Lưu và kiểm tra lại' }).click();
  await page.getByText('Dòng 61 đã được backend kiểm tra lại.').waitFor();
  assert.equal(patchCount, 1);
  assert.equal(await page.getByRole('checkbox', { name: 'Chọn dòng Excel 61' }).isDisabled(), false);
  await page.getByRole('button', { name: 'Xem trước như câu hỏi' }).click();
  await page.getByText('Đáp án đúng: A').waitFor();
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('dialog').count(), 0, 'Escape closes preview dialog');

  await page.getByLabel('Số dòng Excel').fill('');
  await page.getByRole('button', { name: 'Chọn tất cả VALID' }).click();
  await page.getByText('63 câu hợp lệ được chọn').waitFor();
  await page.getByRole('button', { name: 'Sau →' }).click();
  await page.getByText('Trang 2 / 8 · 75 dòng').waitFor();
  await page.getByRole('button', { name: 'Chọn VALID đang lọc' }).click();
  await page.getByRole('button', { name: '← Trước', exact: true }).click();
  await page.getByRole('button', { name: 'Bỏ chọn' }).click();
  await page.getByRole('button', { name: 'Chọn tất cả VALID' }).click();
  await page.getByRole('button', { name: 'Import 63 câu hỏi' }).click();
  await page.getByRole('dialog').getByText('63 Question Draft').waitFor();
  const beforeConfirmCount = confirmCount;
  delayNextConfirmMs = 350;
  await page.getByRole('dialog').getByRole('button', { name: 'Tạo 63 Draft' }).evaluate((button) => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await page.getByRole('dialog').getByRole('button', { name: 'Đang xử lý…' }).waitFor();
  await page.getByText('Import hoàn tất một phần. Hãy xem kết quả riêng của từng dòng.').waitFor();
  assert.equal(confirmCount, beforeConfirmCount + 1);
  const submitted = resultLog.filter((entry) => entry.kind === 'confirm').at(-1).rowNumbers;
  assert.equal(submitted.length, 63);
  assert.ok(submitted.includes(61));
  assert.ok(![4, 6, 8, 9, 10, 11, 65, 68, 71, 72, 73, 74].some((rowNumber) => submitted.includes(rowNumber)));
  await page.getByText('question-draft-0001', { exact: true }).first().waitFor();
  await page.getByText('IMPORT_OPERATION_FAILED', { exact: true }).first().waitFor();

  const routeBatch = new URL(page.url()).searchParams.get('batchId');
  assert.equal(routeBatch, batchId);
  const previousGetCount = getBatchCount;
  await page.reload();
  await page.getByText('Tổng số câu').waitFor();
  assert.ok(getBatchCount > previousGetCount, 'reload recovers batch through GET by batchId');
  await page.getByRole('region', { name: 'Tổng quan trạng thái import' }).getByText('Đã tạo Draft').waitFor();
  assert.equal(await page.locator('.p5-import__metric strong').last().textContent(), '1');

  await page.getByRole('button', { name: 'Bỏ chọn' }).click();
  await page.getByLabel('Số dòng Excel').fill('12');
  const recoverableCheckbox = page.getByRole('checkbox', { name: 'Chọn dòng Excel 12' });
  await recoverableCheckbox.check();
  await page.getByRole('button', { name: 'Import 1 câu hỏi' }).click();
  abortNextConfirm = true;
  await page.getByRole('dialog').getByRole('button', { name: 'Tạo 1 Draft' }).click();
  await page.getByText(/Mất kết nối khi Confirm/).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Import 1 câu hỏi' }).isDisabled(), true);
  const confirmCountAfterFailure = confirmCount;
  await page.getByRole('alert').getByRole('button', { name: 'Tải lại batch' }).click();
  await page.getByRole('button', { name: 'Import 0 câu hỏi' }).waitFor();
  assert.equal(confirmCount, confirmCountAfterFailure, 'network uncertainty does not trigger an automatic retry');
  assert.equal(await page.getByRole('button', { name: 'Import 0 câu hỏi' }).isDisabled(), true, 'recovery clears selection before a manual retry');
  await page.getByRole('button', { name: 'Sửa dòng' }).click();
  const stem = page.getByRole('dialog').getByLabel('Nội dung câu hỏi');
  await stem.fill('Unsaved synthetic edit ______.');
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.getByRole('link', { name: '← Ngân hàng Part 5' }).evaluate((anchor) => anchor.click());
  assert.match(page.url(), /admin\/questions\/import-part5/);

  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  await wireApi(mobileContext, 'admin');
  const mobilePage = await mobileContext.newPage();
  await mobilePage.addInitScript((id) => localStorage.setItem('toeicPart5LastImportBatchId', id), batchId);
  await mobilePage.goto(`${baseUrl}/admin/questions/import-part5?batchId=${batchId}`);
  await mobilePage.getByText('Tổng số câu').waitFor();
  const mobileWidths = await mobilePage.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  assert.ok(mobileWidths.scroll <= mobileWidths.client + 1, `mobile layout overflows: ${JSON.stringify(mobileWidths)}`);
  await fs.mkdir(docsEvidence, { recursive: true });
  await mobilePage.evaluate(() => window.scrollTo(0, 0));
  await mobilePage.screenshot({ path: path.join(docsEvidence, 'import-preview-mobile.png') });
  await mobilePage.setViewportSize({ width: 1440, height: 1000 });
  await mobilePage.evaluate(() => window.scrollTo(0, 0));
  await mobilePage.screenshot({ path: path.join(docsEvidence, 'import-preview-desktop.png') });
  await mobileContext.close();

  const responseContext = await browser.newContext();
  await wireApi(responseContext, 'admin');
  const responsePage = await responseContext.newPage();
  await responsePage.goto(`${baseUrl}/admin/questions/import-part5`);
  const responseInput = responsePage.locator('input[type="file"]');
  await responseInput.setInputFiles({ name: 'corrupt.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from('not-an-xlsx') });
  await responsePage.getByRole('button', { name: 'Phân tích file' }).click();
  await responsePage.getByRole('alert').getByText('Workbook is not a valid XLSX file.').waitFor();
  await responseInput.setInputFiles({ name: 'backend-too-large.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from('synthetic') });
  await responsePage.getByRole('button', { name: 'Phân tích file' }).click();
  await responsePage.getByRole('alert').getByText('XLSX file exceeds the upload size limit.').waitFor();
  await responsePage.evaluate(() => {
    const file = new File(['same-synthetic-file'], 'reused.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    document.querySelector('.p5-import__dropzone').dispatchEvent(new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true }));
  });
  await responsePage.locator('.p5-import__dropzone').getByText('reused.xlsx').waitFor();
  await responsePage.getByRole('button', { name: 'Phân tích file' }).click();
  await responsePage.getByText('Đã mở lại preview có sẵn cho file này.').waitFor();
  assert.ok(uploadCount >= 4, 'invalid and backend-rejected upload responses are surfaced');
  resultLog.push({ kind: 'upload-http-responses', newBatch: 201, reusedBatch: 200, invalidFile: 400, tooLarge: 413, multipartBoundary: true, dragAndDrop: true });
  await responsePage.goto(`${baseUrl}/admin/questions/import-part5`);
  await responsePage.locator('input[type="file"]').setInputFiles({ name: 'processing.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from('synthetic-processing-file') });
  await responsePage.getByRole('button', { name: 'Phân tích file' }).click();
  await responsePage.getByText('File đang được phân tích. Trang sẽ tự cập nhật trạng thái.').waitFor();
  await responsePage.getByRole('checkbox', { name: 'Chọn dòng Excel 2' }).waitFor({ timeout: 10000 });
  resultLog.push({ kind: 'processing-202', recoveredAfterPolling: true });
  await responseContext.close();

  await page.goto(`${baseUrl}/admin/questions`);
  await page.getByRole('heading', { name: 'Ngân hàng Part 5' }).waitFor();
  await page.getByRole('link', { name: 'Import Excel' }).waitFor();
  await page.getByLabel('Tìm câu hỏi Part 5').fill('grammar');
  await page.waitForTimeout(400);
  assert.ok(resultLog.some((entry) => entry.kind === 'bank-list' && entry.query.search === 'grammar' && entry.query.toeicPart === '5'));
  await page.getByLabel('Tìm câu hỏi Part 5').fill('');
  await page.getByRole('button', { name: 'Thêm câu hỏi' }).click();
  await page.getByLabel('Nội dung câu hỏi').fill('Admin Part 5 bank regression question.');
  for (const [letter, text] of [['A', 'choice A'], ['B', 'choice B'], ['C', 'choice C'], ['D', 'choice D']]) {
    await page.getByPlaceholder(`Nội dung phương án ${letter}`).fill(text);
  }
  await page.getByRole('radio', { name: 'Chọn A là đáp án đúng' }).check();
  await page.getByLabel('Lời giải thích').fill('Admin reviewed explanation.');
  await page.getByRole('button', { name: 'Tạo Bản nháp' }).click();
  await page.getByText('Đã tạo câu hỏi Part 5 ở trạng thái Bản nháp.').waitFor();
  await page.getByRole('button', { name: 'Sửa' }).click();
  await page.getByLabel('Nội dung câu hỏi').fill('Admin Part 5 bank regression question updated.');
  await page.getByRole('button', { name: 'Lưu thay đổi' }).click();
  await page.getByText('Đã cập nhật câu hỏi Part 5.').waitFor();
  await page.getByRole('button', { name: 'Xóa' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Xóa' }).click();
  await page.getByText('Đã xóa câu hỏi Part 5.').waitFor();
  assert.ok(resultLog.some((entry) => entry.kind === 'bank-create'));
  assert.ok(resultLog.some((entry) => entry.kind === 'bank-update'));
  assert.ok(resultLog.some((entry) => entry.kind === 'bank-delete'));
  await page.goto(`${baseUrl}/admin/questions/import-part5?batchId=${batchId}`);
  await page.getByRole('link', { name: 'Mở Ngân hàng Part 5 · Bản nháp ↗' }).click();
  await page.getByRole('heading', { name: 'Ngân hàng Part 5' }).waitFor();
  await page.waitForFunction(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('toeicPart') === '5' && params.get('status') === 'draft';
  });
  assert.ok(resultLog.some((entry) => entry.kind === 'bank-list' && entry.query.toeicPart === '5' && entry.query.status === 'draft'));
  resultLog.push({ kind: 'question-bank-regression', adminPart5ScopeAndSearch: true, part5CreateUpdateDelete: true, part5DraftDeepLink: true });

  const teacherContext = await browser.newContext();
  await wireApi(teacherContext, 'teacher');
  const teacherPage = await teacherContext.newPage();
  await teacherPage.goto(`${baseUrl}/admin/questions`);
  await teacherPage.getByRole('heading', { name: 'Ngân hàng câu hỏi' }).waitFor();
  assert.equal(await teacherPage.getByRole('link', { name: 'Import Excel' }).count(), 0);
  await teacherPage.goto(`${baseUrl}/admin/questions/import-part5`);
  await expectRoute(teacherPage, '/admin');
  assert.equal(await teacherPage.getByRole('heading', { name: 'Import Excel Part 5' }).count(), 0);
  await teacherContext.close();

  const studentContext = await browser.newContext();
  await wireApi(studentContext, 'student');
  const studentPage = await studentContext.newPage();
  await studentPage.goto(`${baseUrl}/admin/questions/import-part5`);
  await expectRoute(studentPage, '/student/dashboard');
  assert.equal(await studentPage.getByRole('heading', { name: 'Import Excel Part 5' }).count(), 0);
  await studentContext.close();

  assert.deepEqual(pageErrors, [], `browser page errors: ${pageErrors.join('; ')}`);
  resultLog.push({ kind: 'permissions', adminEntry: true, teacherEntry: false, teacherDirectRoute: 'redirected', studentDirectRoute: 'redirected' });
  resultLog.push({ kind: 'mobile', viewport: '390x844', widths: mobileWidths, noHorizontalOverflow: true });
  await fs.writeFile(path.join(docsEvidence, 'mock-browser-results.json'), JSON.stringify({ generatedAt: new Date().toISOString(), backend: 'mocked HTTP API; all question content is synthetic', resultLog }, null, 2), 'utf8');
  console.log(JSON.stringify({ status: 'PASS', uploadCount, getBatchCount, patchCount, confirmCount, mobileWidths, results: resultLog }, null, 2));
  await context.close();
};

try {
  currentRows = syntheticRows();
  currentBatch = { _id: batchId, sourceFileName: 'synthetic-ui-fixture.xlsx', sheetName: 'TOEIC', state: 'PREVIEW_READY', totalRows: 75, rowCounts: {}, resultCounts: {} };
  recount();
  await run();
} finally {
  if (browser) await browser.close().catch(() => {});
  if (viteProcess && viteProcess.exitCode === null) viteProcess.kill('SIGTERM');
}
