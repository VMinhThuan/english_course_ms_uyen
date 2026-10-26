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
    try { const result = await check(); if (result) return result; } catch { /* wait for startup */ }
    await pause(200);
  }
  throw new Error(`${label} did not become ready.`);
}
async function stopChild(child) {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([new Promise((resolve) => child.once('exit', resolve)), pause(8000).then(() => child.kill('SIGKILL'))]);
}

async function main() {
  const frontendPort = await getPort();
  const backendPort = await getPort();
  const frontendOrigin = `http://${host}:${frontendPort}`;
  const backendOrigin = `http://${host}:${backendPort}`;
  const catalogApiBase = `${backendOrigin}/student/vocabulary-catalog`;
  const vite = spawn(process.execPath, [path.join(frontendRoot, 'node_modules', 'vite', 'bin', 'vite.js'), '--host', host, '--port', String(frontendPort), '--strictPort'], { cwd: frontendRoot, stdio: ['ignore', 'pipe', 'pipe'] });
  const backend = spawn(process.execPath, ['tests/vocabularyStudentCatalogV4bHarnessServer.js'], {
    cwd: backendRoot,
    env: { ...process.env, VOCAB_STUDENT_CATALOG_V4B_HARNESS_PORT: String(backendPort), VOCAB_STUDENT_CATALOG_V4B_FRONTEND_ORIGIN: frontendOrigin },
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
    const fixtureUrl = `${frontendOrigin}/tests/fixtures/vocabulary-catalog-v4b.html`;
    await waitFor(async () => (await fetch(fixtureUrl)).ok, vite, 'Vite');
    const health = await waitFor(async () => {
      const response = await fetch(`${backendOrigin}/__qa/health`);
      return response.ok ? response.json() : null;
    }, backend, 'Isolated V4B backend');
    assert.deepEqual(health, { ok: true, host, database: 'vocabulary_student_catalog_v4b_browser_test' });
    assert.equal(health.host, '127.0.0.1');
    assert.ok(health.database.endsWith('_test'));
    const fixtureResponse = await fetch(`${backendOrigin}/__qa/fixture`);
    const ids = await fixtureResponse.json();
    assert.equal((await fetch(`${catalogApiBase}/tags`)).status, 401);
    assert.equal((await fetch(`${catalogApiBase}/tags`, { headers: { authorization: 'Bearer synthetic-admin' } })).status, 403);

    const authHeaders = { authorization: 'Bearer synthetic-student' };
    const directDraft = await fetch(`${catalogApiBase}/chapters/${ids.chapters.draft}`, { headers: authHeaders });
    assert.equal(directDraft.status, 404, 'Direct Draft Chapter ID must remain hidden from the isolated Student API');
    const directArchived = await fetch(`${catalogApiBase}/chapters/${ids.chapters.archived}`, { headers: authHeaders });
    assert.equal(directArchived.status, 404, 'Direct Archived Chapter ID must remain hidden from the isolated Student API');
    const hiddenTag = await fetch(`${catalogApiBase}/tags/${ids.hiddenTags.draft}/chapters`, { headers: authHeaders });
    assert.equal(hiddenTag.status, 404, 'Direct Draft Tag ID must remain hidden');
    const realWordsResponse = await fetch(`${catalogApiBase}/chapters/${ids.chapters.start1}/vocabularies?limit=100`, { headers: authHeaders });
    assert.equal(realWordsResponse.status, 200);
    const realWords = await realWordsResponse.json();
    assert.equal(realWords.data.pagination.total, 4);
    const serialized = JSON.stringify(realWords.data);
    for (const hidden of ['hidden draft vocabulary', 'hidden archived vocabulary', 'hidden unreviewed vocabulary', 'hidden missing review audit', 'hidden missing import audit', 'hidden wrong chapter reference', 'hidden without provenance', 'hidden without membership', 'rawValues', 'sourceIdentity', 'fileSha256', 'private-source']) {
      assert.equal(serialized.includes(hidden), false, `Real API response must not contain ${hidden}`);
    }

    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.addInitScript(({ base }) => {
      window.__VOCAB_STUDENT_CATALOG_API_BASE__ = base;
      window.__VOCAB_STUDENT_CATALOG_HEADERS__ = { Authorization: 'Bearer synthetic-student' };
      localStorage.setItem('toeic-chapter-flashcard-bookmarks', JSON.stringify(['legacy-lesson-saved']));
    }, { base: catalogApiBase });
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    const pageErrors = [];
    const progressRequests = [];
    let failEssentialsOnce = true;
    let injectedErrorCount = 0;
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('request', (request) => {
      if (/learning.?progress|\/progress(?:\/|\?|$)/i.test(request.url())) progressRequests.push(request.url());
    });
    await page.route(`${catalogApiBase}/tags/*/chapters*`, async (route) => {
      const url = new URL(route.request().url());
      if (failEssentialsOnce && url.pathname.endsWith(`/tags/${ids.tags[2]}/chapters`)) {
        failEssentialsOnce = false;
        injectedErrorCount += 1;
        await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ status: 'error', message: 'Temporary isolated browser interruption.' }) });
      } else await route.continue();
    });
    await page.goto(`${fixtureUrl}#/student/vocabulary-catalog`);
    await page.getByRole('heading', { name: 'Từ vựng theo chủ đề' }).waitFor();
    for (const tagId of ids.tags) {
      const tagResponse = await fetch(`${catalogApiBase}/tags/${tagId}/chapters`, { headers: authHeaders });
      assert.equal(tagResponse.status, 200);
    }
    assert.equal(await page.getByRole('button', { name: /Synthetic Draft Tag/ }).count(), 0);
    assert.equal(await page.getByRole('button', { name: /Synthetic Archived Tag/ }).count(), 0);
    assert.deepEqual(await page.locator('.student-catalog-chapter h3').allTextContents(), [
      'Synthetic Start 1', 'Synthetic Start 2', 'Synthetic Empty Chapter',
    ]);
    assert.deepEqual(await page.locator('.student-catalog-chapter-meta').allTextContents(), [
      'Synthetic Fundamentals · 4 từ', 'Synthetic Fundamentals · 2 từ', 'Synthetic Fundamentals · 0 từ',
    ]);
    await page.getByLabel('Tìm Chapter').fill('Start 2');
    await page.getByRole('heading', { name: 'Synthetic Start 2' }).waitFor();
    assert.equal(await page.locator('.student-catalog-chapter').count(), 1);
    await page.getByLabel('Tìm Chapter').fill('');
    await page.getByRole('link', { name: /Mở Synthetic Start 1/ }).click();
    await page.locator('.chapter-flash-front h2').filter({ hasText: 'Synthetic Start 1' }).waitFor();
    await page.getByText('Đang tải toàn bộ từ vựng của Chapter...').waitFor({ state: 'hidden' });
    assert.match(await page.locator('.chapter-flash-front').innerText(), /4 từ vựng/);
    await page.locator('.chapter-flashcard').click();
    await page.getByText('hồ sơ tổng hợp', { exact: true }).waitFor();
    await page.getByText('ghi lại', { exact: true }).waitFor();
    const bilingualExample = page.locator('.chapter-flash-word-examples').first();
    await bilingualExample.scrollIntoViewIfNeeded();
    const exampleText = await bilingualExample.innerText();
    assert.match(exampleText, /EN\s+Keep a record of each shipment\./);
    assert.match(exampleText, /VI\s+Hãy lưu hồ sơ của từng chuyến hàng\./);
    assert.equal(await page.locator('.chapter-flash-word-list li:first-child .chapter-flash-catalog-sense').count(), 2);
    assert.equal(await page.locator('.chapter-flash-word-list img').count(), 0);
    assert.equal(await page.evaluate(() => window.__catalogXss), undefined);
    assert.ok((await page.locator('.chapter-flash-word-list').innerText()).includes('<img src=x onerror='));
    await page.locator('.chapter-flashcard').focus();
    await page.keyboard.press('ArrowRight');
    await page.locator('.chapter-flash-front h2').filter({ hasText: 'Synthetic Start 2' }).waitFor();
    await page.locator('.chapter-flashcard').focus();
    await page.keyboard.press('ArrowLeft');
    await page.locator('.chapter-flash-front h2').filter({ hasText: 'Synthetic Start 1' }).waitFor();
    await page.getByRole('button', { name: '☆ Lưu chapter' }).click();
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('toeic-chapter-flashcard-bookmarks'))), ['legacy-lesson-saved']);
    assert.equal((await page.evaluate(() => JSON.parse(localStorage.getItem('student-vocabulary-catalog-chapter-bookmarks-v1')))).length, 1);
    await page.goBack();
    await page.getByRole('heading', { name: 'Từ vựng theo chủ đề' }).waitFor();
    await page.goForward();
    await page.locator('.chapter-flash-front h2').filter({ hasText: 'Synthetic Start 1' }).waitFor();
    await page.getByRole('link', { name: '← Danh sách Chapter' }).click();
    await page.getByRole('heading', { name: 'Từ vựng theo chủ đề' }).waitFor();
    await page.getByRole('link', { name: /Mở Synthetic Empty Chapter/ }).click();
    await page.locator('.chapter-flash-front h2').filter({ hasText: 'Synthetic Empty Chapter' }).waitFor();
    await page.getByText('Đang tải toàn bộ từ vựng của Chapter...').waitFor({ state: 'hidden' });
    assert.match(await page.locator('.chapter-flash-front').innerText(), /0 từ vựng/);
    await page.locator('.chapter-flashcard').click();
    assert.equal(await page.locator('.chapter-flash-word-list li').count(), 0);

    await page.goto(`${fixtureUrl}#/student/flashcards?catalogTagId=${ids.tags[0]}&startChapterId=${ids.chapters.draft}`);
    await page.getByRole('alert').filter({ hasText: 'Chapter này không còn khả dụng.' }).waitFor();
    assert.equal(await page.getByText('Synthetic Draft Chapter', { exact: true }).count(), 0, 'Direct browser URL does not resolve to hidden Chapter data');
    await page.goto(`${fixtureUrl}#/student/vocabulary-catalog?tagId=${ids.hiddenTags.draft}`);
    await page.getByRole('alert').filter({ hasText: 'không còn khả dụng' }).waitFor();
    await page.goto(`${fixtureUrl}#/student/vocabulary-catalog?tagId=${ids.tags[0]}`);
    await page.getByRole('heading', { name: 'Từ vựng theo chủ đề' }).waitFor();
    await page.getByRole('button', { name: /Synthetic Collocations/ }).click();
    await page.getByRole('heading', { name: 'Synthetic Collocation Chapter' }).waitFor();
    await page.getByRole('button', { name: /Synthetic Essentials/ }).click();
    await page.getByRole('alert').filter({ hasText: 'Temporary isolated browser interruption.' }).waitFor();
    await page.getByRole('alert').getByRole('button', { name: 'Thử lại' }).click();
    await page.getByRole('heading', { name: 'Synthetic Essential Chapter' }).waitFor();
    assert.equal(injectedErrorCount, 1);

    await page.goto(`${fixtureUrl}#/student/vocabulary-catalog?tagId=${ids.tags[0]}`);
    await page.getByRole('heading', { name: 'Từ vựng theo chủ đề' }).waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    const mobile = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: window.innerWidth }));
    assert.ok(mobile.width <= mobile.viewport + 1, `390px layout must not overflow horizontally (${mobile.width}/${mobile.viewport})`);
    assert.deepEqual(pageErrors, [], 'Real isolated backend browser flow must not raise uncaught errors');
    assert.deepEqual(progressRequests, [], 'Catalog flashcards do not call legacy LearningProgress');

    process.stdout.write(JSON.stringify({
      suite: 'vocabulary-catalog-v4b-isolated-backend-browser', result: 'PASS',
      database: health.database, databaseHost: health.host,
      scenarios: [
        'MongoMemoryReplSet-backed Tag and Chapter browse/order/count/search',
        'published-only vocabulary and multi-sense aggregate Flashcard',
        'direct Draft/Archived IDs and parent Tag visibility',
        'browser back/forward, keyboard navigation, empty Chapter, 390px responsive layout',
        'one intercepted 503 followed by successful real API retry',
        'DTO source/audit privacy, safe text rendering, separate bookmark key, no progress writes',
      ],
      mobile,
      directHiddenStatuses: { draftChapter: directDraft.status, archivedChapter: directArchived.status, draftTag: hiddenTag.status },
      injectedRetryCount: injectedErrorCount,
      progressRequests: progressRequests.length,
    }, null, 2) + '\n');
    await context.close();
  } catch (error) {
    if (backendOutput) process.stderr.write(`\n[V4B isolated harness output]\n${backendOutput}\n`);
    if (viteOutput) process.stderr.write(`\n[Vite output]\n${viteOutput}\n`);
    throw error;
  } finally {
    if (browser) await browser.close();
    await Promise.all([stopChild(vite), stopChild(backend)]);
  }
}

main().catch((error) => { process.stderr.write(`${error.stack || error}\n`); process.exitCode = 1; });
