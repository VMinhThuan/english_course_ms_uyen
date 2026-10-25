import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(scriptDir, '..');
const projectRoot = path.resolve(frontendRoot, '..');
const backendRoot = path.join(projectRoot, 'backend');
const backendRequire = createRequire(path.join(backendRoot, 'package.json'));
const frontendRequire = createRequire(path.join(frontendRoot, 'package.json'));
const { MongoMemoryServer } = backendRequire('mongodb-memory-server');
const mongoose = backendRequire('mongoose');
const express = backendRequire('express');
const cors = backendRequire('cors');
const jwt = backendRequire('jsonwebtoken');
const { chromium } = frontendRequire('playwright');
const { randomUUID } = await import('node:crypto');
const { deflateRawSync } = await import('node:zlib');

const unique = randomUUID().replaceAll('-', '');
const databaseName = `p5_ui_${unique}`;
const evidenceDir = path.join(projectRoot, 'docs', 'toeic-part5', 'phase3', 'evidence');
let mongoServer;
let backendServer;
let viteProcess;
let browser;
let admin;

const getPort = () => new Promise((resolve, reject) => {
  const server = net.createServer();
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const port = server.address().port;
    server.close(() => resolve(port));
  });
});

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let value = n;
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[n] = value >>> 0;
  }
  return table;
})();

