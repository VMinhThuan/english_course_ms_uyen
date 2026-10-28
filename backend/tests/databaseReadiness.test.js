import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDatabaseReadinessMiddleware,
  databaseUnavailableResponse,
  getDatabaseConnectionOptions,
} from '../src/configs/database.js';

const createResponse = () => ({
  headers: {},
  statusCode: 200,
  set(name, value) { this.headers[name] = value; return this; },
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
});

test('database connection options disable Mongoose command buffering', () => {
  assert.equal(getDatabaseConnectionOptions({ NODE_ENV: 'production' }).bufferCommands, false);
});

test('database readiness waits for the connection before continuing to a controller', async () => {
  let connected = false;
  let nextCalled = false;
  const middleware = createDatabaseReadinessMiddleware({
    connect: async () => { connected = true; },
    logger: { error: assert.fail },
  });

  await middleware({ method: 'POST' }, createResponse(), () => {
    assert.equal(connected, true);
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
});

test('database readiness returns a safe 503 and does not invoke the controller when connection fails', async () => {
  const logs = [];
  const middleware = createDatabaseReadinessMiddleware({
    connect: async () => { throw Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:27017'), { code: 'ECONNREFUSED' }); },
    logger: { error: (...args) => logs.push(args) },
  });
  const response = createResponse();
  let nextCalled = false;

  await middleware({ method: 'POST' }, response, () => { nextCalled = true; });

  assert.equal(nextCalled, false);
  assert.equal(response.statusCode, 503);
  assert.equal(response.headers['Retry-After'], '5');
  assert.deepEqual(response.body, databaseUnavailableResponse);
  assert.equal(JSON.stringify(response.body).includes('127.0.0.1'), false);
  assert.equal(logs[0][1].errorCode, 'ECONNREFUSED');
});

test('database readiness lets CORS preflight through without opening a database connection', async () => {
  let connectCalled = false;
  let nextCalled = false;
  const middleware = createDatabaseReadinessMiddleware({
    connect: async () => { connectCalled = true; },
    logger: { error: assert.fail },
  });

  await middleware({ method: 'OPTIONS' }, createResponse(), () => { nextCalled = true; });

  assert.equal(connectCalled, false);
  assert.equal(nextCalled, true);
});
