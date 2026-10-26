import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import express from 'express';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { adminPart1DictationRoutes, studentPart1DictationRoutes } from '../src/routes/part1DictationRoutes.js';
import { errorHandler } from '../src/middlewares/errorHandler.js';
import User from '../src/models/User.js';
import Part1Dictation from '../src/models/Part1Dictation.js';

const unique = randomUUID().replaceAll('-', '');
let mongoServer;
let setupError;
let httpServer;
let baseUrl;
let adminToken;
let studentToken;

try {
  assert.equal(mongoose.connection.readyState, 0, 'test must own its Mongoose connection');
  mongoServer = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1', dbName: `part1_dictation_${unique}` } });
  await mongoose.connect(mongoServer.getUri(), { serverSelectionTimeoutMS: 5000, autoIndex: true });
  await Promise.all([User.init(), Part1Dictation.init()]);
  process.env.JWT_SECRET = `part1-dictation-${unique}`;
  const [admin, student] = await User.create([
    { email: `part1-admin-${unique}@example.test`, password: 'admin-password', role: 'admin', status: 'active', isActive: true },
    { email: `part1-student-${unique}@example.test`, password: 'student-password', role: 'student', status: 'active', isActive: true },
  ]);
  adminToken = jwt.sign({ userId: admin._id }, process.env.JWT_SECRET, { expiresIn: '10m' });
  studentToken = jwt.sign({ userId: student._id }, process.env.JWT_SECRET, { expiresIn: '10m' });
  const app = express();
  app.use(express.json());
  app.use('/api/v1/admin/part1-dictations', adminPart1DictationRoutes);
  app.use('/api/v1/part1-dictations', studentPart1DictationRoutes);
  app.use(errorHandler);
  httpServer = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { httpServer.once('listening', resolve); httpServer.once('error', reject); });
  baseUrl = `http://127.0.0.1:${httpServer.address().port}`;
} catch (error) {
  setupError = error;
  if (httpServer?.listening) await new Promise((resolve) => httpServer.close(resolve));
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect().catch(() => {});
  if (mongoServer) await mongoServer.stop().catch(() => {});
}

const request = async (path, { method = 'GET', token, body } = {}) => {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { response, json: await response.json() };
};

test('Part 1 dictation keeps answers private and grades text case-insensitively', {
  skip: setupError ? `BLOCKED: disposable MongoDB could not start (${setupError.message})` : false,
}, async (t) => {
  const forbidden = await request('/api/v1/admin/part1-dictations', { token: studentToken });
  assert.equal(forbidden.response.status, 403);

  const invalid = await request('/api/v1/admin/part1-dictations', {
    method: 'POST', token: adminToken, body: { title: 'Missing answers', audioUrl: '/uploads/public/a.mp3', answers: [] },
  });
  assert.equal(invalid.response.status, 400);

  const created = await request('/api/v1/admin/part1-dictations', {
    method: 'POST', token: adminToken,
    body: { title: 'Station announcement', audioUrl: '/uploads/public/station.mp3', answers: [{ text: 'The train arrives at noon.' }, { text: 'Please keep your ticket.' }], isVisible: false },
  });
  assert.equal(created.response.status, 201, created.json.message);
  const id = created.json.data.item._id;

  await t.test('hidden item is inaccessible to students', async () => {
    const list = await request('/api/v1/part1-dictations', { token: studentToken });
    assert.deepEqual(list.json.data.items, []);
    const hidden = await request(`/api/v1/part1-dictations/${id}`, { token: studentToken });
    assert.equal(hidden.response.status, 404);
  });

  await t.test('visibility controls student discovery and never exposes answer text', async () => {
    const shown = await request(`/api/v1/admin/part1-dictations/${id}/visibility`, { method: 'PATCH', token: adminToken, body: { isVisible: true } });
    assert.equal(shown.response.status, 200);
    const list = await request('/api/v1/part1-dictations', { token: studentToken });
    assert.equal(list.json.data.items.length, 1);
    assert.equal(list.json.data.items[0].answerCount, 2);
    assert.doesNotMatch(JSON.stringify(list.json), /The train arrives at noon\./);
    const detail = await request(`/api/v1/part1-dictations/${id}`, { token: studentToken });
    assert.equal(detail.response.status, 200);
    assert.equal(detail.json.data.item.answers, undefined);
  });

  await t.test('submission checks each line without case or spacing sensitivity', async () => {
    const submitted = await request(`/api/v1/part1-dictations/${id}/submit`, {
      method: 'POST', token: studentToken, body: { answers: ['  the   TRAIN arrives at NOON. ', 'different sentence'] },
    });
    assert.equal(submitted.response.status, 200);
    assert.deepEqual(submitted.json.data.results, [{ order: 1, isCorrect: true }, { order: 2, isCorrect: false }]);
    assert.equal(submitted.json.data.correctCount, 1);
  });
});

test.after(async () => {
  if (httpServer?.listening) await new Promise((resolve) => httpServer.close(resolve));
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  if (mongoServer) await mongoServer.stop();
});
