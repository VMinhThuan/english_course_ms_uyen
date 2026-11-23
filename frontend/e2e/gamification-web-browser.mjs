import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(scriptDir, '..');
const screenshotDir = path.join(frontendRoot, 'e2e-artifacts');
const captureScreenshots = process.env.GAMIFICATION_SCREENSHOTS === 'true';
const frontendRequire = createRequire(path.join(frontendRoot, 'package.json'));
const { chromium } = frontendRequire('playwright');
let uiUrl = '';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitForVite(url, process) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 30000) {
    if (process.exitCode !== null) throw new Error(`Vite exited with code ${process.exitCode}`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await wait(100);
  }
  throw new Error('Timed out waiting for Vite');
}

function jsonResponse(route, body, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

const user = { _id: 'student-web-e2e', id: 'student-web-e2e', fullName: 'Web Learner', email: 'web@example.test', role: 'student', status: 'active' };
const dailyQuestions = Array.from({ length: 20 }, (_, index) => ({
  questionId: `daily-q${index + 1}`,
  vocabularyId: `v${index + 1}`,
  type: index % 2 ? 'recognition' : 'meaning',
  prompt: `What does word ${index + 1} mean?`,
  sentence: `The TOEIC example sentence for word ${index + 1}.`,
  options: [{ id: 'a', text: 'Correct meaning' }, { id: 'b', text: 'Another meaning' }, { id: 'c', text: 'A third meaning' }, { id: 'd', text: 'A fourth meaning' }],
}));

function makeOverview() {
  return {
    today: { dateKey: '2026-11-22', challenge: null },
    streak: { current: 4, longest: 8, completedDates: ['2026-11-19', '2026-11-22'], timezone: 'Asia/Ho_Chi_Minh' },
    stats: { totalDailyCompletions: 12, questAttempts: 3, overallAccuracy: 86 },
    achievements: [],
    quest: {
      currentLevel: 1,
      activeAttempt: null,
      levels: [
        { level: 1, title: 'Khởi động TOEIC', description: 'Từ vựng nền tảng cho các tình huống quen thuộc.', range: '450–550', unlocked: true, completed: false, completedStages: [], stars: 0, bestAccuracy: 0 },
        { level: 2, title: 'Bứt tốc công sở', description: 'Mở rộng vốn từ trong bối cảnh công việc.', range: '550–650', unlocked: false, completed: false, completedStages: [], stars: 0, bestAccuracy: 0 },
        { level: 3, title: 'Chinh phục học thuật', description: 'Luyện những từ có độ nhiễu cao hơn.', range: '650–750', unlocked: false, completed: false, completedStages: [], stars: 0, bestAccuracy: 0 },
        { level: 4, title: 'TOEIC Mastery', description: 'Sẵn sàng cho nhóm từ nâng cao.', range: '750+', unlocked: false, completed: false, completedStages: [], stars: 0, bestAccuracy: 0 },
      ],
      recentAttempts: [],
    },
  };
}

async function installApiMocks(context, role = 'student') {
  let dailyChallenge = null;
  let dailyCorrect = 0;
  let questAttempt = null;
  const requests = [];

  await context.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = url.pathname;
    requests.push({ method: request.method(), pathname });

    if (pathname.endsWith('/auth/me')) return jsonResponse(route, { status: 'success', data: { user: { ...user, role } } });
    if (pathname.endsWith('/attempts/active')) return jsonResponse(route, { status: 'success', data: { attempts: [] } });
    if (pathname.endsWith('/admin/gamification/config') && request.method() === 'GET') {
      return jsonResponse(route, { status: 'success', data: { configs: [
        { game: 'streak', enabled: true, dailyWordCount: 20 },
        { game: 'quest', enabled: true, passThreshold: 80, timeLimitSeconds: 120, questionCount: 10, levelCount: 4 },
      ] } });
    }
    if (pathname.includes('/admin/gamification/config/') && request.method() === 'PATCH') {
      return jsonResponse(route, { status: 'success', data: { config: { game: pathname.split('/').at(-1), enabled: true, timeLimitSeconds: 120 } } });
    }
    if (pathname.endsWith('/gamification/overview')) {
      const overview = makeOverview();
      overview.today.challenge = dailyChallenge;
      overview.quest.activeAttempt = questAttempt;
      return jsonResponse(route, { status: 'success', data: overview });
    }
    if (pathname.endsWith('/gamification/daily-challenge/start')) {
      dailyChallenge = { id: 'daily-web-e2e', status: 'in_progress', correctCount: dailyCorrect, totalWords: 20, completedVocabularyIds: dailyCorrect ? ['v1'] : [], questions: dailyQuestions };
      return jsonResponse(route, { status: 'success', data: { challenge: dailyChallenge } });
    }
    if (pathname.includes('/gamification/daily-challenge/history/')) {
      return jsonResponse(route, { status: 'success', data: { review: {
        id: 'daily-history-web-e2e', dateKey: '2026-11-22', status: 'completed', totalWords: 20, correctCount: 20, accuracy: 100,
        words: dailyQuestions.map((question, index) => ({ vocabularyId: `v${index + 1}`, questionId: question.questionId, word: `word-${index + 1}`, meaning: `Meaning ${index + 1}`, prompt: question.prompt, isCorrect: true })),
      } } });
    }
    if (pathname.includes('/gamification/daily-challenge/') && pathname.endsWith('/answer')) {
      const payload = JSON.parse(request.postData() || '{}');
      const isCorrect = payload.answer === 'a';
      dailyCorrect = isCorrect ? Math.min(20, dailyCorrect + 1) : dailyCorrect;
      dailyChallenge = { ...dailyChallenge, correctCount: dailyCorrect, completedVocabularyIds: dailyQuestions.slice(0, dailyCorrect).map((question) => question.vocabularyId), status: dailyCorrect >= 20 ? 'completed' : 'in_progress' };
      return jsonResponse(route, { status: 'success', data: { isCorrect, completed: dailyCorrect >= 20, challenge: dailyChallenge } });
    }
    if (pathname.endsWith('/gamification/quest/levels/1/start')) {
      questAttempt = {
        id: 'quest-web-e2e', level: 1, stage: 1, expiresAt: new Date(Date.now() + 600000).toISOString(),
        questions: [1, 2, 3, 4].map((index) => ({ questionId: `quest-q${index}`, mode: 'multiple_choice', vocabularyId: `v${index}`, prompt: `Choose the best meaning for quest word ${index}.`, options: [{ id: 'a', text: 'Correct answer' }, { id: 'b', text: 'Distractor' }] })),
        savedAnswers: [],
      };
      return jsonResponse(route, { status: 'success', data: { attempt: questAttempt } });
    }
    if (pathname.endsWith('/gamification/quest/attempts/quest-web-e2e/progress')) return jsonResponse(route, { status: 'success', data: { saved: true } });
    return jsonResponse(route, { status: 'success', data: {} });
  });
  return { requests };
}

