import path from 'path';
import fs from 'fs';
import os from 'os';

/**
 * Returns a writable uploads directory:
 * - On serverless platforms (Vercel, AWS Lambda), uses OS tmp directory
 * - In local development, uses project root /uploads
 */
export const getUploadDir = () => {
  const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
  const uploadDir = isServerless 
    ? path.join(os.tmpdir(), 'uploads') 
    : path.join(process.cwd(), 'uploads');

  try {
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
  } catch (err) {
    console.warn('Notice: upload directory creation skipped:', err.message);
  }

  return uploadDir;
};

const ensureUploadSubdirectory = (name) => {
  const directory = path.join(getUploadDir(), name);
  try {
    if (!fs.existsSync(directory)) fs.mkdirSync(directory, { recursive: true });
  } catch (err) {
    console.warn('Notice: upload subdirectory creation skipped:', err.message);
  }
  return directory;
};

export const getPrivateUploadDir = () => ensureUploadSubdirectory('private');
export const getPublicUploadDir = () => ensureUploadSubdirectory('public');

export const UPLOAD_DIR = getUploadDir();
