import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveMediaUrl } from '../src/utils/mediaUrl.js';
import {
  API_BASE_URL,
  PRODUCTION_API_URL,
  DEVELOPMENT_API_URL,
  isAllowedApiUrl,
  resolveApiBaseUrl,
} from '../src/api/apiBaseUrl.js';

test('apiBaseUrl exports valid defaults and resolves without trailing slashes', () => {
  assert.equal(PRODUCTION_API_URL, 'https://api.toeicmsuyen.vn/api/v1');
  assert.equal(DEVELOPMENT_API_URL, 'http://localhost:3000/api/v1');
  assert.ok(typeof API_BASE_URL === 'string' && API_BASE_URL.length > 0);
  assert.equal(API_BASE_URL.endsWith('/'), false, 'Base URL must not end with trailing slash');
});

test('isAllowedApiUrl filters out deprecated Vercel backend URLs', () => {
  assert.equal(isAllowedApiUrl('https://english-course-ms-uyen.vercel.app/api/v1'), false);
  assert.equal(isAllowedApiUrl('https://frontend-ru4l.vercel.app/api/v1'), false);
  assert.equal(isAllowedApiUrl(''), false);
  assert.equal(isAllowedApiUrl(null), false);
  assert.equal(isAllowedApiUrl('https://api.toeicmsuyen.vn/api/v1'), true);
  assert.equal(isAllowedApiUrl('http://localhost:5000/api/v1'), true);
});

test('resolveApiBaseUrl falls back to production API when legacy Vercel URL is passed in env', () => {
  // Production with legacy Vercel env
  const legacyProd = resolveApiBaseUrl({
    PROD: true,
    VITE_API_URL: 'https://english-course-ms-uyen.vercel.app/api/v1',
  });
  assert.equal(legacyProd, PRODUCTION_API_URL);

  // Development with legacy Vercel env
  const legacyDev = resolveApiBaseUrl({
    PROD: false,
    VITE_API_URL: 'https://english-course-ms-uyen.vercel.app/api/v1',
  });
  assert.equal(legacyDev, DEVELOPMENT_API_URL);

  // Production without VITE_API_URL
  const defaultProd = resolveApiBaseUrl({ PROD: true });
  assert.equal(defaultProd, PRODUCTION_API_URL);

  // Development without VITE_API_URL
  const defaultDev = resolveApiBaseUrl({ PROD: false });
  assert.equal(defaultDev, DEVELOPMENT_API_URL);

  // Valid custom URL in dev or staging
  const custom = resolveApiBaseUrl({
    PROD: false,
    VITE_API_URL: 'http://localhost:5000/api/v1/',
  });
  assert.equal(custom, 'http://localhost:5000/api/v1');
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