async function newPage(browser, viewport, role = 'student') {
  const context = await browser.newContext({ viewport, hasTouch: viewport.width <= 768 });
  const mocks = await installApiMocks(context, role);
  await context.addInitScript(() => localStorage.setItem('accessToken', 'web-e2e-token'));
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  return { context, page, mocks, consoleErrors, pageErrors };
}

async function assertNoOverflow(page) {
  const dimensions = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
  assert.ok(dimensions.scrollWidth <= dimensions.clientWidth + 1, `unexpected horizontal overflow: ${JSON.stringify(dimensions)}`);
}

async function testDesktopStreak(browser, viewport) {
  const { context, page, mocks, consoleErrors, pageErrors } = await newPage(browser, viewport);
  try {
    await page.goto(`${uiUrl}/student/streak-challenge`, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'Thử thách 7 ngày' }).waitFor();
    assert.ok(await page.locator('.student-sidebar').isVisible(), 'desktop sidebar should remain visible');
    const pageWidth = (await page.locator('.game-page').boundingBox()).width;
    assert.ok(pageWidth >= 900, `streak page should use the available desktop content width, got ${pageWidth}`);
    if (captureScreenshots) {
      await fs.mkdir(screenshotDir, { recursive: true });
      await page.screenshot({ path: path.join(screenshotDir, `streak-${viewport.width}.png`), fullPage: true });
    }
    await page.getByRole('button', { name: 'Bắt đầu thử thách' }).click();
    const firstAnswer = page.getByRole('button', { name: 'Correct meaning' }).first();
    await firstAnswer.focus();
    await page.keyboard.press('Enter');
    await page.getByText('CÂU 2 / 20').waitFor();
    assert.ok(mocks.requests.some((request) => request.pathname.endsWith('/gamification/daily-challenge/daily-web-e2e/answer')), 'daily answer request should be sent');
    await assertNoOverflow(page);
    assert.equal(consoleErrors.length, 0, `console errors: ${consoleErrors.join('; ')}`);
    assert.equal(pageErrors.length, 0, `page errors: ${pageErrors.join('; ')}`);
  } finally { await context.close(); }
}

