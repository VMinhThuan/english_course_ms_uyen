import path from 'node:path';

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

export const sanitizeDownloadFilename = (value) => {
  const leaf = String(value || '').replace(/\\/g, '/').split('/').pop() || '';
  return leaf
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, '')
    .replace(/[\u202a-\u202e\u2066-\u2069]/g, '')
    .trim()
    .slice(0, 240) || 'tai-lieu';
};

export const resolveMaterialDownloadMetadata = ({ originalName, title, filePath, fileType }) => {
  const mimeType = String(fileType || '').split(';', 1)[0].trim().toLowerCase();
  const verifiedExtension = MIME_EXTENSION[mimeType];
  const sourceName = originalName || title || path.basename(filePath || '') || 'tai-lieu';
  let filename = sanitizeDownloadFilename(sourceName);
  const currentExtension = path.extname(filename).toLowerCase();

  if (verifiedExtension && currentExtension !== verifiedExtension) {
    filename = KNOWN_EXTENSIONS.has(currentExtension)
      ? `${filename.slice(0, -currentExtension.length)}${verifiedExtension}`
      : `${filename}${verifiedExtension}`;
  }

  const contentType = MIME_EXTENSION[mimeType]
    ? mimeType
    : 'application/octet-stream';

  return { filename, contentType };
};

const asciiFallback = (filename) => {
  const ascii = filename
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7e]/g, '_')
    .replace(/[\\";]/g, '_')
    .replace(/[\r\n]/g, '')
    .trim();
  return ascii || 'tai-lieu';
};

const encodeRfc5987 = (value) => encodeURIComponent(value)
  .replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);

const buildContentDisposition = (disposition, filename) => {
  const safeFilename = sanitizeDownloadFilename(filename);
  const fallback = asciiFallback(safeFilename).replace(/"/g, '\\"');
  return `${disposition}; filename="${fallback}"; filename*=UTF-8''${encodeRfc5987(safeFilename)}`;
};

export const buildAttachmentContentDisposition = (filename) =>
  buildContentDisposition('attachment', filename);

export const buildInlineContentDisposition = (filename) =>
  buildContentDisposition('inline', filename);

export const streamMaterialFile = (filePath, response, headers, onError = () => {}) =>
  response.sendFile(filePath, { headers }, onError);
