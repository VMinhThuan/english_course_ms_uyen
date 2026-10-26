import assert from 'node:assert/strict';
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(scriptDir, '..');
const backendRoot = path.resolve(frontendRoot, '..', 'backend');
const requireFrontend = createRequire(path.join(frontendRoot, 'package.json'));
const { chromium } = requireFrontend('playwright');
const host = '127.0.0.1';
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const getPort = () => new Promise((resolve, reject) => {
  const server = net.createServer();
  server.once('error', reject);
  server.listen(0, host, () => { const port = server.address().port; server.close(() => resolve(port)); });
});

async function waitFor(check, processRef, label) {
  for (let attempt = 0; attempt < 140; attempt += 1) {
    if (processRef.exitCode !== null) throw new Error(`${label} exited early (${processRef.exitCode}).`);
    try { const result = await check(); if (result) return result; } catch { /* service is starting */ }
    await pause(200);
  }
  throw new Error(`${label} did not become ready.`);
}

function stopChild(processRef) {
  if (!processRef || processRef.exitCode !== null) return Promise.resolve();
  processRef.kill('SIGTERM');
  return Promise.race([
    new Promise((resolve) => processRef.once('exit', resolve)),
    pause(8000).then(() => { if (processRef.exitCode === null) processRef.kill('SIGKILL'); }),
  ]);
}

