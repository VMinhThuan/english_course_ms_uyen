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
const viewports = [
  { label: 'mobile', width: 390, height: 844 },
  { label: 'tablet', width: 1024, height: 768 },
  { label: 'desktop', width: 1440, height: 900 },
];
const routes = {
  student: [
    '/student/dashboard', '/student/courses', '/student/my-courses', '/student/assessments',
    '/student/vocabulary', '/student/vocabulary-dictation', '/student/hard-words-dictation',
    '/student/part-2-challenge', '/student/road-to-part-7', '/student/toeic', '/student/part-1',
    '/student/part-5', '/student/history', '/student/profile',
  ],
  admin: [
    '/admin', '/admin/courses', '/admin/students', '/admin/lessons', '/admin/materials',
    '/admin/vocabulary', '/admin/assessments', '/admin/results', '/admin/statistics',
    '/admin/questions', '/admin/toeic-tests', '/admin/road-to-part-7',
  ],
  public: ['/', '/courses', '/login', '/register'],
};
const requestedViewport = process.env.RESPONSIVE_AUDIT_VIEWPORT;
const requestedRole = process.env.RESPONSIVE_AUDIT_ROLE;
const selectedViewports = requestedViewport ? viewports.filter((viewport) => viewport.label === requestedViewport) : viewports;
const selectedRoutes = requestedRole ? { [requestedRole]: routes[requestedRole] } : routes;

if (requestedViewport && selectedViewports.length === 0) throw new Error(`Unknown viewport: ${requestedViewport}`);
if (requestedRole && !routes[requestedRole]) throw new Error(`Unknown role: ${requestedRole}`);

let viteProcess;
let browser;

const reply = (route, body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
const genericData = {
  courses: [], lessons: [], assessments: [], attempts: [], items: [], tests: [], questions: [], results: [], students: [], vocabulary: [],
  pagination: { page: 1, pages: 1, total: 0, limit: 20 },
  stats: { totalStudents: 0, activeStudents: 0, pendingStudents: 0, lockedStudents: 0, pendingStudentList: [] },
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

const wireApi = async (context, role) => {
  await context.addInitScript(() => localStorage.setItem('accessToken', 'responsive-layout-audit-token'));
  await context.route('**/api/v1/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname.endsWith('/auth/me')) {
      await reply(route, { status: 'success', data: { user: { _id: `${role}-audit`, role, fullName: 'Responsive Audit', email: 'responsive.audit@example.test', status: 'active' } } });
      return;
    }
    await reply(route, { status: 'success', data: genericData });
  });
};

const inspectRoute = async (page, pageErrors, role, viewport, pathName) => {
  pageErrors.length = 0;
  await page.goto(`${baseUrl}${pathName}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(100);
  const layout = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    overflow: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
  }));
  assert.deepEqual(pageErrors, [], `${role} ${pathName} throws a render error at ${viewport.label}: ${pageErrors.join('\n')}`);
  assert.ok(layout.overflow <= 1, `${role} ${pathName} overflows horizontally at ${viewport.label} by ${layout.overflow}px`);
};

try {
  await launchVite();
  browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}),
  });
  for (const viewport of selectedViewports) {
    console.log(`Checking ${viewport.label}…`);
    for (const [role, paths] of Object.entries(selectedRoutes)) {
      const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
      await wireApi(context, role);
      const page = await context.newPage();
      const pageErrors = [];
      page.on('pageerror', (error) => pageErrors.push(error.message));
      for (const pathName of paths) await inspectRoute(page, pageErrors, role, viewport, pathName);
      await context.close();
    }
  }
  console.log('Responsive layout audit passed.');
} finally {
  await browser?.close();
  viteProcess?.kill('SIGTERM');
}
