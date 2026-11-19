import * as XLSX from 'xlsx';
import { EXERCISE_SHEETS } from './exerciseSpreadsheet.js';

const textValue = (value) => value === undefined || value === null ? '' : String(value);

export const buildWorkbook = (exerciseType, valuesRows = []) => {
  const spec = EXERCISE_SHEETS[exerciseType];
  const workbook = XLSX.utils.book_new();
  const guideRows = [
    ['HƯỚNG DẪN NHẬP DỮ LIỆU', spec.label],
    ['Cách điền', spec.guide],
    ['Cột bắt buộc', spec.columns.filter(({ key }) => !['test', 'sourceKey', 'title', ...(spec.optionalColumns || [])].includes(key)).map(({ label }) => label).join(', ')],
    ['Cách lưu', 'Sau khi chỉnh sửa, lưu file .xlsx rồi tải lên phần Import Excel để xem trước và xác nhận.'],
    ['Lưu ý khi import', 'Bỏ cả bài khỏi file không tự xóa bản ghi. Riêng Part 1 và từ vựng, các dòng cùng nhóm (Ngày hoặc Test + Mục) thay thế danh sách câu/từ của nhóm khi xác nhận.'],
  ];
  if (exerciseType === 'toeic-part5') {
    guideRows.push(
      ['Ví dụ câu hỏi', 'The manager ___ the report yesterday.'],
      ['Ví dụ lựa chọn', 'A. completes | B. completed | C. completing | D. completion'],
      ['Ví dụ đáp án đúng', 'B'],
      ['Ví dụ lời giải thích', 'Yesterday chỉ thời điểm quá khứ nên chọn động từ ở thì quá khứ đơn.'],
    );
  }
  const guideSheet = XLSX.utils.aoa_to_sheet(guideRows);
  guideSheet['!cols'] = [{ wch: 24 }, { wch: 110 }];
  const data = [
    spec.columns.map(({ label }) => label),
    ...valuesRows.map((row) => spec.columns.map(({ key }) => textValue(row.values?.[key]))),
  ];
  const dataSheet = XLSX.utils.aoa_to_sheet(data);
  dataSheet['!cols'] = spec.columns.map(({ width }) => ({ wch: Math.max(12, Math.round(width / 8)) }));
  XLSX.utils.book_append_sheet(workbook, guideSheet, 'Hướng dẫn');
  XLSX.utils.book_append_sheet(workbook, dataSheet, spec.sheetName);
  return workbook;
};

export const downloadWorkbook = (exerciseType, rows, suffix = 'du-lieu') => {
  const workbook = buildWorkbook(exerciseType, rows);
  XLSX.writeFileXLSX(workbook, `${exerciseType}-${suffix}.xlsx`, { compression: true });
};

export const workbookFileFromRows = (exerciseType, rows, suffix = 'edited') => {
  const workbook = buildWorkbook(exerciseType, rows);
  const bytes = XLSX.write(workbook, { bookType: 'xlsx', type: 'array', compression: true });
  return new File([bytes], `${exerciseType}-${suffix}.xlsx`, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
};
