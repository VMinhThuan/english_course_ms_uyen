import assert from 'node:assert/strict';
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = createRequire(path.join(root, 'package.json'))('playwright');
const port = await new Promise((resolve, reject) => {
  const listener = net.createServer();
  listener.once('error', reject);
  listener.listen(0, '127.0.0.1', () => {
    const value = listener.address().port;
    listener.close(() => resolve(value));
  });
});
const origin = `http://127.0.0.1:${port}`;
const viewports = [
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
];
const student = { _id: 'browser-streak-student', fullName: 'Browser Streak Student', email: 'streak.browser@test', role: 'student', status: 'active' };
const admin = { _id: 'browser-streak-admin', fullName: 'Browser Streak Admin', email: 'streak.admin@test', role: 'admin', status: 'active' };
const streakData = {
  timezone: 'Asia/Ho_Chi_Minh',
  today: { dateKey: '2026-11-23', validStudySeconds: 480, targetSeconds: 900, remainingSeconds: 420, completed: false },
  streak: { currentStreak: 12, longestStreak: 18, totalCompletedDays: 24, currentTier: 3, tierName: 'Burning Flame', nextMilestone: 14, milestones: [] },
  calendar: Array.from({ length: 35 }, (_, index) => ({ dateKey: `2026-11-${String(Math.max(1, index + 1)).padStart(2, '0')}`, status: index % 3 === 0 ? 'completed' : 'no_data', validStudySeconds: index % 3 === 0 ? 900 : 0 })),
  milestones: [3, 7, 14, 30, 60, 100].map((days) => ({ days, unlocked: days <= 12 })),
  totalValidStudySeconds: 21600,
};

const waitForVite = async (child) => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 30000) {
    if (child.exitCode !== null) throw new Error('Vite exited before browser audit started.');
    try { if ((await fetch(origin)).ok) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Timed out waiting for Vite.');
};

const response = (route, data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ status: 'success', data }) });
const installMocks = async (context, role, completedToday = false) => {
  const responseStreakData = completedToday
    ? { ...streakData, today: { ...streakData.today, validStudySeconds: 900, remainingSeconds: 0, completed: true } }
    : streakData;
  await context.addInitScript(() => localStorage.setItem('accessToken', 'browser-audit-token'));
  await context.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (pathname.endsWith('/auth/me')) return response(route, { user: role === 'admin' ? admin : student });
    if (pathname.endsWith('/attempts/active')) return response(route, { attempts: [] });
    if (pathname.endsWith('/learning/streak/overview')) return response(route, responseStreakData);
    if (pathname.endsWith('/learning/sessions/start')) return response(route, { sessionId: `browser-${role}-session`, session: { activityType: 'interactive', status: 'active' } }, 201);
    if (pathname.endsWith('/learning/sessions/heartbeat')) return response(route, { addedSeconds: 0 });
    if (pathname.endsWith('/learning/sessions/end') || pathname.endsWith('/learning/sessions/activity-heartbeat')) return response(route, { addedSeconds: 0 });
    if (pathname.endsWith('/admin/learning/overview')) return response(route, { totalStudents: 1, currentlyActiveStudents: 0, currentlyInactiveStudents: 1, averageDailyStudySeconds: 480, weeklyLeaderboard: [] });
    if (pathname.endsWith('/admin/learning/students')) return response(route, { students: [{ _id: 'browser-student', fullName: 'Browser Student', email: 'student@test', currentStreak: 12, longestStreak: 18, todayValidStudySeconds: 480, dailyGoalStatus: 'IN_PROGRESS', streakStatus: 'in_progress', activityStatus: 'INACTIVE', totalLearningSeconds: 1200 }], pagination: { page: 1, limit: 20, total: 1, pages: 1 } });
    if (pathname.endsWith('/admin/learning/students/browser-student')) return response(route, { student: { _id: 'browser-student', fullName: 'Browser Student', email: 'student@test', status: 'active' }, learningOverview: { totalLearningSeconds: 1200, studyTodaySeconds: responseStreakData.today.validStudySeconds, overallCompletionPercentage: 0, totalLessons: 0, streak: responseStreakData.streak, dailyGoal: responseStreakData.today }, lastLearningActivity: null });
    if (pathname.endsWith('/admin/learning/students/browser-student/streak')) return response(route, responseStreakData);
    if (pathname.endsWith('/admin/learning/students/browser-student/streak/activity')) return response(route, { rows: streakData.calendar.slice(-30).map((row) => ({ localDate: row.dateKey, validStudySeconds: row.validStudySeconds })) });
    if (pathname.endsWith('/gamification/overview')) return response(route, { today: { challenge: null }, streak: { current: 1, longest: 1 }, stats: {} });
    return response(route, {});
  });
};

