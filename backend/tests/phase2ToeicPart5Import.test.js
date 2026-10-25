import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { deflateRawSync } from 'node:zlib';
import express from 'express';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { MongoMemoryServer } from 'mongodb-memory-server';
import questionRoutes from '../src/routes/questionRoutes.js';
import assessmentRoutes from '../src/routes/assessmentRoutes.js';
import questionImportRoutes from '../src/routes/questionImportRoutes.js';
import { errorHandler } from '../src/middlewares/errorHandler.js';
import { parseToeicPart5Xlsx } from '../src/services/toeicPart5XlsxParser.js';
import User from '../src/models/User.js';
import Question from '../src/models/Question.js';
import QuestionImportBatch from '../src/models/QuestionImportBatch.js';
import QuestionImportRow from '../src/models/QuestionImportRow.js';
import Assessment from '../src/models/Assessment.js';
import Attempt from '../src/models/Attempt.js';
import QuestionGroup from '../src/models/QuestionGroup.js';

const unique = randomUUID().replaceAll('-', '');
const databaseName = `phase2_toeic_import_${unique}`;
const originalJwtSecret = process.env.JWT_SECRET;
let mongoServer;
let setupError;
let httpServer;
let baseUrl;
let teacher;
let admin;
let student;
let teacherToken;
let adminToken;
let studentToken;

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
    local.writeUInt16LE(0, 6);
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
    central.writeUInt16LE(0, 8);
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
  let result = '';
  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }
  return result;
};

const defaultHeaders = ['Câu hỏi', ' A ', 'B', 'C', 'D', 'Đáp án đúng', 'Lời giải thích'];
const toCellXml = (reference, value) => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object' && value.formula) {
    return `<c r="${reference}"><f>${xmlEscape(value.formula)}</f><v>${xmlEscape(value.cached ?? '')}</v></c>`;
  }
  return `<c r="${reference}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`;
};

const worksheetXml = ({ headers = defaultHeaders, rows = [], name = 'TOEIC' } = {}) => {
  const materializedRows = [{ physicalRow: 1, values: headers }, ...rows.map((row, index) => ({ physicalRow: row.physicalRow || index + 2, values: row.values || [] }))];
  const maxRow = Math.max(1, ...materializedRows.map((row) => row.physicalRow));
  const maxColumn = Math.max(7, ...materializedRows.map((row) => row.values.length));
  const xmlRows = materializedRows.map(({ physicalRow, values }) => {
    const cells = values.map((value, index) => toCellXml(`${columnName(index + 1)}${physicalRow}`, value)).join('');
    return `<row r="${physicalRow}">${cells}</row>`;
  }).join('');
  return {
    name,
    xml: `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:${columnName(maxColumn)}${maxRow}"/><sheetData>${xmlRows}</sheetData></worksheet>`,
  };
};

