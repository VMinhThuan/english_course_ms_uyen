import test from 'node:test';
import assert from 'node:assert/strict';
import {
  countStatuses,
  filterImportRows,
  getSelectedValidRows,
  IMPORT_PAGE_SIZE,
  isRowImportable,
  MAX_XLSX_BYTES,
  validateXlsxFile,
} from '../src/pages/admin/toeicPart5ImportUtils.js';

const makeRow = (rowNumber, overrides = {}) => ({
  rowNumber,
  status: 'VALID',
  importState: 'PENDING',
  sheetName: 'TOEIC',
  values: { questionText: `Question ${rowNumber}`, options: [{ id: 'A', text: 'local' }, { id: 'B', text: 'locally' }], explanation: '' },
  issues: [],
  ...overrides,
});

test('XLSX validation accepts .xlsx through 8 MiB and rejects other extensions or oversized files', () => {
  assert.equal(validateXlsxFile({ name: 'part5.XLSX', size: MAX_XLSX_BYTES }), '');
  assert.match(validateXlsxFile({ name: 'part5.xls', size: 10 }), /\.xlsx/);
  assert.match(validateXlsxFile({ name: 'part5.xlsx', size: MAX_XLSX_BYTES + 1 }), /8 MiB/);
  assert.match(validateXlsxFile(null), /chọn/);
});

test('filters search source row, content, option and structured issue without mutating rows', () => {
  const rows = [
    makeRow(61, { status: 'INVALID', issues: [{ code: 'MISSING_ANSWER', message: 'Chưa chọn đáp án đúng.' }] }),
    makeRow(62, { status: 'DUPLICATE', duplicateOfRowNumber: 12 }),
    makeRow(63, { status: 'NEEDS_REVIEW' }),
  ];
  assert.deepEqual(filterImportRows(rows, { rowNumber: '61' }).map((row) => row.rowNumber), [61]);
  assert.deepEqual(filterImportRows(rows, { search: 'missing_answer' }).map((row) => row.rowNumber), [61]);
  assert.deepEqual(filterImportRows(rows, { search: 'LOCALLY' }).map((row) => row.rowNumber), [61, 62, 63]);
  assert.deepEqual(filterImportRows(rows, { status: 'DUPLICATE' }).map((row) => row.rowNumber), [62]);
  assert.equal(rows[0].status, 'INVALID');
});

test('selection sends only currently VALID, not-yet-imported rows in ascending order', () => {
  const rows = [
    makeRow(8),
    makeRow(3, { status: 'INVALID' }),
    makeRow(2, { status: 'DUPLICATE' }),
    makeRow(5, { importState: 'IMPORTED' }),
    makeRow(4),
  ];
  assert.equal(isRowImportable(rows[0]), true);
  assert.equal(isRowImportable(rows[1]), false);
  assert.deepEqual(getSelectedValidRows(rows, new Set([8, 3, 2, 5, 4])), [4, 8]);
});

test('75 synthetic rows can be summarized while imported count is separate from VALID count', () => {
  const rows = Array.from({ length: 75 }, (_, index) => makeRow(index + 2));
  rows[0].importState = 'IMPORTED';
  rows[1].status = 'INVALID';
  rows[2].status = 'NEEDS_REVIEW';
  rows[3].status = 'DUPLICATE';
  assert.equal(IMPORT_PAGE_SIZE, 10);
  assert.deepEqual(countStatuses(rows), { VALID: 72, INVALID: 1, NEEDS_REVIEW: 1, DUPLICATE: 1, IMPORTED: 1 });
});
