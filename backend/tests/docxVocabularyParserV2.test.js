import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { strToU8, zipSync } from 'fflate';
import LegacyDocxVocabularyParser from '../src/services/docxVocabularyParser.js';
import DocxVocabularyParserV2 from '../src/services/docxVocabularyParserV2.js';
import {
  EXPECTED_DUPLICATE_GROUPS,
  REPOSITORY_ROOT,
  SOURCE_FIELD_GOLDENS,
  buildCoverageRows,
  evaluateGolden,
  loadSourceAcceptance,
} from './helpers/vocabularyParserV2SourceOracle.js';

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const CONTENT_TYPES_NS = 'http://schemas.openxmlformats.org/package/2006/content-types';
const PACKAGE_REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';

function xmlEscape(value) {
  return String(value).replace(/[<>&"']/g, char => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[char]);
}

function textRun(text, formatting = '') {
  const preserve = /^\s|\s$/.test(text) ? ' xml:space="preserve"' : '';
  return `<w:r>${formatting ? `<w:rPr>${formatting}</w:rPr>` : ''}<w:t${preserve}>${xmlEscape(text)}</w:t></w:r>`;
}

function breakRun() {
  return '<w:r><w:br/></w:r>';
}

function paragraph(parts, { numId = '', ilvl = '0' } = {}) {
  const properties = numId
    ? `<w:pPr><w:numPr><w:ilvl w:val="${ilvl}"/><w:numId w:val="${numId}"/></w:numPr></w:pPr>`
    : '';
  return `<w:p>${properties}${parts.join('')}</w:p>`;
}

function buildDocx({ body, numbering = '', documentXml = null, extraParts = {} }) {
  const main = documentXml || `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="${W_NS}"><w:body>${body}<w:sectPr/></w:body></w:document>`;
  const entries = {
    '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="${CONTENT_TYPES_NS}"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
    '_rels/.rels': `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="${PACKAGE_REL_NS}"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
    'word/document.xml': main,
    ...extraParts,
  };
  if (numbering) entries['word/numbering.xml'] = numbering;
  return Buffer.from(zipSync(Object.fromEntries(Object.entries(entries).map(([name, data]) => [name, strToU8(data)])), { level: 6 }));
}

function easyStartDocx({ word = 'test item', meaning = 'nghĩa thử', english = 'This is a test.', vietnamese = 'Đây là ví dụ thử.', numId = '1' } = {}) {
  const body = [
    paragraph([textRun('Start 1')]),
    paragraph([
      textRun(`${word} (noun): ${meaning}`), breakRun(),
      textRun(english, '<w:color w:val="0070C0"/>'), breakRun(),
      textRun(vietnamese),
    ], { numId }),
  ].join('');
  const numbering = `<?xml version="1.0"?><w:numbering xmlns:w="${W_NS}"><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/></w:lvl></w:abstractNum><w:num w:numId="${numId}"><w:abstractNumId w:val="0"/></w:num></w:numbering>`;
  return buildDocx({ body, numbering });
}

function mustKnowDocx() {
  const body = [
    paragraph([textRun('Day 3 :')]),
    paragraph([textRun('12. attribute (v/n)')]),
    paragraph([textRun('(v) attribute A to B')]),
    paragraph([textRun('quy cho A là do B')]),
    paragraph([textRun('The team attributed the success to planning.'), breakRun(), textRun('→ Nhóm cho rằng thành công là nhờ sự lên kế hoạch.')]),
    paragraph([textRun('(n):')]),
    paragraph([textRun('đặc điểm, phẩm chất')]),
    paragraph([textRun('Reliability is an important attribute.'), breakRun(), textRun('→ Sự đáng tin cậy là một phẩm chất quan trọng.')]),
    paragraph([textRun('12. second item (n)')]),
    paragraph([textRun('Nghĩa: một mục thử nghiệm')]),
    paragraph([textRun('Ví dụ: This is the second item. → Đây là mục thứ hai.')]),
  ].join('');
  return buildDocx({ body });
}

function usageReferenceDocx() {
  const body = [
    paragraph([textRun('Day 2')]),
    paragraph([textRun('1. mindful (adj)')]),
    paragraph([textRun('Nghĩa:')]),
    paragraph([textRun('chú ý, lưu tâm')]),
    paragraph([textRun('be mindful of + N = pay attention to')]),
    paragraph([textRun('Ví dụ: Please be mindful of the safety rules.'), breakRun(), textRun('→ Hãy chú ý đến các quy tắc an toàn.')]),
    paragraph([textRun('2. aspire (v)')]),
    paragraph([textRun('Nghĩa: khao khát')]),
    paragraph([textRun('aspire to + N/V')]),
    paragraph([textRun('aspire to do something')]),
    paragraph([textRun('Ví dụ: She aspires to lead the team.'), breakRun(), textRun('→ Cô ấy khao khát lãnh đạo nhóm.')]),
    paragraph([textRun('3. assure (v)')]),
    paragraph([textRun('Nghĩa: đảm bảo với ai')]),
    paragraph([textRun('assure someone that + clause')]),
    paragraph([textRun('Ví dụ: The manager assured the team that the plan was ready.'), breakRun(), textRun('→ Quản lý đảm bảo với nhóm rằng kế hoạch đã sẵn sàng.')]),
  ].join('');
  return buildDocx({ body });
}

function collocationDocx() {
  const body = [
    paragraph([textRun('Chapter 10')]),
    paragraph([textRun('account for: giải thích, chiếm tỷ lệ'), breakRun(), textRun('Online sales account for most revenue.'), breakRun(), textRun('Doanh số trực tuyến chiếm phần lớn doanh thu.')]),
    paragraph([textRun('comply with: tuân thủ')]),
    paragraph([textRun('Ví dụ: Employees must comply with the safety rules.'), breakRun(), textRun('Dịch: Nhân viên phải tuân thủ các quy tắc an toàn.')]),
  ].join('');
  return buildDocx({ body });
}

function expectedFromEnvironment() {
  const sourceRoot = process.env.VOCABULARY_DOCX_SOURCE_ROOT || `${REPOSITORY_ROOT}/local-assets/vocabulary-source`;
  const locatorCsv = process.env.VOCABULARY_DOCX_REFERENCE_CSV || `${REPOSITORY_ROOT}/docs/vocabulary/phase0/source-gate-closure/DOCX_SOURCE_ENTRY_LOCATORS.csv`;
  const manifestCsv = process.env.VOCABULARY_DOCX_SHA256_MANIFEST || `${REPOSITORY_ROOT}/docs/vocabulary/phase0/source-gate-closure/DOCX_SHA256_MANIFEST.csv`;
  return existsSync(sourceRoot) && existsSync(locatorCsv) && existsSync(manifestCsv);
}

test('V2 validates DOCX packages, hashes and bounded decompression', async () => {
  await assert.rejects(
    DocxVocabularyParserV2.parseDocxBuffer('not a buffer', { fileName: 'Start 1.docx' }),
    error => error.code === 'INVALID_DOCX_BUFFER',
  );
  await assert.rejects(
    DocxVocabularyParserV2.parseDocxBuffer(Buffer.from('not a zip file'), { fileName: 'Start 1.docx' }),
    error => error.code === 'INVALID_DOCX_ZIP',
  );
  const noMainPart = Buffer.from(zipSync({
    '[Content_Types].xml': strToU8('<Types/>'),
    '_rels/.rels': strToU8('<Relationships/>'),
  }));
  await assert.rejects(
    DocxVocabularyParserV2.parseDocxBuffer(noMainPart, { fileName: 'Start 1.docx' }),
    error => error.code === 'MISSING_REQUIRED_OOXML_PART',
  );

  const valid = easyStartDocx();
  const corruptCrc = Buffer.from(valid);
  const centralDirectoryEntry = corruptCrc.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  assert.notEqual(centralDirectoryEntry, -1);
  corruptCrc.writeUInt32LE(corruptCrc.readUInt32LE(centralDirectoryEntry + 16) ^ 1, centralDirectoryEntry + 16);
  await assert.rejects(
    DocxVocabularyParserV2.parseDocxBuffer(corruptCrc, { relativePath: 'TOEIC EASY START/Start 1.docx' }),
    error => error.code === 'INVALID_DOCX_ZIP_CRC',
  );

  const parsed = await DocxVocabularyParserV2.parseDocxBuffer(valid, { relativePath: 'TOEIC EASY START/Start 1.docx' });
  assert.equal(parsed.source.fileSha256.length, 64);
  assert.equal(parsed.source.paragraphCount, 2);
  assert.equal(parsed.items.length, 1);
  await assert.rejects(
    DocxVocabularyParserV2.parseDocxBuffer(valid, { relativePath: 'TOEIC EASY START/Start 1.docx', fileSha256: '0'.repeat(64) }),
    error => error.code === 'SOURCE_HASH_MISMATCH',
  );

  const large = buildDocx({ body: paragraph([textRun('Start 1')]), extraParts: { 'word/media/large.bin': 'x'.repeat(2048) } });
  await assert.rejects(
    DocxVocabularyParserV2.parseDocxBuffer(large, { relativePath: 'TOEIC EASY START/Start 1.docx' }, { limits: { maxTotalUncompressedBytes: 512 } }),
    error => error.code === 'RESOURCE_LIMIT_UNCOMPRESSED_BYTES',
  );
});

test('V2 rejects malformed XML and broken internal relationships', async () => {
  const malformed = buildDocx({
    body: '',
    documentXml: `<w:document xmlns:w="${W_NS}"><w:body><w:p></w:body></w:document>`,
  });
  await assert.rejects(
    DocxVocabularyParserV2.parseDocxBuffer(malformed, { relativePath: 'TOEIC EASY START/Start 1.docx' }),
    error => error.code === 'INVALID_OOXML_XML',
  );

  const brokenRelationships = buildDocx({
    body: paragraph([textRun('Start 1')]),
    extraParts: {
      'word/_rels/document.xml.rels': `<?xml version="1.0"?><Relationships xmlns="${PACKAGE_REL_NS}"><Relationship Id="rId2" Target="missing.xml" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles"/></Relationships>`,
    },
  });
  await assert.rejects(
    DocxVocabularyParserV2.parseDocxBuffer(brokenRelationships, { relativePath: 'TOEIC EASY START/Start 1.docx' }),
    error => error.code === 'BROKEN_INTERNAL_RELATIONSHIP',
  );
});

