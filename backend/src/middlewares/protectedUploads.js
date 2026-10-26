import fs from 'node:fs/promises';
import path from 'node:path';
import Material from '../models/Material.js';
import Lesson from '../models/Lesson.js';
import connectDB from '../configs/database.js';
import { authenticateRequest, clearRefreshTokenCookie } from './auth.js';
import {
  evaluateMaterialAccess,
  isPathWithinRoot,
  normalizeUploadRequestUrl,
  resolveStoredUploadPath,
} from '../security/materialAccessPolicy.js';
import { getUploadDir } from '../utils/uploadConfig.js';

const UPLOAD_ROOT = getUploadDir();
const EXECUTABLE_OR_ACTIVE_CONTENT_EXTENSIONS = new Set([
  '.html', '.htm', '.xhtml', '.js', '.mjs', '.cjs', '.css', '.svg', '.xml',
  '.php', '.phtml', '.exe', '.dll', '.com', '.bat', '.cmd', '.ps1', '.sh', '.py',
]);
const LEGACY_PUBLIC_ASSET_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.webp', '.mp3', '.m4a', '.wav',
]);

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const findReference = (Model, fieldPath, url) => {
  const encodedUrl = encodeURI(url);
  const pathPattern = new RegExp(`(?:^|https?:\\/\\/[^/]+)${escapeRegex(url)}(?:[?#].*)?$`, 'i');
  const encodedPattern = new RegExp(`(?:^|https?:\\/\\/[^/]+)${escapeRegex(encodedUrl)}(?:[?#].*)?$`, 'i');
  return Model.findOne({
    $or: [
      { [fieldPath]: url },
      { [fieldPath]: encodedUrl },
      { [fieldPath]: pathPattern },
      { [fieldPath]: encodedPattern },
    ],
  });
};

const getFileReference = async (url) => {
  const material = await findReference(Material, 'fileUrl', url)
    .populate({ path: 'lesson', populate: { path: 'course', select: 'teacher title status isPublished' } })
    .populate({ path: 'course', select: 'teacher isPublished' });
  if (material) {
    const lesson = material.lesson;
    const course = lesson?.course || material.course;
    return { material, lesson, course };
  }

  const lesson = await findReference(Lesson, 'attachments.url', url).populate('course');
  if (!lesson) return null;
  return {
    material: {
      status: 'published', allowDownload: true, fileUrl: url,
      course: lesson.course?._id || lesson.course,
    },
    lesson,
    course: lesson.course,
  };
};

const sendPolicyDenial = (res, decision) => res.status(decision.statusCode).json({
  status: 'error',
  ...(decision.code ? { code: decision.code } : {}),
  message: decision.message,
});

