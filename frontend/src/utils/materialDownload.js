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
  if (!blob || typeof blob.text !== 'function') return '';
  try {
    const text = await blob.text();
    if (!text) return '';
    try {
      const body = JSON.parse(text);
      return body.message || body.error || '';
    } catch {
      return blob.type?.startsWith('text/') ? text : '';
    }
  } catch {
    return '';
  }
};

export const isDownloadErrorBlob = (blob) =>
  !blob || blob.size === 0 || /(?:application\/json|text\/html)/i.test(blob.type || '');
