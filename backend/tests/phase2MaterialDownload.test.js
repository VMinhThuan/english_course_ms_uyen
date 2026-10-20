import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import {
  buildAttachmentContentDisposition,
  resolveMaterialDownloadMetadata,
  sanitizeDownloadFilename,
  streamMaterialFile,
} from '../src/utils/materialDownload.js';

const fileCases = [
  ['Lesson_01.pdf', 'application/pdf'],
  ['Bài tập TOEIC.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  ['Bang_diem.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  ['Slide.Part1.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  ['Audio_Listening.mp3', 'audio/mpeg'],
  ['Hình ảnh bài học.png', 'image/png'],
];

for (const [originalName, fileType] of fileCases) {
  test(`download metadata preserves ${originalName}`, () => {
    const metadata = resolveMaterialDownloadMetadata({ originalName, title: 'Tài liệu', filePath: '/private/id', fileType });
    assert.equal(metadata.filename, originalName);
    assert.equal(metadata.contentType, fileType);
  });
}

test('download metadata uses supported MIME extension for extensionless and mismatched legacy metadata', () => {
  assert.equal(resolveMaterialDownloadMetadata({ title: 'Bài giảng', filePath: '/private/file', fileType: 'application/pdf' }).filename, 'Bài giảng.pdf');
  assert.equal(resolveMaterialDownloadMetadata({ originalName: 'Slide.Part1.pdf', fileType: 'image/png' }).filename, 'Slide.Part1.png');
});

test('filename and UTF-8 Content-Disposition remove path/header controls', () => {
  const safe = sanitizeDownloadFilename('../Bài\r\n học/đề thi.pdf');
  assert.equal(safe, 'đề thi.pdf');
  const header = buildAttachmentContentDisposition(safe);
  assert.match(header, /filename\*=UTF-8''/);
  assert.doesNotMatch(header, /[\r\n]/);
  assert.match(header, /filename="/);
});

test('streamed download bytes match fixture bytes exactly', async (context) => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'toeic-phase2-download-'));
  context.after(async () => rm(tempDir, { recursive: true, force: true }));
  const fixture = Buffer.from([0, 1, 2, 255, 37, 80, 68, 70, 45, 10, 195, 169]);
  const filePath = path.join(tempDir, 'fixture.bin');
  await writeFile(filePath, fixture);

  const app = express();
  const contentDisposition = buildAttachmentContentDisposition('Bài tập TOEIC.pdf');
  app.get('/fixture', (_request, response) => {
    streamMaterialFile(filePath, response, {
      'Content-Type': 'application/pdf',
      'Content-Disposition': contentDisposition,
    }, (error) => {
      if (!response.headersSent) response.status(500).end();
      else response.destroy(error);
    });
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  context.after(() => new Promise((resolve) => server.close(resolve)));
  const address = server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}/fixture`);
  const returned = Buffer.from(await response.arrayBuffer());
  assert.equal(response.headers.get('content-type'), 'application/pdf');
  assert.equal(response.headers.get('content-disposition'), contentDisposition);
  assert.deepEqual(returned, await readFile(filePath));
});
