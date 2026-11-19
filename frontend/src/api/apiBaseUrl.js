const viteEnv = import.meta.env || {};

export const IS_PRODUCTION_BUILD = viteEnv.PROD === true;
export const PRODUCTION_API_URL = 'https://api.msuyenclass.vn/api/v1';
export const DEVELOPMENT_API_URL = 'http://localhost:3000/api/v1';

export const isAllowedApiUrl = (url) => {
  if (typeof url !== 'string' || !url.trim()) return false;

  try {
    const parsedUrl = new URL(url.trim());
    return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:';
  } catch {
    return false;
  }
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


