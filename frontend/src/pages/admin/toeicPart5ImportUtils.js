export const MAX_XLSX_BYTES = 8 * 1024 * 1024;
export const IMPORT_PAGE_SIZE = 10;
export const IMPORT_STATUSES = ['VALID', 'INVALID', 'NEEDS_REVIEW', 'DUPLICATE'];

export const validateXlsxFile = (file) => {
  if (!file) return 'Vui lòng chọn một file XLSX.';
  if (!file.name.toLowerCase().endsWith('.xlsx')) return 'Chỉ nhận file có phần mở rộng .xlsx.';
  if (file.size > MAX_XLSX_BYTES) return 'File vượt quá giới hạn 8 MiB.';
  return '';
};

export const rowSearchText = (row) => [
  row.rowNumber,
  row.sheetName,
  row.values?.questionText,
  ...(row.values?.options || []).map((option) => option.text),
  row.values?.explanation,
  ...(row.issues || []).flatMap((issue) => [issue.code, issue.message]),
].join(' ').toLocaleLowerCase('vi');

export const filterImportRows = (rows, { search = '', status = 'ALL', rowNumber = '' } = {}) => {
  const needle = search.trim().toLocaleLowerCase('vi');
  const numericRow = rowNumber.trim();
  return rows.filter((row) => {
    if (status === 'IMPORTED' && row.importState !== 'IMPORTED') return false;
    if (status !== 'ALL' && status !== 'IMPORTED' && row.status !== status) return false;
    if (numericRow && String(row.rowNumber) !== numericRow) return false;
    return !needle || rowSearchText(row).includes(needle);
  });
};

export const isRowImportable = (row) => row?.status === 'VALID' && row?.importState !== 'IMPORTED';

export const getSelectedValidRows = (rows, selectedRowNumbers) => {
  const selected = new Set(selectedRowNumbers);
  return rows.filter((row) => selected.has(row.rowNumber) && isRowImportable(row))
    .map((row) => row.rowNumber)
    .sort((a, b) => a - b);
};

export const countStatuses = (rows) => rows.reduce((counts, row) => {
  if (IMPORT_STATUSES.includes(row.status)) counts[row.status] += 1;
  if (row.importState === 'IMPORTED') counts.IMPORTED += 1;
  return counts;
}, { VALID: 0, INVALID: 0, NEEDS_REVIEW: 0, DUPLICATE: 0, IMPORTED: 0 });