async function testStreakZoom(browser, scale) {
  const { context, page, consoleErrors, pageErrors } = await newPage(browser, { width: 1440, height: 1000 });
  try {
    await page.goto(`${uiUrl}/student/streak-challenge`, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'Thử thách 7 ngày' }).waitFor();
    await page.evaluate((zoom) => { document.documentElement.style.zoom = `${zoom * 100}%`; }, scale);
    await assertNoOverflow(page);
    assert.ok(await page.getByRole('heading', { name: 'Thử thách 7 ngày' }).isVisible());
    assert.equal(consoleErrors.length, 0, `console errors: ${consoleErrors.join('; ')}`);
    assert.equal(pageErrors.length, 0, `page errors: ${pageErrors.join('; ')}`);
  } finally { await context.close(); }
}

async function testVocabularyChallengeFlow(browser, viewport) {
  const { context, page, mocks, consoleErrors, pageErrors } = await newPage(browser, viewport);
  try {
    await page.goto(`${uiUrl}/student/streak-challenge`, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'Thử thách 7 ngày' }).waitFor();
    assert.equal(await page.locator('.challenge-metric').count(), 3, 'challenge summary should use three compact metrics');
    assert.equal(await page.locator('.game-progress-ring').count(), 0, 'challenge should not duplicate progress with a large ring');
    await page.getByRole('button', { name: /Xem lại 20 từ ngày/ }).first().click();
    await page.getByRole('heading', { name: /20 từ ngày/ }).waitFor();
    await page.locator('.challenge-review-word').first().waitFor();
    assert.equal(await page.locator('.challenge-review-word').count(), 20, 'completed day should expose all 20 learned words');
    await page.getByRole('button', { name: 'Đóng' }).click();
    await page.getByRole('button', { name: 'Bắt đầu thử thách' }).click();
    await page.locator('.answer-option').first().waitFor();
    assert.equal(await page.locator('.answer-option').count(), 4, 'quiz should render four answers');
    assert.deepEqual(await page.locator('.answer-option__label').allTextContents(), ['A', 'B', 'C', 'D']);
    assert.equal(await page.locator('.answer-grid').evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length), 1, 'answers should be a single vertical column');
    if (captureScreenshots) {
      await fs.mkdir(screenshotDir, { recursive: true });
      await page.screenshot({ path: path.join(screenshotDir, `challenge-flow-${viewport.width}.png`), fullPage: true });
    }
    await page.getByRole('button', { name: 'B. Another meaning' }).click();
    await page.getByText('Chưa đúng, thử lại nhé.').waitFor();
    assert.ok(await page.locator('.answer-option.is-incorrect').count() === 1, 'incorrect answer state should be visible');
    await page.getByRole('button', { name: 'A. Correct meaning' }).click();
    await page.getByText('CÂU 2 / 20').waitFor();
    assert.ok(mocks.requests.some((request) => request.pathname.endsWith('/gamification/daily-challenge/daily-web-e2e/answer')), 'answer API should be called');
    await assertNoOverflow(page);
    assert.equal(consoleErrors.length, 0, `console errors: ${consoleErrors.join('; ')}`);
    assert.equal(pageErrors.length, 0, `page errors: ${pageErrors.join('; ')}`);
  } finally { await context.close(); }
}

async function testDesktopQuest(browser, viewport) {
  const { context, page, mocks, consoleErrors, pageErrors } = await newPage(browser, viewport);
  try {
    await page.goto(`${uiUrl}/student/vocabulary-quest`, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'Vượt ải TOEIC' }).waitFor();
    const map = await page.locator('.quest-map').boundingBox();
    assert.ok(map.width >= 900, `quest map should be a wide desktop landscape, got ${map.width}`);
    assert.equal(await page.locator('.quest-node').count(), 4);
    assert.ok(await page.locator('.quest-node:nth-child(1)').evaluate((node) => getComputedStyle(node).transform !== 'none'), 'desktop map nodes should have an adventure-map offset');
    await page.getByRole('button', { name: 'Bắt đầu chặng chơi' }).click();
    await page.getByRole('heading', { name: 'Choose the best meaning for quest word 1.' }).waitFor();
    await page.getByRole('button', { name: 'Correct answer' }).first().click();
    await page.waitForTimeout(80);
    assert.ok(mocks.requests.some((request) => request.pathname.endsWith('/gamification/quest/attempts/quest-web-e2e/progress')), 'quest answer should persist through the progress API');
    await assertNoOverflow(page);
    assert.equal(consoleErrors.length, 0, `console errors: ${consoleErrors.join('; ')}`);
    assert.equal(pageErrors.length, 0, `page errors: ${pageErrors.join('; ')}`);
  } finally { await context.close(); }
}

