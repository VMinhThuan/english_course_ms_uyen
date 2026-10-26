import { put, del, list } from '@vercel/blob';

/**
 * Check if Vercel Blob storage is configured via environment variable.
 */
export const isBlobConfigured = () => {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
};

/**
 * Upload a file to Vercel Blob.
 * @param {string} pathname - Storage path (e.g., 'toeic-question-ocean/part1/meeting-ai-v2.jpg')
 * @param {Buffer|ReadableStream|string} body - File content
 * @param {object} [options] - Options passed to put()
 * @returns {Promise<{ url: string, pathname: string, downloadUrl: string }>}
 */
export const uploadToBlob = async (pathname, body, options = {}) => {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    throw new Error('BLOB_READ_WRITE_TOKEN is not configured in environment variables.');
  }

  const cleanPath = pathname.replace(/^\/+/, '');
  const result = await put(cleanPath, body, {
    access: 'public',
    addRandomSuffix: options.addRandomSuffix ?? false,
    token,
    ...options,
  });

  return result;
};

/**
 * Delete a file from Vercel Blob by url.
 * @param {string|string[]} url - URL or array of URLs to delete
 */
export const deleteFromBlob = async (url) => {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return;
  await del(url, { token });
};

/**
 * List files in Vercel Blob.
 * @param {object} [options]
 */
export const listBlobs = async (options = {}) => {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return { blobs: [] };
  return await list({ token, ...options });
};
