import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import express from 'express';
import cookieParser from 'cookie-parser';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import jwt from 'jsonwebtoken';

import authRoutes from '../src/routes/authRoutes.js';
import adminRoutes from '../src/routes/adminRoutes.js';
import adminLearningRoutes from '../src/routes/adminLearningRoutes.js';
import learningSessionRoutes from '../src/routes/learningSessionRoutes.js';
import progressRoutes from '../src/routes/progressRoutes.js';

import User from '../src/models/User.js';
import Course from '../src/models/Course.js';
import Lesson from '../src/models/Lesson.js';
import Enrollment from '../src/models/Enrollment.js';
import LearningProgress from '../src/models/LearningProgress.js';
import LearningSession from '../src/models/LearningSession.js';
import LearningActivity from '../src/models/LearningActivity.js';
import Assessment from '../src/models/Assessment.js';
import Attempt from '../src/models/Attempt.js';

const dbName = `round2_test_${randomUUID().replaceAll('-', '')}`;
let mongoServer;
let httpServer;
let baseUrl;
let admin;
let teacher;
let studentA;
let studentB;
let adminToken;
let teacherToken;
let studentAToken;
let studentBToken;
let courseOne;
let lessonOne;
let lessonTwo;
let lessonThree;

const request = async (path, { method = 'GET', token, body } = {}) => {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { response, json };
};

