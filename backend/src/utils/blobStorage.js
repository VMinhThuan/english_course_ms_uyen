import { Readable } from 'node:stream';
import {
  del,
  get,
  head,
  issueSignedToken,
  list,
  presignUrl,
  put,
} from '@vercel/blob';

const PRIVATE_READ_URL_TTL_MS = 6 * 60 * 60 * 1000;
const RESPONSE_URL_EXCLUDED_KEYS = new Set(['storageUrl', 'previewUrl', 'uploadUrl', 'pathname', 'blobPath']);

/**
 * Vercel injects BLOB_READ_WRITE_TOKEN for a connected Blob store. The SDK can
 * also authenticate with OIDC when BLOB_STORE_ID is present on Vercel.
 */
export const isBlobConfigured = () => Boolean(
  process.env.BLOB_READ_WRITE_TOKEN
  || (process.env.VERCEL && process.env.BLOB_STORE_ID),
);

export const getPrivateBlobPathname = (value) => {
  if (typeof value !== 'string' || !value.trim()) return null;
  const candidate = value.trim();
  let pathname = candidate;

  if (/^https:\/\//i.test(candidate)) {
    try {
      const url = new URL(candidate);
      if (url.protocol !== 'https:'
        || !/^[a-z0-9_-]+\.private\.blob\.vercel-storage\.com$/i.test(url.hostname)) return null;
      pathname = url.pathname;
    } catch {
      return null;
    }
  }

  try {
    const decoded = decodeURIComponent(pathname.replace(/^\/+/, '').split(/[?#]/, 1)[0]);
    const segments = decoded.split('/');
    if (!decoded || decoded.includes('\\') || decoded.includes('\0')
      || segments.some((segment) => !segment || segment === '.' || segment === '..')) return null;
    return decoded;
  } catch {
    return null;
  }
};

export const isPrivateBlobUrl = (value) =>
  typeof value === 'string'
  && /^https:\/\//i.test(value.trim())
  && Boolean(getPrivateBlobPathname(value));

export const normalizePrivateBlobUrl = (value) => {
  if (typeof value !== 'string' || !/^https:\/\//i.test(value.trim())) return null;
  try {
    const url = new URL(value.trim());
    const pathname = isPrivateBlobUrl(value) ? getPrivateBlobPathname(value) : null;
    if (!pathname) return null;
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
};

export const normalizePrivateBlobReferences = (value) => {
  if (typeof value === 'string') return normalizePrivateBlobUrl(value) || value;
  if (Array.isArray(value)) return value.map(normalizePrivateBlobReferences);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalizePrivateBlobReferences(item)]));
};

export const uploadToBlob = async (pathname, body, options = {}) => {
  if (!isBlobConfigured()) {
    throw new Error('Vercel Blob is not configured for this environment.');
  }
  const cleanPath = getPrivateBlobPathname(pathname);
  if (!cleanPath) throw new Error('A valid Blob pathname is required.');

  return put(cleanPath, body, {
    addRandomSuffix: options.addRandomSuffix ?? false,
    ...options,
    access: 'private',
  });
};

export const createPrivateBlobUploadUrl = async (
  pathname,
  { allowedContentTypes, maximumSizeInBytes, validUntil = Date.now() + 15 * 60 * 1000 } = {},
) => {
  const cleanPath = getPrivateBlobPathname(pathname);
  if (!cleanPath) throw new Error('A valid Blob pathname is required.');
  if (!isBlobConfigured()) throw new Error('Vercel Blob is not configured for this environment.');

  const constraints = {
    pathname: cleanPath,
    operations: ['put'],
    validUntil,
    ...(allowedContentTypes?.length ? { allowedContentTypes } : {}),
    ...(Number.isFinite(maximumSizeInBytes) ? { maximumSizeInBytes } : {}),
  };
  const token = await issueSignedToken(constraints);
  const { presignedUrl } = await presignUrl(token, {
    pathname: cleanPath,
    operation: 'put',
    access: 'private',
    validUntil,
    ...(allowedContentTypes?.length ? { allowedContentTypes } : {}),
    ...(Number.isFinite(maximumSizeInBytes) ? { maximumSizeInBytes } : {}),
  });
  return presignedUrl;
};

export const createPrivateBlobReadUrl = async (
  value,
  { validUntil = Date.now() + PRIVATE_READ_URL_TTL_MS } = {},
) => {
  const pathname = getPrivateBlobPathname(value);
  if (!pathname) throw new Error('A valid private Blob reference is required.');
  if (!isBlobConfigured()) throw new Error('Vercel Blob is not configured for this environment.');

  const token = await issueSignedToken({ pathname, operations: ['get'], validUntil });
  const { presignedUrl } = await presignUrl(token, {
    pathname,
    operation: 'get',
    access: 'private',
    validUntil,
  });
  return presignedUrl;
};

export const getPrivateBlob = async (value) => {
  const pathname = getPrivateBlobPathname(value);
  if (!pathname || !isBlobConfigured()) return null;
  const result = await get(pathname, { access: 'private' });
  return result?.statusCode === 200 ? result : null;
};

export const getPrivateBlobMetadata = async (value) => {
  const pathname = getPrivateBlobPathname(value);
  if (!pathname || !isBlobConfigured()) return null;
  return head(pathname, { access: 'private' });
};

export const readPrivateBlobSample = async (value, maxBytes = 8192) => {
  const result = await getPrivateBlob(value);
  if (!result) return null;

  const reader = result.stream.getReader();
  const chunks = [];
  let length = 0;
  try {
    while (length < maxBytes) {
      const { done, value: chunk } = await reader.read();
      if (done) break;
      const buffer = Buffer.from(chunk);
      const remaining = maxBytes - length;
      chunks.push(buffer.subarray(0, remaining));
      length += Math.min(buffer.length, remaining);
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  return { blob: result.blob, sample: Buffer.concat(chunks, length) };
};

export const readPrivateBlobBuffer = async (value, maxBytes = Infinity) => {
  const result = await getPrivateBlob(value);
  if (!result) return null;

  const chunks = [];
  let length = 0;
  for await (const chunk of Readable.fromWeb(result.stream)) {
    const buffer = Buffer.from(chunk);
    length += buffer.length;
    if (length > maxBytes) throw new Error('Private Blob exceeds the allowed size.');
    chunks.push(buffer);
  }
  return { blob: result.blob, buffer: Buffer.concat(chunks, length) };
};

export const deleteFromBlob = async (value) => {
  const pathname = getPrivateBlobPathname(value);
  if (!pathname || !isBlobConfigured()) return;
  await del(pathname, { access: 'private' });
};

export const listBlobs = async (options = {}) => {
  if (!isBlobConfigured()) return { blobs: [] };
  return list({ ...options, access: 'private' });
};

const collectPrivateBlobPathnames = (value, key = '') => {
  if (typeof value === 'string') {
    if (RESPONSE_URL_EXCLUDED_KEYS.has(key)) return [];
    const pathname = isPrivateBlobUrl(value) ? getPrivateBlobPathname(value) : null;
    return pathname ? [pathname] : [];
  }
  if (Array.isArray(value)) return value.flatMap((item) => collectPrivateBlobPathnames(item, key));
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([childKey, child]) => collectPrivateBlobPathnames(child, childKey));
};

const transformPrivateBlobUrls = async (value, token, validUntil, userPresent, key = '', signedUrls = new Map()) => {
  if (typeof value === 'string') {
    const pathname = isPrivateBlobUrl(value) ? getPrivateBlobPathname(value) : null;
    if (!pathname || RESPONSE_URL_EXCLUDED_KEYS.has(key)) return value;
    if (!userPresent) return '';
    if (signedUrls.has(pathname)) return signedUrls.get(pathname);
    const signedUrlPromise = presignUrl(token, {
      pathname,
      operation: 'get',
      access: 'private',
      validUntil,
    }).then(({ presignedUrl }) => presignedUrl);
    signedUrls.set(pathname, signedUrlPromise);
    return signedUrlPromise;
  }
  if (Array.isArray(value)) {
    return Promise.all(value.map((item) => transformPrivateBlobUrls(item, token, validUntil, userPresent, key, signedUrls)));
  }
  if (!value || typeof value !== 'object') return value;
  const entries = await Promise.all(Object.entries(value).map(async ([childKey, child]) => [
    childKey,
    await transformPrivateBlobUrls(child, token, validUntil, userPresent, childKey, signedUrls),
  ]));
  return Object.fromEntries(entries);
};

/**
 * Converts durable private Blob references in API JSON responses into short-lived
 * GET URLs. The durable storageUrl/path fields used by upload handshakes are left
 * intact, and guests never receive private object paths.
 */
export const resolvePrivateBlobResponse = async (body, { userPresent = false } = {}) => {
  const serialized = JSON.stringify(body);
  const responseBody = serialized === undefined ? body : JSON.parse(serialized);
  const pathnames = collectPrivateBlobPathnames(responseBody);
  if (!pathnames.length) return { body: responseBody, hasPrivateBlobs: false };
  if (!userPresent) {
    return {
      body: await transformPrivateBlobUrls(responseBody, null, 0, false),
      hasPrivateBlobs: true,
    };
  }
  if (!isBlobConfigured()) return { body: responseBody, hasPrivateBlobs: true };

  const validUntil = Date.now() + PRIVATE_READ_URL_TTL_MS;
  const token = await issueSignedToken({ operations: ['get'], validUntil });
  return {
    body: await transformPrivateBlobUrls(responseBody, token, validUntil, true),
    hasPrivateBlobs: true,
  };
};
