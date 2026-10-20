import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isDownloadErrorBlob,
  parseContentDispositionFilename,
  readDownloadErrorMessage,
  resolveMaterialFilename,
} from '../../frontend/src/utils/materialDownload.js';

test('frontend prefers UTF-8 Content-Disposition filename without dropping Unicode or suffix', () => {
  const filename = parseContentDispositionFilename("attachment; filename=download.docx; filename*=UTF-8''B%C3%A0i%20t%E1%BA%ADp%20TOEIC.docx");
  assert.equal(filename, 'Bài tập TOEIC.docx');
});

test('frontend fallback adds supported MIME extension and preserves multiple dots', () => {
  assert.equal(resolveMaterialFilename({ fallbackName: 'Slide.Part1', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' }), 'Slide.Part1.pptx');
  assert.equal(resolveMaterialFilename({ fallbackName: 'Lesson_01.pdf', mimeType: 'application/pdf' }), 'Lesson_01.pdf');
});

test('JSON error blobs are not treated as downloadable files', async () => {
  const errorBlob = new Blob([JSON.stringify({ message: 'Access denied' })], { type: 'application/json' });
  assert.equal(isDownloadErrorBlob(errorBlob), true);
  assert.equal(await readDownloadErrorMessage(errorBlob), 'Access denied');
  assert.equal(isDownloadErrorBlob(new Blob(['plain text file'], { type: 'text/plain' })), false);
});
