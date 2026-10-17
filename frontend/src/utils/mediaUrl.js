const API_URL = import.meta.env.VITE_API_URL || '/api/v1';

export const resolveMediaUrl = (value) => {
  if (typeof value !== 'string' || !value.trim()) return '';
  if (/^(?:https?:|data:|blob:)/i.test(value)) return value;

  const mediaPath = value.startsWith('/') ? value : `/${value}`;
  if (/^https?:\/\//i.test(API_URL)) return new URL(mediaPath, API_URL).toString();
  return mediaPath;
};