test('Easy Start reads Word numbering and preserves run formatting and raw fields', async () => {
  const first = easyStartDocx({ word: 'application form', meaning: 'đơn đăng ký, mẫu đơn đăng ký', english: 'Please fill out the application form.', vietnamese: 'Vui lòng điền vào đơn đăng ký.' });
  const parsed = await DocxVocabularyParserV2.parseDocxBuffer(first, { relativePath: 'TOEIC EASY START/Start 1.docx' });
  const candidate = parsed.items[0];
  assert.equal(candidate.word, 'application form');
  assert.equal(candidate.source.sourceOrdinal, 1);
  assert.equal(candidate.source.sourceDisplayNumber, 1);
  assert.equal(candidate.senses[0].meaning, 'đơn đăng ký, mẫu đơn đăng ký');
  assert.deepEqual(candidate.senses[0].examples.map(({ english, vietnamese }) => ({ english, vietnamese })), [
    { english: 'Please fill out the application form.', vietnamese: 'Vui lòng điền vào đơn đăng ký.' },
  ]);
  assert.ok(candidate.raw.paragraphs[0].runs.some(run => run.formatting.color === '0070C0'));
  assert.equal(candidate.reviewStatus, 'NEEDS_REVIEW');
  assert.equal(candidate.reviewReasons[0].code, 'SOURCE_CANDIDATE_NOT_HUMAN_VERIFIED');
  assert.equal('status' in candidate, false);
});

