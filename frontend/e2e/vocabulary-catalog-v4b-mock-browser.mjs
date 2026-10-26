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
const host = '127.0.0.1';
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const getPort = () => new Promise((resolve, reject) => {
  const server = net.createServer();
  server.once('error', reject);
  server.listen(0, host, () => { const port = server.address().port; server.close(() => resolve(port)); });
});
const reply = (route, status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
async function waitFor(check, processRef, label) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
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

const ids = {
  fundamentals: '64b000000000000000000001',
  collocations: '64b000000000000000000002',
  essentials: '64b000000000000000000003',
  hiddenTag: '64b000000000000000000004',
  start1: '64c000000000000000000001',
  start2: '64c000000000000000000002',
  empty: '64c000000000000000000003',
  collocation: '64c000000000000000000004',
  essential: '64c000000000000000000005',
  hiddenDraft: '64c000000000000000000099',
  page13: '64c000000000000000000013',
};
const tagRows = [
  { _id: ids.fundamentals, name: 'Synthetic Fundamentals', slug: 'synthetic-fundamentals', description: 'Synthetic learning collection.', sortOrder: 1, chapterCount: 13, vocabularyCount: 6, access: 'AVAILABLE' },
  { _id: ids.collocations, name: 'Synthetic Collocations', slug: 'synthetic-collocations', description: 'Synthetic phrase collection.', sortOrder: 2, chapterCount: 1, vocabularyCount: 1, access: 'AVAILABLE' },
  { _id: ids.essentials, name: 'Synthetic Essentials', slug: 'synthetic-essentials', description: 'Synthetic review collection.', sortOrder: 3, chapterCount: 1, vocabularyCount: 0, access: 'AVAILABLE' },
];
const chapter = (id, title, tag, number, order, count, description = '') => ({
  _id: id, tagId: tag._id, tagName: tag.name, title, description, chapterNumber: number, sortOrder: order, vocabularyCount: count, access: 'AVAILABLE',
});
const fundamentals = [
  chapter(ids.start1, 'Synthetic Start 1', tagRows[0], 1, 1, 4, 'First synthetic chapter.'),
  chapter(ids.start2, 'Synthetic Start 2', tagRows[0], 2, 2, 2),
  chapter(ids.empty, 'Synthetic Empty Chapter', tagRows[0], 3, 3, 0),
  ...Array.from({ length: 9 }, (_, index) => chapter(`64c0000000000000000000${String(index + 4).padStart(2, '0')}`, `Synthetic Chapter ${index + 4}`, tagRows[0], index + 4, index + 4, 1)),
  chapter(ids.page13, 'Synthetic Chapter 13', tagRows[0], 13, 13, 1),
];
const chaptersByTag = {
  [ids.fundamentals]: fundamentals,
  [ids.collocations]: [chapter(ids.collocation, 'Synthetic Collocation Chapter', tagRows[1], 1, 1, 1)],
  [ids.essentials]: [chapter(ids.essential, 'Synthetic Essential Chapter', tagRows[2], 1, 1, 0)],
};
const commonSenses = [
  {
    partOfSpeech: ['noun'], usagePattern: 'keep a record', meaning: 'hồ sơ tổng hợp',
    examples: [
      { english: 'Keep a record of each shipment.', vietnamese: 'Hãy lưu hồ sơ của từng chuyến hàng.' },
      { english: 'The record is complete.', vietnamese: 'Hồ sơ đã đầy đủ.' },
    ], notes: ['Learner-facing sense note.'],
  },
  { partOfSpeech: ['verb'], usagePattern: 'record a result', meaning: 'ghi lại', examples: [{ english: 'They record each result.', vietnamese: 'Họ ghi lại từng kết quả.' }], notes: ['A second sense note.'] },
];
const vocabularyByChapter = {
  [ids.start1]: [
    { _id: '64d000000000000000000001', word: 'synthetic record', partOfSpeech: 'noun, verb', meaning: 'hồ sơ; ghi lại', catalogSenses: commonSenses, catalogNotes: ['Chapter note.', '<img src=x onerror="window.__catalogXss=1">'], sortOrder: 1 },
    { _id: '64d000000000000000000002', word: 'synthetic charge', partOfSpeech: 'noun', meaning: 'khoản phí', catalogSenses: [], catalogNotes: [], sortOrder: 2 },
    { _id: '64d000000000000000000003', word: 'synthetic charge', partOfSpeech: 'verb', meaning: 'buộc tội', catalogSenses: [], catalogNotes: [], sortOrder: 3 },
    { _id: '64d000000000000000000004', word: 'synthetic shared', partOfSpeech: 'noun', meaning: 'dùng chung hai chapter', catalogSenses: [], catalogNotes: [], sortOrder: 4 },
  ],
  [ids.start2]: [{ _id: '64d000000000000000000004', word: 'synthetic shared', partOfSpeech: 'noun', meaning: 'dùng chung hai chapter', catalogSenses: [], catalogNotes: [], sortOrder: 1 }, { _id: '64d000000000000000000005', word: 'synthetic budget', partOfSpeech: 'noun', meaning: 'ngân sách tổng hợp', catalogSenses: [], catalogNotes: [], sortOrder: 2 }],
  [ids.empty]: [],
  [ids.collocation]: [{ _id: '64d000000000000000000006', word: 'synthetic collocation', partOfSpeech: 'phrase', meaning: 'cụm từ tổng hợp', catalogSenses: [], catalogNotes: [], sortOrder: 1 }],
  [ids.essential]: [],
};

async function main() {
  const frontendPort = await getPort();
  const frontendOrigin = `http://${host}:${frontendPort}`;
  const vite = spawn(process.execPath, [path.join(frontendRoot, 'node_modules', 'vite', 'bin', 'vite.js'), '--host', host, '--port', String(frontendPort), '--strictPort'], { cwd: frontendRoot, stdio: ['ignore', 'pipe', 'pipe'] });
  let viteOutput = '';
  vite.stdout.on('data', (chunk) => { viteOutput += chunk.toString(); });
  vite.stderr.on('data', (chunk) => { viteOutput += chunk.toString(); });
  let browser;
  let failEssentialsOnce = true;
  let tagChapterRequests = 0;
  let releaseInitialTags;
  let holdInitialTags = true;
  const initialTagsGate = new Promise((resolve) => { releaseInitialTags = resolve; });
  const observedCatalogRequests = [];
  try {
    const fixtureUrl = `${frontendOrigin}/tests/fixtures/vocabulary-catalog-v4b.html`;
    await waitFor(async () => (await fetch(fixtureUrl)).ok, vite, 'Vite');
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.addInitScript(() => {
      window.__VOCAB_STUDENT_CATALOG_API_BASE__ = '/mock/student/vocabulary-catalog';
      window.__VOCAB_STUDENT_CATALOG_HEADERS__ = { Authorization: 'Bearer synthetic-student' };
      localStorage.setItem('toeic-chapter-flashcard-bookmarks', JSON.stringify(['legacy-lesson-saved']));
    });
    await context.route('**/mock/student/vocabulary-catalog/**', async (route) => {
      const url = new URL(route.request().url());
      observedCatalogRequests.push({ path: url.pathname, query: Object.fromEntries(url.searchParams) });
      if (url.pathname.endsWith('/tags')) {
        if (holdInitialTags) await initialTagsGate;
        await reply(route, 200, { status: 'success', data: { items: tagRows, pagination: { page: 1, limit: 100, total: tagRows.length, pages: 1 } } });
        return;
      }
      const chapterListMatch = url.pathname.match(/\/tags\/([^/]+)\/chapters$/);
      if (chapterListMatch) {
        const tagId = chapterListMatch[1];
        tagChapterRequests += 1;
        if (tagId === ids.essentials && failEssentialsOnce) {
          failEssentialsOnce = false;
          await reply(route, 503, { status: 'error', code: 'MOCK_UNAVAILABLE', message: 'Mock chapter service unavailable.' });
          return;
        }
        if (!chaptersByTag[tagId]) {
          await reply(route, 404, { status: 'error', code: 'TAG_NOT_FOUND', message: 'Published Vocabulary Tag was not found.' });
          return;
        }
        let items = chaptersByTag[tagId];
        const search = (url.searchParams.get('search') || '').toLocaleLowerCase();
        if (search) items = items.filter((item) => `${item.title} ${item.description}`.toLocaleLowerCase().includes(search));
        const page = Number(url.searchParams.get('page') || 1);
        const limit = Number(url.searchParams.get('limit') || 12);
        const pages = Math.ceil(items.length / limit) || 1;
        const start = (page - 1) * limit;
        await reply(route, 200, { status: 'success', data: { tag: tagRows.find((item) => item._id === tagId), items: items.slice(start, start + limit), pagination: { page, limit, total: items.length, pages } } });
        return;
      }
      const vocabularyMatch = url.pathname.match(/\/chapters\/([^/]+)\/vocabularies$/);
      if (vocabularyMatch) {
        const chapterId = vocabularyMatch[1];
        if (chapterId === ids.hiddenDraft) {
          await reply(route, 404, { status: 'error', code: 'CHAPTER_NOT_FOUND', message: 'Published Vocabulary Chapter was not found.' });
          return;
        }
        const items = vocabularyByChapter[chapterId] || [];
        await reply(route, 200, { status: 'success', data: { chapterId, items, pagination: { page: 1, limit: 100, total: items.length, pages: 1 } } });
        return;
      }
      await reply(route, 404, { status: 'error', code: 'NOT_FOUND', message: 'Not found.' });
    });

    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.goto(`${fixtureUrl}#/student/vocabulary-catalog`);
    await page.getByRole('status').filter({ hasText: 'Đang tải danh mục' }).waitFor();
    holdInitialTags = false;
    releaseInitialTags();
    await page.getByRole('heading', { name: 'Từ vựng theo chủ đề' }).waitFor();
    for (const tag of ['Synthetic Fundamentals', 'Synthetic Collocations', 'Synthetic Essentials']) await page.getByRole('button', { name: new RegExp(tag) }).waitFor();
    assert.equal(await page.getByRole('button', { name: /Synthetic Draft Tag/ }).count(), 0, 'Draft Tag is absent from dynamic tabs');
    assert.equal(await page.getByRole('button', { name: /Synthetic Archived Tag/ }).count(), 0, 'Archived Tag is absent from dynamic tabs');
    await page.getByRole('heading', { name: 'Chọn Chapter để bắt đầu' }).waitFor();

    const visibleTitles = await page.locator('.student-catalog-chapter h3').allTextContents();
    assert.deepEqual(visibleTitles, fundamentals.slice(0, 12).map((item) => item.title), 'Chapter cards keep server order and do not become word cards');
    assert.match(await page.locator('.student-catalog-chapter').first().getAttribute('aria-label'), /4 từ vựng/);
    await page.getByLabel('Tìm Chapter').fill('Empty');
    await page.getByRole('link', { name: /Synthetic Empty Chapter/ }).waitFor();
    assert.equal(await page.locator('.student-catalog-chapter').count(), 1, 'Chapter search filters the card list');
    await page.getByLabel('Tìm Chapter').fill('');
    await page.getByRole('button', { name: 'Trang sau →' }).click();
    await page.getByRole('heading', { name: 'Synthetic Chapter 13' }).waitFor();
    await page.getByRole('button', { name: '← Trang trước' }).click();

    await page.getByRole('link', { name: /Mở Synthetic Start 1/ }).click();
    await page.locator('.chapter-flash-front h2').filter({ hasText: 'Synthetic Start 1' }).waitFor();
    await page.getByText('Đang tải toàn bộ từ vựng của Chapter...').waitFor({ state: 'hidden' });
    assert.equal(await page.locator('.chapter-flashcard').getAttribute('aria-pressed'), 'false');
    assert.match(await page.locator('.chapter-flash-front').innerText(), /4 từ vựng/);
    await page.locator('.chapter-flashcard').click();
    await page.getByText('hồ sơ tổng hợp', { exact: true }).waitFor();
    await page.getByText('ghi lại', { exact: true }).waitFor();
    const bilingualExample = page.locator('.chapter-flash-word-examples').first();
    await bilingualExample.scrollIntoViewIfNeeded();
    const exampleText = await bilingualExample.innerText();
    assert.match(exampleText, /EN\s+Keep a record of each shipment\./);
    assert.match(exampleText, /VI\s+Hãy lưu hồ sơ của từng chuyến hàng\./);
    assert.equal(await page.locator('.chapter-flash-word-list li:first-child .chapter-flash-catalog-sense').count(), 2, 'Both senses are presented on the aggregate Chapter card');
    assert.equal(await page.locator('.chapter-flash-word-list img').count(), 0, 'DOCX-like text is escaped as text, not rendered as HTML');
    assert.equal(await page.evaluate(() => window.__catalogXss), undefined, 'Catalog text cannot execute markup');
    assert.ok((await page.locator('.chapter-flash-word-list').innerText()).includes('<img src=x onerror='));
    await page.locator('.chapter-flashcard').focus();
    await page.keyboard.press('ArrowRight');
    await page.locator('.chapter-flash-front h2').filter({ hasText: 'Synthetic Start 2' }).waitFor();
    await page.locator('.chapter-flashcard').focus();
    await page.keyboard.press('ArrowLeft');
    await page.locator('.chapter-flash-front h2').filter({ hasText: 'Synthetic Start 1' }).waitFor();
    await page.getByRole('button', { name: '☆ Lưu chapter' }).click();
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('toeic-chapter-flashcard-bookmarks'))), ['legacy-lesson-saved'], 'Catalog bookmark writes do not overwrite legacy bookmarks');
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
    assert.equal(await page.locator('.chapter-flash-word-list li').count(), 0, 'Empty Chapter remains available without inventing a word');

    await page.goto(`${fixtureUrl}#/student/vocabulary-catalog`);
    await page.getByRole('button', { name: /Synthetic Collocations/ }).click();
    await page.getByRole('heading', { name: 'Synthetic Collocation Chapter' }).waitFor();
    assert.equal(await page.locator('.student-catalog-chapter').count(), 1, 'Changing Tag loads only its own Chapters');
    await page.getByRole('button', { name: /Synthetic Essentials/ }).click();
    await page.getByRole('alert').filter({ hasText: 'Mock chapter service unavailable.' }).waitFor();
    await page.getByRole('alert').getByRole('button', { name: 'Thử lại' }).click();
    await page.getByRole('heading', { name: 'Synthetic Essential Chapter' }).waitFor();
    assert.ok(tagChapterRequests >= 5, 'Retry re-requests the real mock API endpoint');

    await page.goto(`${fixtureUrl}#/student/flashcards?catalogTagId=${ids.fundamentals}&startChapterId=${ids.hiddenDraft}`);
    await page.getByRole('alert').filter({ hasText: 'Chapter này không còn khả dụng.' }).waitFor();
    assert.equal(await page.getByText('Synthetic Draft Chapter', { exact: true }).count(), 0, 'Direct URL cannot expose a Draft Chapter');
    await page.goto(`${fixtureUrl}#/student/vocabulary-catalog?tagId=${ids.hiddenTag}`);
    await page.getByRole('alert').filter({ hasText: 'không còn khả dụng' }).waitFor();

    await page.goto(`${fixtureUrl}#/student/vocabulary-catalog?tagId=${ids.fundamentals}`);
    await page.getByRole('heading', { name: 'Từ vựng theo chủ đề' }).waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    const mobile = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: window.innerWidth }));
    assert.ok(mobile.width <= mobile.viewport + 1, `390px layout must not overflow horizontally (${mobile.width}/${mobile.viewport})`);

    let progressRequests = 0;
    await page.route('**/api/v1/**', async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith('/courses')) {
        await reply(route, 200, { data: { courses: [{ _id: 'legacy-course-id', title: 'Synthetic Legacy TOEIC', englishType: 'TOEIC' }] } });
      } else if (url.pathname.endsWith('/lessons/course/legacy-course-id')) {
        await reply(route, 200, { data: { lessons: [{ _id: 'legacy-lesson-id', title: 'Chapter 1 - Legacy lesson', topic: 'Unit 1', order: 1 }] } });
      } else if (url.pathname.endsWith('/vocabulary')) {
        await reply(route, 200, { data: { vocabulary: [{ _id: 'legacy-word-id', lesson: { _id: 'legacy-lesson-id' }, word: 'legacy aggregate word', meaning: 'từ legacy', partOfSpeech: 'noun', topic: 'Unit 1', order: 1 }], pagination: { pages: 1 } } });
      } else if (url.pathname.includes('/progress')) {
        progressRequests += 1;
        await reply(route, 200, { data: {} });
      } else {
        await reply(route, 404, { status: 'error', message: 'Not found.' });
      }
    });
    await page.goto(`${fixtureUrl}#/student/flashcards?topic=Unit%201`);
    await page.locator('.chapter-flash-front h2').filter({ hasText: 'Chapter 1' }).waitFor();
    await page.locator('.chapter-flashcard').click();
    await page.locator('.chapter-flash-word-term h3').filter({ hasText: 'legacy aggregate word' }).waitFor();
    await page.getByRole('button', { name: '☆ Lưu chapter' }).click();
    assert.ok(JSON.parse(await page.evaluate(() => localStorage.getItem('toeic-chapter-flashcard-bookmarks'))).includes('legacy-lesson-id'));
    assert.equal(progressRequests, 0, 'Neither Catalog nor legacy Flashcard fixture calls LearningProgress');
    assert.deepEqual(pageErrors, [], 'Mock browser flow must not raise uncaught errors');
    assert.ok(observedCatalogRequests.length > 0);

    process.stdout.write(JSON.stringify({
      suite: 'vocabulary-catalog-v4b-mock-browser', result: 'PASS', scenarios: [
        'dynamic Tags, Tag filtering, Chapter order/cards/counts/search/pagination',
        'aggregate Flashcard, multiple senses and examples, keyboard flip/navigation',
        'empty Chapter, hidden direct URLs, loading/error/retry, 390px responsive layout',
        'safe text rendering, separate Catalog bookmark storage, legacy Flashcard and zero progress writes',
      ],
      chapterRequests: tagChapterRequests,
      catalogApiCalls: observedCatalogRequests.length,
      mobile,
      legacyBookmarkPreserved: true,
      progressRequests,
    }, null, 2) + '\n');
    await context.close();
  } catch (error) {
    if (viteOutput) process.stderr.write(`\n[Vite output]\n${viteOutput}\n`);
    throw error;
  } finally {
    if (browser) await browser.close();
    await stopChild(vite);
  }
}

main().catch((error) => { process.stderr.write(`${error.stack || error}\n`); process.exitCode = 1; });
