const viteEnv = import.meta.env || {};

export const IS_PRODUCTION_BUILD = viteEnv.PROD === true;
export const PRODUCTION_API_URL = 'https://api.toeicmsuyen.vn/api/v1';
export const DEVELOPMENT_API_URL = 'http://localhost:3000/api/v1';

const rawApiUrl = (typeof viteEnv.VITE_API_URL === 'string' && viteEnv.VITE_API_URL.trim())
  ? viteEnv.VITE_API_URL.trim()
  : (IS_PRODUCTION_BUILD ? PRODUCTION_API_URL : DEVELOPMENT_API_URL);

export const API_BASE_URL = rawApiUrl.replace(/\/+$/, '');