const sendProtectedFile = async (req, res, next, reference, url, {
  authenticate = authenticateRequest,
  uploadRoot = UPLOAD_ROOT,
} = {}) => {
  if (!reference?.lesson) {
    return res.status(404).json({ status: 'error', code: 'MATERIAL_NOT_FOUND', message: 'Material not found' });
  }

  const auth = await authenticate(req);
  if (auth.error) {
    if (auth.error.code === 'ACCOUNT_SUSPENDED') clearRefreshTokenCookie(res);
    return sendPolicyDenial(res, auth.error);
  }

  const decision = evaluateMaterialAccess({
    user: auth.user,
    material: reference.material,
    lesson: reference.lesson,
    course: reference.course,
  });
  if (!decision.allowed) return sendPolicyDenial(res, decision);

  const filePath = resolveStoredUploadPath(reference.material, uploadRoot)
    || resolveStoredUploadPath({ fileUrl: url }, uploadRoot);
  if (!filePath || !isPathWithinRoot(uploadRoot, filePath)) {
    return res.status(404).json({ status: 'error', code: 'MATERIAL_FILE_NOT_FOUND', message: 'Material file not found' });
  }

  try {
    const [rootRealPath, fileRealPath, fileStat] = await Promise.all([
      fs.realpath(uploadRoot),
      fs.realpath(filePath),
      fs.stat(filePath),
    ]);
    if (!isPathWithinRoot(rootRealPath, fileRealPath) || !fileStat.isFile()) {
      return res.status(404).json({ status: 'error', code: 'MATERIAL_FILE_NOT_FOUND', message: 'Material file not found' });
    }
  } catch (error) {
    if (error.code === 'ENOENT') {
      return res.status(404).json({ status: 'error', code: 'MATERIAL_FILE_NOT_FOUND', message: 'Material file not found' });
    }
    return next(error);
  }

  const storedName = reference.material.title || path.basename(filePath);
  const safeName = path.basename(String(storedName).replace(/\\/g, '/')).replace(/[\r\n"\u0000]/g, '_') || 'lesson-material';
  res.set({
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'Content-Type': 'application/octet-stream',
  });
  return res.download(filePath, safeName, {
    headers: {
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Type': 'application/octet-stream',
    },
  });
};

export const createProtectedUploadHandler = ({
  privateOnly = false,
  publicOnly = false,
  connect = connectDB,
  resolveReference = getFileReference,
  authenticate = authenticateRequest,
  uploadRoot = UPLOAD_ROOT,
} = {}) => async (req, res, next) => {
  const url = normalizeUploadRequestUrl(req.originalUrl);
  if (!url) {
    return res.status(404).json({ status: 'error', code: 'MATERIAL_FILE_NOT_FOUND', message: 'File not found' });
  }

  const relative = url.slice('/uploads/'.length);
  const pathSegments = relative.split('/');
  const isPrivatePath = pathSegments[0] === 'private';
  const isPublicPath = pathSegments[0] === 'public';
  if (privateOnly && !isPrivatePath) return res.status(404).end();
  if (privateOnly && pathSegments.length !== 2) return res.status(404).end();
  if (publicOnly && (!isPublicPath || pathSegments.length !== 2)) return res.status(404).end();
  if (!privateOnly && (isPrivatePath || isPublicPath)) {
    if (!publicOnly) return res.status(404).end();
  }

  const extension = path.extname(relative).toLowerCase();
  if (!privateOnly && EXECUTABLE_OR_ACTIVE_CONTENT_EXTENSIONS.has(extension)) {
    return res.status(404).end();
  }

  try {
    await connect();
    const reference = await resolveReference(url);
    if (reference) {
      return await sendProtectedFile(req, res, next, reference, url, {
        authenticate,
        uploadRoot,
      });
    }
    if (privateOnly) {
      return res.status(404).json({ status: 'error', code: 'MATERIAL_FILE_NOT_FOUND', message: 'File not found' });
    }
    if (!LEGACY_PUBLIC_ASSET_EXTENSIONS.has(extension)) return res.status(404).end();

    // express.static follows symlinks. Confirm that unreferenced public/legacy assets are
    // regular files whose resolved target remains inside the configured upload root.
    const staticPath = path.resolve(uploadRoot, ...relative.split('/'));
    if (!isPathWithinRoot(uploadRoot, staticPath)) return res.status(404).end();
    try {
      const [rootRealPath, fileRealPath, fileStat] = await Promise.all([
        fs.realpath(uploadRoot),
        fs.realpath(staticPath),
        fs.stat(staticPath),
      ]);
      if (!isPathWithinRoot(rootRealPath, fileRealPath) || !fileStat.isFile()) return res.status(404).end();
    } catch (error) {
      if (error.code === 'ENOENT') return next();
      return next(error);
    }
    return next();
  } catch (error) {
    console.error('[protected-upload] UPLOAD_ACCESS_UNAVAILABLE', {
      errorName: error?.name || 'Error',
      errorCode: typeof error?.code === 'string' ? error.code : undefined,
    });
    return res.status(503).json({
      status: 'error',
      code: 'UPLOAD_ACCESS_UNAVAILABLE',
      message: 'Không thể xác minh quyền truy cập tệp lúc này.',
    });
  }
};

export const protectPrivateUpload = createProtectedUploadHandler({ privateOnly: true });
export const protectLegacyUpload = createProtectedUploadHandler({ privateOnly: false });
export const protectPublicUpload = createProtectedUploadHandler({ publicOnly: true });
