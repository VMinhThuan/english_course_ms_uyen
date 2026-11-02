import dotenv from 'dotenv';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import User from '../models/User.js';
import Course from '../models/Course.js';
import Lesson from '../models/Lesson.js';
import Enrollment from '../models/Enrollment.js';
import LearningProgress from '../models/LearningProgress.js';
import LearningSession from '../models/LearningSession.js';
import LearningActivity from '../models/LearningActivity.js';
import Assessment from '../models/Assessment.js';
import Attempt from '../models/Attempt.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const backendRoot = join(__dirname, '../..');
dotenv.config({ path: join(backendRoot, '.env') });

const DEMO_PASSWORD = 'Demo@Password123';

async function seedMonitoringDemo() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error('❌ MONGODB_URI is not set in backend/.env');
    process.exit(1);
  }

  console.log('Connecting to MongoDB...');
  await mongoose.connect(mongoUri);
  console.log('✅ Connected to MongoDB.');

  const hashedPassword = await bcrypt.hash(DEMO_PASSWORD, 10);

  // 1. Ensure an Admin user exists
  let adminUser = await User.findOne({ role: 'admin' });
  if (!adminUser) {
    adminUser = await User.create({
      email: 'admin.monitoring.demo@toeicmsuyen.vn',
      username: 'admin_demo',
      password: hashedPassword,
      fullName: 'Quản trị viên Demo',
      role: 'admin',
      status: 'active',
      isActive: true,
    });
    console.log(`Created admin user: ${adminUser.email}`);
  } else {
    console.log(`Using existing admin: ${adminUser.email}`);
  }

  // 2. Create demo students with distinct learning states
  const demoStudentSpecs = [
    {
      email: 'hocvien.hoanthanh.demo@toeicmsuyen.vn',
      username: 'hv_hoanthanh',
      fullName: 'Nguyễn Hoàng Long (Demo Đã Hoàn Thành)',
      phoneNumber: '0901234567',
      groupName: 'Lớp TOEIC 650+ K42',
      state: 'COMPLETED',
    },
    {
      email: 'hocvien.danghoc.demo@toeicmsuyen.vn',
      username: 'hv_danghoc',
      fullName: 'Trần Mai Phương (Demo Đang Học)',
      phoneNumber: '0912345678',
      groupName: 'Lớp TOEIC 650+ K42',
      state: 'IN_PROGRESS',
    },
    {
      email: 'hocvien.chuahoc.demo@toeicmsuyen.vn',
      username: 'hv_chuahoc',
      fullName: 'Lê Văn Tuấn (Demo Chưa Bắt Đầu)',
      phoneNumber: '0923456789',
      groupName: 'Lớp TOEIC 500 Cơ bản',
      state: 'NOT_STARTED',
    },
  ];

  const students = [];
  for (const spec of demoStudentSpecs) {
    let student = await User.findOne({ email: spec.email });
    if (!student) {
      student = await User.create({
        email: spec.email,
        username: spec.username,
        password: hashedPassword,
        fullName: spec.fullName,
        phoneNumber: spec.phoneNumber,
        groupName: spec.groupName,
        role: 'student',
        status: 'active',
        isActive: true,
      });
      console.log(`Created demo student: ${student.email}`);
    } else {
      console.log(`Existing demo student: ${student.email}`);
    }
    students.push({ user: student, spec });
  }

  // 3. Ensure a Course exists with chapters and lessons
  let demoCourse = await Course.findOne({ slug: 'toeic-650-mastery-demo' });
  if (!demoCourse) {
    demoCourse = await Course.create({
      slug: 'toeic-650-mastery-demo',
      title: 'Khóa Luyện Thi TOEIC 650+ Toàn Diện (Demo Giám Sát)',
      description: 'Chương trình đào tạo Listening & Reading chuẩn ETS với giám sát thời gian học thực tế.',
      level: 'Intermediate',
      englishType: 'TOEIC',
      teacher: adminUser._id,
      isPublished: true,
      price: 1500000,
      students: students.map((s) => s.user._id),
    });
    console.log(`Created demo course: ${demoCourse.title}`);
  } else {
    console.log(`Using existing demo course: ${demoCourse.title}`);
  }

  // 4. Create Lessons structured by Chapters
  const lessonSpecs = [
    { title: 'Bài 1: Tổng quan TOEIC Listening Part 1', chapter: 'Chương 1: Listening Foundation', order: 1, duration: 30 },
    { title: 'Bài 2: Chiến lược bẫy tranh người và vật Part 1', chapter: 'Chương 1: Listening Foundation', order: 2, duration: 45 },
    { title: 'Bài 3: Kỹ thuật nghe câu hỏi Wh- Questions Part 2', chapter: 'Chương 1: Listening Foundation', order: 3, duration: 40 },
    { title: 'Bài 4: Ngữ pháp trọng điểm Part 5 - Danh từ & Đại từ', chapter: 'Chương 2: Grammar & Reading Core', order: 4, duration: 50 },
    { title: 'Bài 5: Phân biệt Tính từ & Trạng từ Part 5', chapter: 'Chương 2: Grammar & Reading Core', order: 5, duration: 45 },
    { title: 'Bài 6: Chiến thuật làm bài đọc song ngữ Part 7', chapter: 'Chương 3: Reading Comprehension', order: 6, duration: 60 },
  ];

  const lessons = [];
  for (const lSpec of lessonSpecs) {
    let lesson = await Lesson.findOne({ course: demoCourse._id, title: lSpec.title });
    if (!lesson) {
      lesson = await Lesson.create({
        course: demoCourse._id,
        title: lSpec.title,
        chapter: lSpec.chapter,
        topic: lSpec.chapter,
        order: lSpec.order,
        duration: lSpec.duration,
        status: 'published',
        content: `<p>Nội dung bài học demo: ${lSpec.title}. Giám sát học tập bắt đầu khi học viên mở trang này.</p>`,
      });
      console.log(`Created lesson: ${lesson.title}`);
    }
    lessons.push(lesson);
  }

  // 5. Create or update Enrollments
  for (const { user, spec } of students) {
    const isCompleted = spec.state === 'COMPLETED';
    const isInProgress = spec.state === 'IN_PROGRESS';
    const progressVal = isCompleted ? 100 : (isInProgress ? 50 : 0);

    await Enrollment.findOneAndUpdate(
      { student: user._id, course: demoCourse._id },
      {
        $set: {
          progress: progressVal,
          enrolledAt: new Date(Date.now() - 14 * 24 * 3600 * 1000),
        },
      },
      { upsert: true, new: true }
    );

    // Clean previous monitoring demo records for this student to ensure reproducible state
    await LearningProgress.deleteMany({ student: user._id, course: demoCourse._id });
    await LearningSession.deleteMany({ student: user._id, course: demoCourse._id });
    await LearningActivity.deleteMany({ student: user._id, course: demoCourse._id });

    if (spec.state === 'NOT_STARTED') {
      // 0 progress, no records
      continue;
    }

    if (isCompleted) {
      // Student completed all 6 lessons
      for (let i = 0; i < lessons.length; i++) {
        const lesson = lessons[i];
        const daysAgo = 10 - i;
        const accessedAt = new Date(Date.now() - daysAgo * 24 * 3600 * 1000);
        const durationSec = 1800 + i * 300; // 30-45 mins per lesson

        await LearningProgress.create({
          student: user._id,
          course: demoCourse._id,
          lesson: lesson._id,
          status: 'completed',
          progress: 100,
          startedAt: accessedAt,
          completedAt: new Date(accessedAt.getTime() + durationSec * 1000),
          lastAccessedAt: new Date(accessedAt.getTime() + durationSec * 1000),
          visitCount: 2 + i,
          totalActiveSeconds: durationSec,
        });

        await LearningSession.create({
          student: user._id,
          course: demoCourse._id,
          lesson: lesson._id,
          startedAt: accessedAt,
          lastHeartbeatAt: new Date(accessedAt.getTime() + durationSec * 1000),
          endedAt: new Date(accessedAt.getTime() + durationSec * 1000),
          accumulatedActiveSeconds: durationSec,
          status: 'completed',
        });

        await LearningActivity.create({
          student: user._id,
          course: demoCourse._id,
          lesson: lesson._id,
          eventType: 'started_lesson',
          metadata: { lessonTitle: lesson.title, chapter: lesson.chapter },
          createdAt: accessedAt,
        });

        await LearningActivity.create({
          student: user._id,
          course: demoCourse._id,
          lesson: lesson._id,
          eventType: 'completed_lesson',
          metadata: { lessonTitle: lesson.title, chapter: lesson.chapter },
          createdAt: new Date(accessedAt.getTime() + durationSec * 1000),
        });
      }

      // Course completed activity
      await LearningActivity.create({
        student: user._id,
        course: demoCourse._id,
        eventType: 'completed_course',
        metadata: { courseTitle: demoCourse.title },
        createdAt: new Date(Date.now() - 2 * 24 * 3600 * 1000),
      });
    } else if (isInProgress) {
      // Completed 3 lessons, 1 in-progress, 2 not started
      for (let i = 0; i < 3; i++) {
        const lesson = lessons[i];
        const daysAgo = 7 - i * 2;
        const accessedAt = new Date(Date.now() - daysAgo * 24 * 3600 * 1000);
        const durationSec = 1500 + i * 200;

        await LearningProgress.create({
          student: user._id,
          course: demoCourse._id,
          lesson: lesson._id,
          status: 'completed',
          progress: 100,
          startedAt: accessedAt,
          completedAt: new Date(accessedAt.getTime() + durationSec * 1000),
          lastAccessedAt: new Date(accessedAt.getTime() + durationSec * 1000),
          visitCount: 2,
          totalActiveSeconds: durationSec,
        });

        await LearningSession.create({
          student: user._id,
          course: demoCourse._id,
          lesson: lesson._id,
          startedAt: accessedAt,
          lastHeartbeatAt: new Date(accessedAt.getTime() + durationSec * 1000),
          endedAt: new Date(accessedAt.getTime() + durationSec * 1000),
          accumulatedActiveSeconds: durationSec,
          status: 'completed',
        });

        await LearningActivity.create({
          student: user._id,
          course: demoCourse._id,
          lesson: lesson._id,
          eventType: 'completed_lesson',
          metadata: { lessonTitle: lesson.title, chapter: lesson.chapter },
          createdAt: new Date(accessedAt.getTime() + durationSec * 1000),
        });
      }

      // Lesson 4 is in-progress
      const currentLesson = lessons[3];
      const recentAccess = new Date(Date.now() - 2 * 3600 * 1000);
      await LearningProgress.create({
        student: user._id,
        course: demoCourse._id,
        lesson: currentLesson._id,
        status: 'in_progress',
        progress: 0,
        startedAt: recentAccess,
        lastAccessedAt: recentAccess,
        visitCount: 1,
        totalActiveSeconds: 780,
      });

      await LearningSession.create({
        student: user._id,
        course: demoCourse._id,
        lesson: currentLesson._id,
        startedAt: recentAccess,
        lastHeartbeatAt: new Date(recentAccess.getTime() + 780 * 1000),
        endedAt: new Date(recentAccess.getTime() + 780 * 1000),
        accumulatedActiveSeconds: 780,
        status: 'completed',
      });

      await LearningActivity.create({
        student: user._id,
        course: demoCourse._id,
        lesson: currentLesson._id,
        eventType: 'started_lesson',
        metadata: { lessonTitle: currentLesson.title, chapter: currentLesson.chapter },
        createdAt: recentAccess,
      });
    }
  }

  // 6. Create a Demo Assessment and Attempt for student
  let demoAssessment = await Assessment.findOne({ title: 'TOEIC Mini Mock Test 01 (Demo Giám Sát)' });
  if (!demoAssessment) {
    demoAssessment = await Assessment.create({
      title: 'TOEIC Mini Mock Test 01 (Demo Giám Sát)',
      description: 'Đề thi thử 50 câu kiểm tra định kỳ',
      type: 'exam',
      examFormat: 'toeic',
      toeicMode: 'mini_test',
      durationMinutes: 45,
      passScore: 60,
      totalScore: 50,
      status: 'published',
    });
    console.log(`Created demo assessment: ${demoAssessment.title}`);
  }

  const completedStudent = students[0].user;
  await Attempt.deleteMany({ student: completedStudent._id, assessment: demoAssessment._id });
  await Attempt.create({
    student: completedStudent._id,
    assessment: demoAssessment._id,
    assessmentType: 'exam',
    engine: 'toeic',
    startedAt: new Date(Date.now() - 3 * 24 * 3600 * 1000),
    deadlineAt: new Date(Date.now() - 3 * 24 * 3600 * 1000 + 45 * 60 * 1000),
    submittedAt: new Date(Date.now() - 3 * 24 * 3600 * 1000 + 38 * 60 * 1000),
    status: 'completed',
    score: 42,
    maxScore: 50,
    scorePercentage: 84,
    correctCount: 42,
    incorrectCount: 8,
    unansweredCount: 0,
    duration: 38 * 60,
    passed: true,
    passScore: 60,
    toeicBreakdown: {
      listeningCorrect: 22,
      readingCorrect: 20,
      listeningTotal: 25,
      readingTotal: 25,
      estimatedToeicScore: 720,
    },
  });

  await LearningActivity.create({
    student: completedStudent._id,
    assessment: demoAssessment._id,
    eventType: 'submitted_assessment',
    metadata: {
      assessmentTitle: demoAssessment.title,
      type: 'exam',
      examFormat: 'toeic',
      score: 42,
      maxScore: 50,
      percentage: 84,
      passed: true,
    },
    createdAt: new Date(Date.now() - 3 * 24 * 3600 * 1000 + 38 * 60 * 1000),
  });

  console.log('\n==================================================');
  console.log('🎉 DEMO SEED COMPLETED SUCCESSFULLY!');
  console.log('==================================================');
  console.log('Admin Demo Login:');
  console.log(`Email: ${adminUser.email}`);
  console.log(`Password: ${DEMO_PASSWORD}`);
  console.log('--------------------------------------------------');
  console.log('Demo Students:');
  demoStudentSpecs.forEach((s) => {
    console.log(`- ${s.fullName} (${s.state})`);
    console.log(`  Email: ${s.email} | Pass: ${DEMO_PASSWORD}`);
  });
  console.log('==================================================\n');

  await mongoose.disconnect();
}

seedMonitoringDemo().catch((err) => {
  console.error('Fatal seed error:', err);
  process.exit(1);
});
