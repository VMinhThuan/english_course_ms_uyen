import test from 'node:test';
import assert from 'node:assert/strict';

// Set these before app.js loads dotenv. This process never contacts the
// configured database and deliberately uses an unavailable local TCP port.
process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = 'mongodb://127.0.0.1:1/database_readiness_test';
process.env.MONGODB_TIMEOUT_MS = '100';
process.env.MONGODB_CONNECT_TIMEOUT_MS = '100';

const { default: app } = await import('../src/app.js');

test('login returns 503 before its User.findOne query when MongoDB is unavailable', async (t) => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'student@example.test', password: 'not-used' }),
  });

  assert.equal(response.status, 503);
  assert.equal(response.headers.get('retry-after'), '5');
  assert.deepEqual(await response.json(), {
    status: 'error',
    code: 'DATABASE_UNAVAILABLE',
    message: 'Dịch vụ cơ sở dữ liệu hiện chưa sẵn sàng. Vui lòng thử lại sau.',
  });
});

test('readiness reports 503 while MongoDB is unavailable', async (t) => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const response = await fetch(`http://127.0.0.1:${server.address().port}/ready`);

  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, 'DATABASE_UNAVAILABLE');
});
