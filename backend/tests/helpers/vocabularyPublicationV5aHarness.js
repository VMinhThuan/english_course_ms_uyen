import cors from 'cors';
import express from 'express';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { strToU8, zipSync } from 'fflate';
import Vocabulary from '../../src/models/Vocabulary.js';
import ChapterVocabulary from '../../src/models/ChapterVocabulary.js';
import VocabularyChapter from '../../src/models/VocabularyChapter.js';
import VocabularyImportAudit from '../../src/models/VocabularyImportAudit.js';
import VocabularyImportBatch from '../../src/models/VocabularyImportBatch.js';
import VocabularyImportCandidate from '../../src/models/VocabularyImportCandidate.js';
import VocabularyImportCatalogMapping from '../../src/models/VocabularyImportCatalogMapping.js';
import VocabularyPublicationAudit from '../../src/models/VocabularyPublicationAudit.js';
import VocabularyTag from '../../src/models/VocabularyTag.js';
import { createStudentVocabularyCatalogPrototypeRouter } from '../../src/routes/studentVocabularyCatalogPrototypeRoutes.js';
import { createVocabularyCatalogManagementPrototypeRouter } from '../../src/routes/vocabularyCatalogManagementPrototypeRoutes.js';
import { createVocabularyImportPrototypeRouter } from '../../src/routes/vocabularyImportPrototypeRoutes.js';
import { createVocabularyPublicationPrototypeRouter } from '../../src/routes/vocabularyPublicationPrototypeRoutes.js';

const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const CONTENT_TYPES_NS = 'http://schemas.openxmlformats.org/package/2006/content-types';
const PACKAGE_REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';
const HOST = '127.0.0.1';

function xmlEscape(value) {
  return String(value).replace(/[<>&"']/g, (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[char]);
}

function paragraph(text, numId = '') {
  const numbering = numId ? `<w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="${numId}"/></w:numPr></w:pPr>` : '';
  const runs = text.split('\n').map((line) => `<w:r><w:t xml:space="preserve">${xmlEscape(line)}</w:t></w:r>`).join('<w:r><w:br/></w:r>');
  return `<w:p>${numbering}${runs}</w:p>`;
}

export function syntheticPublicationDocx({ title = 'Synthetic Chapter', word = 'synthetic applicant', meaning = 'a made up entry' } = {}) {
  const body = [
    paragraph('Start 1'),
    paragraph('synthetic item (noun): a made up entry\nThis is a synthetic example.\n→ Đây là ví dụ tổng hợp.', '1'),
    paragraph('synthetic item (noun): a second synthetic sense\nA second example for review.\n→ Ví dụ thứ hai để kiểm duyệt.', '1'),
  ].join('');
  void title;
  void word;
  void meaning;
  const document = `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="${WORD_NS}"><w:body>${body}<w:sectPr/></w:body></w:document>`;
  const numbering = `<?xml version="1.0"?><w:numbering xmlns:w="${WORD_NS}"><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>`;
  const parts = {
    '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="${CONTENT_TYPES_NS}"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
    '_rels/.rels': `<?xml version="1.0"?><Relationships xmlns="${PACKAGE_REL_NS}"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
    'word/document.xml': document,
    'word/numbering.xml': numbering,
  };
  return Buffer.from(zipSync(Object.fromEntries(Object.entries(parts).map(([name, value]) => [name, strToU8(value)])), { level: 6 }));
}

export async function startVocabularyPublicationV5aHarness({
  port = 0,
  frontendOrigin = 'http://127.0.0.1:5173',
  databaseName = 'vocabulary_publication_v5a_test',
} = {}) {
  if (mongoose.connection.readyState !== 0) throw new Error('V5A harness must start disconnected from application MongoDB.');
  if (!databaseName.endsWith('_test')) throw new Error('V5A harness database name must end in _test.');
  const replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1, ip: HOST, dbName: databaseName } });
  let server;
  try {
    const uri = replicaSet.getUri(databaseName);
    if (new URL(uri).hostname !== HOST) throw new Error('V5A MongoMemoryReplSet must bind to loopback.');
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
    if (mongoose.connection.host !== HOST || mongoose.connection.name !== databaseName || !mongoose.connection.name.endsWith('_test')) {
      throw new Error('V5A harness database safety assertion failed.');
    }
    await Promise.all([
      Vocabulary.init(), VocabularyTag.init(), VocabularyChapter.init(), ChapterVocabulary.init(),
      VocabularyImportBatch.init(), VocabularyImportCandidate.init(), VocabularyImportAudit.init(),
      VocabularyImportCatalogMapping.init(), VocabularyPublicationAudit.init(),
    ]);

    const actors = Object.freeze({
      admin: new mongoose.Types.ObjectId(),
      teacher: new mongoose.Types.ObjectId(),
      student: new mongoose.Types.ObjectId(),
    });
    const app = express();
    app.use(cors({ origin: frontendOrigin, credentials: true }));
    app.get('/__qa/health', (_req, res) => res.json({ ok: true, host: HOST, database: databaseName }));
    app.get('/__qa/synthetic/:filename', (req, res) => {
      const base = String(req.params.filename || '').replace(/\.docx$/i, '').replace(/[^\w -]/g, '').slice(0, 80) || 'Synthetic Chapter';
      res.type('application/vnd.openxmlformats-officedocument.wordprocessingml.document')
        .send(syntheticPublicationDocx({ title: base, word: `synthetic ${base.toLowerCase().replace(/\s+/g, ' ')}` }));
    });
    app.get('/__qa/principals', (_req, res) => res.json({
      adminId: String(actors.admin), teacherId: String(actors.teacher), studentId: String(actors.student),
    }));
    const authenticateSyntheticPrincipal = (req, _res, next) => {
      const token = req.get('authorization');
      for (const [role, id] of Object.entries(actors)) {
        if (token === `Bearer synthetic-${role}`) req.user = { _id: id, role };
      }
      next();
    };
    app.use('/admin/vocabulary-catalog', createVocabularyCatalogManagementPrototypeRouter({ authenticateAdmin: authenticateSyntheticPrincipal }));
    app.use('/admin/vocabulary-import-batches', createVocabularyImportPrototypeRouter({
      authenticateAdmin: authenticateSyntheticPrincipal,
      requireCatalogMappingForConfirm: true,
    }));
    app.use('/admin/vocabulary-publication', createVocabularyPublicationPrototypeRouter({ authenticateAdmin: authenticateSyntheticPrincipal }));
    app.use('/student/vocabulary-catalog', createStudentVocabularyCatalogPrototypeRouter({ authenticateStudent: authenticateSyntheticPrincipal }));
    server = await new Promise((resolve, reject) => {
      const listener = app.listen(port, HOST, () => resolve(listener));
      listener.once('error', reject);
    });
    const address = server.address();
    return {
      app,
      actors,
      baseUrl: `http://${HOST}:${address.port}`,
      databaseName,
      async close() {
        if (server) await new Promise((resolve) => server.close(resolve));
        if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
        await replicaSet.stop();
      },
    };
  } catch (error) {
    if (server) await new Promise((resolve) => server.close(resolve));
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect().catch(() => {});
    await replicaSet.stop();
    throw error;
  }
}
