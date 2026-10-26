import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import DocxVocabularyParserV2 from '../../src/services/docxVocabularyParserV2.js';

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
export const BACKEND_ROOT = path.resolve(THIS_DIR, '../..');
export const REPOSITORY_ROOT = path.resolve(BACKEND_ROOT, '..');

export const SOURCE_FIELD_GOLDENS = Object.freeze([
  {
    sourcePath: 'TOEIC EASY START/Start 1.docx',
    word: 'application form',
    meaning: ['đơn đăng ký, mẫu đơn đăng ký'],
    examples: [{ english: 'Please fill out the application form.', vietnamese: 'Vui lòng điền vào đơn đăng ký.' }],
  },
  {
    sourcePath: 'TOEIC MUST-KNOW VOCABULARY/DAY 2.docx',
    word: 'attribute',
    senses: [
      {
        partOfSpeech: ['verb'],
        usagePattern: 'attribute A to B',
        meaning: 'quy cho A là do B\ncho rằng A là kết quả/nguyên nhân của B',
        examples: [{ english: 'The company attributed the increase in sales to its new advertising campaign.', vietnamese: 'Công ty cho rằng sự gia tăng doanh số là nhờ chiến dịch quảng cáo mới.' }],
      },
      {
        partOfSpeech: ['noun'],
        usagePattern: '',
        meaning: 'đặc điểm, phẩm chất, đặc tính',
        examples: [{ english: 'Reliability is an important attribute of a good employee.', vietnamese: 'Sự đáng tin cậy là một phẩm chất quan trọng của một nhân viên giỏi.' }],
      },
    ],
  },
  {
    sourcePath: 'TOEIC MUST-KNOW VOCABULARY/DAY 4.docx',
    word: 'negligence',
    meaning: ['sự bất cẩn\nsự sơ suất\nsự cẩu thả do không thực hiện trách nhiệm cần thiết'],
    examples: [{ english: "The accident was caused by the driver's negligence.", vietnamese: 'Tai nạn xảy ra do sự bất cẩn của người lái xe.' }],
    noteIncludes: 'negligence ≠ neglect',
  },
  {
    sourcePath: 'TOEIC ESSENTIAL COLLOCATION/Chapter 1.docx',
    word: 'implement a change',
    meaning: ['thực hiện một thay đổi'],
    examples: [{ english: 'The company plans to implement a change in its hiring policy.', vietnamese: 'Công ty dự định thực hiện một thay đổi trong chính sách tuyển dụng.' }],
  },
  {
    sourcePath: 'TOEIC ESSENTIAL COLLOCATION/Chapter 9.docx',
    word: 'generic drug',
    meaning: ['thuốc generic, thuốc tương đương thuốc gốc'],
    examples: [{ english: 'The doctor prescribed a generic drug.', vietnamese: 'Bác sĩ kê một loại thuốc generic.' }],
  },
  {
    sourcePath: 'TOEIC ESSENTIAL COLLOCATION/Chaper 10.docx',
    word: 'advanced degree',
    meaning: ['bằng cấp cao, bằng sau đại học'],
    examples: [{ english: 'She holds an advanced degree in business.', vietnamese: 'Cô ấy có bằng cấp cao về kinh doanh.' }],
  },
]);

export const EXPECTED_DUPLICATE_GROUPS = Object.freeze({
  maintenance: { count: 2, classification: 'NEEDS_REVIEW' },
  complimentary: { count: 2, classification: 'SAME_HEADWORD_DIFFERENT_SENSE' },
  arrange: { count: 2, classification: 'NEEDS_REVIEW' },
  release: { count: 2, classification: 'SAME_CONTENT_DIFFERENT_CHAPTER' },
  extension: { count: 2, classification: 'SAME_HEADWORD_DIFFERENT_SENSE' },
  convey: { count: 2, classification: 'SAME_HEADWORD_DIFFERENT_SENSE' },
  occasionally: { count: 2, classification: 'NEEDS_REVIEW' },
  approval: { count: 2, classification: 'NEEDS_REVIEW' },
  access: { count: 3, classification: 'SAME_HEADWORD_DIFFERENT_SENSE' },
  outline: { count: 2, classification: 'NEEDS_REVIEW' },
  clarify: { count: 2, classification: 'NEEDS_REVIEW' },
  transaction: { count: 2, classification: 'NEEDS_REVIEW' },
  entirely: { count: 2, classification: 'NEEDS_REVIEW' },
  'rigorous inspection': { count: 2, classification: 'NEEDS_REVIEW' },
});

export function parseCsv(text) {
  text = String(text).replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\n') {
      row.push(cell.replace(/\r$/, ''));
      if (row.some(value => value !== '')) rows.push(row);
      row = [];
      cell = '';
    } else cell += char;
  }
  if (cell || row.length) {
    row.push(cell.replace(/\r$/, ''));
    if (row.some(value => value !== '')) rows.push(row);
  }
  const [header = [], ...records] = rows;
  return records.map(values => Object.fromEntries(header.map((name, index) => [name, values[index] || ''])));
}