async function testMobile(browser, viewport) {
  const { context, page, consoleErrors, pageErrors } = await newPage(browser, viewport);
  try {
    await page.goto(`${uiUrl}/student/vocabulary-quest`, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'Vượt ải TOEIC' }).waitFor();
    await assertNoOverflow(page);
    assert.equal(await page.locator('.student-sidebar').isVisible(), false, 'mobile sidebar should be collapsed');
    const menu = page.getByRole('button', { name: 'Mở menu điều hướng' });
    await menu.tap();
    assert.equal(await page.locator('.student-sidebar').isVisible(), true, 'mobile sidebar should open by touch/click');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.student-sidebar').isVisible(), false, 'Escape should close the mobile navigation');
    await page.locator('.quest-map').evaluate((element) => { element.scrollLeft = 100; });
    assert.ok(await page.locator('.quest-map').evaluate((element) => element.scrollWidth >= element.clientWidth), 'mobile map should support horizontal touch scrolling');
    assert.equal(consoleErrors.length, 0, `console errors: ${consoleErrors.join('; ')}`);
    assert.equal(pageErrors.length, 0, `page errors: ${pageErrors.join('; ')}`);
  } finally { await context.close(); }
}

async function captureMobileStreak(browser) {
  const { context, page } = await newPage(browser, { width: 390, height: 844 });
  try {
    await page.goto(`${uiUrl}/student/streak-challenge`, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'Thử thách 7 ngày' }).waitFor();
    await assertNoOverflow(page);
    if (captureScreenshots) {
      await fs.mkdir(screenshotDir, { recursive: true });
      await page.screenshot({ path: path.join(screenshotDir, 'streak-mobile-390.png'), fullPage: true });
    }
  } finally { await context.close(); }
}

async function testAdminGamification(browser) {
  const { context, page, mocks, consoleErrors, pageErrors } = await newPage(browser, { width: 1440, height: 1000 }, 'admin');
  try {
    await page.goto(`${uiUrl}/admin`, { waitUntil: 'networkidle' });
    await page.getByRole('link', { name: 'Quản Lý Mini Game' }).click();
    await page.getByRole('heading', { name: 'Quản lý Mini Game' }).waitFor();
    assert.equal(await page.locator('.admin-gamification-card').count(), 2);
    assert.equal(await page.locator('.admin-sidebar-link.active').getByText('Quản Lý Mini Game').count(), 1);
    await page.getByRole('link', { name: 'Cấu hình game →' }).first().click();
    await page.getByRole('heading', { name: 'Cấu hình Thử thách 7 ngày' }).waitFor();
    await page.getByRole('button', { name: 'Lưu cấu hình' }).click();
    assert.ok(mocks.requests.some((request) => request.method === 'PATCH' && request.pathname.endsWith('/admin/gamification/config/streak')), 'admin config should persist through the API');
    assert.equal(consoleErrors.length, 0, `console errors: ${consoleErrors.join('; ')}`);
    assert.equal(pageErrors.length, 0, `page errors: ${pageErrors.join('; ')}`);
  } finally { await context.close(); }
}

const vitePort = await freePort();
const viteScript = path.join(frontendRoot, 'node_modules/vite/bin/vite.js');
const viteProcess = spawn(process.execPath, [viteScript, '--host', '127.0.0.1', '--port', String(vitePort), '--strictPort'], { cwd: frontendRoot, stdio: 'ignore', env: { ...process.env, NODE_ENV: 'test', CI: 'true' } });
const baseUrl = `http://127.0.0.1:${vitePort}`;
uiUrl = baseUrl;
let browser;
try {
  await waitForVite(baseUrl, viteProcess);
  browser = await chromium.launch({ headless: process.env.GAMIFICATION_HEADLESS !== 'false' });
  for (const width of [1280, 1440, 1920]) await testDesktopStreak(browser, { width, height: 1000 });
  for (const width of [375, 390, 768, 1280, 1440]) await testVocabularyChallengeFlow(browser, { width, height: width <= 390 ? 844 : width === 768 ? 1024 : 1000 });
  await testStreakZoom(browser, 0.8);
  await testStreakZoom(browser, 1.25);
  for (const width of [1280, 1440, 1920]) await testDesktopQuest(browser, { width, height: 1000 });
  await testAdminGamification(browser);
  await testMobile(browser, { width: 390, height: 844 });
  await testMobile(browser, { width: 768, height: 1024 });
  await captureMobileStreak(browser);
  console.log('Gamification web browser E2E: PASS (quiz flow 375/390/768/1280/1440; quest/admin regression covered)');
} finally {
  await browser?.close();
  viteProcess.kill('SIGTERM');
}
