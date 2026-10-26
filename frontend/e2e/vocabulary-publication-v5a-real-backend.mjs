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
  for (let attempt = 0; attempt < 150; attempt += 1) {
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

async function apiJson(url, { method = 'GET', body, role = 'admin' } = {}) {
  const response = await fetch(url, {
    method,
    headers: { Authorization: `Bearer synthetic-${role}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const payload = await response.json();
  assert.ok(response.ok, `${method} ${url} failed (${response.status}): ${JSON.stringify(payload)}`);
  return payload.data;
}

async function createSyntheticWorkflow(backendOrigin) {
  const catalogBase = `${backendOrigin}/admin/vocabulary-catalog`;
  const importBase = `${backendOrigin}/admin/vocabulary-import-batches`;
  const tag = (await apiJson(`${catalogBase}/tags`, {
    method: 'POST', body: { name: 'V5A Browser Release', slug: 'v5a-browser-release', description: 'Synthetic browser-only publication test.' },
  })).tag;
  const chapter = (await apiJson(`${catalogBase}/tags/${tag._id}/chapters`, {
    method: 'POST', body: { title: 'Synthetic Publication Chapter', chapterNumber: 1, description: 'Synthetic end-to-end source.' },
  })).chapter;

  const docxResponse = await fetch(`${backendOrigin}/__qa/synthetic/${encodeURIComponent('Publication Synthetic.docx')}`);
  assert.equal(docxResponse.status, 200);
  const form = new FormData();
  form.append('files', new Blob([await docxResponse.arrayBuffer()], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  }), 'Publication Synthetic.docx');
  form.append('sourceFolder', 'TOEIC EASY START');
  const uploadResponse = await fetch(importBase, { method: 'POST', headers: { Authorization: 'Bearer synthetic-admin' }, body: form });
  const upload = await uploadResponse.json();
  assert.equal(uploadResponse.status, 201, JSON.stringify(upload));
  const batchId = upload.data.batch._id;

  const openMapping = await apiJson(`${importBase}/${batchId}/catalog-mapping`);
  const mapped = await apiJson(`${importBase}/${batchId}/catalog-mapping`, {
    method: 'PUT',
    body: {
      expectedVersion: null,
      targetTagId: tag._id,
      entries: openMapping.mapping.entries.map((entry) => ({
        sourceFileIdentity: entry.sourceFileIdentity,
        chapterAction: 'EXISTING',
        targetChapterId: chapter._id,
      })),
    },
  });
  assert.equal(mapped.mapping.status, 'MAPPED');

  const candidatePage = await apiJson(`${importBase}/${batchId}/candidates?page=1&limit=20`);
  assert.equal(candidatePage.items.length, 2);
  for (const [index, candidate] of candidatePage.items.entries()) {
    const edited = await apiJson(`${importBase}/${batchId}/candidates/${candidate._id}`, {
      method: 'PATCH',
      body: {
        expectedVersion: candidate.version,
        reason: 'Synthetic browser test uses distinct reviewed entries.',
        changes: { word: `publication synthetic ${index + 1}` },
      },
    });
    await apiJson(`${importBase}/${batchId}/candidates/${candidate._id}/review`, {
      method: 'POST',
      body: {
        expectedVersion: edited.version,
        decision: 'APPROVE',
        reason: 'Reviewed synthetic content and examples.',
        duplicateDecision: 'KEEP_SEPARATE',
      },
    });
  }
  const batch = await apiJson(`${importBase}/${batchId}`);
  const confirmed = await apiJson(`${importBase}/${batchId}/confirm`, {
    method: 'POST', body: { expectedVersion: batch.version, candidateIds: candidatePage.items.map((item) => item._id) },
  });
  assert.equal(confirmed.results.length, 2);
  return { tag, chapter, batchId, imported: confirmed.results };
}

async function main() {
  const frontendPort = await getPort();
  const backendPort = await getPort();
  const frontendOrigin = `http://${host}:${frontendPort}`;
  const backendOrigin = `http://${host}:${backendPort}`;
  const catalogBase = `${backendOrigin}/admin/vocabulary-catalog`;
  const importBase = `${backendOrigin}/admin/vocabulary-import-batches`;
  const publicationBase = `${backendOrigin}/admin/vocabulary-publication`;
  const vite = spawn(process.execPath, [path.join(frontendRoot, 'node_modules', 'vite', 'bin', 'vite.js'), '--host', host, '--port', String(frontendPort), '--strictPort'], { cwd: frontendRoot, stdio: ['ignore', 'pipe', 'pipe'] });
  const backend = spawn(process.execPath, ['tests/vocabularyPublicationV5aHarnessServer.js'], {
    cwd: backendRoot,
    env: { ...process.env, VOCAB_PUBLICATION_V5A_HARNESS_PORT: String(backendPort), VOCAB_PUBLICATION_V5A_FRONTEND_ORIGIN: frontendOrigin },
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
    const fixtureUrl = `${frontendOrigin}/tests/fixtures/vocabulary-publication-v5a.html`;
    await waitFor(async () => (await fetch(fixtureUrl)).ok, vite, 'Vite');
    const health = await waitFor(async () => {
      const response = await fetch(`${backendOrigin}/__qa/health`);
      return response.ok ? response.json() : null;
    }, backend, 'V5A isolated backend');
    assert.deepEqual(health, { ok: true, host, database: 'vocabulary_publication_v5a_browser_test' });
    assert.ok(health.database.endsWith('_test'));
    assert.equal((await fetch(`${publicationBase}/tags`)).status, 401);
    assert.equal((await fetch(`${publicationBase}/tags`, { headers: { Authorization: 'Bearer synthetic-teacher' } })).status, 403);

    const { tag, chapter, batchId, imported } = await createSyntheticWorkflow(backendOrigin);
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.addInitScript(({ catalog, imports, publication, auth }) => {
      window.__VOCAB_CATALOG_API_BASE__ = catalog;
      window.__VOCAB_IMPORT_API_BASE__ = imports;
      window.__VOCAB_PUBLICATION_API_BASE__ = publication;
      window.__VOCAB_ADMIN_HEADERS__ = { Authorization: auth };
    }, { catalog: catalogBase, imports: importBase, publication: publicationBase, auth: 'Bearer synthetic-admin' });

    const page = await context.newPage();
    const pageErrors = [];
    const failedApiResponses = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('response', (response) => {
      if (response.url().startsWith(backendOrigin) && response.status() >= 400) failedApiResponses.push({ status: response.status(), url: response.url() });
    });
    await page.goto(fixtureUrl);
    await page.getByRole('heading', { name: 'Publish có bằng chứng' }).waitFor();
    await page.getByText('PENDING_PO', { exact: true }).waitFor();
    await page.getByRole('heading', { name: 'V5A Browser Release' }).waitFor();
    await page.getByRole('heading', { name: 'Synthetic Publication Chapter' }).waitFor();
    assert.equal(await page.getByText('Có thể Publish', { exact: true }).count(), 1);
    assert.equal(await page.getByText('2', { exact: true }).count() >= 1, true);

    await page.getByRole('button', { name: 'Xem candidate cần xử lý' }).first().click();
    const candidateDialog = page.getByRole('dialog', { name: 'Candidate review evidence' });
    await candidateDialog.getByText(batchId, { exact: true }).waitFor();
    await candidateDialog.getByRole('button', { name: 'Đóng', exact: true }).click();

    await page.getByRole('button', { name: 'Duyệt Tag' }).click();
    await page.getByText('Editorial review approved', { exact: true }).waitFor();
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Publish Tag' }).click();
    await page.waitForFunction(() => document.querySelector('.vpub-entity--tag .vpub-status-stack .vpub-state')?.textContent === 'Published');
    await page.getByRole('button', { name: 'Duyệt Chapter' }).click();
    await page.getByRole('heading', { name: 'Synthetic Publication Chapter' }).waitFor();
    await page.getByText('Editorial review approved', { exact: true }).nth(1).waitFor();
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Publish Chapter' }).click();
    await page.waitForFunction(() => document.querySelector('.vpub-chapter__head .vpub-status-stack .vpub-state')?.textContent === 'Published');

    let lostFirstVocabularyResponse = false;
    await page.route(/\/admin\/vocabulary-publication\/vocabularies\/[^/]+\/publish$/, async (route) => {
      if (lostFirstVocabularyResponse) return route.continue();
      lostFirstVocabularyResponse = true;
      const response = await route.fetch();
      assert.equal(response.status(), 200, 'first Vocabulary Publish should commit before its response is dropped');
      await route.abort('failed');
    });

    const publishButtons = page.getByRole('button', { name: 'Publish Vocabulary', exact: true });
    const initialEligibleCount = await publishButtons.count();
    assert.equal(initialEligibleCount, imported.length, `expected ${imported.length} eligible entries; UI state:\n${await page.locator('body').innerText()}`);
    page.once('dialog', (dialog) => dialog.accept());
    await publishButtons.first().click();
    await page.getByRole('alert').filter({ hasText: 'Không kết nối được Publication API.' }).waitFor();
    assert.equal(await publishButtons.count(), initialEligibleCount, 'a lost response should leave the retry action available');
    page.once('dialog', (dialog) => dialog.accept());
    await publishButtons.first().click();
    await page.getByText('Thao tác trước đã hoàn tất; trạng thái hiện tại đã được xác nhận.', { exact: true }).waitFor();
    await page.unrouteAll({ behavior: 'wait' });

    for (let published = 1; published < imported.length; published += 1) {
      await page.waitForFunction((expected) => document.querySelectorAll('.vpub-word__actions .vpub-button--primary').length === expected, imported.length - published);
      page.once('dialog', (dialog) => dialog.accept());
      await publishButtons.first().click();
      await page.locator('.vpub-notice').waitFor();
      await page.waitForFunction((expected) => document.querySelectorAll('.vpub-word__actions .vpub-button--primary').length === expected, imported.length - published - 1);
    }

    const studentUrl = `${backendOrigin}/student/vocabulary-catalog/chapters/${chapter._id}/vocabularies?limit=20`;
    let studentResponse = await fetch(studentUrl, { headers: { Authorization: 'Bearer synthetic-student' } });
    let studentPayload = await studentResponse.json();
    assert.equal(studentResponse.status, 200, JSON.stringify(studentPayload));
    assert.equal(studentPayload.data.items.length, imported.length);
    for (const forbidden of ['sourceIdentity', 'rawValues', 'parsedValues', 'reviewedBy', 'VocabularyPublicationAudit']) {
      assert.equal(JSON.stringify(studentPayload).includes(forbidden), false, `Student response leaked ${forbidden}`);
    }

    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Hide Vocabulary', exact: true }).first().click();
    await page.waitForFunction(() => document.querySelectorAll('.vpub-word__actions .vpub-button--danger').length === 1);
    studentResponse = await fetch(studentUrl, { headers: { Authorization: 'Bearer synthetic-student' } });
    studentPayload = await studentResponse.json();
    assert.equal(studentResponse.status, 200);
    assert.equal(studentPayload.data.items.length, imported.length - 1);

    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Archive Chapter', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.vpub-chapter__head .vpub-status-stack .vpub-state')?.textContent === 'Archived');
    const archivedChapter = await fetch(`${backendOrigin}/student/vocabulary-catalog/chapters/${chapter._id}`, { headers: { Authorization: 'Bearer synthetic-student' } });
    assert.equal(archivedChapter.status, 404, 'archived Chapter direct-ID access must be hidden');
    await page.setViewportSize({ width: 390, height: 844 });
    const mobileLayout = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: window.innerWidth }));
    assert.ok(mobileLayout.width <= mobileLayout.viewport + 1, `V5A Admin UI should reflow at mobile width (${mobileLayout.width}/${mobileLayout.viewport})`);
    assert.deepEqual(pageErrors, [], 'V5A Admin UI should not raise uncaught page errors');
    assert.deepEqual(failedApiResponses, [], 'only the deliberately dropped first Vocabulary response is expected to fail in the browser');

    process.stdout.write(JSON.stringify({
      suite: 'vocabulary-publication-v5a-real-backend-browser', result: 'PASS',
      database: health.database, databaseHost: health.host, batchId,
      workflow: ['synthetic DOCX upload and parsing', 'Tag/Chapter mapping', 'Candidate edit/review/Confirm Draft', 'Admin UI review and ordered publication', 'lost-response idempotent retry', 'Student privacy and visibility', 'Vocabulary hide', 'Chapter archive and direct-ID denial', '390px responsive layout'],
      importedVocabularyCount: imported.length, mobileViewport: mobileLayout,
    }, null, 2) + '\n');
    await context.close();
  } catch (error) {
    if (backendOutput) process.stderr.write(`\n[V5A harness output]\n${backendOutput}\n`);
    if (viteOutput) process.stderr.write(`\n[Vite output]\n${viteOutput}\n`);
    throw error;
  } finally {
    if (browser) await browser.close();
    await Promise.all([stopChild(vite), stopChild(backend)]);
  }
}

main().catch((error) => { process.stderr.write(`${error.stack || error}\n`); process.exitCode = 1; });
