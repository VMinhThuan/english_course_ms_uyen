import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BLOB_UPLOAD_FOLDERS,
  createOwnedBlobUploadPathname,
  isOwnedBlobUploadPathname,
  resolveBlobUploadFolder,
} from '../src/utils/blobUploadPaths.js';

const userId = '64b64c0f0f2c4b9d3b2a1e77';
const fileId = '7d4501bb-2209-4614-9872-7d4501bb2209';

test('media upload categories use the requested top-level Blob folders', () => {
  for (const storageFolder of Object.values(BLOB_UPLOAD_FOLDERS)) {
    assert.equal(resolveBlobUploadFolder('media', storageFolder), storageFolder);
    const pathname = createOwnedBlobUploadPathname({
      storageFolder,
      userId,
      fileId,
      extension: '.mp3',
    });
    assert.equal(pathname, `${storageFolder}/${userId}-${fileId}.mp3`);
    assert.equal(pathname.split('/').length, 2);
  }
});

test('non-media uploads are routed to their required flat folders', () => {
  assert.equal(resolveBlobUploadFolder('question-import-xlsx'), 'import-files');
  assert.equal(resolveBlobUploadFolder('toeic-pdf'), 'import-files');
  assert.equal(resolveBlobUploadFolder('lesson-attachment'), 'import-files');
  assert.equal(resolveBlobUploadFolder('toeic-page-image'), 'toeic-test-image');
  assert.equal(resolveBlobUploadFolder('material'), 'import-files');
});

test('media upload rejects unknown folders and defaults older clients to import-files', () => {
  assert.equal(resolveBlobUploadFolder('media'), 'import-files');
  assert.equal(resolveBlobUploadFolder('media', 'uploads/media'), null);
});

test('owned path validation accepts direct files and transition-era paths only', () => {
  const directPath = `audio-part1/${userId}-${fileId}.mp3`;
  assert.equal(isOwnedBlobUploadPathname({
    pathname: directPath,
    purpose: 'media',
    userId,
    extension: '.mp3',
  }), true);
  assert.equal(isOwnedBlobUploadPathname({
    pathname: `uploads/media/${userId}/${fileId}.mp3`,
    purpose: 'media',
    userId,
    extension: '.mp3',
  }), true);
  assert.equal(isOwnedBlobUploadPathname({
    pathname: `audio-part1/${userId}/nested-${fileId}.mp3`,
    purpose: 'media',
    userId,
    extension: '.mp3',
  }), false);
  assert.equal(isOwnedBlobUploadPathname({
    pathname: `audio-part1/${userId}-${fileId}.mp3`,
    purpose: 'media',
    userId: '64b64c0f0f2c4b9d3b2a1e78',
    extension: '.mp3',
  }), false);
});
