import sanitizeHtml from 'sanitize-html';

export const LESSON_HTML_POLICY = Object.freeze({
  allowedTags: [
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'br', 'hr',
    'strong', 'b', 'em', 'i', 'u', 's', 'del', 'blockquote', 'pre', 'code',
    'ul', 'ol', 'li', 'table', 'caption', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
    'sub', 'sup', 'a', 'img',
  ],
  allowedAttributes: {
    a: ['href', 'title', 'rel'],
    img: ['src', 'alt', 'title', 'width', 'height'],
    th: ['colspan', 'rowspan'],
    td: ['colspan', 'rowspan'],
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  allowedSchemesByTag: {
    img: ['http', 'https'],
  },
  allowedSchemesAppliedToAttributes: ['href', 'src'],
  allowProtocolRelative: false,
  disallowedTagsMode: 'discard',
  enforceHtmlBoundary: true,
});

export const sanitizeLessonHtml = (value) =>
  sanitizeHtml(typeof value === 'string' ? value : '', LESSON_HTML_POLICY);

export const sanitizeLessonMediaUrl = (value) => {
  if (typeof value !== 'string') return '';
  const url = value.trim();
  if (!url || url.includes('\\') || /[\u0000-\u0020]/.test(url) || url.startsWith('//')) return '';

  if (url.startsWith('/uploads/')) {
    const parts = url.slice('/uploads/'.length).split(/[?#]/, 1)[0].split('/');
    if (parts.some((part) => !part || part === '.' || part === '..')) return '';
    return url;
  }

  if (!/^https:\/\/[^/]/i.test(url)) return '';
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.hostname && !parsed.username && !parsed.password
      ? parsed.toString()
      : '';
  } catch {
    return '';
  }
};

export const sanitizeLessonRecord = (lesson, { includeAttachments = true } = {}) => {
  if (!lesson) return lesson;
  const record = typeof lesson.toObject === 'function' ? lesson.toObject() : { ...lesson };
  record.content = sanitizeLessonHtml(record.content);
  record.videoUrl = sanitizeLessonMediaUrl(record.videoUrl);
  record.audioUrl = sanitizeLessonMediaUrl(record.audioUrl);
  if (!includeAttachments) delete record.attachments;
  return record;
};
