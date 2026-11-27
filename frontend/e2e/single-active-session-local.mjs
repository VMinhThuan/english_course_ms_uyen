import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import mongoose from '../../backend/node_modules/mongoose/index.js';
import { MongoMemoryReplSet } from '../../backend/node_modules/mongodb-memory-server/index.js';
import playwright from '../node_modules/playwright/index.js';

const { chromium } = playwright;

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const backendRoot = path.resolve(frontendRoot, '..', 'backend');
const host = '127.0.0.1';
const backendPort = 3911;
const frontendPort = 5171;
const apiOrigin = `http://${host}:${backendPort}`;
const frontendOrigin = `http://${host}:${frontendPort}`;
const databaseName = `single_session_ui_${randomUUID().replaceAll('-', '')}`;
const password = 'SingleSessionUi!2026';

let replicaSet;
let backendServer;
let viteProcess;
let browser;

const waitForHttp = async (url, timeoutMs = 30000) => {
  const startedAt = Date.now();
  let lastError;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
      lastError = new Error(`${url} returned HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw lastError || new Error(`Timed out waiting for ${url}`);
};

const stopProcess = (child) => {
  if (!child || child.killed) return;
  child.kill('SIGTERM');
};

try {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = `single-session-ui-access-${randomUUID()}`;
  process.env.JWT_REFRESH_SECRET = `single-session-ui-refresh-${randomUUID()}`;
  process.env.AUTH_SESSION_ENFORCEMENT_STUDENTS = 'true';
  process.env.AUTH_REFRESH_ROTATION = 'true';
  process.env.MONGOOSE_AUTO_INDEX = 'true';
  process.env.FRONTEND_URL = frontendOrigin;

  replicaSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, ip: host, dbName: databaseName },
  });
  process.env.MONGODB_URI = replicaSet.getUri(databaseName);

  const [{ default: app }, { default: User }] = await Promise.all([
    import(pathToFileURL(path.join(backendRoot, 'src/app.js')).href),
    import(pathToFileURL(path.join(backendRoot, 'src/models/User.js')).href),
  ]);
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000, autoIndex: true });
  await User.init();
  await User.create({
    email: 'single-session-ui@test.local',
    password,
    fullName: 'Single Session UI',
    role: 'student',
    status: 'active',
    isActive: true,
  });

  backendServer = app.listen(backendPort, host);
  await waitForHttp(`${apiOrigin}/health`);

  viteProcess = spawn(process.execPath, [
    path.join(frontendRoot, 'node_modules', 'vite', 'bin', 'vite.js'),
    '--host', host,
    '--port', String(frontendPort),
    '--strictPort',
  ], {
    cwd: frontendRoot,
    env: { ...process.env, BROWSER: 'none', VITE_API_URL: `${apiOrigin}/api/v1` },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await waitForHttp(`${frontendOrigin}/login`);

  browser = await chromium.launch({ headless: true });
  const deviceOne = await browser.newContext();
  const deviceTwo = await browser.newContext();
  const pageOne = await deviceOne.newPage();
  const pageTwo = await deviceTwo.newPage();

  const login = async (page) => {
    await page.goto(`${frontendOrigin}/login`, { waitUntil: 'domcontentloaded' });
    await page.locator('#login-identifier').fill('single-session-ui@test.local');
    await page.locator('#login-password').fill(password);
    await page.getByRole('button', { name: /Đăng nhập/ }).click();
    await page.waitForURL('**/student/dashboard', { timeout: 15000 });
  };

  await login(pageOne);
  await login(pageTwo);

  let pageOneRefreshCalls = 0;
  pageOne.on('request', (request) => {
    if (request.url().endsWith('/auth/refresh')) pageOneRefreshCalls += 1;
  });
  const refreshCallsBeforeReplacement = pageOneRefreshCalls;
  await pageOne.reload({ waitUntil: 'domcontentloaded' });
  const replacementDialog = pageOne.getByRole('dialog');
  await replacementDialog.waitFor({ state: 'visible', timeout: 15000 });
  assert.equal(pageOneRefreshCalls, refreshCallsBeforeReplacement);
  assert.equal(await pageOne.getByRole('dialog').count(), 1);
  await assert.equal(await replacementDialog.getByRole('heading').textContent(), 'Phiên đăng nhập đã kết thúc');
  await assert.match(
    await replacementDialog.textContent(),
    /được đăng nhập trên một thiết bị khác/,
  );
  await replacementDialog.getByRole('button', { name: 'Đăng nhập lại' }).click();
  await pageOne.waitForURL('**/login', { timeout: 10000 });

  const secondTab = await deviceTwo.newPage();
  await secondTab.goto(`${frontendOrigin}/student/dashboard`, { waitUntil: 'domcontentloaded' });
  await secondTab.waitForURL('**/student/dashboard', { timeout: 10000 });
  assert.equal(await pageTwo.locator('body').isVisible(), true);
  assert.equal(await secondTab.locator('body').isVisible(), true);
  assert.equal(await pageTwo.getByRole('dialog').count(), 0);
  assert.equal(await secondTab.getByRole('dialog').count(), 0);

  await deviceOne.close();
  await deviceTwo.close();
  console.log('PASS: two browser contexts, replacement modal, conditional logout, and multi-tab current session');
} finally {
  await browser?.close().catch(() => {});
  stopProcess(viteProcess);
  await new Promise((resolve) => backendServer?.close(resolve) || resolve());
  await mongoose.disconnect().catch(() => {});
  await replicaSet?.stop().catch(() => {});
}