export function csvEscape(value) {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function normalizeWhitespace(text) {
  return String(text || '').normalize('NFC').replace(/\s+/gu, ' ').trim();
}

function normalizeWord(text) {
  return normalizeWhitespace(text).normalize('NFKC').toLocaleLowerCase('vi');
}

function posToken(text) {
  const token = normalizeWhitespace(text).toLowerCase().replace(/[()]/g, '');
  return ({
    n: 'noun', noun: 'noun',
    v: 'verb', verb: 'verb',
    adj: 'adjective', adjective: 'adjective',
    adv: 'adverb', adverb: 'adverb',
    prep: 'preposition', preposition: 'preposition',
  })[token] || token;
}

function normalizePos(value) {
  return [...new Set(String(value || '').split(/[\/,;]/).map(posToken).filter(Boolean))].sort();
}

function normalizeCandidatePos(candidate) {
  return [...new Set(candidate.partOfSpeech.map(posToken))].sort();
}

export function evaluateGolden(candidate, golden) {
  if (!candidate || normalizeWord(candidate.word) !== normalizeWord(golden.word)) return false;
  const normalizePairs = pairs => pairs.map(pair => `${normalizeWhitespace(pair.english)}\u0000${normalizeWhitespace(pair.vietnamese)}`);
  const candidateMeanings = candidate.senses.map(sense => normalizeWhitespace(sense.meaning));
  const expectedMeanings = golden.meaning || golden.senses.map(sense => sense.meaning);
  if (JSON.stringify(candidateMeanings) !== JSON.stringify(expectedMeanings.map(normalizeWhitespace))) return false;

  if (golden.senses) {
    if (candidate.senses.length !== golden.senses.length) return false;
    for (let index = 0; index < golden.senses.length; index += 1) {
      const actual = candidate.senses[index];
      const expected = golden.senses[index];
      if (JSON.stringify([...actual.partOfSpeech].sort()) !== JSON.stringify([...expected.partOfSpeech].sort())) return false;
      if (normalizeWhitespace(actual.usagePattern) !== normalizeWhitespace(expected.usagePattern)) return false;
      if (JSON.stringify(normalizePairs(actual.examples)) !== JSON.stringify(normalizePairs(expected.examples))) return false;
    }
  } else {
    const actualPairs = candidate.senses.flatMap(sense => sense.examples);
    if (JSON.stringify(normalizePairs(actualPairs)) !== JSON.stringify(normalizePairs(golden.examples || []))) return false;
  }
  if (golden.noteIncludes && !candidate.notes.some(note => normalizeWhitespace(note.text).includes(normalizeWhitespace(golden.noteIncludes)))) return false;
  return true;
}

export async function loadSourceAcceptance({ sourceRoot, referenceCsv, manifestCsv }) {
  const root = path.resolve(sourceRoot || process.env.VOCABULARY_DOCX_SOURCE_ROOT || path.join(REPOSITORY_ROOT, 'local-assets/vocabulary-source'));
  const referencePath = path.resolve(referenceCsv || process.env.VOCABULARY_DOCX_REFERENCE_CSV || path.join(REPOSITORY_ROOT, 'docs/vocabulary/phase0/source-gate-closure/DOCX_SOURCE_ENTRY_LOCATORS.csv'));
  const manifestPath = path.resolve(manifestCsv || process.env.VOCABULARY_DOCX_SHA256_MANIFEST || path.join(REPOSITORY_ROOT, 'docs/vocabulary/phase0/source-gate-closure/DOCX_SHA256_MANIFEST.csv'));
  const [referenceText, manifestText, topEntries] = await Promise.all([
    fs.readFile(referencePath, 'utf8'),
    fs.readFile(manifestPath, 'utf8'),
    fs.readdir(root, { withFileTypes: true }),
  ]);
  const references = parseCsv(referenceText).map(row => ({ ...row, source_path: row.source_path.replace(/\\/g, '/') }));
  const manifest = parseCsv(manifestText).map(row => ({ ...row, source_path: row.source_path.replace(/\\/g, '/') }));
  const directFolders = topEntries.filter(entry => entry.isDirectory()).map(entry => entry.name);
  const allFiles = [];
  async function walk(folder) {
    for (const entry of await fs.readdir(folder, { withFileTypes: true })) {
      const fullPath = path.join(folder, entry.name);
      if (entry.isDirectory()) await walk(fullPath);
      else if (entry.isFile()) allFiles.push(fullPath);
    }
  }
  await walk(root);
  const files = allFiles.filter(fullPath => fullPath.toLowerCase().endsWith('.docx'));
  files.sort((a, b) => path.relative(root, a).localeCompare(path.relative(root, b), 'en'));
  const inputs = await Promise.all(files.map(async fullPath => {
    const relativePath = path.relative(root, fullPath).split(path.sep).join('/');
    const buffer = await fs.readFile(fullPath);
    return {
      buffer,
      source: {
        fileName: path.basename(fullPath),
        sourceFolder: relativePath.split('/')[0],
        relativePath,
        sourceBytes: buffer.length,
        sourceSha256: createHash('sha256').update(buffer).digest('hex').toUpperCase(),
      },
    };
  }));
  const result = await DocxVocabularyParserV2.parseDocxFiles(inputs);
  return { root, referencePath, manifestPath, directFolders, allFiles, references, manifest, files, inputs, result };
}

export function buildCoverageRows(acceptance) {
  const refsByPath = new Map();
  for (const row of acceptance.references) {
    if (!refsByPath.has(row.source_path)) refsByPath.set(row.source_path, []);
    refsByPath.get(row.source_path).push(row);
  }
  const itemsByPath = new Map();
  for (const item of acceptance.result.items) {
    const key = item.source.relativePath;
    if (!itemsByPath.has(key)) itemsByPath.set(key, []);
    itemsByPath.get(key).push(item);
  }
  const manifestByPath = new Map(acceptance.manifest.map(row => [row.source_path, row]));
  const documentsByPath = new Map(acceptance.result.documents.map(document => [document.source.relativePath, document]));
  const goldensByPath = new Map();
  for (const golden of SOURCE_FIELD_GOLDENS) {
    if (!goldensByPath.has(golden.sourcePath)) goldensByPath.set(golden.sourcePath, []);
    goldensByPath.get(golden.sourcePath).push(golden);
  }
  const paths = [...new Set([...refsByPath.keys(), ...itemsByPath.keys()])].sort((a, b) => a.localeCompare(b, 'en'));
  return paths.map(sourcePath => {
    const refs = refsByPath.get(sourcePath) || [];
    const items = itemsByPath.get(sourcePath) || [];
    const actualByOrdinal = new Map(items.map(item => [item.source.sourceOrdinal, item]));
    let wordPosOrderMatches = 0;
    let locatorCovered = 0;
    let sourceReferenceMismatch = 0;
    for (const reference of refs) {
      const ordinal = Number(reference.source_order);
      const item = actualByOrdinal.get(ordinal);
      if (!item) {
        sourceReferenceMismatch += 1;
        continue;
      }
      const wordMatches = normalizeWord(item.word) === normalizeWord(reference.word_or_phrase);
      const posMatches = JSON.stringify(normalizeCandidatePos(item)) === JSON.stringify(normalizePos(reference.part_of_speech));
      const orderMatches = item.source.sourceOrdinal === ordinal;
      let rowMatches = true;
      if (wordMatches && posMatches && orderMatches) wordPosOrderMatches += 1;
      else rowMatches = false;
      if (item.source.paragraphStart === Number(reference.paragraph_start)) locatorCovered += 1;
      else rowMatches = false;
      if (reference.source_display_number && Number(reference.source_display_number) !== item.source.sourceDisplayNumber) rowMatches = false;
      if (!rowMatches) sourceReferenceMismatch += 1;
    }
    const pathGoldens = goldensByPath.get(sourcePath) || [];
    const goldenPasses = pathGoldens.filter(golden => {
      const candidate = items.find(item => normalizeWord(item.word) === normalizeWord(golden.word));
      return evaluateGolden(candidate, golden);
    }).length;
    const manifest = manifestByPath.get(sourcePath);
    const parsedDocument = documentsByPath.get(sourcePath);
    return {
      source_path: sourcePath,
      source_entry_count_reference: refs.length,
      parser_detected: items.length,
      exact_field_correct_independent: goldenPasses,
      independent_field_oracle_rows: pathGoldens.length,
      missing: Math.max(refs.length - items.length, 0),
      extra: Math.max(items.length - refs.length, 0),
      field_mismatch_verified: pathGoldens.length - goldenPasses,
      source_reference_mismatch: sourceReferenceMismatch,
      needs_review: items.filter(item => item.reviewStatus === 'NEEDS_REVIEW').length,
      word_pos_order_matches: wordPosOrderMatches,
      source_locator_covered: locatorCovered,
      source_sha256_match: Boolean(manifest && parsedDocument && manifest.sha256.toUpperCase() === parsedDocument.source.fileSha256),
      package_xml_relationship_validation: Boolean(parsedDocument),
      unreviewed_field_rows: Math.max(items.length - pathGoldens.length, 0),
      parser_issues: items.reduce((sum, item) => sum + item.issues.length, 0),
    };
  });
}

export function coverageCsv(rows) {
  const headers = [
    'source_path', 'source_entry_count_reference', 'parser_detected', 'exact_field_correct_independent',
    'independent_field_oracle_rows', 'missing', 'extra', 'field_mismatch_verified',
    'source_reference_mismatch', 'needs_review', 'word_pos_order_matches', 'source_locator_covered',
    'source_sha256_match', 'package_xml_relationship_validation',
    'unreviewed_field_rows', 'parser_issues',
  ];
  return `${headers.join(',')}\n${rows.map(row => headers.map(header => csvEscape(row[header])).join(',')).join('\n')}\n`;
}
