import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveMediaUrl } from '../src/utils/mediaUrl.js';
import {
  API_BASE_URL,
  PRODUCTION_API_URL,
  DEVELOPMENT_API_URL,
} from '../src/api/apiBaseUrl.js';

test('apiBaseUrl exports valid defaults and resolves without trailing slashes', () => {
  assert.equal(PRODUCTION_API_URL, 'https://api.toeicmsuyen.vn/api/v1');
  assert.equal(DEVELOPMENT_API_URL, 'http://localhost:3000/api/v1');
  assert.ok(typeof API_BASE_URL === 'string' && API_BASE_URL.length > 0);
  assert.equal(API_BASE_URL.endsWith('/'), false, 'Base URL must not end with trailing slash');
});

test('resolveMediaUrl correctly handles empty, external, local audio, and backend upload paths', () => {
  // Empty values
  assert.equal(resolveMediaUrl(''), '');
  assert.equal(resolveMediaUrl(null), '');
  assert.equal(resolveMediaUrl(undefined), '');
  assert.equal(resolveMediaUrl('   '), '');

  // External URLs
  assert.equal(resolveMediaUrl('https://cdn.example.com/audio.mp3'), 'https://cdn.example.com/audio.mp3');
  assert.equal(resolveMediaUrl('http://example.com/test.jpg'), 'http://example.com/test.jpg');
  assert.equal(resolveMediaUrl('data:image/png;base64,abc'), 'data:image/png;base64,abc');
  assert.equal(resolveMediaUrl('blob:http://localhost/uuid'), 'blob:http://localhost/uuid');

  // Frontend public static assets (must stay relative to frontend domain)
  assert.equal(resolveMediaUrl('/audio/part-2-challenge/Cau_001.mp3'), '/audio/part-2-challenge/Cau_001.mp3');
  assert.equal(resolveMediaUrl('audio/part-2-challenge/Cau_001.mp3'), '/audio/part-2-challenge/Cau_001.mp3');
  assert.equal(resolveMediaUrl('/favicon.ico'), '/favicon.ico');

  // Backend uploaded assets (must resolve to API origin when API_BASE_URL is set)
  const resolvedUpload = resolveMediaUrl('/uploads/test.png');
  assert.ok(resolvedUpload.endsWith('/uploads/test.png'));
  if (/^https?:\/\//i.test(API_BASE_URL)) {
    const origin = new URL(API_BASE_URL).origin;
    assert.equal(resolvedUpload, `${origin}/uploads/test.png`);
  }
});
