export const MAX_FILES_PER_BATCH = 5;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_BATCH_BYTES = 25 * 1024 * 1024;
export const PAGE_SIZE = 20;

export const STEP_LABELS = [
  { id: 'upload', label: 'Tải DOCX', hint: 'Chọn nguồn và tạo batch' },
  { id: 'preview', label: 'Xem trước', hint: 'Kiểm tra Chapter đã parse' },
  { id: 'review', label: 'Biên tập', hint: 'Sửa và quyết định review' },
  { id: 'confirm', label: 'Tạo bản nháp', hint: 'Confirm các từ đã duyệt' },
];

export const STATUS_LABELS = {
  PARSED: 'Đã phân tích',
  VALID: 'Hợp lệ',
  INVALID: 'Cần sửa dữ liệu',
  NEEDS_REVIEW: 'Chờ kiểm duyệt',
  EDITED: 'Đã sửa · chờ duyệt',
  REVIEW_APPROVED: 'Đã duyệt',
  REVIEW_REJECTED: 'Bị từ chối',
  IMPORTED_AS_DRAFT: 'Đã tạo bản nháp',
  VALIDATION_PASSED: 'Hợp lệ',
  VALIDATION_FAILED: 'Cần sửa dữ liệu',
  NOT_RUN: 'Chưa kiểm tra',
  NOT_IMPORTED: 'Chưa tạo bản nháp',
  PARSED_BATCH: 'Đã phân tích',
  REVIEW_COMPLETE: 'Review hoàn tất',
  PARTIALLY_CONFIRMED_DRAFT: 'Đã tạo một phần',
  CONFIRMED_DRAFT: 'Đã tạo bản nháp',
  FAILED: 'Thất bại',
  NOT_ELIGIBLE: 'Chưa thể xuất bản',
};

export const FIELD_LABELS = {
  word: 'Từ / cụm từ',
  partOfSpeech: 'Từ loại',
  senses: 'Nghĩa',
  notes: 'Ghi chú',
  examples: 'Ví dụ',
  meaning: 'Nghĩa tiếng Việt',
  english: 'Ví dụ tiếng Anh',
  vietnamese: 'Ví dụ tiếng Việt',
};

export const ISSUE_LABELS = {
  TEXT_REQUIRED: 'Trường này cần có nội dung.',
  TEXT_TOO_LONG: 'Nội dung vượt quá độ dài cho phép.',
  CONTROL_CHARACTER_NOT_ALLOWED: 'Nội dung có ký tự điều khiển không hợp lệ.',
  HTML_CONTENT_NOT_ALLOWED: 'Không thể lưu mã HTML trong trường này.',
  POS_ARRAY_INVALID: 'Kiểm tra lại danh sách từ loại.',
  SENSES_ARRAY_INVALID: 'Cần có ít nhất một nghĩa.',
  SENSE_INVALID: 'Một nghĩa có định dạng không hợp lệ.',
  EXAMPLES_ARRAY_INVALID: 'Danh sách ví dụ không hợp lệ.',
  EXAMPLE_INVALID: 'Một ví dụ có định dạng không hợp lệ.',
};

export const formatBytes = (bytes = 0) => {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
};

export const effectiveValues = (candidate = {}) => {
  const parsed = candidate.parsedValues || {};
  const edited = candidate.editedValues || {};
  const value = { ...parsed, ...edited };
  if (Array.isArray(edited.senses) && Array.isArray(parsed.senses)) {
    value.senses = edited.senses.map((sense, index) => ({
      ...(parsed.senses[index] || {}), ...sense,
      examples: Array.isArray(sense.examples) ? sense.examples : (parsed.senses[index]?.examples || []),
    }));
  }
  value.partOfSpeech = Array.isArray(value.partOfSpeech) ? value.partOfSpeech : [];
  value.senses = Array.isArray(value.senses) ? value.senses : [];
  value.notes = Array.isArray(value.notes) ? value.notes : [];
  return value;
};

export const editorValues = (candidate) => {
  const value = effectiveValues(candidate);
  return {
    word: value.word || '',
    partOfSpeech: [...value.partOfSpeech],
    senses: value.senses.map((sense) => ({
      partOfSpeech: Array.isArray(sense.partOfSpeech) ? [...sense.partOfSpeech] : [],
      meaning: sense.meaning || '',
      examples: (sense.examples || []).map((example) => ({
        english: example.english || '', vietnamese: example.vietnamese || '',
      })),
    })),
    notes: [...value.notes],
  };
};

export const candidateHasDuplicate = (candidate = {}) => {
  const duplicate = candidate.duplicateMetadata || {};
  return Boolean(duplicate.parser || duplicate.sourceRevision?.revisionDetected || duplicate.catalogMatches?.length);
};

export const candidateFileName = (candidate = {}) => {
  const relativePath = candidate.sourceMetadata?.relativePath || '';
  const storedLabel = candidate.sourceMetadata?.fileName;
  return storedLabel || relativePath.replace(/\\/g, '/').split('/').filter(Boolean).pop() || 'Tài liệu DOCX';
};

export const candidateOrdinal = (candidate = {}) => candidate.sourceMetadata?.sourceOrdinal ?? '—';

export const candidateLocator = (candidate = {}) => {
  const source = candidate.sourceMetadata || {};
  const start = source.paragraphStart;
  const end = source.paragraphEnd;
  const range = Number.isInteger(start) ? (Number.isInteger(end) && end !== start ? `${start}–${end}` : String(start)) : '';
  const table = Number.isInteger(source.tableIndex) ? ` · Bảng ${source.tableIndex + 1}` : '';
  return range ? `Đoạn ${range}${table}` : table.replace(/^ · /, '') || 'Không có vị trí đoạn';
};

export const issueLabel = (issue = {}) => {
  const field = String(issue.field || '').split('.');
  const root = FIELD_LABELS[field[0]] || FIELD_LABELS[field[1]] || 'Nội dung';
  const detail = ISSUE_LABELS[issue.code] || 'Hãy kiểm tra lại trường này.';
  return { field: root, message: detail };
};

export const safeSourceText = (rawValues = {}) => {
  if (typeof rawValues === 'string') return rawValues;
  if (typeof rawValues.rawText === 'string') return rawValues.rawText;
  const parts = [];
  const visit = (value, depth = 0) => {
    if (value === null || value === undefined || depth > 3) return;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      parts.push(String(value));
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => visit(item, depth + 1));
      return;
    }
    for (const [key, child] of Object.entries(value)) {
      const label = FIELD_LABELS[key];
      if (label && (typeof child === 'string' || Array.isArray(child))) parts.push(`${label}:`);
      visit(child, depth + 1);
    }
  };
  visit(rawValues);
  return parts.join('\n').trim() || 'Nguồn không có văn bản thô để hiển thị.';
};

export const timestampLabel = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'medium', timeStyle: 'short',
  }).format(date);
};
