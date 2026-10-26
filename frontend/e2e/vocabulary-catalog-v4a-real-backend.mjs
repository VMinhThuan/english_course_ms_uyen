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
  const backendOrigin = `http://${host}:${backendPort}`;
  const catalogApiBase = `${backendOrigin}/admin/vocabulary-catalog`;
  const importApiBase = `${backendOrigin}/admin/vocabulary-import-batches`;
  const vite = spawn(process.execPath, [path.join(frontendRoot, 'node_modules', 'vite', 'bin', 'vite.js'), '--host', host, '--port', String(frontendPort), '--strictPort'], { cwd: frontendRoot, stdio: ['ignore', 'pipe', 'pipe'] });
  const backend = spawn(process.execPath, ['tests/vocabularyCatalogV4aHarnessServer.js'], {
    cwd: backendRoot,
    env: { ...process.env, VOCAB_CATALOG_V4A_HARNESS_PORT: String(backendPort), VOCAB_CATALOG_V4A_FRONTEND_ORIGIN: frontendOrigin },
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
    const fixtureUrl = `${frontendOrigin}/tests/fixtures/vocabulary-catalog-v4a.html`;
    await waitFor(async () => (await fetch(fixtureUrl)).ok, vite, 'Vite');
    const health = await waitFor(async () => {
      const response = await fetch(`${backendOrigin}/__qa/health`);
      return response.ok ? response.json() : null;
    }, backend, 'V4A isolated backend');
    assert.deepEqual(health, { ok: true, host, database: 'vocabulary_v4a_admin_test' });
    assert.ok(health.database.endsWith('_test'));
    assert.equal((await fetch(`${catalogApiBase}/tags`)).status, 401);
    assert.equal((await fetch(`${catalogApiBase}/tags`, { headers: { authorization: 'Bearer synthetic-teacher' } })).status, 403);

    const uploaded = new FormData();
    for (const name of ['Existing Chapter.docx', 'New Chapter.docx']) {
      const response = await fetch(`${backendOrigin}/__qa/synthetic/${encodeURIComponent(name)}`);
      assert.equal(response.status, 200);
      uploaded.append('files', new Blob([await response.arrayBuffer()], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), name);
    }
    uploaded.append('sourceFolder', 'TOEIC EASY START');
    const uploadResponse = await fetch(importApiBase, { method: 'POST', headers: { authorization: 'Bearer synthetic-admin' }, body: uploaded });
    const uploadPayload = await uploadResponse.json();
    assert.equal(uploadResponse.status, 201, JSON.stringify(uploadPayload));
    const batchId = uploadPayload.data.batch._id;
    assert.equal(uploadPayload.data.batch.candidateCount, 4);
    const candidateSourceBefore = uploadPayload.data.candidates.map((item) => ({ id: String(item._id), sourceIdentity: item.sourceIdentity, relativePath: item.sourceMetadata.relativePath }));

    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.addInitScript(({ catalogBase, importBase, auth }) => {
      window.__VOCAB_CATALOG_API_BASE__ = catalogBase;
      window.__VOCAB_IMPORT_API_BASE__ = importBase;
      window.__VOCAB_CATALOG_HEADERS__ = { Authorization: auth };
    }, { catalogBase: catalogApiBase, importBase: importApiBase, auth: 'Bearer synthetic-admin' });
    const page = await context.newPage();
    const pageErrors = [];
    const failedApiResponses = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('response', (response) => {
      if (response.url().startsWith(backendOrigin) && response.status() >= 400) failedApiResponses.push({ status: response.status(), url: response.url() });
    });
    await page.goto(fixtureUrl);
    await page.getByRole('heading', { name: 'Quản lý Tag & Chapter' }).waitFor();
    await page.getByRole('button', { name: /Tạo Tag/ }).click();
    const tagDialog = page.getByRole('dialog', { name: 'Tạo Tag Draft' });
    await tagDialog.getByLabel('Tên Tag').fill('Browser Catalog');
    await tagDialog.getByLabel('Slug').fill('browser-catalog');
    await tagDialog.getByLabel('Mô tả').fill('Synthetic browser test catalog.');
    await tagDialog.getByRole('button', { name: 'Lưu Tag Draft' }).click();
    await page.getByRole('heading', { name: 'Browser Catalog' }).waitFor();

    await page.getByRole('button', { name: '+ Tạo Chapter' }).click();
    const chapterDialog = page.getByRole('dialog', { name: 'Tạo Chapter Draft' });
    await chapterDialog.getByLabel('Tiêu đề Chapter').fill('Existing Chapter');
    await chapterDialog.getByLabel('Chapter number').fill('1');
    await chapterDialog.getByRole('button', { name: 'Lưu Chapter Draft' }).click();
    try { await page.getByText('Existing Chapter', { exact: true }).first().waitFor({ timeout: 10000 }); }
    catch (error) {
      process.stderr.write(`\n[Chapter UI state]\n${await page.locator('body').innerText()}\n[Failed API responses]\n${JSON.stringify(failedApiResponses)}\n`);
      throw error;
    }
    const targetTagResponse = await fetch(`${catalogApiBase}/tags?search=browser-catalog&limit=20`, { headers: { authorization: 'Bearer synthetic-admin' } });
    const targetTag = (await targetTagResponse.json()).data.items[0];
    assert.equal(targetTag.slug, 'browser-catalog');
    const targetChaptersResponse = await fetch(`${catalogApiBase}/tags/${targetTag._id}/chapters`, { headers: { authorization: 'Bearer synthetic-admin' } });
    const existingChapter = (await targetChaptersResponse.json()).data.items.find((chapter) => chapter.title === 'Existing Chapter');
    assert.ok(existingChapter);

    await page.getByRole('button', { name: /Import history/ }).click();
    await page.getByRole('heading', { name: 'Lịch sử Import Batch' }).waitFor();
    const batchRow = page.locator('.vcm-batch-row').filter({ hasText: batchId });
    await batchRow.getByRole('button', { name: 'Ánh xạ Tag / Chapter' }).click();
    const mapDialog = page.getByRole('dialog', { name: 'Ánh xạ DOCX vào Catalog' });
    await mapDialog.getByLabel('Tag đích').selectOption({ label: 'Browser Catalog · browser-catalog' });
    const sourceCards = mapDialog.locator('.vcm-source-map-card');
    assert.equal(await sourceCards.count(), 2);
    const existingSource = sourceCards.filter({ hasText: 'Existing Chapter.docx' });
    await existingSource.getByLabel('Cách gán Chapter').selectOption('EXISTING');
    await existingSource.getByLabel('Chapter đích').selectOption(existingChapter._id);
    const newSource = sourceCards.filter({ hasText: 'New Chapter.docx' });
    await newSource.getByLabel('Cách gán Chapter').selectOption('CREATE');
    await newSource.getByLabel('Tiêu đề Chapter mới').fill('New Explicit Chapter');
    await mapDialog.getByRole('button', { name: 'Lưu ánh xạ' }).click();
    await page.getByRole('status').filter({ hasText: 'Đã lưu ánh xạ Tag và Chapter' }).waitFor();
    const mappingResponse = await fetch(`${importApiBase}/${batchId}/catalog-mapping`, { headers: { authorization: 'Bearer synthetic-admin' } });
    assert.equal(mappingResponse.status, 200);
    const mapping = (await mappingResponse.json()).data.mapping;
    assert.equal(mapping.status, 'MAPPED');
    assert.equal(mapping.targetTagId, targetTag._id);
    assert.equal(mapping.entries.length, 2);
    assert.ok(mapping.entries.some((entry) => entry.chapterAction === 'EXISTING' && entry.targetChapterId));
    assert.ok(mapping.entries.some((entry) => entry.chapterAction === 'CREATE' && entry.createChapter.title === 'New Explicit Chapter'));
    await mapDialog.getByRole('button', { name: 'Đóng', exact: true }).click();
    await mapDialog.waitFor({ state: 'hidden' });
    const candidateResponse = await fetch(`${importApiBase}/${batchId}/candidates?page=1&limit=20`, { headers: { authorization: 'Bearer synthetic-admin' } });
    const candidateSourceAfter = (await candidateResponse.json()).data.items.map((item) => ({ id: String(item._id), sourceIdentity: item.sourceIdentity, relativePath: item.sourceMetadata.relativePath }));
    assert.deepEqual(candidateSourceAfter, candidateSourceBefore, 'mapping must not rewrite reviewed/parser source identity data');

    await batchRow.getByRole('button', { name: 'Tiếp tục review' }).click();
    await page.getByRole('heading', { name: 'Các Chapter candidate' }).waitFor();
    await page.getByText(batchId, { exact: true }).waitFor();
    await page.getByRole('button', { name: '← Lịch sử Import Batch' }).click();
    await page.getByRole('heading', { name: 'Lịch sử Import Batch' }).waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    const layout = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: window.innerWidth }));
    assert.ok(layout.width <= layout.viewport + 1, `V4A Admin UI should reflow at mobile width (${layout.width}/${layout.viewport})`);
    assert.deepEqual(pageErrors, [], 'V4A UI should not raise uncaught page errors');

    process.stdout.write(JSON.stringify({
      suite: 'vocabulary-catalog-v4a-real-backend-browser', result: 'PASS',
      database: health.database, databaseHost: health.host, batchId,
      workflow: ['isolated Admin Tag and Chapter creation', 'Batch history', 'explicit existing/new Chapter mapping', 'source identity preservation', 'continue review in V3B', '390px responsive layout'],
      mapping: mapping.entries.map(({ sourceFileName, chapterAction, targetChapterId, createChapter }) => ({ sourceFileName, chapterAction, targetChapterId, createChapter: createChapter?.title || null })),
      candidateCount: candidateSourceAfter.length, mobileViewport: layout,
    }, null, 2) + '\n');
    await context.close();
  } catch (error) {
    if (backendOutput) process.stderr.write(`\n[V4A harness output]\n${backendOutput}\n`);
    if (viteOutput) process.stderr.write(`\n[Vite output]\n${viteOutput}\n`);
    throw error;
  } finally {
    if (browser) await browser.close();
    await Promise.all([stopChild(vite), stopChild(backend)]);
  }
}

main().catch((error) => { process.stderr.write(`${error.stack || error}\n`); process.exitCode = 1; });