const makeXlsx = ({ headers = defaultHeaders, rows = [], sheetCount = 1, macro = false, extraEntries = [], workbookXmlPrefix = '' } = {}) => {
  const sheets = Array.from({ length: sheetCount }, (_, index) => worksheetXml({
    headers: index === 0 ? headers : ['Notes'],
    rows: index === 0 ? rows : [],
    name: index === 0 ? 'TOEIC' : `Sheet${index + 1}`,
  }));
  const contentType = macro
    ? 'application/vnd.ms-excel.sheet.macroEnabled.main+xml'
    : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml';
  const contentTypes = `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="${contentType}"/></Types>`;
  const sheetsXml = sheets.map((sheet, index) => `<sheet name="${sheet.name}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('');
  const workbookXml = `<?xml version="1.0" encoding="UTF-8"?>${workbookXmlPrefix}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheetsXml}</sheets></workbook>`;
  const relationships = sheets.map((sheet, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('');
  const entries = [
    ['[Content_Types].xml', contentTypes],
    ['xl/workbook.xml', workbookXml],
    ['xl/_rels/workbook.xml.rels', `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relationships}</Relationships>`],
    ...sheets.map((sheet, index) => [`xl/worksheets/sheet${index + 1}.xml`, sheet.xml]),
    ...extraEntries,
  ];
  return zipEntries(entries);
};

const validRow = (stem, { answer = 'C', explanation = 'Grammar explanation.', options, optionA = 'carefully', formulaAnswer = false } = {}) => ({
  values: [
    stem,
    optionA,
    options?.[1] ?? 'quickly',
    options?.[2] ?? 'careful',
    options?.[3] ?? 'carefulness',
    formulaAnswer ? { formula: '"C"', cached: 'C' } : answer,
    explanation,
  ],
});

const optionsFor = (overrides = {}) => ['A', 'B', 'C', 'D'].map((id) => ({ id, text: overrides[id] ?? `Option ${id}` }));

try {
  assert.equal(mongoose.connection.readyState, 0, 'tests must use an isolated MongoDB connection');
  mongoServer = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1', dbName: databaseName } });
  const isolatedUri = mongoServer.getUri(databaseName);
  assert.equal(new URL(isolatedUri).hostname, '127.0.0.1', 'test MongoDB must bind to loopback only');
  assert.equal(new URL(isolatedUri).pathname.replaceAll('/', ''), databaseName, 'test must use its unique disposable database');
  await mongoose.connect(isolatedUri, { serverSelectionTimeoutMS: 5000, autoIndex: true });
  await Promise.all([
    User.init(), Question.init(), Assessment.init(), Attempt.init(), QuestionGroup.init(),
    QuestionImportBatch.init(), QuestionImportRow.init(),
  ]);

  process.env.JWT_SECRET = `phase2-import-${unique}`;
  teacher = await User.create({ email: `p5-import-teacher-${unique}@example.test`, password: 'teacher-password', role: 'teacher', status: 'active', isActive: true });
  admin = await User.create({ email: `p5-import-admin-${unique}@example.test`, password: 'admin-password', role: 'admin', status: 'active', isActive: true });
  student = await User.create({ email: `p5-import-student-${unique}@example.test`, password: 'student-password', role: 'student', status: 'active', isActive: true });
  teacherToken = jwt.sign({ userId: teacher._id }, process.env.JWT_SECRET, { expiresIn: '10m' });
  adminToken = jwt.sign({ userId: admin._id }, process.env.JWT_SECRET, { expiresIn: '10m' });
  studentToken = jwt.sign({ userId: student._id }, process.env.JWT_SECRET, { expiresIn: '10m' });

  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use('/api/v1/questions', questionRoutes);
  app.use('/api/v1/assessments', assessmentRoutes);
  app.use('/api/v1/admin/question-import-batches', questionImportRoutes);
  app.use(errorHandler);
  httpServer = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    httpServer.once('listening', resolve);
    httpServer.once('error', reject);
  });
  baseUrl = `http://127.0.0.1:${httpServer.address().port}`;
} catch (error) {
  setupError = error;
  if (httpServer?.listening) await new Promise((resolve) => httpServer.close(resolve));
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect().catch(() => {});
  if (mongoServer) await mongoServer.stop().catch(() => {});
}

const requestJson = async (path, { method = 'GET', token, body } = {}) => {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return { response, json: await response.json() };
};