const crc32 = (buffer) => {
  let value = 0xffffffff;
  for (const byte of buffer) value = crcTable[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
};

const zipEntries = (entries) => {
  const localParts = [];
  const centralParts = [];
  let localOffset = 0;
  for (const [name, contents] of entries) {
    const nameBytes = Buffer.from(name, 'utf8');
    const data = Buffer.isBuffer(contents) ? contents : Buffer.from(contents, 'utf8');
    const compressed = deflateRawSync(data);
    const checksum = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    localParts.push(local, nameBytes, compressed);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(localOffset, 42);
    centralParts.push(central, nameBytes);
    localOffset += local.length + nameBytes.length + compressed.length;
  }
  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(localOffset, 16);
  return Buffer.concat([...localParts, centralDirectory, end]);
};

const xmlEscape = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
const columnName = (number) => {
  let value = number;
  let name = '';
  while (value > 0) {
    const remainder = (value - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    value = Math.floor((value - 1) / 26);
  }
  return name;
};

const makeXlsx = () => {
  const headers = ['Câu hỏi', 'A', 'B', 'C', 'D', 'Đáp án đúng', 'Lời giải thích'];
  const rows = [
    ['The manager _____ the report.', 'carefully', 'quickly', 'careful', 'carefulness', 'A', 'Choose the adverb that modifies the verb.'],
    ['The manager _____ the report.', 'carefully', 'quickly', 'careful', 'carefulness', 'A', 'Choose the adverb that modifies the verb.'],
    ['The office _____ at nine.', 'opens', 'opening', 'open', 'opened', '', 'The sentence needs a present-tense verb.'],
  ];
  const allRows = [headers, ...rows];
  const worksheetRows = allRows.map((values, rowIndex) => `<row r="${rowIndex + 1}">${values.map((value, columnIndex) => `<c r="${columnName(columnIndex + 1)}${rowIndex + 1}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`).join('')}</row>`).join('');
  const worksheetXml = `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:G4"/><sheetData>${worksheetRows}</sheetData></worksheet>`;
  const contentTypes = `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/></Types>`;
  const workbook = `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="TOEIC" sheetId="1" r:id="rId1"/></sheets></workbook>`;
  const rels = `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`;
  return zipEntries([
    ['[Content_Types].xml', contentTypes],
    ['xl/workbook.xml', workbook],
    ['xl/_rels/workbook.xml.rels', rels],
    ['xl/worksheets/sheet1.xml', worksheetXml],
  ]);
};

const startVite = async (frontendPort, apiUrl) => {
  viteProcess = spawn(process.execPath, [path.join(frontendRoot, 'node_modules', 'vite', 'bin', 'vite.js'), '--host', '127.0.0.1', '--port', String(frontendPort), '--strictPort'], {
    cwd: frontendRoot,
    env: { ...process.env, BROWSER: 'none', VITE_API_URL: apiUrl },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  viteProcess.stdout.on('data', (chunk) => { output += chunk.toString(); });
  viteProcess.stderr.on('data', (chunk) => { output += chunk.toString(); });
  const startedAt = Date.now();
  while (Date.now() - startedAt < 30000) {
    if (viteProcess.exitCode !== null) throw new Error(`Vite exited before ready: ${output}`);
    try { if ((await fetch(`http://127.0.0.1:${frontendPort}`)).ok) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for Vite: ${output}`);
};

const main = async () => {
  assert.equal(mongoose.connection.readyState, 0, 'real-backend browser integration requires an isolated database connection');
  mongoServer = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1', dbName: databaseName } });
  const mongoUri = mongoServer.getUri(databaseName);
  assert.equal(new URL(mongoUri).hostname, '127.0.0.1');
  assert.equal(new URL(mongoUri).pathname.replaceAll('/', ''), databaseName);
  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000, autoIndex: true });

  const [User, Question, Assessment, Attempt, QuestionGroup, QuestionImportBatch, QuestionImportRow] = await Promise.all([
    import(pathToFileURL(path.join(backendRoot, 'src/models/User.js'))),
    import(pathToFileURL(path.join(backendRoot, 'src/models/Question.js'))),
    import(pathToFileURL(path.join(backendRoot, 'src/models/Assessment.js'))),
    import(pathToFileURL(path.join(backendRoot, 'src/models/Attempt.js'))),
    import(pathToFileURL(path.join(backendRoot, 'src/models/QuestionGroup.js'))),
    import(pathToFileURL(path.join(backendRoot, 'src/models/QuestionImportBatch.js'))),
    import(pathToFileURL(path.join(backendRoot, 'src/models/QuestionImportRow.js'))),
  ]).then((models) => models.map((module) => module.default));
  await Promise.all([User.init(), Question.init(), Assessment.init(), Attempt.init(), QuestionGroup.init(), QuestionImportBatch.init(), QuestionImportRow.init()]);

  process.env.JWT_SECRET = `p5-ui-${unique}`;
  admin = await User.create({ email: `p5-ui-admin-${unique}@example.test`, password: 'admin-password', role: 'admin', status: 'active', isActive: true });
  const adminToken = jwt.sign({ userId: admin._id }, process.env.JWT_SECRET, { expiresIn: '10m' });

  const [questionRoutes, assessmentRoutes, questionImportRoutes, errorHandlerModule] = await Promise.all([
    import(pathToFileURL(path.join(backendRoot, 'src/routes/questionRoutes.js'))),
    import(pathToFileURL(path.join(backendRoot, 'src/routes/assessmentRoutes.js'))),
    import(pathToFileURL(path.join(backendRoot, 'src/routes/questionImportRoutes.js'))),
    import(pathToFileURL(path.join(backendRoot, 'src/middlewares/errorHandler.js'))),
  ]);
  const backendPort = await getPort();
  const frontendPort = await getPort();
  const frontendOrigin = `http://127.0.0.1:${frontendPort}`;
  const backendOrigin = `http://127.0.0.1:${backendPort}`;
  const app = express();
  app.use(cors({ origin: frontendOrigin, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use('/api/v1/questions', questionRoutes.default);
  app.use('/api/v1/assessments', assessmentRoutes.default);
  app.use('/api/v1/admin/question-import-batches', questionImportRoutes.default);
  app.use(errorHandlerModule.errorHandler);
  backendServer = app.listen(backendPort, '127.0.0.1');
  await new Promise((resolve, reject) => { backendServer.once('listening', resolve); backendServer.once('error', reject); });
  await startVite(frontendPort, `${backendOrigin}/api/v1`);

  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1365, height: 940 } });
  await context.addInitScript((token) => localStorage.setItem('accessToken', token), adminToken);
  const page = await context.newPage();
  await page.route('**/api/v1/auth/me', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ status: 'success', data: { user: { _id: String(admin._id), role: 'admin', fullName: 'Import Admin', email: admin.email, status: 'active', isActive: true } } }),
  }));
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto(`${frontendOrigin}/admin/questions/import-part5`);
  await page.getByRole('heading', { name: 'Import Excel Part 5' }).waitFor();
  await page.locator('input[type="file"]').setInputFiles({
    name: 'synthetic-real-backend.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: makeXlsx(),
  });
  await page.getByRole('button', { name: 'Phân tích file' }).click();
  await page.getByRole('heading', { name: 'synthetic-real-backend.xlsx' }).waitFor({ timeout: 20000 });
  await page.getByRole('region', { name: 'Tổng quan trạng thái import' }).getByText('Không hợp lệ').waitFor();
  assert.equal(await page.locator('.p5-import__metric strong').first().textContent(), '3');
  assert.equal(await page.locator('.p5-import__metric strong').nth(1).textContent(), '1');
  assert.equal(await page.locator('.p5-import__metric strong').nth(2).textContent(), '1');
  assert.equal(await page.locator('.p5-import__metric strong').nth(4).textContent(), '1');
  assert.equal(await page.getByRole('checkbox', { name: 'Chọn dòng Excel 3' }).isDisabled(), true, 'identical workbook row is not selectable');
  await page.getByText('MISSING_ANSWER').waitFor();

  await page.getByRole('checkbox', { name: 'Chọn dòng Excel 2' }).check();
  await page.locator('.p5-import__row').filter({ hasText: 'Dòng Excel 4' }).getByRole('button', { name: 'Sửa dòng' }).click();
  await page.getByRole('dialog').getByRole('radio', { name: 'Đặt B là đáp án đúng' }).check();
  await page.getByRole('button', { name: 'Lưu và kiểm tra lại' }).click();
  await page.getByText('Dòng 4 đã được backend kiểm tra lại.').waitFor();
  await page.getByRole('checkbox', { name: 'Chọn dòng Excel 4' }).check();
  await page.getByRole('button', { name: 'Import 2 câu hỏi' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Tạo 2 Draft' }).click();
  await page.getByText('Các dòng đã được xử lý. Question được tạo ở trạng thái Draft.').waitFor();
  await page.getByText('Dòng 4').waitFor();
  await page.getByText('Question created as draft.', { exact: true }).first().waitFor();

  const questions = await Question.find({ toeicPart: 5 }).select('+importBatchId +importRowNumber +importFingerprintVersion').lean();
  assert.equal(questions.length, 2);
  assert.ok(questions.every((question) => question.status === 'draft' && String(question.createdBy) === String(admin._id) && question.type === 'single_choice'));
  assert.ok(questions.every((question) => question.options.length === 4 && question.correctAnswers.length === 1));
  assert.equal(await Assessment.countDocuments({}), 0);
  assert.equal(await QuestionGroup.countDocuments({}), 0);
  assert.equal(await Attempt.countDocuments({}), 0);
  const batchId = new URL(page.url()).searchParams.get('batchId');
  assert.ok(batchId);
  const importedRows = await QuestionImportRow.find({ batchId, importState: 'IMPORTED' }).lean();
  assert.deepEqual(importedRows.map((row) => row.rowNumber).sort((a, b) => a - b), [2, 4]);

  await fs.mkdir(evidenceDir, { recursive: true });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: path.join(evidenceDir, 'import-preview-real-backend.png') });
  assert.deepEqual(errors, [], `browser errors: ${errors.join('; ')}`);
  console.log(JSON.stringify({
    status: 'PASS',
    browser: 'Playwright Chromium',
    backend: 'Phase 2 Express routes with real MongoMemoryServer test DB',
    auth: 'Admin session identity endpoint mocked; import endpoints use real bearer auth and real backend',
    syntheticWorkbook: { sheet: 'TOEIC', rows: 3, expectedStatuses: { VALID: 1, DUPLICATE: 1, INVALID: 1 } },
    patchedRow: 4,
    confirmedRows: [2, 4],
    createdQuestionCount: questions.length,
    createdAsDraft: questions.every((question) => question.status === 'draft'),
    assessmentsCreated: 0,
    questionGroupsCreated: 0,
    browserErrors: errors.length,
    isolatedDatabase: databaseName,
  }, null, 2));
  await context.close();
};

try {
  await main();
} finally {
  if (browser) await browser.close().catch(() => {});
  if (viteProcess && viteProcess.exitCode === null) viteProcess.kill('SIGTERM');
  if (backendServer?.listening) await new Promise((resolve) => backendServer.close(resolve));
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect().catch(() => {});
  if (mongoServer) await mongoServer.stop().catch(() => {});
}