test('Must-Know retains senses, bilingual pairs, Day 3 and repeated display number 12', async () => {
  const parsed = await DocxVocabularyParserV2.parseDocxBuffer(mustKnowDocx(), { relativePath: 'TOEIC MUST-KNOW VOCABULARY/DAY 3.docx' });
  assert.equal(parsed.items.length, 2);
  const attribute = parsed.items[0];
  assert.equal(attribute.source.topicCandidate, 'Day 3');
  assert.equal(attribute.source.sourceDisplayNumber, 12);
  assert.equal(attribute.source.sourceOrdinal, 1);
  assert.equal(attribute.senses.length, 2);
  assert.equal(attribute.senses[0].usagePattern, 'attribute A to B');
  assert.equal(attribute.senses[0].meaning, 'quy cho A là do B');
  assert.equal(attribute.senses[1].usagePattern, '');
  assert.deepEqual(attribute.senses.map(sense => sense.examples[0].english), [
    'The team attributed the success to planning.',
    'Reliability is an important attribute.',
  ]);
  assert.deepEqual(parsed.items.map(item => item.source.sourceDisplayNumber), [12, 12]);
  assert.deepEqual(parsed.items.map(item => item.source.sourceOrdinal), [1, 2]);
});

test('Must-Know recognizes usage-pattern structure without adding it to meanings', async () => {
  const parsed = await DocxVocabularyParserV2.parseDocxBuffer(usageReferenceDocx(), { relativePath: 'TOEIC MUST-KNOW VOCABULARY/Day 2.docx' });
  assert.equal(parsed.items.length, 3);
  assert.equal(parsed.items[0].senses[0].meaning, 'chú ý, lưu tâm');
  assert.deepEqual(parsed.items[0].notes.map(note => note.text), ['be mindful of + N = pay attention to']);
  assert.equal(parsed.items[1].senses[0].meaning, 'khao khát');
  assert.deepEqual(parsed.items[1].notes.map(note => note.text), ['aspire to + N/V', 'aspire to do something']);
  assert.equal(parsed.items[2].senses[0].meaning, 'đảm bảo với ai');
  assert.deepEqual(parsed.items[2].notes.map(note => note.text), ['assure someone that + clause']);
  assert.deepEqual(parsed.items.map(item => item.senses[0].examples[0].english), [
    'Please be mindful of the safety rules.',
    'She aspires to lead the team.',
    'The manager assured the team that the plan was ready.',
  ]);
});

