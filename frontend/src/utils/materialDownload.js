const MIME_EXTENSION = Object.freeze({
  'application/pdf': '.pdf',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.ms-excel': '.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'application/vnd.ms-powerpoint': '.ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
  'text/plain': '.txt',
  'text/csv': '.csv',
  'application/zip': '.zip',
  'audio/mpeg': '.mp3',
  'audio/mp4': '.m4a',
  'audio/wav': '.wav',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
});
const KNOWN_EXTENSIONS = new Set(Object.values(MIME_EXTENSION));
const formatErrorDetails = (details) => (Array.isArray(details) ? details : [])
  .map((detail) => {
    if (typeof detail === 'string') return detail.trim();
    if (!detail || typeof detail !== 'object') return '';
    const message = String(detail.message || detail.msg || '').trim();
    const field = String(detail.field || detail.path || '').trim();
    return field && message ? `${field}: ${message}` : (message || '');
  })
  .filter(Boolean)
  .join(' · ');

export const sanitizeMaterialFilename = (value) => {
  const leaf = String(value || '').replace(/\\/g, '/').split('/').pop() || '';
  return leaf.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, '').trim() || 'tai-lieu';
};

export const parseContentDispositionFilename = (header) => {
  if (typeof header !== 'string') return '';
  const encoded = header.match(/filename\*\s*=\s*UTF-8''([^;]+)/i)?.[1]?.trim();
  if (encoded) {
    try {
      return sanitizeMaterialFilename(decodeURIComponent(encoded.replace(/^"|"$/g, '')));
    } catch {
      // Use the quoted legacy filename if the UTF-8 parameter is malformed.
    }
  }
  const quoted = header.match(/filename\s*=\s*"((?:\\.|[^"\\])*)"/i)?.[1];
  if (quoted) return sanitizeMaterialFilename(quoted.replace(/\\([\\"])/g, '$1'));
  const plain = header.match(/filename\s*=\s*([^;]+)/i)?.[1]?.trim();
  return plain ? sanitizeMaterialFilename(plain) : '';
};

export const resolveMaterialFilename = ({ contentDisposition, fallbackName, mimeType }) => {
  let filename = parseContentDispositionFilename(contentDisposition)
    || sanitizeMaterialFilename(fallbackName);
  const extension = MIME_EXTENSION[String(mimeType || '').split(';', 1)[0].toLowerCase()];
  const existingExtension = filename.match(/\.[^.]+$/)?.[0]?.toLowerCase() || '';
  if (extension && existingExtension !== extension) {
    filename = KNOWN_EXTENSIONS.has(existingExtension)
      ? `${filename.slice(0, -existingExtension.length)}${extension}`
      : `${filename}${extension}`;
  }
  return filename;
};

export const readDownloadErrorMessage = async (blob) => {
  if (blob && typeof blob === 'object' && typeof blob.text !== 'function') {
    const details = formatErrorDetails(blob.data || blob.details);
    return blob.message || blob.error || details || '';
  }
  if (!blob || typeof blob.text !== 'function') return '';
  try {
    const text = await blob.text();
    if (!text) return '';
    try {
      const body = JSON.parse(text);
      return body.message || body.error || '';
    } catch {
      const contentType = String(blob.type || '').split(';', 1)[0].trim().toLowerCase();
      return contentType === 'text/plain' ? text.slice(0, 1200).trim() : '';
    }
  } catch {
    return '';
  }
};

export const isDownloadErrorBlob = (blob) =>
  !blob || blob.size === 0 || /(?:application\/json|text\/html)/i.test(blob.type || '');

export const hasAttachedMaterialFile = (material) => {
  if (typeof material?.hasFile === 'boolean') return material.hasFile;
  const fileUrl = typeof material?.fileUrl === 'string' ? material.fileUrl.trim() : '';
  if (material?.storageProvider === 's3') {
    return material.uploadStatus === 'ready' && Boolean(fileUrl || material.storageKey);
  }
  return Boolean(fileUrl);
};

const errorMessageForStatus = (status, action) => {
  if (status === 401) return 'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại rồi thử tiếp.';
  if (status === 403) return 'Tài khoản hiện tại không có quyền thực hiện thao tác này.';
  if (status === 404 && action === 'download') return 'Không tìm thấy tệp đính kèm. Hãy báo giáo viên kiểm tra tài liệu.';
  if (status === 413) return 'Máy chủ từ chối yêu cầu vì tệp vượt giới hạn dung lượng. Nếu đang chạy trên Vercel, giới hạn là 4,5 MB cho cả yêu cầu multipart; hãy chọn tệp nhỏ hơn.';
  if (status === 415) return 'Định dạng tệp này chưa được hỗ trợ.';
  if (status >= 500) return 'Máy chủ không thể hoàn tất thao tác. Hãy thử lại sau.';
  if (status) return `Yêu cầu thất bại (HTTP ${status}). Hãy kiểm tra thông tin tài liệu rồi thử lại.`;
  return '';
};

const errorMessageForCode = (code) => ({
  FILE_TOO_LARGE: 'Tệp vượt quá dung lượng cho phép. Hãy chọn tệp nhỏ hơn.',
  FILE_TYPE_NOT_ALLOWED: 'Định dạng tệp này chưa được hỗ trợ.',
  FILE_CONTENT_INVALID: 'Nội dung tệp không khớp với định dạng đã chọn. Hãy kiểm tra lại tệp.',
  FILE_REQUIRED: 'Hãy chọn tệp cần tải lên rồi thử lại.',
  UPLOAD_FAILED: 'Máy chủ không thể lưu hoặc kiểm tra tệp tải lên. Hãy thử lại sau.',
  MATERIAL_FILE_NOT_FOUND: 'Không tìm thấy tệp đính kèm trên máy chủ. Hãy tải tệp mới lên hoặc báo giáo viên kiểm tra.',
  MATERIAL_NOT_FOUND: 'Tài liệu không còn tồn tại hoặc bạn không có quyền truy cập.',
  OBJECT_STORAGE_UNAVAILABLE: 'Kho lưu trữ tệp hiện không khả dụng. Hãy thử lại sau hoặc báo quản trị viên.',
}[String(code || '').toUpperCase()] || '');

export const getMaterialOperationError = async (error, { action = 'save', fallbackMessage = '' } = {}) => {
  const status = Number(error?.response?.status) || 0;
  const body = error?.response?.data;
  const details = await readDownloadErrorMessage(body);
  const bodyCode = body?.code || '';
  const bodyMessage = body?.message || body?.error || '';
  const validationDetails = formatErrorDetails(body?.data || body?.details);
  let message = errorMessageForCode(bodyCode);
  if (!message && status === 413) message = errorMessageForStatus(status, action);
  if (!message) message = bodyMessage === 'Validation error' ? validationDetails : (bodyMessage || details || validationDetails);

  if (!message && !error?.response && error?.message && error.message !== 'Network Error') {
    message = error.message;
  }
  if (!message && !error?.response) {
    message = error?.code === 'ECONNABORTED'
      ? 'Máy chủ phản hồi quá thời gian. Hãy thử lại khi kết nối ổn định.'
      : 'Không nhận được phản hồi từ máy chủ. Hãy kiểm tra kết nối hoặc trạng thái API rồi thử lại.';
  }
  if (!message) message = errorMessageForStatus(status, action) || fallbackMessage || 'Không thể hoàn tất thao tác. Hãy thử lại.';

  return {
    message,
    code: bodyCode || (bodyMessage === 'Validation error' ? 'VALIDATION_ERROR' : '')
      || (status ? `HTTP_${status}` : error?.code || ''),
  };
};
