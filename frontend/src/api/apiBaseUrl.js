const viteEnv = import.meta.env || {};

export const IS_PRODUCTION_BUILD = viteEnv.PROD === true;
export const PRODUCTION_API_URL = 'https://api.toeicmsuyen.vn/api/v1';
export const DEVELOPMENT_API_URL = 'http://localhost:3000/api/v1';

const DEPRECATED_URL_KEYWORDS = [
  ['english', 'course', 'ms', 'uyen.vercel.app'].join('-'),
  ['frontend', 'ru4l.vercel.app'].join('-'),
];

export const isAllowedApiUrl = (url) => {
  if (typeof url !== 'string' || !url.trim()) return false;
  const normalized = url.trim().toLowerCase();
  return !DEPRECATED_URL_KEYWORDS.some((deprecated) => normalized.includes(deprecated));
};

export const resolveApiBaseUrl = (env = {}) => {
  const isProd = env.PROD === true;
  const candidateUrl = env.VITE_API_URL;

  if (isAllowedApiUrl(candidateUrl)) {
    return candidateUrl.trim().replace(/\/+$/, '');
  }

  return (isProd ? PRODUCTION_API_URL : DEVELOPMENT_API_URL).replace(/\/+$/, '');
};

export const API_BASE_URL = resolveApiBaseUrl(viteEnv);


