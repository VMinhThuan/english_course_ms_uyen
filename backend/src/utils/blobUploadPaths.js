export const BLOB_UPLOAD_FOLDERS = Object.freeze({
  part1Audio: 'audio-part1',
  part2ChallengeAudio: 'audio-part2-challenge',
  vocabularyAudio: 'audio-voc',
  toeicTestImage: 'toeic-test-image',
  toeicTestAudio: 'toeic-test-audio',
  importFiles: 'import-files',
});

const MEDIA_FOLDERS = Object.freeze([
  BLOB_UPLOAD_FOLDERS.part1Audio,
  BLOB_UPLOAD_FOLDERS.part2ChallengeAudio,
  BLOB_UPLOAD_FOLDERS.vocabularyAudio,
  BLOB_UPLOAD_FOLDERS.toeicTestImage,
  BLOB_UPLOAD_FOLDERS.toeicTestAudio,
  BLOB_UPLOAD_FOLDERS.importFiles,
]);

const FOLDERS_BY_PURPOSE = Object.freeze({
  media: MEDIA_FOLDERS,
  material: Object.freeze([BLOB_UPLOAD_FOLDERS.importFiles]),
  'lesson-attachment': Object.freeze([BLOB_UPLOAD_FOLDERS.importFiles]),
  'toeic-pdf': Object.freeze([BLOB_UPLOAD_FOLDERS.importFiles]),
  'toeic-page-image': Object.freeze([BLOB_UPLOAD_FOLDERS.toeicTestImage]),
  'question-import-xlsx': Object.freeze([BLOB_UPLOAD_FOLDERS.importFiles]),
});

const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const getBlobUploadFolders = (purpose) => FOLDERS_BY_PURPOSE[purpose] || [];

export const resolveBlobUploadFolder = (purpose, requestedFolder) => {
  const allowedFolders = getBlobUploadFolders(purpose);
  if (!allowedFolders.length) return null;

  if (purpose !== 'media') return allowedFolders[0];
  const folder = String(requestedFolder || '').trim();
  if (!folder) return BLOB_UPLOAD_FOLDERS.importFiles;
  return allowedFolders.includes(folder) ? folder : null;
};

export const createOwnedBlobUploadPathname = ({ storageFolder, userId, fileId, extension }) =>
  `${storageFolder}/${userId}-${fileId}${extension}`;

/**
 * New uploads are stored directly in a single category folder. The legacy
 * check keeps tickets issued just before a deployment valid during rollout.
 */
export const isOwnedBlobUploadPathname = ({ pathname, purpose, userId, extension }) => {
  if (typeof pathname !== 'string' || !pathname || !userId || !extension) return false;

  const escapedExtension = escapeRegExp(extension);
  const escapedUserId = escapeRegExp(userId);
  const directLeaf = new RegExp(`^${escapedUserId}-[0-9a-f-]{36}${escapedExtension}$`, 'i');

  for (const folder of getBlobUploadFolders(purpose)) {
    const prefix = `${folder}/`;
    if (pathname.startsWith(prefix) && directLeaf.test(pathname.slice(prefix.length))) return true;
  }

  const legacyPrefix = `uploads/${purpose}/${userId}/`;
  return pathname.startsWith(legacyPrefix)
    && new RegExp(`^[0-9a-f-]{36}${escapedExtension}$`, 'i').test(pathname.slice(legacyPrefix.length));
};
