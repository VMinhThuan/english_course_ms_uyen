import crypto from 'node:crypto';
import path from 'node:path';
import yauzl from 'yauzl';
import { SaxesParser } from 'saxes';

export const XLSX_IMPORT_LIMITS = Object.freeze({
  maxFileBytes: 8 * 1024 * 1024,
  maxZipEntries: 128,
  maxUncompressedBytes: 24 * 1024 * 1024,
  maxEntryBytes: 8 * 1024 * 1024,
  maxCompressionRatio: 250,
  maxWorksheets: 5,
  maxDataRows: 1000,
  maxPhysicalRow: 1020,
  maxColumns: 64,
  maxCells: 40_000,
  maxCellCharacters: 4000,
  maxSharedStrings: 20_000,
  maxHeaderScanRows: 20,
});

const FIELD_NAMES = ['questionText', 'optionA', 'optionB', 'optionC', 'optionD', 'correctAnswer', 'explanation'];
const OPTION_FIELDS = [
  ['A', 'optionA'],
  ['B', 'optionB'],
  ['C', 'optionC'],
  ['D', 'optionD'],
];

const HEADER_ALIASES = new Map([
  ['questionText', ['cau hoi', 'question', 'question text', 'stem']],
  ['optionA', ['a', 'dap an a', 'phuong an a', 'lua chon a', 'option a', 'choice a']],
  ['optionB', ['b', 'dap an b', 'phuong an b', 'lua chon b', 'option b', 'choice b']],
  ['optionC', ['c', 'dap an c', 'phuong an c', 'lua chon c', 'option c', 'choice c']],
  ['optionD', ['d', 'dap an d', 'phuong an d', 'lua chon d', 'option d', 'choice d']],
  ['correctAnswer', ['dap an dung', 'dap an', 'correct answer', 'correct option', 'answer', 'answer key', 'key']],
  ['explanation', ['loi giai thich', 'giai thich', 'explanation', 'reason']],
]);