test('Round 2 Student Learning Monitoring Suite', async (t) => {
  await t.test('Setup isolated test server and database', async () => {
    mongoServer = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1', dbName } });
    const uri = mongoServer.getUri(dbName);
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000, autoIndex: true });

    await Promise.all([
      User.init(), Course.init(), Lesson.init(), Enrollment.init(),
      LearningProgress.init(), LearningSession.init(), LearningActivity.init(),
      Assessment.init(), Attempt.init(),
    ]);

    process.env.JWT_SECRET = `round2-test-jwt-${randomUUID()}`;

    const app = express();
    app.use(express.json());
    app.use(cookieParser());

    app.use('/api/v1/auth', authRoutes);
    app.use('/api/v1/admin', adminRoutes);
    app.use('/api/v1/admin/learning', adminLearningRoutes);
    app.use('/api/v1/learning/sessions', learningSessionRoutes);
    app.use('/api/v1/progress', progressRoutes);

    app.use((error, _req, res, _next) => {
      res.status(500).json({ status: 'error', message: error.message || 'Internal error' });
    });

    httpServer = app.listen(0, '127.0.0.1');
    await new Promise((resolve, reject) => {
      httpServer.once('listening', resolve);
      httpServer.once('error', reject);
    });
    baseUrl = `http://127.0.0.1:${httpServer.address().port}`;

    // Seed test users
    admin = await User.create({ email: 'admin@r2.test', password: 'password123', fullName: 'Quản trị viên', role: 'admin', status: 'active', isActive: true });
    teacher = await User.create({ email: 'teacher@r2.test', password: 'password123', fullName: 'Giáo viên', role: 'teacher', status: 'active', isActive: true });
    studentA = await User.create({ email: 'studentA@r2.test', password: 'password123', fullName: 'Nguyễn Văn A', username: 'nguyenvana', role: 'student', status: 'active', isActive: true });
    studentB = await User.create({ email: 'studentB@r2.test', password: 'password123', fullName: 'Trần Thị B', username: 'tranthib', role: 'student', status: 'active', isActive: true });

    adminToken = jwt.sign({ userId: admin._id }, process.env.JWT_SECRET, { expiresIn: '1h' });
    teacherToken = jwt.sign({ userId: teacher._id }, process.env.JWT_SECRET, { expiresIn: '1h' });
    studentAToken = jwt.sign({ userId: studentA._id }, process.env.JWT_SECRET, { expiresIn: '1h' });
    studentBToken = jwt.sign({ userId: studentB._id }, process.env.JWT_SECRET, { expiresIn: '1h' });

    // Seed Course and Lessons
    courseOne = await Course.create({
      title: 'Khóa học TOEIC 650+',
      description: 'Khóa học luyện thi TOEIC',
      level: 'Intermediate',
      englishType: 'TOEIC',
      teacher: teacher._id,
      isPublished: true,
      students: [studentA._id, studentB._id],
    });

    [lessonOne, lessonTwo, lessonThree] = await Promise.all([
      Lesson.create({ title: 'Bài 1: Listening Part 1', chapter: 'Chương 1: Listening', order: 1, course: courseOne._id, status: 'published', duration: 30 }),
      Lesson.create({ title: 'Bài 2: Listening Part 2', chapter: 'Chương 1: Listening', order: 2, course: courseOne._id, status: 'published', duration: 45 }),
      Lesson.create({ title: 'Bài 3: Reading Part 5', chapter: 'Chương 2: Reading', order: 3, course: courseOne._id, status: 'published', duration: 40 }),
    ]);

    await Enrollment.create([
      { student: studentA._id, course: courseOne._id, progress: 0 },
      { student: studentB._id, course: courseOne._id, progress: 0 },
    ]);
  });

  await t.test('RBAC: Student cannot access Admin Learning Monitoring routes', async () => {
    const endpoints = [
      '/api/v1/admin/learning/overview',
      '/api/v1/admin/learning/students',
      `/api/v1/admin/learning/students/${studentA._id}`,
      `/api/v1/admin/learning/students/${studentA._id}/progress`,
      `/api/v1/admin/learning/students/${studentA._id}/history`,
      `/api/v1/admin/learning/courses/${courseOne._id}/stats`,
    ];

    for (const endpoint of endpoints) {
      const res = await request(endpoint, { token: studentAToken });
      assert.equal(res.response.status, 403, `Student access to ${endpoint} must be 403 Forbidden`);
    }
  });

  await t.test('Session tracking: Student starts session, sends heartbeats with server clamping, and ends session', async () => {
    // 1. Start session
    const startRes = await request('/api/v1/learning/sessions/start', {
      method: 'POST',
      token: studentAToken,
      body: { lessonId: lessonOne._id, courseId: courseOne._id },
    });

    assert.equal(startRes.response.status, 201);
    assert.equal(startRes.json.status, 'success');
    const sessionId = startRes.json.data.sessionId;
    assert.ok(sessionId);
    assert.equal(startRes.json.data.session.status, 'active');

    // Verify LearningProgress was created with visitCount = 1 and status in_progress
    const progress = await LearningProgress.findOne({ student: studentA._id, lesson: lessonOne._id });
    assert.equal(progress.status, 'in_progress');
    assert.equal(progress.visitCount, 1);

    // Verify LearningActivity logged started_lesson
    const activity = await LearningActivity.findOne({ student: studentA._id, lesson: lessonOne._id, eventType: 'started_lesson' });
    assert.ok(activity);

    // 2. Student B cannot heartbeat on Student A's session
    const hijackedHb = await request('/api/v1/learning/sessions/heartbeat', {
      method: 'POST',
      token: studentBToken,
      body: { sessionId, activeSeconds: 15 },
    });
    assert.equal(hijackedHb.response.status, 404, 'Student B cannot update Student A session');

    // 3. Heartbeat duration clamping: sending spoofed huge seconds (e.g. 9999) must be capped to max 45s
    const spoofedHb = await request('/api/v1/learning/sessions/heartbeat', {
      method: 'POST',
      token: studentAToken,
      body: { sessionId, activeSeconds: 99999 },
    });
    assert.equal(spoofedHb.response.status, 200);
    assert.ok(spoofedHb.json.data.addedSeconds <= 45, 'Heartbeat duration must be clamped securely');

    // 4. Normal heartbeat (e.g. 15s)
    const normalHb = await request('/api/v1/learning/sessions/heartbeat', {
      method: 'POST',
      token: studentAToken,
      body: { sessionId, activeSeconds: 15 },
    });
    assert.equal(normalHb.response.status, 200);
    assert.ok(normalHb.json.data.accumulatedActiveSeconds > 0);

    // 5. End session
    const endRes = await request('/api/v1/learning/sessions/end', {
      method: 'POST',
      token: studentAToken,
      body: { sessionId, activeSeconds: 5 },
    });
    assert.equal(endRes.response.status, 200);

    const closedSession = await LearningSession.findById(sessionId);
    assert.equal(closedSession.status, 'completed');
    assert.ok(closedSession.endedAt);
    assert.ok(closedSession.accumulatedActiveSeconds > 0);

    // Check LearningProgress accumulated duration
    const updatedProgress = await LearningProgress.findOne({ student: studentA._id, lesson: lessonOne._id });
    assert.equal(updatedProgress.totalActiveSeconds, closedSession.accumulatedActiveSeconds);
  });

  await t.test('Lesson completion flow: marks lesson completed and logs activity', async () => {
    const completeRes = await request('/api/v1/progress/complete', {
      method: 'POST',
      token: studentAToken,
      body: { lessonId: lessonOne._id },
    });

    assert.equal(completeRes.response.status, 200);
    assert.equal(completeRes.json.data.progress.status, 'completed');
    assert.equal(completeRes.json.data.progress.progress, 100);

    // Verify LearningActivity has completed_lesson
    const completedActivity = await LearningActivity.findOne({
      student: studentA._id,
      lesson: lessonOne._id,
      eventType: 'completed_lesson',
    });
    assert.ok(completedActivity, 'Completed lesson activity must be logged');

    // Idempotent repeat complete call must not duplicate activity or corrupt progress
    const repeatRes = await request('/api/v1/progress/complete', {
      method: 'POST',
      token: studentAToken,
      body: { lessonId: lessonOne._id },
    });
    assert.equal(repeatRes.response.status, 200);

    const activityCount = await LearningActivity.countDocuments({
      student: studentA._id,
      lesson: lessonOne._id,
      eventType: 'completed_lesson',
    });
    assert.equal(activityCount, 1, 'Activity must not duplicate on repeated completion');
  });

  await t.test('Admin Learning Overview: returns accurate system-wide metrics', async () => {
    const res = await request('/api/v1/admin/learning/overview', { token: adminToken });
    assert.equal(res.response.status, 200);
    assert.equal(res.json.status, 'success');

    const data = res.json.data;
    assert.equal(data.totalStudents, 2);
    assert.equal(data.activeLearners, 1); // Student A is active, Student B has not started
    assert.equal(data.notStartedStudents, 1);
    assert.ok(data.totalLearningSeconds > 0);
    assert.equal(data.totalCourses, 1);
  });

  await t.test('Admin Learning Students: returns paginated student list with progress & filter', async () => {
    // All students
    const resAll = await request('/api/v1/admin/learning/students', { token: adminToken });
    assert.equal(resAll.response.status, 200);
    assert.equal(resAll.json.data.students.length, 2);

    const stA = resAll.json.data.students.find((s) => s.email === 'studenta@r2.test');
    assert.ok(stA);
    assert.equal(stA.learningStatus, 'IN_PROGRESS');
    assert.equal(stA.completedLessons, 1);
    assert.equal(stA.totalLessons, 3);
    assert.equal(stA.progressPercentage, 33);
    assert.ok(stA.totalLearningSeconds > 0);

    const stB = resAll.json.data.students.find((s) => s.email === 'studentb@r2.test');
    assert.ok(stB);
    assert.equal(stB.learningStatus, 'NOT_STARTED');
    assert.equal(stB.completedLessons, 0);

    // Filter by status: in_progress
    const resFilter = await request('/api/v1/admin/learning/students?status=in_progress', { token: adminToken });
    assert.equal(resFilter.json.data.students.length, 1);
    assert.equal(resFilter.json.data.students[0].email, 'studenta@r2.test');

    // Search by name
    const resSearch = await request('/api/v1/admin/learning/students?search=Trần Thị', { token: adminToken });
    assert.equal(resSearch.json.data.students.length, 1);
    assert.equal(resSearch.json.data.students[0].email, 'studentb@r2.test');
  });

  await t.test('Admin Learning Student Detail: returns student overview metrics', async () => {
    const res = await request(`/api/v1/admin/learning/students/${studentA._id}`, { token: adminToken });
    assert.equal(res.response.status, 200);

    const data = res.json.data;
    assert.equal(data.student.email, 'studenta@r2.test');
    assert.equal(data.enrolledCourses.length, 1);
    assert.equal(data.learningOverview.completedLessons, 1);
    assert.equal(data.learningOverview.totalLessons, 3);
    assert.equal(data.learningOverview.overallCompletionPercentage, 33);
    assert.ok(data.learningOverview.totalLearningSeconds > 0);
  });

  await t.test('Admin Learning Student Progress: returns hierarchy Course → Chapter → Lesson', async () => {
    const res = await request(`/api/v1/admin/learning/students/${studentA._id}/progress`, { token: adminToken });
    assert.equal(res.response.status, 200);

    const courses = res.json.data.courses;
    assert.equal(courses.length, 1);
    const course = courses[0];
    assert.equal(course.title, 'Khóa học TOEIC 650+');
    assert.equal(course.chapters.length, 2); // Chương 1: Listening & Chương 2: Reading

    const chap1 = course.chapters.find((c) => c.chapterTitle.includes('Listening'));
    assert.ok(chap1);
    assert.equal(chap1.lessons.length, 2);

    const lesson1Data = chap1.lessons.find((l) => l.title.includes('Bài 1'));
    assert.ok(lesson1Data);
    assert.equal(lesson1Data.status, 'COMPLETED');
    assert.ok(lesson1Data.totalActiveDuration > 0);
    assert.equal(lesson1Data.numberOfVisits, 1);
  });

  await t.test('Admin Learning Student History: returns timeline of activities', async () => {
    const res = await request(`/api/v1/admin/learning/students/${studentA._id}/history`, { token: adminToken });
    assert.equal(res.response.status, 200);

    const activities = res.json.data.activities;
    assert.ok(activities.length >= 2);
    assert.ok(activities.some((a) => a.eventType === 'completed_lesson'));
    assert.ok(activities.some((a) => a.eventType === 'started_lesson'));
  });

  await t.test('Admin Course Reporting Stats: returns course statistics & lesson breakdown', async () => {
    const res = await request(`/api/v1/admin/learning/courses/${courseOne._id}/stats`, { token: adminToken });
    assert.equal(res.response.status, 200);

    const data = res.json.data;
    assert.equal(data.course.title, 'Khóa học TOEIC 650+');
    assert.equal(data.enrolledStudents, 2);
    assert.equal(data.startedStudents, 1);
    assert.equal(data.completedStudents, 0);
    assert.equal(data.lessons.length, 3);

    const lesson1Stats = data.lessons.find((l) => l.title.includes('Bài 1'));
    assert.ok(lesson1Stats);
    assert.equal(lesson1Stats.completedStudentsCount, 1);
    assert.equal(lesson1Stats.completionRate, 50); // 1 of 2 enrolled students
    assert.ok(lesson1Stats.totalActiveSeconds > 0);
  });

  await t.test('Teardown test server and database', async () => {
    if (httpServer?.listening) {
      await new Promise((resolve) => httpServer.close(resolve));
    }
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    if (mongoServer) {
      await mongoServer.stop();
    }
  });
});
