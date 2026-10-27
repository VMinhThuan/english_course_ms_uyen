const viteEnv = import.meta.env || {};

// Keep browser API traffic on the frontend origin in production. Vercel's
// external rewrite proxies /api/v1 to the backend, so httpOnly auth cookies
// remain first-party instead of depending on third-party cookie support.
export const IS_PRODUCTION_BUILD = viteEnv.PROD === true;
export const API_BASE_URL = IS_PRODUCTION_BUILD
  ? '/api/v1'
  : viteEnv.VITE_API_URL || '/api/v1';