test('Essential Collocation supports inline and labeled following-paragraph examples', async () => {
  const parsed = await DocxVocabularyParserV2.parseDocxBuffer(collocationDocx(), { relativePath: 'TOEIC ESSENTIAL COLLOCATION/Chaper 10.docx' });
  assert.equal(parsed.items.length, 2);
  assert.equal(parsed.items[0].source.fileName, 'Chaper 10.docx');
  assert.equal(parsed.items[0].word, 'account for');
  assert.equal(parsed.items[0].senses[0].meaning, 'giải thích, chiếm tỷ lệ');
  assert.equal(parsed.items[0].senses[0].examples[0].vietnamese, 'Doanh số trực tuyến chiếm phần lớn doanh thu.');
  assert.equal(parsed.items[1].word, 'comply with');
  assert.equal(parsed.items[1].senses[0].examples[0].english, 'Employees must comply with the safety rules.');
  assert.equal(parsed.items[1].senses[0].examples[0].vietnamese, 'Nhân viên phải tuân thủ các quy tắc an toàn.');
});

test('Table candidates retain table coordinates and review warnings', async () => {
  const table = `<w:tbl><w:tr><w:tc>${paragraph([textRun('comply with: tuân thủ')])}</w:tc></w:tr></w:tbl>`;
  const parsed = await DocxVocabularyParserV2.parseDocxBuffer(buildDocx({ body: table }), { relativePath: 'TOEIC ESSENTIAL COLLOCATION/Chapter 1.docx' });
  assert.equal(parsed.items.length, 1);
  assert.equal(parsed.items[0].source.tableIndex, 1);
  assert.equal(parsed.items[0].source.rowIndex, 1);
  assert.ok(parsed.warnings.some(warning => warning.includes('table')));
  assert.ok(parsed.items[0].issues.some(issue => issue.code === 'TABLE_LAYOUT_REQUIRES_REVIEW'));
});

test('Batch duplicate annotation keeps every occurrence and never merges rows', async () => {
  const buffer = easyStartDocx({ word: 'release', meaning: 'phát hành', english: 'The team will release a report.', vietnamese: 'Nhóm sẽ phát hành một báo cáo.' });
  const result = await DocxVocabularyParserV2.parseDocxFiles([
    { buffer, source: { relativePath: 'TOEIC EASY START/Start 4.docx' } },
    { buffer, source: { relativePath: 'TOEIC EASY START/Start 5.docx' } },
  ]);
  assert.equal(result.items.length, 2);
  assert.equal(result.duplicateGroups.length, 1);
  assert.equal(result.duplicateGroups[0].classification, 'SAME_CONTENT_DIFFERENT_CHAPTER');
  assert.ok(result.items.every(item => item.duplicateCandidate.occurrenceCount === 2 && item.duplicateCandidate.merged === false));
});

test('Legacy parser text contract remains unchanged and V2 does not publish', () => {
  const legacy = LegacyDocxVocabularyParser.parseText('1. contract (noun)\nNghĩa:\nthỏa thuận\nVí dụ:\nThey signed a contract.\n→ Họ đã ký một hợp đồng.');
  assert.equal(legacy.items.length, 1);
  assert.equal(legacy.items[0].word, 'contract');
  assert.equal(legacy.items[0].status, 'published');
  assert.deepEqual(Object.keys(legacy.summary).sort(), ['invalid', 'total', 'valid']);
  assert.equal(DocxVocabularyParserV2.version, '2.1.0');
});

