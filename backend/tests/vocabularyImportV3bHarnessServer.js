import assert from 'node:assert/strict';
import cors from 'cors';
import express from 'express';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { strToU8, zipSync } from 'fflate';
import { createVocabularyImportPrototypeRouter } from '../src/routes/vocabularyImportPrototypeRoutes.js';
import Vocabulary from '../src/models/Vocabulary.js';
import VocabularyTag from '../src/models/VocabularyTag.js';
import VocabularyChapter from '../src/models/VocabularyChapter.js';
import ChapterVocabulary from '../src/models/ChapterVocabulary.js';
import VocabularyImportBatch from '../src/models/VocabularyImportBatch.js';
import VocabularyImportCandidate from '../src/models/VocabularyImportCandidate.js';
import VocabularyImportAudit from '../src/models/VocabularyImportAudit.js';

const host = '127.0.0.1';
const port = Number(process.env.VOCAB_IMPORT_HARNESS_PORT || 43187);
const frontendOrigin = process.env.VOCAB_IMPORT_FRONTEND_ORIGIN || 'http://127.0.0.1:5173';
const databaseName = 'vocabulary_v3b_browser_test';
const adminId = new mongoose.Types.ObjectId();
const teacherId = new mongoose.Types.ObjectId();
const wordNs = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const contentTypesNs = 'http://schemas.openxmlformats.org/package/2006/content-types';
const packageRelNs = 'http://schemas.openxmlformats.org/package/2006/relationships';

function xmlEscape(value) {
  return String(value).replace(/[<>&"']/g, (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[char]);
}

function paragraph(text, numId = '') {
  const numbering = numId ? `<w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="${numId}"/></w:numPr></w:pPr>` : '';
  const lines = text.split('\n').map((line) => `<w:r><w:t xml:space="preserve">${xmlEscape(line)}</w:t></w:r>`).join('<w:r><w:br/></w:r>');
  return `<w:p>${numbering}${lines}</w:p>`;
}

function syntheticDocx() {
  const paragraphs = [
    paragraph('Start 1'),
    paragraph('synthetic item (noun): a made up entry\nThis is a synthetic example.\n→ Đây là ví dụ tổng hợp.', '1'),
    paragraph('synthetic item (noun): a second synthetic sense\nA second example for review.\n→ Ví dụ thứ hai để kiểm duyệt.', '1'),
  ].join('');
  const document = `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="${wordNs}"><w:body>${paragraphs}<w:sectPr/></w:body></w:document>`;
  const numbering = `<?xml version="1.0"?><w:numbering xmlns:w="${wordNs}"><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>`;
  const parts = {
    '[Content_Types].xml': `<?xml version="1.0"?><Types xmlns="${contentTypesNs}"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
    '_rels/.rels': `<?xml version="1.0"?><Relationships xmlns="${packageRelNs}"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
    'word/document.xml': document,
    'word/numbering.xml': numbering,
  };
  return Buffer.from(zipSync(Object.fromEntries(Object.entries(parts).map(([name, value]) => [name, strToU8(value)])), { level: 6 }));
}

async function main() {
  assert.equal(mongoose.connection.readyState, 0, 'harness must start without an application database connection');
  const replicaSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, ip: host, dbName: databaseName },
  });
  const uri = replicaSet.getUri(databaseName);
  assert.equal(new URL(uri).hostname, host, 'the database must be loopback-only');
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  assert.equal(mongoose.connection.host, host);
  assert.equal(mongoose.connection.name, databaseName);
  await Promise.all([
    Vocabulary.init(), VocabularyTag.init(), VocabularyChapter.init(), ChapterVocabulary.init(),
    VocabularyImportBatch.init(), VocabularyImportCandidate.init(), VocabularyImportAudit.init(),
  ]);

  const app = express();
  app.use(cors({ origin: frontendOrigin, credentials: true }));
  app.get('/__qa/health', (_req, res) => res.json({ ok: true, host: mongoose.connection.host, database: mongoose.connection.name }));
  app.get('/__qa/synthetic.docx', (_req, res) => {
    res.type('application/vnd.openxmlformats-officedocument.wordprocessingml.document').send(syntheticDocx());
  });
  const syntheticAuth = (req, _res, next) => {
    if (req.get('authorization') === 'Bearer synthetic-admin') req.user = { _id: adminId, role: 'admin' };
    if (req.get('authorization') === 'Bearer synthetic-teacher') req.user = { _id: teacherId, role: 'teacher' };
    next();
  };
  app.use('/admin/vocabulary-import-batches', createVocabularyImportPrototypeRouter({ authenticateAdmin: syntheticAuth }));

  const server = await new Promise((resolve) => {
    const listener = app.listen(port, host, () => resolve(listener));
  });
  process.stdout.write(`VOCAB_IMPORT_HARNESS_READY http://${host}:${port} ${databaseName}\n`);

  const shutdown = async () => {
    await new Promise((resolve) => server.close(resolve));
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
    await replicaSet.stop();
  };
  process.once('SIGINT', () => shutdown().finally(() => process.exit(0)));
  process.once('SIGTERM', () => shutdown().finally(() => process.exit(0)));
}

main().catch(async (error) => {
  process.stderr.write(`${error?.stack || error}\n`);
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect().catch(() => {});
  process.exitCode = 1;
});