const vite = spawn(process.execPath, [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'), '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: root, env: { ...process.env, BROWSER: 'none' }, stdio: 'ignore' });
let browser;
try {
  await waitForVite(vite);
  browser = await chromium.launch({ headless: true });
  for (const viewport of viewports) {
    for (const [role, pathname] of [['student', '/student/streak-challenge'], ['student', '/student/learning-streak'], ['admin', '/admin/learning-progress'], ['admin', '/admin/learning-progress/students/browser-student']]) {
      const context = await browser.newContext({ viewport });
      const celebrationScenario = role === 'student' && pathname === '/student/learning-streak' && viewport.width === 375;
      await installMocks(context, role, celebrationScenario);
      const page = await context.newPage();
      const pageErrors = [];
      page.on('pageerror', (error) => pageErrors.push(error.message));
      await page.goto(`${origin}${pathname}`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(250);
      const layout = await page.evaluate(() => ({ width: window.innerWidth, scrollWidth: document.documentElement.scrollWidth }));
      assert.deepEqual(pageErrors, [], `${role} ${pathname} browser errors at ${viewport.width}px`);
      assert.ok(layout.scrollWidth - layout.width <= 1, `${role} ${pathname} horizontal overflow at ${viewport.width}px`);
      if (role === 'student' && pathname === '/student/streak-challenge') {
        assert.equal(await page.locator('.learning-streak-page').count(), 0, 'vocabulary challenge must not render Learning Streak UI');
        assert.equal(await page.locator('.game-hero--streak').count(), 1, 'vocabulary challenge route should keep its own challenge header');
      }
      if (role === 'student' && pathname === '/student/learning-streak') {
        assert.equal(await page.locator('.learning-streak-page').count(), 1, 'Learning Streak route should render its own page');
        assert.equal(await page.locator('.game-hero--streak').count(), 0, 'Learning Streak route must not render vocabulary challenge header');
        const firstCalendarDay = page.locator('.learning-streak-day').first();
        await firstCalendarDay.click();
        assert.equal(await page.locator('.learning-streak-day-detail').count(), 1, 'calendar day should open its detail panel');
        if (viewport.width === 1280) {
          await page.locator('a[href="/student/streak-challenge"]').click();
          await page.waitForTimeout(150);
          assert.equal(new URL(page.url()).pathname, '/student/streak-challenge', 'sidebar should navigate to vocabulary challenge');
          await page.goBack({ waitUntil: 'domcontentloaded' });
          assert.equal(new URL(page.url()).pathname, '/student/learning-streak', 'browser back should restore Learning Streak');
          await page.goForward({ waitUntil: 'domcontentloaded' });
          assert.equal(new URL(page.url()).pathname, '/student/streak-challenge', 'browser forward should restore vocabulary challenge');
        }
      }
      if (role === 'admin' && pathname === '/admin/learning-progress') {
        const monitoringTable = page.locator('.monitoring-student-list-table');
        await monitoringTable.waitFor();
        const tableLayout = await monitoringTable.evaluate((table) => ({
          tableWidth: table.getBoundingClientRect().width,
          headerWidths: [...table.querySelectorAll('thead th')].map((cell) => Math.round(cell.getBoundingClientRect().width)),
          rowHeight: table.querySelector('tbody tr')?.getBoundingClientRect().height || 0,
          timeText: table.querySelector('tbody tr td:nth-child(4)')?.innerText || '',
        }));
        assert.equal(tableLayout.headerWidths.length, 5, 'student monitoring table should keep all five columns');
        assert.ok(tableLayout.headerWidths[4] >= 90, `action column should remain usable: ${JSON.stringify(tableLayout)}`);
        assert.ok(tableLayout.headerWidths[3] >= 220, `study time column should not collapse: ${JSON.stringify(tableLayout)}`);
        assert.ok(tableLayout.rowHeight < 260, `monitoring row should not become vertically stretched: ${JSON.stringify(tableLayout)}`);
        assert.match(tableLayout.timeText, /Hôm nay/);
      }
      if (role === 'admin' && pathname === '/admin/learning-progress/students/browser-student') {
        assert.equal(await page.locator('.admin-student-detail-tabs').count(), 1, 'student detail tabs should be visible near the summary');
        assert.equal(await page.locator('.admin-streak-day').count(), 35, 'student detail should keep the 35-day streak history');
        const streakCalendarColumns = await page.locator('.admin-streak-calendar').evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length);
        assert.equal(streakCalendarColumns, 7, 'student streak calendar should use a readable seven-column grid');
      }
      if (role === 'student' && pathname === '/student/streak-challenge' && viewport.width === 375) {
        await page.locator('.mobile-hamburger-btn').click();
        await page.waitForTimeout(350);
        const practiceMenu = page.locator('.practice-sidebar-menu');
        const sidebarGeometry = await page.locator('.student-sidebar').evaluate((element) => {
          const rect = element.getBoundingClientRect();
          return {
            left: rect.left,
            width: rect.width,
            viewportWidth: window.innerWidth,
            height: rect.height,
            viewportHeight: window.innerHeight,
            horizontalOverflow: element.scrollWidth > element.clientWidth,
          };
        });
        assert.ok(sidebarGeometry.left >= 0, `mobile sidebar should stay inside viewport: ${JSON.stringify(sidebarGeometry)}`);
        assert.ok(sidebarGeometry.width <= sidebarGeometry.viewportWidth - 8, `mobile sidebar should leave a usable backdrop: ${JSON.stringify(sidebarGeometry)}`);
        assert.ok(sidebarGeometry.height <= sidebarGeometry.viewportHeight + 1, `mobile sidebar should fit viewport height: ${JSON.stringify(sidebarGeometry)}`);
        assert.equal(sidebarGeometry.horizontalOverflow, false, 'mobile sidebar should not horizontally overflow');
        const practiceToggle = practiceMenu.locator('.practice-sidebar-toggle');
        await practiceToggle.click();
        assert.equal(await practiceToggle.getAttribute('aria-expanded'), 'true', 'practice dropdown should open on mobile');
        assert.equal(await practiceMenu.locator('.practice-sidebar-children').getAttribute('aria-hidden'), 'false', 'practice dropdown should expose its items');
        const grammarToggle = practiceMenu.locator('.practice-sidebar-group-toggle');
        await grammarToggle.click();
        assert.equal(await grammarToggle.getAttribute('aria-expanded'), 'true', 'grammar dropdown should open on mobile');
        assert.equal(await practiceMenu.locator('.practice-sidebar-nested').getAttribute('aria-hidden'), 'false', 'grammar dropdown should expose its items');
      }
      if (celebrationScenario) {
        assert.equal(await page.locator('.learning-streak-celebration').count(), 1, 'celebration should appear once after completion');
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(250);
        assert.equal(await page.locator('.learning-streak-celebration').count(), 0, 'celebration should not replay after refresh');
      }
      assert.deepEqual(pageErrors, [], `${role} ${pathname} browser errors after interaction at ${viewport.width}px`);
      await context.close();
    }
  }
  console.log('Learning Streak browser audit passed at 375, 390, 768, 1280 and 1440px.');
} finally {
  await browser?.close();
  vite.kill('SIGTERM');
}