test('All original DOCX files reconcile to the independent 711-row locator and SHA-256 references', { skip: !expectedFromEnvironment() }, async () => {
  const acceptance = await loadSourceAcceptance({});
  const coverageRows = buildCoverageRows(acceptance);
  assert.deepEqual(acceptance.directFolders.sort(), [
    'TOEIC EASY START',
    'TOEIC ESSENTIAL COLLOCATION',
    'TOEIC MUST-KNOW VOCABULARY',
  ]);
  assert.equal(acceptance.allFiles.length, 30);
  assert.equal(acceptance.files.length, 30);
  assert.equal(acceptance.references.length, 711);
  assert.equal(acceptance.manifest.length, 30);
  assert.equal(acceptance.result.items.length, 711);
  for (const folder of acceptance.directFolders) {
    assert.equal(acceptance.files.filter(file => file.split(path.sep).slice(-2, -1)[0] === folder).length, 10, `${folder} DOCX count`);
  }
  assert.equal(coverageRows.reduce((sum, row) => sum + row.missing, 0), 0);
  assert.equal(coverageRows.reduce((sum, row) => sum + row.extra, 0), 0);
  assert.equal(coverageRows.reduce((sum, row) => sum + row.word_pos_order_matches, 0), 711);
  assert.equal(coverageRows.reduce((sum, row) => sum + row.source_locator_covered, 0), 711);
  assert.equal(coverageRows.reduce((sum, row) => sum + row.source_reference_mismatch, 0), 0);
  assert.ok(coverageRows.every(row => row.source_sha256_match && row.package_xml_relationship_validation));
  assert.equal(coverageRows.reduce((sum, row) => sum + row.exact_field_correct_independent, 0), SOURCE_FIELD_GOLDENS.length);
  assert.equal(coverageRows.reduce((sum, row) => sum + row.independent_field_oracle_rows, 0), SOURCE_FIELD_GOLDENS.length);
  assert.equal(acceptance.result.duplicateGroups.length, 14);
  assert.equal(acceptance.result.summary.duplicateOccurrences, 29);
  assert.equal(acceptance.result.items.filter(item => item.reviewStatus === 'NEEDS_REVIEW').length, 711);
  assert.ok(acceptance.result.items.every(item => !('status' in item)));

  for (const golden of SOURCE_FIELD_GOLDENS) {
    const candidate = acceptance.result.items.find(item => item.source.relativePath === golden.sourcePath && item.word.toLowerCase() === golden.word.toLowerCase());
    assert.ok(candidate, `Missing golden source row ${golden.sourcePath} :: ${golden.word}`);
    assert.ok(evaluateGolden(candidate, golden), `Field golden mismatch ${golden.sourcePath} :: ${golden.word}`);
  }

  const byWord = new Map(acceptance.result.duplicateGroups.map(group => [group.headword.toLowerCase(), group]));
  assert.equal(Object.keys(EXPECTED_DUPLICATE_GROUPS).length, 14);
  for (const [word, expected] of Object.entries(EXPECTED_DUPLICATE_GROUPS)) {
    const group = byWord.get(word);
    assert.ok(group, `Missing duplicate candidate ${word}`);
    assert.equal(group.occurrenceCount, expected.count, `Occurrence count for ${word}`);
    assert.equal(group.classification, expected.classification, `Classification for ${word}`);
  }

  const dayFourTwelfths = acceptance.result.items.filter(item => item.source.relativePath.toUpperCase() === 'TOEIC MUST-KNOW VOCABULARY/DAY 4.DOCX' && item.source.sourceDisplayNumber === 12);
  assert.equal(dayFourTwelfths.length, 2);
  for (const document of acceptance.result.documents.filter(document => document.source.layoutGroup === 'easy-start')) {
    const documentItems = acceptance.result.items.filter(item => item.source.relativePath === document.source.relativePath);
    assert.deepEqual(documentItems.map(item => item.source.sourceDisplayNumber), documentItems.map((_, index) => index + 1), `${document.source.relativePath} automatic numbering`);
  }
  assert.equal(acceptance.result.items.filter(item => item.word.toLowerCase() === 'release').length, 2);
  const releaseRows = acceptance.result.items.filter(item => item.word.toLowerCase() === 'release');
  assert.equal(releaseRows[0].raw.text, releaseRows[1].raw.text);
  assert.equal(acceptance.result.items.find(item => item.source.relativePath === 'TOEIC MUST-KNOW VOCABULARY/Day 3.docx')?.source.topicCandidate, 'Day 3');
  assert.ok(acceptance.result.items.some(item => item.source.fileName === 'Chaper 10.docx'));
});
