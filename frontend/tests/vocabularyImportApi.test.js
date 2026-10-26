import assert from 'node:assert/strict';
import test from 'node:test';
import { createVocabularyImportApi, VocabularyImportApiError } from '../src/features/vocabulary-import/api.js';

const ok = (data, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => ({ status: 'success', data }) });

test('V3A API client uses isolated endpoints, credentials and bounded query contract', async () => {
  const calls = [];
  const api = createVocabularyImportApi({
    baseUrl: 'http://127.0.0.1:43187/admin/vocabulary-import-batches',
    getHeaders: () => ({ Authorization: 'Bearer synthetic-admin' }),
    fetchImpl: async (url, options) => { calls.push({ url, options }); return ok({ items: [], pagination: { page: 1, limit: 20, total: 0, pages: 1 } }); },
  });

  await api.getCandidates('batch/one', { page: 2, limit: 20, search: 'noun', status: '', validationStatus: undefined });

  assert.equal(calls[0].url, 'http://127.0.0.1:43187/admin/vocabulary-import-batches/batch%2Fone/candidates?page=2&limit=20&search=noun');
  assert.equal(calls[0].options.credentials, 'include');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer synthetic-admin');
});

test('upload is multipart and leaves boundary generation to fetch', async () => {
  let call;
  const api = createVocabularyImportApi({
    baseUrl: '/isolated/vocabulary-import-batches',
    fetchImpl: async (url, options) => { call = { url, options }; return ok({ batch: { _id: 'batch-1' }, candidates: [] }, 201); },
  });
  const file = new File([new Uint8Array([0x50, 0x4b])], 'Start 1.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  await api.uploadBatch([file], 'TOEIC EASY START');

  assert.equal(call.url, '/isolated/vocabulary-import-batches');
  assert.ok(call.options.body instanceof FormData);
  assert.equal(call.options.body.getAll('files').length, 1);
  assert.equal(call.options.body.get('sourceFolder'), 'TOEIC EASY START');
  assert.equal('Content-Type' in call.options.headers, false);
});

test('candidate edit and confirm payloads pass only V3A allowlisted fields', async () => {
  const calls = [];
  const api = createVocabularyImportApi({
    baseUrl: '/isolated/batches',
    fetchImpl: async (url, options) => { calls.push({ url, options }); return ok({ updated: true }); },
  });
  await api.updateCandidate('batch-1', 'candidate-1', {
    expectedVersion: 4,
    reason: 'Editorial correction',
    changes: { word: 'sample', senses: [{ meaning: 'meaning', partOfSpeech: ['noun'], examples: [{ english: 'line', vietnamese: 'dòng' }] }] },
  });
  await api.confirmBatch('batch-1', { expectedVersion: 9, candidateIds: ['candidate-1'] });

  const edit = JSON.parse(calls[0].options.body);
  assert.deepEqual(Object.keys(edit).sort(), ['changes', 'expectedVersion', 'reason']);
  assert.deepEqual(Object.keys(edit.changes).sort(), ['senses', 'word']);
  const confirm = JSON.parse(calls[1].options.body);
  assert.deepEqual(confirm, { expectedVersion: 9, candidateIds: ['candidate-1'] });
});

test('HTTP conflict and no-response failures remain distinguishable', async () => {
  const conflictApi = createVocabularyImportApi({
    baseUrl: '/isolated/batches',
    fetchImpl: async () => ({ ok: false, status: 409, json: async () => ({ status: 'error', code: 'CONCURRENT_MODIFICATION', message: 'Reload first.' }) }),
  });
  await assert.rejects(conflictApi.getBatch('batch-1'), (error) => error instanceof VocabularyImportApiError && error.status === 409 && error.code === 'CONCURRENT_MODIFICATION');

  const networkApi = createVocabularyImportApi({ baseUrl: '/isolated/batches', fetchImpl: async () => { throw new TypeError('offline'); } });
  await assert.rejects(networkApi.getBatch('batch-1'), (error) => error instanceof VocabularyImportApiError && error.status === null && error.code === 'NETWORK_ERROR');
});