const uploadWorkbook = async (buffer, { token = adminToken, filename = 'toeic.xlsx' } = {}) => {
  const form = new FormData();
  form.append('file', new Blob([buffer]), filename);
  const response = await fetch(`${baseUrl}/api/v1/admin/question-import-batches`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  return { response, json: await response.json() };
};

const makeImportPath = (batchId, suffix = '') => `/api/v1/admin/question-import-batches/${batchId}${suffix}`;

test('Phase 2 TOEIC Part 5 XLSX import engine', {
  skip: setupError ? `BLOCKED: disposable MongoDB could not start (${setupError.message})` : false,
}, async (t) => {
  await t.test('parser reads actual OOXML structure and rejects unsafe or ambiguous inputs', async () => {
    const workbook = makeXlsx({ rows: [validRow('Cafe\u0301 employs a multilingual manager.\nPlease reply today.') ] });
    const parsed = await parseToeicPart5Xlsx({ buffer: workbook, originalFileName: 'sample.xlsx' });
    assert.equal(parsed.sheetName, 'TOEIC');
    assert.equal(parsed.headerRowNumber, 1);
    assert.equal(parsed.totalRows, 1);
    assert.equal(parsed.rows[0].rowNumber, 2);
    assert.equal(parsed.rows[0].status, 'VALID');
    assert.match(parsed.rows[0].values.questionText, /Cafe\u0301/);
    assert.ok(parsed.rows[0].values.questionText.includes('\n'));
    assert.deepEqual(parsed.rows[0].values.correctAnswers, ['C']);

    const formula = await parseToeicPart5Xlsx({
      buffer: makeXlsx({ rows: [validRow('Formula answer must not be evaluated.', { formulaAnswer: true })] }),
      originalFileName: 'formula.xlsx',
    });
    assert.equal(formula.rows[0].status, 'INVALID');
    assert.ok(formula.rows[0].issues.some((issue) => issue.code === 'FORMULA_NOT_ALLOWED'));
    assert.deepEqual(formula.rows[0].values.correctAnswers, []);

    const blankRowWorkbook = await parseToeicPart5Xlsx({
      buffer: makeXlsx({ rows: [{ physicalRow: 2, values: [] }, { ...validRow('After a physical blank row.'), physicalRow: 3 }] }),
      originalFileName: 'blank-row.xlsx',
    });
    assert.equal(blankRowWorkbook.totalRows, 2);
    assert.equal(blankRowWorkbook.rows[0].rowNumber, 2);
    assert.equal(blankRowWorkbook.rows[0].status, 'INVALID');
    assert.ok(blankRowWorkbook.rows[0].issues.some((issue) => issue.code === 'BLANK_ROW'));
    assert.equal(blankRowWorkbook.rows[1].rowNumber, 3, 'physical Excel row numbers must be preserved');

    const wrongHeaders = await parseToeicPart5Xlsx({
      buffer: makeXlsx({ headers: ['Prompt', 'Choice 1', 'Choice 2', 'Choice 3', 'Choice 4', 'Key', 'Reason'], rows: [validRow('No supported headers')] }),
      originalFileName: 'headers.xlsx',
    });
    assert.equal(wrongHeaders.rows[0].status, 'INVALID');
    assert.ok(wrongHeaders.rows[0].issues.some((issue) => issue.code === 'MISSING_HEADER'));

    const tooManySheets = makeXlsx({ sheetCount: 6 });
    await assert.rejects(parseToeicPart5Xlsx({ buffer: tooManySheets, originalFileName: 'many.xlsx' }), (error) => error.code === 'WORKSHEET_LIMIT');
    await assert.rejects(parseToeicPart5Xlsx({ buffer: makeXlsx({ macro: true }), originalFileName: 'macro.xlsx' }), (error) => error.code === 'MACRO_NOT_ALLOWED');
    await assert.rejects(parseToeicPart5Xlsx({ buffer: Buffer.from('not a zip'), originalFileName: 'broken.xlsx' }), (error) => error.code === 'INVALID_XLSX');
    await assert.rejects(parseToeicPart5Xlsx({ buffer: workbook, originalFileName: 'wrong.xls' }), (error) => error.code === 'XLSX_EXTENSION_REQUIRED');
    await assert.rejects(parseToeicPart5Xlsx({ buffer: Buffer.alloc(8 * 1024 * 1024 + 1), originalFileName: 'large.xlsx' }), (error) => error.code === 'FILE_TOO_LARGE');
    const compressionBomb = makeXlsx({ extraEntries: [['xl/repeated.txt', 'A'.repeat(500_000)]] });
    await assert.rejects(parseToeicPart5Xlsx({ buffer: compressionBomb, originalFileName: 'ratio.xlsx' }), (error) => error.code === 'ZIP_COMPRESSION_RATIO');
    const dtd = makeXlsx({ workbookXmlPrefix: '<!DOCTYPE workbook [<!ENTITY x "unsafe">]>' });
    await assert.rejects(parseToeicPart5Xlsx({ buffer: dtd, originalFileName: 'dtd.xlsx' }), (error) => error.code === 'XML_DTD_NOT_ALLOWED');
  });

  await t.test('Admin preview, row edits, safe confirm, retry, concurrency, and legacy compatibility', async () => {
    const legacyQuestion = await Question.create({
      questionText: `Existing assessment question ${unique}`,
      type: 'single_choice',
      toeicPart: 5,
      options: optionsFor(),
      correctAnswers: ['A'],
      explanation: 'Existing explanation.',
      status: 'published',
      createdBy: teacher._id,
    });
    const assessment = await Assessment.create({
      title: `Existing assessment ${unique}`,
      type: 'exam',
      examFormat: 'standard',
      status: 'published',
      durationMinutes: 30,
      questions: [{ question: legacyQuestion._id, score: 1 }],
      createdBy: teacher._id,
    });
    const assessmentQuestionIds = assessment.questions.map((item) => String(item.question));
    const assessmentCountBefore = await Assessment.countDocuments();
    const questionGroupsBefore = await QuestionGroup.countDocuments();

    const rows = [
      validRow(`Valid import row ${unique}`),
      validRow(`Formula edit row ${unique}`, { formulaAnswer: true }),
      validRow(`Invalid answer edit row ${unique}`, { answer: 'E' }),
      validRow(`Explanation edit row ${unique}`, { explanation: '' }),
      validRow(`Option edit row ${unique}`, { optionA: '' }),
      validRow(`Concurrent row ${unique}`),
    ].map((row) => ({ ...row, values: [...row.values, 'published', 'forged-question-id', 'forged-user-id', '1', 'multiple_choice'] }));
    const workbook = makeXlsx({ headers: [...defaultHeaders, 'Status', 'Question ID', 'Created By', 'TOEIC Part', 'Type'], rows });
    const initialQuestionCount = await Question.countDocuments();

    const anonymous = await uploadWorkbook(workbook, { token: null });
    assert.equal(anonymous.response.status, 401);
    const teacherDenied = await uploadWorkbook(workbook, { token: teacherToken });
    assert.equal(teacherDenied.response.status, 403);
    const studentDenied = await uploadWorkbook(workbook, { token: studentToken });
    assert.equal(studentDenied.response.status, 403);
    const oversizedUpload = await uploadWorkbook(Buffer.alloc(8 * 1024 * 1024 + 1));
    assert.equal(oversizedUpload.response.status, 413);
    assert.equal(oversizedUpload.json.code, 'FILE_TOO_LARGE');
    const studentQuestionBank = await requestJson('/api/v1/questions', { token: studentToken });
    assert.equal(studentQuestionBank.response.status, 403);

    const upload = await uploadWorkbook(workbook);
    assert.equal(upload.response.status, 201, upload.json.message);
    const batchId = upload.json.data.batch._id;
    assert.equal(upload.json.data.rows.length, 6);
    assert.deepEqual(upload.json.data.rows.map((row) => row.rowNumber), [2, 3, 4, 5, 6, 7]);
    assert.equal(upload.json.data.rows[0].status, 'VALID');
    assert.equal(upload.json.data.rows[1].status, 'INVALID');
    assert.equal(upload.json.data.rows[2].status, 'INVALID');
    assert.equal(upload.json.data.rows[3].status, 'NEEDS_REVIEW');
    assert.equal(upload.json.data.rows[4].status, 'INVALID');
    assert.equal(await Question.countDocuments(), initialQuestionCount, 'preview must not create Questions');
    const studentBatchRead = await requestJson(makeImportPath(batchId), { token: studentToken });
    assert.equal(studentBatchRead.response.status, 403);

    const invalidConfirm = await requestJson(makeImportPath(batchId, '/confirm'), {
      method: 'POST', token: adminToken, body: { rowNumbers: [4] },
    });
    assert.equal(invalidConfirm.response.status, 207);
    assert.equal(invalidConfirm.json.data.results[0].status, 'INVALID');
    assert.equal(await Question.countDocuments(), initialQuestionCount, 'INVALID rows must never be confirmed');

    const repeatedUpload = await uploadWorkbook(workbook);
    assert.equal(repeatedUpload.response.status, 200);
    assert.equal(repeatedUpload.json.data.reused, true);
    assert.equal(String(repeatedUpload.json.data.batch._id), String(batchId));

    const edit = async (rowNumber, values) => requestJson(makeImportPath(batchId, `/rows/${rowNumber}`), {
      method: 'PATCH', token: adminToken, body: { values },
    });
    for (const rowNumber of [3, 4]) {
      const result = await edit(rowNumber, { correctAnswers: ['B'] });
      assert.equal(result.response.status, 200, result.json.message);
      assert.equal(result.json.data.rows.find((row) => row.rowNumber === rowNumber).status, 'VALID');
    }
    const explanationEdit = await edit(5, { explanation: 'Admin supplied the missing explanation.' });
    assert.equal(explanationEdit.response.status, 200);
    assert.equal(explanationEdit.json.data.rows.find((row) => row.rowNumber === 5).status, 'VALID');
    const optionEdit = await edit(6, { options: optionsFor({ A: 'Admin supplied option A.' }) });
    assert.equal(optionEdit.response.status, 200);
    assert.equal(optionEdit.json.data.rows.find((row) => row.rowNumber === 6).status, 'VALID');

    const editedRow = await requestJson(makeImportPath(batchId), { token: adminToken });
    assert.equal(editedRow.response.status, 200);
    assert.ok(editedRow.json.data.rows.slice(0, 5).every((row) => row.status === 'VALID'));

    const confirm = await requestJson(makeImportPath(batchId, '/confirm'), {
      method: 'POST', token: adminToken, body: { rowNumbers: [2, 3, 4, 5, 6] },
    });
    assert.equal(confirm.response.status, 200, confirm.json.message);
    assert.equal(confirm.json.data.results.filter((row) => row.status === 'IMPORTED').length, 5);
    const imported = await Question.find({ importBatchId: batchId }).select('+importBatchId +importRowNumber +importStemOptionsFingerprint').lean();
    assert.equal(imported.length, 5);
    for (const question of imported) {
      assert.equal(question.type, 'single_choice');
      assert.equal(question.toeicPart, 5);
      assert.equal(question.status, 'draft');
      assert.equal(String(question.createdBy), String(admin._id));
      assert.deepEqual(question.options.map((option) => option.id), ['A', 'B', 'C', 'D']);
      assert.equal(question.correctAnswers.length, 1);
      assert.ok(['A', 'B', 'C', 'D'].includes(question.correctAnswers[0]));
      assert.ok(question.explanation.trim());
    }

    const repeatedConfirm = await requestJson(makeImportPath(batchId, '/confirm'), {
      method: 'POST', token: adminToken, body: { rowNumbers: [2, 3, 4, 5, 6] },
    });
    assert.equal(repeatedConfirm.response.status, 200);
    assert.ok(repeatedConfirm.json.data.results.every((row) => row.status === 'ALREADY_IMPORTED'));
    assert.equal(await Question.countDocuments(), initialQuestionCount + 5);

    const concurrentResponses = await Promise.all([
      requestJson(makeImportPath(batchId, '/confirm'), { method: 'POST', token: adminToken, body: { rowNumbers: [7] } }),
      requestJson(makeImportPath(batchId, '/confirm'), { method: 'POST', token: adminToken, body: { rowNumbers: [7] } }),
    ]);
    assert.ok(concurrentResponses.every(({ response }) => [200, 207, 409].includes(response.status)));
    const concurrentQuestion = await Question.findOne({ questionText: `Concurrent row ${unique}` });
    assert.ok(concurrentQuestion);
    assert.equal(await Question.countDocuments({ questionText: `Concurrent row ${unique}` }), 1);

    const importedDraft = await Question.findOne({ questionText: `Valid import row ${unique}` }).select('+importBatchId +importRowNumber');
    const teacherPublish = await requestJson(`/api/v1/questions/${importedDraft._id}`, {
      method: 'PATCH', token: teacherToken, body: { status: 'published', importBatchId: null },
    });
    assert.equal(teacherPublish.response.status, 403);
    const teacherOperatorPublish = await requestJson(`/api/v1/questions/${importedDraft._id}`, {
      method: 'PATCH', token: teacherToken, body: { $set: { status: 'published', importBatchId: null } },
    });
    assert.equal(teacherOperatorPublish.response.status, 403);
    const provenanceAfterDeniedUpdate = await Question.findById(importedDraft._id).select('+importBatchId +importRowNumber').lean();
    assert.equal(String(provenanceAfterDeniedUpdate.importBatchId), String(batchId));
    assert.equal(provenanceAfterDeniedUpdate.status, 'draft');
    const adminPublish = await requestJson(`/api/v1/questions/${importedDraft._id}`, {
      method: 'PATCH', token: adminToken, body: { $set: { status: 'published', importBatchId: null } },
    });
    assert.equal(adminPublish.response.status, 200, adminPublish.json.message);
    const provenanceAfterAdminUpdate = await Question.findById(importedDraft._id).select('+importBatchId +importRowNumber').lean();
    assert.equal(provenanceAfterAdminUpdate.status, 'published');
    assert.equal(String(provenanceAfterAdminUpdate.importBatchId), String(batchId));

    const genericPart1 = await requestJson('/api/v1/questions', {
      method: 'POST', token: teacherToken, body: {
        questionText: `Generic Part 1 behavior ${unique}`,
        type: 'single_choice',
        toeicPart: 1,
        options: [{ id: 'yes', text: 'Yes' }, { id: 'no', text: 'No' }],
        correctAnswers: ['yes'],
      },
    });
    assert.equal(genericPart1.response.status, 201, genericPart1.json.message);
    assert.equal(genericPart1.json.data.question.toeicPart, 1);
    assert.equal(genericPart1.json.data.question.options.length, 2);

    const assessmentAfterImport = await Assessment.findById(assessment._id).lean();
    assert.equal(await Assessment.countDocuments(), assessmentCountBefore);
    assert.deepEqual(assessmentAfterImport.questions.map((item) => String(item.question)), assessmentQuestionIds);
    assert.equal(await QuestionGroup.countDocuments(), questionGroupsBefore, 'question import must not create QuestionGroups');
    const studentStart = await requestJson(`/api/v1/assessments/${assessment._id}/start`, {
      method: 'POST', token: studentToken, body: {},
    });
    assert.equal(studentStart.response.status, 201, studentStart.json.message);
    assert.equal(Object.hasOwn(studentStart.json.data.questions[0], 'correctAnswers'), false);
    assert.equal(Object.hasOwn(studentStart.json.data.questions[0], 'explanation'), false);
    const attempt = await Attempt.findById(studentStart.json.data.attemptId).lean();
    assert.deepEqual(attempt.questionSnapshots[0].correctAnswers, ['A']);
  });

  await t.test('duplicate classification handles bank matches, normalized exact matches, and conflicting content', async () => {
    const bankExactText = `Bank exact duplicate ${unique}`;
    const bankConflictText = `Bank options conflict ${unique}`;
    await Question.create([
      { questionText: bankExactText, type: 'single_choice', toeicPart: 5, options: optionsFor({ A: 'carefully', B: 'quickly', C: 'careful', D: 'carefulness' }), correctAnswers: ['C'], explanation: 'Same bank explanation.', status: 'draft', createdBy: teacher._id },
      { questionText: bankConflictText, type: 'single_choice', toeicPart: 5, options: optionsFor({ A: 'carefully', B: 'quickly', C: 'careful', D: 'carefulness' }), correctAnswers: ['C'], explanation: 'Bank conflict explanation.', status: 'draft', createdBy: teacher._id },
    ]);
    const initialCount = await Question.countDocuments();
    const duplicateWorkbook = makeXlsx({ rows: [
      validRow(bankExactText, { explanation: 'Same bank explanation.' }),
      validRow(bankConflictText, { explanation: 'Different bank explanation.', answer: 'C' }),
      validRow(`Normalized duplicate ${unique}`, { answer: 'B', explanation: 'Same normalized explanation.' }),
      validRow(`  NORMALIZED   DUPLICATE ${unique}  `, { answer: 'b', explanation: ' same   normalized EXPLANATION. ' }),
      validRow(`Workbook conflict ${unique}`, { answer: 'A' }),
      validRow(`Workbook conflict ${unique}`, { answer: 'D' }),
      validRow(`Café Unicode normalization ${unique}`),
      validRow(`Cafe\u0301 Unicode normalization ${unique}`),
      validRow(`Workbook option conflict ${unique}`),
      validRow(`Workbook option conflict ${unique}`, { options: ['carefully', 'other option', 'careful', 'carefulness'] }),
    ] });
    const preview = await uploadWorkbook(duplicateWorkbook);
    assert.equal(preview.response.status, 201, preview.json.message);
    const statuses = new Map(preview.json.data.rows.map((row) => [row.rowNumber, row.status]));
    assert.equal(statuses.get(2), 'DUPLICATE');
    assert.equal(statuses.get(3), 'NEEDS_REVIEW');
    assert.equal(statuses.get(4), 'VALID');
    assert.equal(statuses.get(5), 'DUPLICATE');
    assert.equal(statuses.get(6), 'NEEDS_REVIEW');
    assert.equal(statuses.get(7), 'NEEDS_REVIEW');
    assert.equal(statuses.get(8), 'VALID');
    assert.equal(statuses.get(9), 'DUPLICATE');
    assert.equal(statuses.get(10), 'NEEDS_REVIEW');
    assert.equal(statuses.get(11), 'NEEDS_REVIEW');
    assert.equal(await Question.countDocuments(), initialCount, 'preview duplicates and conflicts must not write Questions');
    assert.ok(preview.json.data.rows.find((row) => row.rowNumber === 5).issues.some((issue) => issue.code === 'DUPLICATE_IN_WORKBOOK'));
    assert.ok(preview.json.data.rows.find((row) => row.rowNumber === 3).issues.some((issue) => issue.code === 'BANK_CONTENT_CONFLICT'));

    const concurrentStem = `Cross-batch concurrent duplicate ${unique}`;
    const concurrentWorkbookA = makeXlsx({ rows: [validRow(concurrentStem)] });
    const concurrentWorkbookB = makeXlsx({
      headers: [...defaultHeaders, 'Ignored metadata'],
      rows: [{ values: [...validRow(concurrentStem).values, 'Variant file metadata'] }],
    });
    const [batchA, batchB] = await Promise.all([uploadWorkbook(concurrentWorkbookA), uploadWorkbook(concurrentWorkbookB)]);
    assert.equal(batchA.response.status, 201);
    assert.equal(batchB.response.status, 201);
    assert.notEqual(String(batchA.json.data.batch._id), String(batchB.json.data.batch._id));
    const raceResults = await Promise.all([batchA, batchB].map(({ json }) => requestJson(makeImportPath(json.data.batch._id, '/confirm'), {
      method: 'POST', token: adminToken, body: { rowNumbers: [2] },
    })));
    assert.ok(raceResults.every(({ response }) => [200, 207, 409].includes(response.status)));
    assert.equal(await Question.countDocuments({ questionText: concurrentStem }), 1);
    const raceRows = await Promise.all([batchA, batchB].map(({ json }) => QuestionImportRow.findOne({ batchId: json.data.batch._id, rowNumber: 2 }).lean()));
    assert.equal(raceRows.filter((row) => row.importState === 'IMPORTED').length, 1);
    assert.equal(raceRows.filter((row) => row.importState === 'DUPLICATE').length, 1);
  });

  await t.test('partial confirmation leaves unresolved rows editable', async () => {
    const workbook = makeXlsx({ rows: [
      validRow(`Selected valid row ${unique}`),
      validRow(`Unresolved answer row ${unique}`, { answer: '' }),
    ] });
    const preview = await uploadWorkbook(workbook);
    assert.equal(preview.response.status, 201);
    assert.equal(preview.json.data.rows[1].status, 'INVALID');
    const batchId = preview.json.data.batch._id;

    const firstConfirm = await requestJson(makeImportPath(batchId, '/confirm'), {
      method: 'POST', token: adminToken, body: { rowNumbers: [2] },
    });
    assert.equal(firstConfirm.response.status, 200);
    assert.equal(firstConfirm.json.data.batch.state, 'PARTIALLY_CONFIRMED');

    const correction = await requestJson(makeImportPath(batchId, '/rows/3'), {
      method: 'PATCH', token: adminToken, body: { values: { correctAnswers: ['B'] } },
    });
    assert.equal(correction.response.status, 200, correction.json.message);
    assert.equal(correction.json.data.rows.find((row) => row.rowNumber === 3).status, 'VALID');

    const secondConfirm = await requestJson(makeImportPath(batchId, '/confirm'), {
      method: 'POST', token: adminToken, body: { rowNumbers: [3] },
    });
    assert.equal(secondConfirm.response.status, 200);
    assert.equal(secondConfirm.json.data.batch.state, 'CONFIRMED');
    assert.equal(await Question.countDocuments({ importBatchId: batchId }), 2);
  });

  await t.test('a failure after Question creation is recoverable without a second Question', async () => {
    const workbook = makeXlsx({ rows: [validRow(`Recovery row ${unique}`)] });
    const upload = await uploadWorkbook(workbook);
    assert.equal(upload.response.status, 201, upload.json.message);
    const batchId = upload.json.data.batch._id;
    const originalCreate = Question.create;
    let threwAfterCreate = false;
    Question.create = async function (...args) {
      const created = await originalCreate.apply(this, args);
      if (!threwAfterCreate) {
        threwAfterCreate = true;
        throw new Error('simulated interruption after database insert');
      }
      return created;
    };

    try {
      const firstAttempt = await requestJson(makeImportPath(batchId, '/confirm'), {
        method: 'POST', token: adminToken, body: { rowNumbers: [2] },
      });
      assert.equal(firstAttempt.response.status, 207);
      assert.equal(firstAttempt.json.data.results[0].status, 'FAILED');
      assert.equal(await Question.countDocuments({ questionText: `Recovery row ${unique}` }), 1);

      const retry = await requestJson(makeImportPath(batchId, '/confirm'), {
        method: 'POST', token: adminToken, body: { rowNumbers: [2] },
      });
      assert.equal(retry.response.status, 200, retry.json.message);
      assert.equal(retry.json.data.results[0].status, 'IMPORTED');
      assert.equal(await Question.countDocuments({ questionText: `Recovery row ${unique}` }), 1);
      const row = await QuestionImportRow.findOne({ batchId, rowNumber: 2 }).lean();
      assert.equal(row.importState, 'IMPORTED');
      assert.equal(row.attemptCount, 2);

      await Question.deleteOne({ _id: row.questionId });
      const differentFileSameContent = makeXlsx({
        headers: [...defaultHeaders, 'Ignored metadata'],
        rows: [{ values: [...validRow(`Recovery row ${unique}`).values, 'New file hash'] }],
      });
      const parsedVariant = await parseToeicPart5Xlsx({ buffer: differentFileSameContent, originalFileName: 'variant.xlsx' });
      const importedHistory = await QuestionImportRow.find({ importState: 'IMPORTED' }).lean();
      assert.ok(importedHistory.some((historyRow) => historyRow.values.questionText === `Recovery row ${unique}`));
      assert.ok(importedHistory.some((historyRow) => historyRow.stemFingerprint === parsedVariant.rows[0].stemFingerprint));
      const laterBatch = await uploadWorkbook(differentFileSameContent);
      assert.equal(laterBatch.response.status, 201);
      assert.equal(laterBatch.json.data.rows[0].status, 'DUPLICATE');
      assert.ok(laterBatch.json.data.rows[0].issues.some((issue) => issue.code === 'DUPLICATE_IN_PRIOR_BATCH'));
    } finally {
      Question.create = originalCreate;
    }
  });
});

test.after(async () => {
  if (httpServer?.listening) await new Promise((resolve) => httpServer.close(resolve));
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect().catch(() => {});
  if (mongoServer) await mongoServer.stop().catch(() => {});
  if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = originalJwtSecret;
});