export class XlsxImportError extends Error {
  constructor(code, message, statusCode = 400) {
    super(message);
    this.name = 'XlsxImportError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

const fail = (code, message, statusCode) => {
  throw new XlsxImportError(code, message, statusCode);
};

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

const normalizeHeader = (value) => String(value || '')
  .normalize('NFD')
  .replace(/\p{Diacritic}/gu, '')
  .replace(/[đĐ]/g, 'd')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim()
  .replace(/\s+/g, ' ');

const attribute = (tag, name) => {
  const value = tag.attributes?.[name];
  if (typeof value === 'string') return value;
  return value?.value ?? '';
};

const localName = (name) => String(name || '').split(':').at(-1);

const parseXml = (xml, label, handlers = {}) => {
  const parser = new SaxesParser({ xmlns: false });
  let parserError;
  parser.on('error', (error) => { parserError = error; });
  parser.on('doctype', () => fail('XML_DTD_NOT_ALLOWED', `${label} contains a DOCTYPE; DTDs are not accepted.`));
  parser.on('opentag', (tag) => handlers.open?.(tag));
  parser.on('text', (text) => handlers.text?.(text));
  parser.on('cdata', (text) => handlers.text?.(text));
  parser.on('closetag', (tag) => handlers.close?.(tag));

  try {
    parser.write(String(xml).replace(/^\uFEFF/, '')).close();
  } catch (error) {
    if (error instanceof XlsxImportError) throw error;
    fail('INVALID_XML', `${label} is not well-formed XML.`);
  }
  if (parserError) fail('INVALID_XML', `${label} is not well-formed XML.`);
}

const openZip = (buffer) => new Promise((resolve, reject) => {
  yauzl.fromBuffer(buffer, {
    lazyEntries: true,
    autoClose: false,
    decodeStrings: true,
    strictFileNames: true,
    validateEntrySizes: true,
  }, (error, zipFile) => (error ? reject(error) : resolve(zipFile)));
});

const readZipEntry = async (zipFile, entry, limit = XLSX_IMPORT_LIMITS.maxEntryBytes) => {
  if (!Number.isSafeInteger(entry.uncompressedSize) || entry.uncompressedSize > limit) {
    fail('ZIP_ENTRY_TOO_LARGE', `XLSX entry ${entry.fileName} exceeds the uncompressed entry limit.`, 413);
  }

  let stream;
  try {
    stream = await zipFile.openReadStreamPromise(entry);
    const chunks = [];
    let length = 0;
    for await (const chunk of stream) {
      length += chunk.length;
      if (length > limit) {
        stream.destroy();
        fail('ZIP_ENTRY_TOO_LARGE', `XLSX entry ${entry.fileName} exceeds the uncompressed entry limit.`, 413);
      }
      chunks.push(chunk);
    }
    return Buffer.concat(chunks, length).toString('utf8');
  } catch (error) {
    if (error instanceof XlsxImportError) throw error;
    fail('INVALID_XLSX', `XLSX entry ${entry.fileName} could not be read safely.`);
  }
};

const collectZipEntries = async (buffer) => {
  let zipFile;
  try {
    zipFile = await openZip(buffer);
    const entries = new Map();
    const foldedNames = new Set();
    let totalUncompressedBytes = 0;
    let entryCount = 0;

    for await (const entry of zipFile.eachEntry()) {
      entryCount += 1;
      if (entryCount > XLSX_IMPORT_LIMITS.maxZipEntries) {
        fail('ZIP_ENTRY_LIMIT', 'XLSX contains too many ZIP entries.', 413);
      }

      const name = entry.fileName;
      const segments = name.split('/');
      if (!name || name.startsWith('/') || name.includes('\\') || segments.some((segment, index) => segment === '..' || (segment === '' && index !== segments.length - 1))) {
        fail('INVALID_ZIP_PATH', 'XLSX contains an unsafe ZIP entry path.');
      }

      const foldedName = name.toLowerCase();
      if (foldedNames.has(foldedName)) fail('DUPLICATE_ZIP_ENTRY', 'XLSX contains duplicate ZIP entry names.');
      foldedNames.add(foldedName);

      if ((entry.generalPurposeBitFlag & 0x1) !== 0) fail('ENCRYPTED_ZIP_ENTRY', 'Encrypted XLSX entries are not accepted.');
      if (![0, 8].includes(entry.compressionMethod)) fail('UNSUPPORTED_ZIP_COMPRESSION', 'XLSX uses an unsupported ZIP compression method.');
      if (!Number.isSafeInteger(entry.compressedSize) || !Number.isSafeInteger(entry.uncompressedSize)) {
        fail('INVALID_ZIP_SIZE', 'XLSX contains invalid ZIP size metadata.');
      }
      if (entry.uncompressedSize > XLSX_IMPORT_LIMITS.maxEntryBytes) {
        fail('ZIP_ENTRY_TOO_LARGE', 'XLSX contains an entry larger than the allowed uncompressed size.', 413);
      }
      if (entry.uncompressedSize > 0 && entry.compressedSize === 0) {
        fail('ZIP_COMPRESSION_RATIO', 'XLSX contains an invalid compressed entry.');
      }
      if (entry.compressedSize > 0 && entry.uncompressedSize / entry.compressedSize > XLSX_IMPORT_LIMITS.maxCompressionRatio) {
        fail('ZIP_COMPRESSION_RATIO', 'XLSX entry compression ratio exceeds the safety limit.', 413);
      }

      totalUncompressedBytes += entry.uncompressedSize;
      if (totalUncompressedBytes > XLSX_IMPORT_LIMITS.maxUncompressedBytes) {
        fail('ZIP_UNCOMPRESSED_LIMIT', 'XLSX total uncompressed size exceeds the safety limit.', 413);
      }

      const lowerName = name.toLowerCase();
      if (lowerName.includes('vbaproject.bin') || lowerName.includes('/macrosheets/')) {
        fail('MACRO_NOT_ALLOWED', 'Macro-enabled workbooks are not accepted.');
      }
      entries.set(name, entry);
    }

    return { zipFile, entries };
  } catch (error) {
    if (zipFile) zipFile.close();
    if (error instanceof XlsxImportError) throw error;
    fail('INVALID_XLSX', 'File is not a readable XLSX ZIP package.');
  }
};

const parseContentTypes = (xml) => {
  let workbookTypeFound = false;
  let macroTypeFound = false;
  parseXml(xml, '[Content_Types].xml', {
    open(tag) {
      if (localName(tag.name) !== 'Override') return;
      const partName = attribute(tag, 'PartName');
      const contentType = attribute(tag, 'ContentType').toLowerCase();
      if (partName === '/xl/workbook.xml' && contentType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml') {
        workbookTypeFound = true;
      }
      if (contentType.includes('macroenabled') || contentType.includes('vbaproject')) macroTypeFound = true;
    },
  });
  if (macroTypeFound) fail('MACRO_NOT_ALLOWED', 'Macro-enabled workbooks are not accepted.');
  if (!workbookTypeFound) fail('INVALID_XLSX', 'File is not an OOXML .xlsx workbook.');
};

const parseWorkbook = (xml) => {
  const sheets = [];
  parseXml(xml, 'xl/workbook.xml', {
    open(tag) {
      if (localName(tag.name) !== 'sheet') return;
      sheets.push({
        name: attribute(tag, 'name'),
        relationshipId: attribute(tag, 'r:id'),
        state: attribute(tag, 'state') || 'visible',
      });
    },
  });
  if (sheets.length === 0) fail('INVALID_XLSX', 'Workbook does not contain a worksheet.');
  if (sheets.length > XLSX_IMPORT_LIMITS.maxWorksheets) {
    fail('WORKSHEET_LIMIT', `Workbook exceeds the ${XLSX_IMPORT_LIMITS.maxWorksheets}-worksheet limit.`, 413);
  }
  return sheets;
};

const parseWorkbookRelationships = (xml) => {
  const relationships = new Map();
  parseXml(xml, 'xl/_rels/workbook.xml.rels', {
    open(tag) {
      if (localName(tag.name) !== 'Relationship') return;
      const id = attribute(tag, 'Id');
      const target = attribute(tag, 'Target');
      const targetMode = attribute(tag, 'TargetMode');
      const type = attribute(tag, 'Type');
      if (targetMode.toLowerCase() === 'external') {
        fail('EXTERNAL_RELATIONSHIP_NOT_ALLOWED', 'External workbook relationships are not accepted.');
      }
      relationships.set(id, { target, type });
    },
  });
  return relationships;
};

const resolveWorksheetPath = (target) => {
  if (!target || target.includes('\\') || target.includes('?') || target.includes('#')) {
    fail('INVALID_WORKSHEET_RELATIONSHIP', 'Workbook contains an invalid worksheet relationship.');
  }
  const resolved = target.startsWith('/')
    ? path.posix.normalize(target.slice(1))
    : path.posix.normalize(path.posix.join('xl', target));
  if (!resolved.startsWith('xl/worksheets/') || resolved.includes('../')) {
    fail('INVALID_WORKSHEET_RELATIONSHIP', 'Workbook worksheet relationship points outside the worksheet folder.');
  }
  return resolved;
};

const parseSharedStrings = (xml) => {
  const values = [];
  const oversizedIndexes = new Set();
  let currentString = null;
  let inText = false;
  parseXml(xml, 'xl/sharedStrings.xml', {
    open(tag) {
      const name = localName(tag.name);
      if (name === 'si') currentString = { value: '', length: 0, oversized: false };
      else if (name === 't' && currentString) inText = true;
    },
    text(text) {
      if (!currentString || !inText) return;
      currentString.length += text.length;
      if (currentString.length > XLSX_IMPORT_LIMITS.maxCellCharacters) currentString.oversized = true;
      const room = Math.max(0, XLSX_IMPORT_LIMITS.maxCellCharacters - currentString.value.length);
      if (room > 0) currentString.value += text.slice(0, room);
    },
    close(tag) {
      const name = localName(tag.name);
      if (name === 't') inText = false;
      if (name === 'si' && currentString) {
        if (values.length >= XLSX_IMPORT_LIMITS.maxSharedStrings) {
          fail('SHARED_STRING_LIMIT', 'Workbook contains too many shared strings.', 413);
        }
        if (currentString.oversized) oversizedIndexes.add(values.length);
        values.push(currentString.value);
        currentString = null;
      }
    },
  });
  return { values, oversizedIndexes };
};

const columnNumberFromReference = (reference) => {
  const match = String(reference || '').match(/^([A-Z]+)(\d+)$/i);
  if (!match) return null;
  let column = 0;
  for (const letter of match[1].toUpperCase()) column = column * 26 + (letter.charCodeAt(0) - 64);
  return { column, row: Number(match[2]) };
};

const parseWorksheet = (xml, sheetName) => {
  const rows = new Map();
  let dimensionMaxRow = 0;
  let currentRowNumber = 0;
  let currentCell = null;
  let inValue = false;
  let inInlineText = false;
  let cellCount = 0;

  const appendCellText = (target, text) => {
    target.length += text.length;
    const room = Math.max(0, XLSX_IMPORT_LIMITS.maxCellCharacters - target.value.length);
    if (room > 0) target.value += text.slice(0, room);
    if (target.length > XLSX_IMPORT_LIMITS.maxCellCharacters) target.tooLong = true;
  };

  parseXml(xml, `worksheet ${sheetName}`, {
    open(tag) {
      const name = localName(tag.name);
      if (name === 'dimension') {
        const dimension = attribute(tag, 'ref');
        const lastReference = dimension?.split(':').at(-1);
        const lastCell = columnNumberFromReference(lastReference);
        if (lastCell) {
          if (lastCell.column > XLSX_IMPORT_LIMITS.maxColumns || lastCell.row > XLSX_IMPORT_LIMITS.maxPhysicalRow) {
            fail('WORKSHEET_DIMENSION_LIMIT', 'Worksheet used range exceeds row or column limits.', 413);
          }
          dimensionMaxRow = lastCell.row;
        }
      } else if (name === 'row') {
        const rowAttribute = Number(attribute(tag, 'r'));
        currentRowNumber = Number.isInteger(rowAttribute) && rowAttribute > 0 ? rowAttribute : currentRowNumber + 1;
        if (currentRowNumber > XLSX_IMPORT_LIMITS.maxPhysicalRow) {
          fail('ROW_LIMIT', 'Worksheet row number exceeds the safety limit.', 413);
        }
        if (!rows.has(currentRowNumber)) rows.set(currentRowNumber, new Map());
      } else if (name === 'c') {
        const reference = attribute(tag, 'r');
        const parsedReference = columnNumberFromReference(reference);
        const column = parsedReference?.column;
        const rowNumber = parsedReference?.row || currentRowNumber;
        if (!column || column > XLSX_IMPORT_LIMITS.maxColumns || rowNumber < 1 || rowNumber > XLSX_IMPORT_LIMITS.maxPhysicalRow) {
          fail('CELL_REFERENCE_LIMIT', 'Worksheet contains an invalid or out-of-range cell reference.', 413);
        }
        cellCount += 1;
        if (cellCount > XLSX_IMPORT_LIMITS.maxCells) fail('CELL_COUNT_LIMIT', 'Worksheet contains too many cells.', 413);
        if (!rows.has(rowNumber)) rows.set(rowNumber, new Map());
        currentCell = {
          rowNumber,
          column,
          reference,
          type: attribute(tag, 't') || 'n',
          value: '',
          length: 0,
          tooLong: false,
          formula: false,
        };
      } else if (name === 'f' && currentCell) {
        currentCell.formula = true;
      } else if (name === 'v' && currentCell) {
        inValue = true;
      } else if (name === 't' && currentCell) {
        inInlineText = true;
      }
    },
    text(text) {
      if (!currentCell || currentCell.formula) return;
      if (inValue || inInlineText) appendCellText(currentCell, text);
    },
    close(tag) {
      const name = localName(tag.name);
      if (name === 'v') inValue = false;
      if (name === 't') inInlineText = false;
      if (name === 'c' && currentCell) {
        const row = rows.get(currentCell.rowNumber);
        row.set(currentCell.column, currentCell);
        currentCell = null;
      }
    },
  });

  const maxRow = Math.max(dimensionMaxRow, ...rows.keys(), 0);
  if (maxRow > XLSX_IMPORT_LIMITS.maxPhysicalRow) fail('ROW_LIMIT', 'Worksheet row number exceeds the safety limit.', 413);
  return { rows, maxRow };
};

const resolveSharedCells = (worksheet, sharedStrings) => {
  for (const row of worksheet.rows.values()) {
    for (const cell of row.values()) {
      if (cell.formula) {
        cell.value = '';
        continue;
      }
      if (cell.type === 's') {
        const index = Number(cell.value);
        if (!Number.isInteger(index) || index < 0 || index >= sharedStrings.values.length) {
          cell.sharedStringError = true;
          cell.value = '';
          continue;
        }
        cell.sharedStringIndex = index;
        cell.value = sharedStrings.values[index];
        if (sharedStrings.oversizedIndexes.has(index)) cell.tooLong = true;
      } else if (cell.type === 'inlineStr') {
        // Inline strings were collected from their <t> nodes while parsing.
      } else if (cell.type === 'e') {
        cell.cellError = true;
        cell.value = '';
      }
    }
  }
};

const findHeader = (worksheet) => {
  const candidates = [];
  const scanEnd = Math.min(worksheet.maxRow, XLSX_IMPORT_LIMITS.maxHeaderScanRows);
  for (let rowNumber = 1; rowNumber <= scanEnd; rowNumber += 1) {
    const row = worksheet.rows.get(rowNumber) || new Map();
    const columnsByField = new Map(FIELD_NAMES.map((field) => [field, []]));
    for (const [column, cell] of row.entries()) {
      if (cell.formula || cell.cellError || cell.sharedStringError) continue;
      const normalized = normalizeHeader(cell.value);
      if (!normalized) continue;
      for (const [field, aliases] of HEADER_ALIASES) {
        if (aliases.includes(normalized)) columnsByField.get(field).push(column);
      }
    }

    const columns = {};
    const ambiguousFields = [];
    for (const field of FIELD_NAMES) {
      const matches = columnsByField.get(field);
      if (matches.length === 1) columns[field] = matches[0];
      else if (matches.length > 1) ambiguousFields.push(field);
    }
    const score = Object.keys(columns).length;
    candidates.push({ rowNumber, columns, ambiguousFields, score, complete: score === FIELD_NAMES.length && ambiguousFields.length === 0 });
  }

  const complete = candidates.filter((candidate) => candidate.complete);
  if (complete.length === 1) return complete[0];
  if (complete.length > 1) fail('AMBIGUOUS_HEADER_ROW', 'More than one row looks like a complete import header.');

  const bestScore = Math.max(0, ...candidates.map((candidate) => candidate.score));
  const best = candidates.filter((candidate) => candidate.score === bestScore);
  if (bestScore > 0 && best.length === 1) return best[0];
  if (bestScore > 0 && best.length > 1) fail('AMBIGUOUS_HEADER_ROW', 'Header row could not be selected unambiguously.');
  return { rowNumber: 1, columns: {}, ambiguousFields: [], score: 0, complete: false };
};

const getCellText = (row, column) => {
  if (!column) return null;
  const cell = row.get(column);
  if (!cell) return null;
  return cell.value;
};

const sourceValue = (text, row, column, field, formulaFields, issues) => {
  if (!column) return '';
  const cell = row.get(column);
  if (!cell) return '';
  if (cell.formula) {
    formulaFields.push(field);
    issues.push({ code: 'FORMULA_NOT_ALLOWED', field, severity: 'error', message: 'Formula cells are not evaluated or accepted.' });
    return '';
  }
  if (cell.cellError || cell.sharedStringError) {
    issues.push({ code: cell.sharedStringError ? 'INVALID_SHARED_STRING' : 'CELL_ERROR', field, severity: 'error', message: 'Cell value could not be read as safe text.' });
    return '';
  }
  if (cell.tooLong) {
    issues.push({ code: 'CELL_TOO_LONG', field, severity: 'error', message: `Cell exceeds ${XLSX_IMPORT_LIMITS.maxCellCharacters} characters; the preview contains a truncated value.` });
  }
  return text;
};

export const normalizeImportText = (value) => String(value || '')
  .normalize('NFC')
  .trim()
  .replace(/\s+/gu, ' ')
  .toLowerCase();

const fingerprint = (value) => sha256(JSON.stringify(value));

export const fingerprintImportValues = (values) => {
  const normalizedOptions = ['A', 'B', 'C', 'D'].map((id) => {
    const option = values.options?.find((item) => item.id === id);
    return normalizeImportText(option?.text);
  });
  const stem = normalizeImportText(values.questionText);
  const correctAnswer = normalizeImportText(values.correctAnswers?.[0]);
  const explanation = normalizeImportText(values.explanation);
  return {
    fingerprintVersion: 1,
    stemFingerprint: fingerprint({ version: 1, stem }),
    stemOptionsFingerprint: fingerprint({ version: 1, stem, options: normalizedOptions }),
    contentFingerprint: fingerprint({ version: 1, stem, options: normalizedOptions, correctAnswer, explanation }),
  };
};

export const validateImportValues = (values, { formulaFields = [], sourceIssues = [] } = {}) => {
  const issues = [...sourceIssues];
  const hasError = (field, code) => issues.some((issue) => issue.field === field && issue.code === code);

  if (typeof values.questionText !== 'string' || !values.questionText.trim()) {
    if (!hasError('questionText', 'MISSING_STEM')) issues.push({ code: 'MISSING_STEM', field: 'questionText', severity: 'error', message: 'Question text is required.' });
  }
  if (!Array.isArray(values.options) || values.options.length !== 4) {
    issues.push({ code: 'INVALID_OPTION_COUNT', field: 'options', severity: 'error', message: 'Exactly four options A, B, C, and D are required.' });
  } else {
    const ids = values.options.map((option) => option?.id);
    const expected = new Set(['A', 'B', 'C', 'D']);
    if (ids.some((id) => !expected.has(id)) || new Set(ids).size !== 4) {
      issues.push({ code: 'INVALID_OPTION_IDS', field: 'options', severity: 'error', message: 'Option IDs must be exactly A, B, C, and D.' });
    }
    for (const id of ['A', 'B', 'C', 'D']) {
      const option = values.options.find((item) => item?.id === id);
      if (typeof option?.text !== 'string' || !option.text.trim()) {
        const field = `option${id}`;
        if (!hasError(field, 'MISSING_OPTION')) issues.push({ code: 'MISSING_OPTION', field, severity: 'error', message: `Option ${id} is required.` });
      }
    }
  }
  if (!Array.isArray(values.correctAnswers) || values.correctAnswers.length === 0) {
    if (!hasError('correctAnswer', 'MISSING_ANSWER')) issues.push({ code: 'MISSING_ANSWER', field: 'correctAnswer', severity: 'error', message: 'Correct answer is required.' });
  } else if (values.correctAnswers.length !== 1 || !['A', 'B', 'C', 'D'].includes(values.correctAnswers[0])) {
    issues.push({ code: 'INVALID_ANSWER', field: 'correctAnswer', severity: 'error', message: 'Correct answer must be exactly one of A, B, C, or D.' });
  }
  if (typeof values.explanation !== 'string' || !values.explanation.trim()) {
    if (!hasError('explanation', 'FORMULA_NOT_ALLOWED')) {
      issues.push({ code: 'MISSING_EXPLANATION', field: 'explanation', severity: 'warning', message: 'Explanation is required before this row can be confirmed.' });
    }
  }
  for (const field of formulaFields) {
    if (!issues.some((issue) => issue.code === 'FORMULA_NOT_ALLOWED' && issue.field === field)) {
      issues.push({ code: 'FORMULA_NOT_ALLOWED', field, severity: 'error', message: 'Formula cells are not evaluated or accepted.' });
    }
  }

  const status = issues.some((issue) => issue.severity === 'error')
    ? 'INVALID'
    : issues.length > 0 ? 'NEEDS_REVIEW' : 'VALID';
  return { status, issues };
};

const candidateForSheet = (sheet, sharedStrings) => {
  const worksheet = parseWorksheet(sheet.xml, sheet.name);
  resolveSharedCells(worksheet, sharedStrings);
  return { ...sheet, worksheet, header: findHeader(worksheet) };
};

export const parseToeicPart5Xlsx = async ({ buffer, originalFileName = 'upload.xlsx' }) => {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) fail('FILE_REQUIRED', 'An XLSX file is required.');
  if (buffer.length > XLSX_IMPORT_LIMITS.maxFileBytes) fail('FILE_TOO_LARGE', `XLSX file exceeds ${XLSX_IMPORT_LIMITS.maxFileBytes} bytes.`, 413);
  if (path.extname(String(originalFileName)).toLowerCase() !== '.xlsx') fail('XLSX_EXTENSION_REQUIRED', 'Only .xlsx files are accepted.');

  const { zipFile, entries } = await collectZipEntries(buffer);
  try {
  const requiredFile = async (name) => {
    const entry = entries.get(name);
    if (!entry) fail('INVALID_XLSX', `Required OOXML entry ${name} is missing.`);
    return readZipEntry(zipFile, entry);
  };

  const contentTypesXml = await requiredFile('[Content_Types].xml');
  parseContentTypes(contentTypesXml);
  const workbookXml = await requiredFile('xl/workbook.xml');
  const relationshipsXml = await requiredFile('xl/_rels/workbook.xml.rels');
  const workbookSheets = parseWorkbook(workbookXml);
  const relationships = parseWorkbookRelationships(relationshipsXml);

  const sheetEntries = [];
  for (const sheet of workbookSheets) {
    const relation = relationships.get(sheet.relationshipId);
    if (!relation || !relation.type?.endsWith('/worksheet')) fail('INVALID_WORKSHEET_RELATIONSHIP', `Worksheet ${sheet.name} has no valid internal relationship.`);
    const worksheetPath = resolveWorksheetPath(relation.target);
    const entry = entries.get(worksheetPath);
    if (!entry) fail('INVALID_XLSX', `Worksheet entry ${worksheetPath} is missing.`);
    sheetEntries.push({ name: sheet.name, state: sheet.state, path: worksheetPath, entry });
  }

  const sharedStrings = entries.has('xl/sharedStrings.xml')
    ? parseSharedStrings(await readZipEntry(zipFile, entries.get('xl/sharedStrings.xml')))
    : { values: [], oversizedIndexes: new Set() };

  const candidates = [];
  for (const sheet of sheetEntries) {
    const xml = await readZipEntry(zipFile, sheet.entry);
    candidates.push(candidateForSheet({ ...sheet, xml }, sharedStrings));
  }
  const completeCandidates = candidates.filter((candidate) => candidate.header.complete);
  if (completeCandidates.length > 1) fail('AMBIGUOUS_WORKSHEETS', 'More than one worksheet contains all required import headers.');
  let selected;
  if (completeCandidates.length === 1) {
    selected = completeCandidates[0];
  } else {
    const bestScore = Math.max(0, ...candidates.map((candidate) => candidate.header.score));
    const best = candidates.filter((candidate) => candidate.header.score === bestScore);
    if (bestScore > 0 && best.length > 1) fail('AMBIGUOUS_WORKSHEETS', 'Could not select a worksheet unambiguously from its headers.');
    selected = bestScore > 0 ? best[0] : candidates[0];
  }
  if (selected.state !== 'visible') fail('HIDDEN_WORKSHEET', 'Hidden worksheets cannot be imported.');

  const { worksheet, header } = selected;
  const dataRowCount = Math.max(0, worksheet.maxRow - header.rowNumber);
  if (dataRowCount > XLSX_IMPORT_LIMITS.maxDataRows) {
    fail('ROW_LIMIT', `Worksheet contains more than ${XLSX_IMPORT_LIMITS.maxDataRows} data rows.`, 413);
  }

  const headerIssues = [];
  for (const field of header.ambiguousFields) {
    headerIssues.push({ code: 'AMBIGUOUS_HEADER', field, severity: 'error', message: `More than one header column maps to ${field}.` });
  }
  for (const field of FIELD_NAMES) {
    if (!header.columns[field] && !header.ambiguousFields.includes(field)) {
      headerIssues.push({ code: 'MISSING_HEADER', field, severity: 'error', message: `A header for ${field} was not found.` });
    }
  }
  if (header.score === 0) {
    headerIssues.push({ code: 'HEADER_NOT_FOUND', field: 'header', severity: 'error', message: `No import header was found in the first ${XLSX_IMPORT_LIMITS.maxHeaderScanRows} rows.` });
  }

  const rows = [];
  for (let rowNumber = header.rowNumber + 1; rowNumber <= worksheet.maxRow; rowNumber += 1) {
    const sourceRow = worksheet.rows.get(rowNumber) || new Map();
    const formulaFields = [];
    const sourceIssues = [...headerIssues];
    const sourceValues = {};
    for (const field of FIELD_NAMES) {
      sourceValues[field] = getCellText(sourceRow, header.columns[field]);
      if (header.columns[field]) {
        sourceValues[field] = sourceValue(sourceValues[field] ?? '', sourceRow, header.columns[field], field, formulaFields, sourceIssues);
      } else {
        sourceValues[field] = '';
      }
      const column = header.columns[field];
      const cell = column ? sourceRow.get(column) : null;
      if (cell?.tooLong && !sourceIssues.some((issue) => issue.code === 'CELL_TOO_LONG' && issue.field === field)) {
        sourceIssues.push({ code: 'CELL_TOO_LONG', field, severity: 'error', message: `Cell exceeds ${XLSX_IMPORT_LIMITS.maxCellCharacters} characters; the preview contains a truncated value.` });
      }
    }

    const values = {
      questionText: sourceValues.questionText,
      options: OPTION_FIELDS.map(([id, field]) => ({ id, text: sourceValues[field] })),
      correctAnswers: /^[ABCD]$/i.test(sourceValues.correctAnswer.trim()) ? [sourceValues.correctAnswer.trim().toUpperCase()] : [],
      explanation: sourceValues.explanation,
    };
    const dataCellPresent = [...sourceRow.values()].some((cell) => cell.value || cell.formula);
    if (!dataCellPresent) {
      sourceIssues.push({ code: 'BLANK_ROW', field: 'row', severity: 'error', message: 'This physical worksheet row is blank.' });
    }
    if (sourceValues.correctAnswer.trim() && !/^[ABCD]$/i.test(sourceValues.correctAnswer.trim())) {
      sourceIssues.push({ code: 'INVALID_ANSWER', field: 'correctAnswer', severity: 'error', message: 'Correct answer must be A, B, C, or D.' });
    }

    const validation = validateImportValues(values, { formulaFields, sourceIssues });
    rows.push({
      sheetName: selected.name,
      rowNumber,
      sourceValues,
      values,
      formulaFields,
      sourceIssues,
      issues: validation.issues,
      status: validation.status,
      ...fingerprintImportValues(values),
    });
  }

  return {
    fileSha256: sha256(buffer),
    sourceFileName: path.basename(String(originalFileName)).slice(0, 240),
    sheetName: selected.name,
    headerRowNumber: header.rowNumber,
    totalRows: rows.length,
    rows,
  };
  } finally {
    zipFile.close();
  }
};
