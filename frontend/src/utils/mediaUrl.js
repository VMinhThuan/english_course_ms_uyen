import { API_BASE_URL } from '../api/apiBaseUrl.js';

export const resolveMediaUrl = (value) => {
  if (typeof value !== 'string' || !value.trim()) return '';
  if (/^(?:https?:|data:|blob:)/i.test(value)) return value;

  const mediaPath = value.startsWith('/') ? value : `/${value}`;
  // Public static assets hosted directly by frontend (e.g. /audio/*) stay on frontend origin
  if (mediaPath.startsWith('/audio/') || mediaPath.startsWith('/favicon.ico')) {
    return mediaPath;
  }

  if (/^https?:\/\//i.test(API_BASE_URL)) {
    return new URL(mediaPath, API_BASE_URL).toString();
  }
  return mediaPath;
};

