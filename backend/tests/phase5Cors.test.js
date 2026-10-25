import test from 'node:test';
import assert from 'node:assert/strict';

const trustedOrigin = 'https://toeic-part1-staging.example.test';
process.env.NODE_ENV = 'production';
process.env.FRONTEND_URL = trustedOrigin;
process.env.FRONTEND_ORIGINS = '';

const { default: app } = await import('../src/app.js');

test('production CORS permits the configured frontend with credentials and Range preflight', async (t) => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(`${baseUrl}/health`, { headers: { Origin: trustedOrigin } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), trustedOrigin);
  assert.equal(response.headers.get('access-control-allow-credentials'), 'true');

  const preflight = await fetch(`${baseUrl}/api/v1/materials/000000000000000000000000/stream`, {
    method: 'OPTIONS',
    headers: {
      Origin: trustedOrigin,
      'Access-Control-Request-Method': 'GET',
      'Access-Control-Request-Headers': 'range',
    },
  });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), trustedOrigin);
  assert.equal(preflight.headers.get('access-control-allow-credentials'), 'true');
  assert.ok((preflight.headers.get('access-control-allow-headers') || '').toLowerCase().split(',').map((value) => value.trim()).includes('range'));
});

test('production CORS permits the Idempotency-Key header used by the Part 5 picker', async (t) => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const preflight = await fetch(`${baseUrl}/api/v1/admin/toeic-tests/test/question-bank/part5/selections`, {
    method: 'OPTIONS',
    headers: {
      Origin: trustedOrigin,
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'authorization,content-type,idempotency-key',
    },
  });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), trustedOrigin);
  assert.equal(preflight.headers.get('access-control-allow-credentials'), 'true');
  const allowedHeaders = (preflight.headers.get('access-control-allow-headers') || '').toLowerCase().split(',').map((value) => value.trim());
  assert.ok(allowedHeaders.includes('idempotency-key'));
  assert.ok(allowedHeaders.includes('authorization'));
});
