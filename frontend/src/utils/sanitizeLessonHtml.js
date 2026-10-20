import DOMPurify from 'dompurify';

const ALLOWED_TAGS = [
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'br', 'hr',
  'strong', 'b', 'em', 'i', 'u', 's', 'del', 'blockquote', 'pre', 'code',
  'ul', 'ol', 'li', 'table', 'caption', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
  'sub', 'sup', 'a', 'img',
];

const ALLOWED_ATTR = ['href', 'title', 'rel', 'src', 'alt', 'width', 'height', 'colspan', 'rowspan'];
const SAFE_URI = /^(?:(?:https?:\/\/|mailto:)|\/(?!\/)|#|\.{1,2}\/|[^:]*$)/i;

export const sanitizeLessonHtml = (value) => DOMPurify.sanitize(
  typeof value === 'string' ? value : '',
  {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
    ALLOWED_URI_REGEXP: SAFE_URI,
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'svg', 'math'],
    FORBID_ATTR: ['style', 'target', 'srcset'],
  }
);

export const getSafeLessonMediaUrl = (value) => {
  if (typeof value !== 'string') return '';
  const url = value.trim();
  if (!url || url.includes('\\') || /[\u0000-\u0020]/.test(url) || url.startsWith('//')) return '';
  if (url.startsWith('/uploads/')) {
    const parts = url.slice('/uploads/'.length).split(/[?#]/, 1)[0].split('/');
    return parts.some((part) => !part || part === '.' || part === '..') ? '' : url;
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