async function main() {
  const frontendPort = await getPort();
  const backendPort = await getPort();
  const frontendOrigin = `http://${host}:${frontendPort}`;
  const apiBase = `http://${host}:${backendPort}/admin/vocabulary-import-batches`;
  const vite = spawn(process.execPath, [path.join(frontendRoot, 'node_modules', 'vite', 'bin', 'vite.js'), '--host', host, '--port', String(frontendPort), '--strictPort'], { cwd: frontendRoot, stdio: ['ignore', 'pipe', 'pipe'] });
  const backend = spawn(process.execPath, ['tests/vocabularyImportV3bHarnessServer.js'], {
    cwd: backendRoot,
    env: { ...process.env, VOCAB_IMPORT_HARNESS_PORT: String(backendPort), VOCAB_IMPORT_FRONTEND_ORIGIN: frontendOrigin },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let viteOutput = '';
  let backendOutput = '';
  vite.stdout.on('data', (chunk) => { viteOutput += chunk.toString(); });
  vite.stderr.on('data', (chunk) => { viteOutput += chunk.toString(); });
  backend.stdout.on('data', (chunk) => { backendOutput += chunk.toString(); });
  backend.stderr.on('data', (chunk) => { backendOutput += chunk.toString(); });
  let browser;

  try {
    const fixtureUrl = `${frontendOrigin}/tests/fixtures/vocabulary-import.html`;
    await waitFor(async () => (await fetch(fixtureUrl)).ok, vite, 'Vite');
    const health = await waitFor(async () => {
      const response = await fetch(`${apiBase.replace('/admin/vocabulary-import-batches', '')}/__qa/health`);
      return response.ok ? response.json() : null;
    }, backend, 'V3A isolated backend');
    assert.deepEqual(health, { ok: true, host, database: 'vocabulary_v3b_browser_test' });
    assert.ok(health.database.endsWith('_test'));

    const unauthenticated = await fetch(`${apiBase}/${'0'.repeat(24)}`);
    assert.equal(unauthenticated.status, 401);
    const teacher = await fetch(`${apiBase}/${'0'.repeat(24)}`, { headers: { authorization: 'Bearer synthetic-teacher' } });
    assert.equal(teacher.status, 403);

    const binaryResponse = await fetch(`http://${host}:${backendPort}/__qa/synthetic.docx`);
    assert.equal(binaryResponse.status, 200);
    const syntheticDocx = Buffer.from(await binaryResponse.arrayBuffer());
    assert.equal(syntheticDocx[0], 0x50);
    assert.equal(syntheticDocx[1], 0x4b);

    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.addInitScript(({ base, auth }) => {
      window.__VOCAB_IMPORT_API_BASE__ = base;
      window.__VOCAB_IMPORT_HEADERS__ = { Authorization: auth };
    }, { base: apiBase, auth: 'Bearer synthetic-admin' });
    const page = await context.newPage();
    const pageErrors = [];
    let latestCandidatePage = null;
    let candidateBeforeEdit = null;
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('response', async (response) => {
      if (!response.url().includes('/admin/vocabulary-import-batches/') || response.request().method() !== 'GET') return;
      const pathname = new URL(response.url()).pathname;
      if (!pathname.endsWith('/candidates') || pathname.includes('/candidates/')) return;
      try { latestCandidatePage = (await response.json()).data; } catch { /* ignore non-JSON */ }
    });
    await page.goto(fixtureUrl);
    const input = page.locator('input[type="file"]');
    await input.setInputFiles([{ name: 'bad.docx', mimeType: 'text/plain', buffer: Buffer.from('not a DOCX') }]);
    await page.getByRole('alert').filter({ hasText: 'định dạng trình duyệt' }).waitFor();

    await input.setInputFiles([{ name: 'Start 1.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: syntheticDocx }]);
    await page.locator('.vwi-field--source input').fill('TOEIC EASY START');
    await page.getByRole('button', { name: 'Tạo batch & xem trước' }).click();
    await page.getByRole('heading', { name: 'Các Chapter candidate' }).waitFor();
    await page.getByRole('button', { name: 'Trang trước' }).waitFor();
    await page.waitForFunction(() => document.querySelector('.vwi-batch-id code')?.textContent?.length === 24);
    const batchId = (await page.locator('.vwi-batch-id code').innerText()).trim();
    assert.match(batchId, /^[a-f\d]{24}$/i);
    await page.waitForFunction(() => Boolean(window.localStorage.getItem('vwi:lastBatchId')));
    await page.waitForFunction(() => document.querySelector('.vwi-candidate-row'));
    const candidateListResponse = await fetch(`${apiBase}/${batchId}/candidates?page=1&limit=20`, { headers: { authorization: 'Bearer synthetic-admin' } });
    assert.equal(candidateListResponse.status, 200);
    latestCandidatePage = (await candidateListResponse.json()).data;
    assert.ok(latestCandidatePage?.items?.length > 0, 'the browser preview must be backed by V3A candidates');
    const firstCandidateRow = page.locator('.vwi-candidate-row').first();
    await firstCandidateRow.locator('.vwi-candidate-open').click();
    await page.locator('.vwi-workbench__head h3').waitFor();
    const initialWord = (await page.locator('.vwi-workbench__head h3').innerText()).trim();
    const sourceDetailResponse = await fetch(`${apiBase}/${batchId}/candidates/${latestCandidatePage.items[0]._id}`, { headers: { authorization: 'Bearer synthetic-admin' } });
    assert.equal(sourceDetailResponse.status, 200);
    candidateBeforeEdit = (await sourceDetailResponse.json()).data.candidate;
    assert.ok(candidateBeforeEdit.rawValues);
    assert.ok(candidateBeforeEdit.parsedValues);
    assert.ok(candidateBeforeEdit.sourceMetadata.paragraphStart);

    const workbench = page.locator('.vwi-workbench');
    await workbench.locator('.vwi-editor-form label').filter({ hasText: 'Ghi chú' }).locator('textarea').fill('Reviewed in the isolated V3B browser harness');
    await workbench.locator('.vwi-editor-form label').filter({ hasText: 'Lý do chỉnh sửa' }).locator('input').fill('Synthetic browser review correction');
    await workbench.getByRole('button', { name: 'Lưu chỉnh sửa' }).click();
    await page.getByRole('status').filter({ hasText: 'Đã lưu thay đổi' }).waitFor();
    const duplicateToggle = workbench.locator('.vwi-keep-separate input');
    if (await duplicateToggle.count()) await duplicateToggle.check();
    const approve = workbench.getByRole('button', { name: 'Duyệt candidate' });
    const validationLabel = await workbench.locator('.vwi-workbench__head').innerText();
    assert.equal(await approve.isDisabled(), false, `the parser fixture candidate must validate before approval: ${validationLabel}`);
    await approve.click();
    await page.getByRole('status').filter({ hasText: 'Candidate đã được duyệt' }).waitFor();

    await page.locator('.vwi-stepper__step').nth(3).click();
    const approvedRow = page.locator('.vwi-candidate-row').filter({ hasText: initialWord });
    await approvedRow.locator('input[type="checkbox"]:not(:disabled)').check();
    await page.getByRole('button', { name: 'Xác nhận 1 bản nháp' }).click();
    const dialog = page.getByRole('dialog', { name: 'Xác nhận tạo bản nháp?' });
    await dialog.getByText('Thao tác này tạo Vocabulary Draft, chưa xuất bản cho học viên.').waitFor();
    await dialog.getByRole('button', { name: 'Confirm bản nháp' }).click();
    await page.getByText(/API trả về 1 kết quả/).waitFor();
    await approvedRow.getByText('Đã tạo bản nháp', { exact: true }).waitFor();
    assert.ok(!await page.getByText('Đã xuất bản', { exact: true }).count());

    const finalResponse = await fetch(`${apiBase}/${batchId}/candidates/${candidateBeforeEdit._id}`, { headers: { authorization: 'Bearer synthetic-admin' } });
    assert.equal(finalResponse.status, 200);
    const finalDetail = (await finalResponse.json()).data;
    assert.equal(finalDetail.candidate.importStatus, 'IMPORTED_AS_DRAFT');
    assert.equal(finalDetail.candidate.publicationStatus, 'NOT_ELIGIBLE');
    assert.equal(finalDetail.candidate.parsedValues.word, candidateBeforeEdit.parsedValues.word, 'the parser snapshot remains immutable after edits');
    assert.deepEqual(finalDetail.candidate.rawValues, candidateBeforeEdit.rawValues, 'the original DOCX source snapshot remains immutable');
    assert.deepEqual(finalDetail.auditHistory.map((entry) => entry.action), ['FIELDS_EDITED', 'REVIEW_DECISION', 'CONFIRMED_DRAFT']);
    if (candidateBeforeEdit.duplicateMetadata?.parser || candidateBeforeEdit.duplicateMetadata?.sourceRevision?.revisionDetected || candidateBeforeEdit.duplicateMetadata?.catalogMatches?.length) {
      assert.equal(finalDetail.candidate.duplicateDecision, 'KEEP_SEPARATE');
    }

    await page.reload();
    assert.equal(await page.locator('.vwi-recovery-card input').inputValue(), batchId);
    await page.getByRole('button', { name: 'Mở batch' }).click();
    await page.getByRole('status').filter({ hasText: 'Đã mở batch đã lưu' }).waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    const layout = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: window.innerWidth }));
    assert.ok(layout.width <= layout.viewport + 1, `isolated backend workflow should reflow at mobile width (${layout.width}/${layout.viewport})`);
    assert.deepEqual(pageErrors, [], 'real API browser harness should not raise uncaught page errors');

    process.stdout.write(JSON.stringify({
      suite: 'isolated-backend-browser', result: 'PASS',
      database: health.database, databaseHost: health.host,
      authorization: { unauthenticated: 401, teacher: 403 },
      syntheticDocxBytes: syntheticDocx.length, batchId, candidateId: String(candidateBeforeEdit._id),
      workflow: ['real DOCX parser upload', 'candidate preview/detail and source locators', 'PATCH with immutable raw/parsed values', 'review decision', 'Confirm Draft transaction', 'audit timeline', 'reload by Batch ID', 'publication remains blocked'],
      importedStatus: finalDetail.candidate.importStatus,
      publicationStatus: finalDetail.candidate.publicationStatus,
      auditActions: finalDetail.auditHistory.map((entry) => entry.action),
      mobileViewport: layout,
    }, null, 2) + '\n');
    await context.close();
  } catch (error) {
    if (backendOutput) process.stderr.write(`\n[V3A harness output]\n${backendOutput}\n`);
    if (viteOutput) process.stderr.write(`\n[Vite output]\n${viteOutput}\n`);
    throw error;
  } finally {
    if (browser) await browser.close();
    await Promise.all([stopChild(vite), stopChild(backend)]);
  }
}

main().catch((error) => { process.stderr.write(`${error.stack || error}\n`); process.exitCode = 1; });
