import assert from 'node:assert/strict';
import cors from 'cors';
import express from 'express';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { strToU8, zipSync } from 'fflate';
import Vocabulary from '../src/models/Vocabulary.js';
import ChapterVocabulary from '../src/models/ChapterVocabulary.js';
import VocabularyChapter from '../src/models/VocabularyChapter.js';
import VocabularyImportAudit from '../src/models/VocabularyImportAudit.js';
import VocabularyImportBatch from '../src/models/VocabularyImportBatch.js';
import VocabularyImportCandidate from '../src/models/VocabularyImportCandidate.js';
import VocabularyImportCatalogMapping from '../src/models/VocabularyImportCatalogMapping.js';
import VocabularyTag from '../src/models/VocabularyTag.js';
import { createVocabularyCatalogManagementPrototypeRouter } from '../src/routes/vocabularyCatalogManagementPrototypeRoutes.js';
import { createVocabularyImportPrototypeRouter } from '../src/routes/vocabularyImportPrototypeRoutes.js';

const host = '127.0.0.1';
const port = Number(process.env.VOCAB_CATALOG_V4A_HARNESS_PORT || 43191);
const frontendOrigin = process.env.VOCAB_CATALOG_V4A_FRONTEND_ORIGIN || 'http://127.0.0.1:5173';
const databaseName = 'vocabulary_v4a_admin_test';
const principals = {
  admin: new mongoose.Types.ObjectId(),
  teacher: new mongoose.Types.ObjectId(),
  student: new mongoose.Types.ObjectId(),
};
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

function syntheticDocx(filename = 'Chapter 1.docx') {
  const title = filename.replace(/\.docx$/i, '');
  const body = [
    paragraph(title),
    paragraph('catalog synthetic (noun): test-only definition\nA synthetic example for catalog QA.\n→ Ví dụ kiểm thử tổng hợp.', '1'),
    paragraph('catalog synthetic (verb): test-only second sense\nAnother synthetic sentence for review.\n→ Một câu kiểm thử khác.', '1'),
  ].join('');
  const document = `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="${wordNs}"><w:body>${body}<w:sectPr/></w:body></w:document>`;
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
  assert.equal(mongoose.connection.readyState, 0, 'V4A harness must start disconnected from application MongoDB');
  const replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1, ip: host, dbName: databaseName } });
  try {
    const uri = replicaSet.getUri(databaseName);
    assert.equal(new URL(uri).hostname, host, 'V4A writes must stay on loopback MongoMemoryReplSet');
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
    assert.equal(mongoose.connection.host, host);
    assert.equal(mongoose.connection.name, databaseName);
    await Promise.all([
      Vocabulary.init(), VocabularyTag.init(), VocabularyChapter.init(), ChapterVocabulary.init(),
      VocabularyImportBatch.init(), VocabularyImportCandidate.init(), VocabularyImportAudit.init(),
      VocabularyImportCatalogMapping.init(),
    ]);

    const app = express();
    app.use(cors({ origin: frontendOrigin, credentials: true }));
    app.get('/__qa/health', (_req, res) => res.json({ ok: true, host: mongoose.connection.host, database: mongoose.connection.name }));
    app.get('/__qa/synthetic/:filename', (req, res) => {
      res.type('application/vnd.openxmlformats-officedocument.wordprocessingml.document').send(syntheticDocx(req.params.filename));
    });
    const authenticateSyntheticPrincipal = (req, _res, next) => {
      const token = req.get('authorization');
      for (const [role, id] of Object.entries(principals)) {
        if (token === `Bearer synthetic-${role}`) req.user = { _id: id, role };
      }
      next();
    };
    app.use('/admin/vocabulary-catalog', createVocabularyCatalogManagementPrototypeRouter({ authenticateAdmin: authenticateSyntheticPrincipal }));
    app.use('/admin/vocabulary-import-batches', createVocabularyImportPrototypeRouter({
      authenticateAdmin: authenticateSyntheticPrincipal,
      requireCatalogMappingForConfirm: true,
    }));
    const server = await new Promise((resolve) => {
      const listener = app.listen(port, host, () => resolve(listener));
    });
    process.stdout.write(`VOCAB_CATALOG_V4A_HARNESS_READY http://${host}:${port} ${databaseName}\n`);

    const shutdown = async () => {
      await new Promise((resolve) => server.close(resolve));
      if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
      await replicaSet.stop();
    };
    process.once('SIGINT', () => shutdown().finally(() => process.exit(0)));
    process.once('SIGTERM', () => shutdown().finally(() => process.exit(0)));
  } catch (error) {
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect().catch(() => {});
    await replicaSet.stop();
    throw error;
  }
}

main().catch((error) => {
  process.stderr.write(`${error?.stack || error}\n`);
  process.exitCode = 1;
});
