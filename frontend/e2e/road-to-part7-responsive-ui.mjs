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
const readings = Array.from({ length: 26 }, (_, index) => ({
  _id: `reading-${index + 1}`,
  sourceKey: `reading-${index + 1}`,
  order: index + 1,
  title: `Bài đọc ${String(index + 1).padStart(2, '0')}`,
  englishText: Array.from({ length: 96 }, (_, sentence) => `Reading ${index + 1}, sentence ${sentence + 1}.`).join(' '),
  bilingualPairs: [{ order: 1, english: `Sentence ${index + 1}.`, vietnamese: `Câu ${index + 1}.` }],
}));

let viteProcess;
let browser;

const reply = (route, body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

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

const wireApi = async (context) => {
  await context.addInitScript(() => localStorage.setItem('accessToken', 'road7-responsive-test-token'));
  await context.route('**/api/v1/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname.endsWith('/auth/me')) {
      await reply(route, { status: 'success', data: { user: { _id: 'road7-student', role: 'student', fullName: 'Road 7 Test', email: 'road7@example.test', status: 'active' } } });
      return;
    }
    if (pathname.endsWith('/road-to-part-7')) {
      await reply(route, { status: 'success', data: { items: readings } });
      return;
    }
    await reply(route, { status: 'success', data: { attempts: [] } });
  });
};

const verifyViewport = async (viewport, expectedColumns) => {
  const context = await browser.newContext({ viewport });
  await wireApi(context);
  const page = await context.newPage();
  await page.goto(`${baseUrl}/student/road-to-part-7`);
  await page.getByRole('heading', { name: 'Road to Part 7' }).waitFor();

  const options = page.locator('.road7-reading-option');
  await assert.doesNotReject(() => options.nth(25).waitFor());
  assert.equal(await options.count(), 26, `${viewport.width}px renders all 26 readings`);
  assert.equal(await page.locator('.road7-reading-list').evaluate((list) => list.children.length), 26);

  const layout = await page.locator('.road7-reading-list').evaluate((list) => {
    list.scrollTop = list.scrollHeight;
    const last = list.lastElementChild.getBoundingClientRect();
    const bounds = list.getBoundingClientRect();
    return {
      columns: getComputedStyle(list).gridTemplateColumns.split(' ').filter(Boolean).length,
      isScrollable: list.scrollHeight > list.clientHeight,
      lastVisible: last.top >= bounds.top && last.bottom <= bounds.bottom + 1,
    };
  });

  assert.equal(layout.columns, expectedColumns, `${viewport.width}px uses the intended reading-list grid`);
  assert.equal(layout.isScrollable, true, `${viewport.width}px keeps the reading selector scrollable`);
  assert.equal(layout.lastVisible, true, `${viewport.width}px exposes Bài đọc 26 at the end of the selector`);

  const reader = await page.locator('.road7-flash-english').evaluate((scrollArea) => {
    scrollArea.scrollTop = scrollArea.scrollHeight;
    const content = scrollArea.querySelector('.road7-flash-english__content').getBoundingClientRect();
    const bounds = scrollArea.getBoundingClientRect();
    return {
      isScrollable: scrollArea.scrollHeight > scrollArea.clientHeight,
      lastLineVisible: content.bottom <= bounds.bottom - 18,
    };
  });
  assert.equal(reader.isScrollable, true, `${viewport.width}px keeps long English readings inside their own scroller`);
  assert.equal(reader.lastLineVisible, true, `${viewport.width}px leaves space below the last English line`);

  if (viewport.width <= 600) {
    const navigation = await page.locator('.road7-flash-nav').evaluate((nav) => {
      const previous = nav.querySelector('button:first-child').getBoundingClientRect();
      const next = nav.querySelector('button:last-child').getBoundingClientRect();
      const flip = nav.querySelector('.road7-flip-button').getBoundingClientRect();
      return { previousTop: previous.top, nextTop: next.top, flipWidth: flip.width, navWidth: nav.getBoundingClientRect().width };
    });
    assert.equal(navigation.previousTop, navigation.nextTop, 'mobile previous and next controls share one row');
    assert.ok(navigation.flipWidth >= navigation.navWidth - 1, 'mobile flip control spans the full navigation row');
  }
  await context.close();
};

try {
  await launchVite();
  browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}),
  });
  await verifyViewport({ width: 1440, height: 800 }, 1);
  await verifyViewport({ width: 1024, height: 768 }, 5);
  await verifyViewport({ width: 390, height: 844 }, 1);
  console.log('Road to Part 7 responsive UI check passed.');
} finally {
  await browser?.close();
  viteProcess?.kill('SIGTERM');
}
