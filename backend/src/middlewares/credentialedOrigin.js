const normalizeOrigin = (value) => {
  try { return new URL(value).origin; } catch { return String(value || '').replace(/\/+$/, ''); }
};

const trustedOrigins = () => new Set([
  process.env.FRONTEND_URL,
  ...(process.env.FRONTEND_ORIGINS || '').split(','),
  'https://frontend-ru4l.vercel.app',
  'https://msuyenclass.vn',
  'https://www.msuyenclass.vn',
].filter((value) => typeof value === 'string' && value.trim()).map(normalizeOrigin));

// Credentialed cookie endpoints reject browser requests from an untrusted
// Origin. Requests without Origin remain available to native/server clients
// and same-origin navigation, while CORS remains the response-side control.
export const requireTrustedCredentialedOrigin = (req, res, next) => {
  const origin = req.get('Origin');
  if (String(process.env.NODE_ENV || '').toLowerCase() !== 'production') return next();
  if (!origin || trustedOrigins().has(normalizeOrigin(origin))) return next();
  return res.status(403).json({
    status: 'error',
    code: 'CSRF_ORIGIN_REJECTED',
    message: 'Nguồn yêu cầu không được phép.',
  });
};
