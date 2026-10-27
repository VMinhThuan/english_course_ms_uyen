import { normalizePrivateBlobReferences, resolvePrivateBlobResponse } from '../utils/blobStorage.js';

export const normalizePrivateBlobRequest = (req, _res, next) => {
  if (req.body && typeof req.body === 'object') {
    req.body = normalizePrivateBlobReferences(req.body);
  }
  return next();
};

export const signPrivateBlobResponse = (req, res, next) => {
  const sendJson = res.json.bind(res);
  res.json = (body) => {
    resolvePrivateBlobResponse(body, { userPresent: Boolean(req.user) })
      .then(({ body: resolvedBody, hasPrivateBlobs }) => {
        if (res.headersSent) return;
        if (hasPrivateBlobs) res.setHeader('Cache-Control', 'private, no-store');
        return sendJson(resolvedBody);
      })
      .catch(next);
    return res;
  };
  return next();
};
