import path from 'path';
import { getStudentStatusError } from './accountAccessPolicy.js';

const denial = (statusCode, code, message) => ({ allowed: false, statusCode, code, message });

export const evaluateMaterialAccess = ({ user, material, lesson, course, enrolled = false }) => {
  if (!user) return denial(401, 'UNAUTHORIZED', 'Unauthorized');
  if (!material || !lesson) return denial(404, 'MATERIAL_NOT_FOUND', 'Material not found');

  if (user.role === 'admin') return { allowed: true };

  if (user.role === 'teacher') {
    const ownerId = course?.teacher?._id || course?.teacher;
    if (ownerId && String(ownerId) === String(user._id)) return { allowed: true };
    return denial(403, 'FORBIDDEN', 'Access denied. Insufficient permissions.');
  }

  if (user.role !== 'student') {
    return denial(403, 'FORBIDDEN', 'Access denied. Insufficient permissions.');
  }

  const stateError = getStudentStatusError(user);
  if (stateError) return denial(stateError.statusCode, stateError.code, stateError.message);
  if (material.status !== 'published' || lesson.status !== 'published') {
    return denial(404, 'MATERIAL_NOT_FOUND', 'Material not found');
  }
  if (!enrolled) {
    return denial(403, 'COURSE_ENROLLMENT_REQUIRED', 'Bạn cần đăng ký khóa học để truy cập tài liệu này.');
  }
  if (!material.allowDownload) {
    return denial(403, 'MATERIAL_DOWNLOAD_NOT_ALLOWED', 'Tài liệu này chưa được phép tải xuống.');
  }
  return { allowed: true };
};

export const normalizeUploadRequestUrl = (rawUrl, prefix = '/uploads') => {
  try {
    const rawPath = new URL(rawUrl, 'http://localhost').pathname;
    const decodedPath = decodeURIComponent(rawPath);
    if (decodedPath.includes('\\') || decodedPath.includes('\0')) return null;
    if (!decodedPath.startsWith(`${prefix}/`)) return null;

    const segments = decodedPath.slice(prefix.length + 1).split('/');
    if (segments.some((segment) => !segment || segment === '.' || segment === '..')) return null;
    const normalized = path.posix.normalize(decodedPath);
    return normalized === decodedPath ? decodedPath : null;
  } catch {
    return null;
  }
};

export const isPathWithinRoot = (root, candidate) => {
  const resolvedRoot = path.resolve(root);
  const resolvedCandidate = path.resolve(candidate);
  const relative = path.relative(resolvedRoot, resolvedCandidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
};

export const resolveStoredUploadPath = ({ filePath, fileUrl }, uploadRoot) => {
  if (filePath) {
    const resolved = path.resolve(filePath);
    if (isPathWithinRoot(uploadRoot, resolved)) return resolved;
  }

  if (typeof fileUrl !== 'string' || !fileUrl.startsWith('/uploads/')) return null;
  const relativeUrl = fileUrl.split(/[?#]/, 1)[0].slice('/uploads/'.length);
  let decoded;
  try {
    decoded = decodeURIComponent(relativeUrl);
  } catch {
    return null;
  }
  if (decoded.includes('\\') || decoded.includes('\0')) return null;
  const segments = decoded.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) return null;
  const resolved = path.resolve(uploadRoot, ...segments);
  return isPathWithinRoot(uploadRoot, resolved) ? resolved : null;
};

export const isSafeExternalMaterialUrl = (value) => {
  if (typeof value !== 'string'
    || !/^https:\/\/[^/]/i.test(value)
    || value.includes('\\')
    || /[\u0000-\u0020]/.test(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && Boolean(url.hostname) && !url.username && !url.password;
  } catch {
    return false;
  }
};
