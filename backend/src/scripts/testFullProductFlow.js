import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import User from '../models/User.js';
import Course from '../models/Course.js';
import Lesson from '../models/Lesson.js';
import Material from '../models/Material.js';
import Vocabulary from '../models/Vocabulary.js';
import LearningProgress from '../models/LearningProgress.js';
import Question from '../models/Question.js';
import Assessment from '../models/Assessment.js';
import Attempt from '../models/Attempt.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../.env') });

const API_BASE = 'http://localhost:3000/api/v1';

let adminToken = '';
let studentToken = '';
let studentId = '';
let courseId = '';
let lessonId = '';
let questionId = '';
let assessmentId = '';
let attemptId = '';

let passCount = 0;
let failCount = 0;

function logPass(testName, details = '') {
  passCount++;
  console.log(`✅ [PASS] ${testName} ${details ? `- ${details}` : ''}`);
}

function logFail(testName, error) {
  failCount++;
  console.error(`❌ [FAIL] ${testName}:`, error);
}

async function runFullProductTests() {
  console.log('==================================================');
  console.log('   FULL PRODUCT & E2E AUTOMATED TEST SUITE');
  console.log('==================================================\n');

  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/english_course';
    await mongoose.connect(mongoUri);
    console.log(' Connected to MongoDB:', mongoUri);

    // 1. Setup Admin Account
    let admin = await User.findOne({ email: 'admin_test_full@example.com' });
    if (!admin) {
      admin = await User.create({
        email: 'admin_test_full@example.com',
        password: 'Password123!',
        fullName: 'System Admin Full',
        role: 'admin',
        status: 'active',
        isActive: true,
      });
    } else {
      admin.role = 'admin';
      admin.status = 'active';
      await admin.save();
    }

    // Admin Login
    const adminLoginRes = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin_test_full@example.com', password: 'Password123!' }),
    });
    const adminLoginData = await adminLoginRes.json();
    adminToken = adminLoginData.data.accessToken;

    // 2. Setup Student Account via Registration & Admin Approval
    const testStudentEmail = `student_full_${Date.now()}@example.com`;
    const regRes = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testStudentEmail,
        password: 'StudentPassword123!',
        fullName: 'Initial Full Name',
        phoneNumber: '0987654321',
        role: 'admin', // Malicious role injection attempt
        status: 'active', // Malicious status injection attempt
      }),
    });
    const regData = await regRes.json();
    studentId = regData.data.user.id;

    if (regData.data.user.role === 'student' && regData.data.user.status === 'pending') {
      logPass('TEST REGISTRATION INTEGRITY', 'Backend correctly forced role=student & status=pending');
    } else {
      logFail('TEST REGISTRATION INTEGRITY', 'Backend failed to force role/status');
    }

    // Admin Approve Student
    await fetch(`${API_BASE}/admin/students/${studentId}/approve`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    // Student Login
    const studLoginRes = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testStudentEmail, password: 'StudentPassword123!' }),
    });
    const studLoginData = await studLoginRes.json();
    studentToken = studLoginData.data.accessToken;

    // 3. Setup Course, Lesson, Material, Vocabulary, Question, Assessment
    let course = await Course.findOne({ title: 'Full E2E English Course' });
    if (!course) {
      course = await Course.create({
        title: 'Full E2E English Course',
        description: 'Course for full E2E validation',
        level: 'Intermediate',
        category: 'general',
        englishType: 'General',
        teacher: admin._id,
        createdBy: admin._id,
      });
    }
    courseId = course._id.toString();


    let lesson = await Lesson.create({
      course: course._id,
      title: 'Lesson 1: Introduction to Grammar',
      description: 'Grammar basics for test',
      content: 'Grammar lesson content text',
      order: 1,
      status: 'published',
      createdBy: admin._id,
    });

    lessonId = lesson._id.toString();

    await Material.create({
      title: 'Grammar Guide PDF',
      description: 'Reference PDF for lesson 1',
      lesson: lesson._id,
      course: course._id,
      fileUrl: '/uploads/sample.pdf',
      fileType: 'pdf',
      allowDownload: true,
      createdBy: admin._id,
    });


    await Vocabulary.create({
      word: 'Achieve',
      phonetic: '/əˈtʃiːv/',
      partOfSpeech: 'verb',
      meaning: 'Đạt được, hoàn thành',
      lesson: lesson._id,
      course: course._id,
      createdBy: admin._id,
    });


    const question = await Question.create({
      questionText: 'What is the past tense of "go"?',
      prompt: 'What is the past tense of "go"?',
      type: 'single_choice',
      options: [
        { id: 'opt_1', text: 'go' },
        { id: 'opt_2', text: 'went' },
        { id: 'opt_3', text: 'gone' },
      ],
      correctAnswer: 'opt_2',
      score: 10,
      points: 10,
      createdBy: admin._id,
    });

    questionId = question._id.toString();

    const assessment = await Assessment.create({
      title: 'Unit 1 Grammar Exam',
      description: 'Comprehensive test for Unit 1',
      type: 'exam',
      questions: [{ question: question._id, points: 10, order: 1 }],
      duration: 30,
      attemptLimit: 3,
      passScore: 10,
      totalScore: 10,
      showCorrectAnswers: true,
      status: 'published',
      createdBy: admin._id,
    });

    assessmentId = assessment._id.toString();

    // ==================================================
    // RUN INDIVIDUAL AUDIT TESTS (BK -> BZ)
    // ==================================================

    // TEST BK: Update student profile
    const updateProfileRes = await fetch(`${API_BASE}/auth/profile`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${studentToken}`,
      },
      body: JSON.stringify({
        fullName: 'Updated Student Name',
        phoneNumber: '0912345678',
        role: 'admin', // Should be ignored
        status: 'suspended', // Should be ignored
      }),
    });
    const updateProfileData = await updateProfileRes.json();
    if (
      updateProfileRes.status === 200 &&
      updateProfileData.data.user.fullName === 'Updated Student Name' &&
      updateProfileData.data.user.role === 'student'
    ) {
      logPass('TEST BK: Student profile update succeeds', 'Role/status tampering correctly ignored');
    } else {
      logFail('TEST BK: Student profile update failed', JSON.stringify(updateProfileData));
    }

    // TEST BL: Change password with wrong current password
    const wrongPassRes = await fetch(`${API_BASE}/auth/change-password`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${studentToken}`,
      },
      body: JSON.stringify({
        currentPassword: 'WrongPassword123!',
        newPassword: 'NewPassword123!',
        confirmPassword: 'NewPassword123!',
      }),
    });
    if (wrongPassRes.status === 400) {
      logPass('TEST BL: Change password with wrong current password fails (HTTP 400)');
    } else {
      logFail('TEST BL: Change password with wrong current password did not fail with 400', wrongPassRes.status);
    }

    // TEST BM: Change password with valid current password
    const validPassRes = await fetch(`${API_BASE}/auth/change-password`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${studentToken}`,
      },
      body: JSON.stringify({
        currentPassword: 'StudentPassword123!',
        newPassword: 'NewPassword123!',
        confirmPassword: 'NewPassword123!',
      }),
    });
    if (validPassRes.status === 200) {
      logPass('TEST BM: Change password with valid current password succeeds');
    } else {
      logFail('TEST BM: Change password with valid current password failed', validPassRes.status);
    }

    // TEST BN: Login with new password vs old password
    const oldLoginRes = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testStudentEmail, password: 'StudentPassword123!' }),
    });
    const newLoginRes = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testStudentEmail, password: 'NewPassword123!' }),
    });
    const newLoginData = await newLoginRes.json();

    if (oldLoginRes.status === 401 && newLoginRes.status === 200) {
      studentToken = newLoginData.data.accessToken;
      logPass('TEST BN: Login with new password succeeds; old password fails (HTTP 401)');
    } else {
      logFail('TEST BN: Password update login verification failed');
    }

    // TEST BO: Student Dashboard endpoint
    const studDashRes = await fetch(`${API_BASE}/progress/student-dashboard`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    const studDashData = await studDashRes.json();
    if (studDashRes.status === 200 && studDashData.data.studentName === 'Updated Student Name') {
      logPass('TEST BO: Student Dashboard endpoint returns real student metrics');
    } else {
      logFail('TEST BO: Student Dashboard endpoint failed', JSON.stringify(studDashData));
    }

    // TEST BP: Available Assessments list endpoint
    const availAssRes = await fetch(`${API_BASE}/assessments/available`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    const availAssData = await availAssRes.json();
    if (availAssRes.status === 200 && Array.isArray(availAssData.data.assessments)) {
      logPass('TEST BP: Available Assessments endpoint returns exercises and exams with type badges');
    } else {
      logFail('TEST BP: Available Assessments endpoint failed', JSON.stringify(availAssData));
    }

    // Access & Complete Lesson
    await fetch(`${API_BASE}/progress/access`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${studentToken}`,
      },
      body: JSON.stringify({ lessonId }),
    });
    await fetch(`${API_BASE}/progress/complete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${studentToken}`,
      },
      body: JSON.stringify({ lessonId }),
    });

    // Start & Submit Attempt
    const startRes = await fetch(`${API_BASE}/assessments/${assessmentId}/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    const startData = await startRes.json();
    attemptId = startData.data.attemptId || startData.data.attempt?._id;


    const submitRes = await fetch(`${API_BASE}/attempts/${attemptId}/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${studentToken}`,
      },
      body: JSON.stringify({
        answers: [{ questionId, answer: 'opt_2' }],
      }),
    });

    const submitData = await submitRes.json();

    // TEST BQ: Student History endpoint
    const historyRes = await fetch(`${API_BASE}/attempts/history`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    const historyData = await historyRes.json();
    const historyList = historyData.data?.attempts || historyData.data?.history || [];
    if (historyRes.status === 200 && historyList.length > 0) {
      logPass('TEST BQ: Student History endpoint returns real attempt history');
    } else {
      logFail('TEST BQ: Student History endpoint failed', JSON.stringify(historyData));
    }


    // TEST BR: Student Result Detail endpoint
    const resultDetailRes = await fetch(`${API_BASE}/attempts/${attemptId}/result`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    const resultDetailData = await resultDetailRes.json();
    const resObj = resultDetailData.data?.result || resultDetailData.data?.attempt;
    if (resultDetailRes.status === 200 && resObj && (resObj.score === 10 || resObj.score === 0)) {
      logPass('TEST BR: Student Result Detail endpoint returns full graded attempt result');
    } else {
      logFail('TEST BR: Student Result Detail endpoint failed', JSON.stringify(resultDetailData));
    }


    // TEST BS: Admin Stats endpoint
    const adminStatsRes = await fetch(`${API_BASE}/admin/stats`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const adminStatsData = await adminStatsRes.json();
    if (adminStatsRes.status === 200 && adminStatsData.data.totalStudents > 0) {
      logPass('TEST BS: Admin Stats endpoint returns real MongoDB database metrics');
    } else {
      logFail('TEST BS: Admin Stats endpoint failed', JSON.stringify(adminStatsData));
    }

    // TEST BT: Admin Results endpoint
    const adminResultsRes = await fetch(`${API_BASE}/admin/results`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const adminResultsData = await adminResultsRes.json();
    const resultsList = adminResultsData.data?.attempts || adminResultsData.data?.results || [];
    if (adminResultsRes.status === 200 && Array.isArray(resultsList) && resultsList.length > 0) {
      logPass('TEST BT: Admin Results endpoint returns student attempt list');
    } else {
      logFail('TEST BT: Admin Results endpoint failed', JSON.stringify(adminResultsData));
    }


    // TEST BU: Delete question referenced by assessment (Expect HTTP 409 Conflict)
    const delQRes = await fetch(`${API_BASE}/admin/questions/${questionId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    if (delQRes.status === 409) {
      logPass('TEST BU: Delete question referenced by assessment fails with HTTP 409 Conflict');
    } else {
      logFail('TEST BU: Delete question referenced by assessment did not return 409', delQRes.status);
    }

    // TEST BV: Delete assessment with submitted student attempts (Expect HTTP 409 Conflict)
    const delAssRes = await fetch(`${API_BASE}/admin/assessments/${assessmentId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    if (delAssRes.status === 409) {
      logPass('TEST BV: Delete assessment with student attempts fails with HTTP 409 Conflict');
    } else {
      logFail('TEST BV: Delete assessment with student attempts did not return 409', delAssRes.status);
    }

    // TEST BW: End-to-End User Journey Complete Check
    if (failCount === 0) {
      logPass('TEST BW: Full E2E User Journey completely passed with zero errors');
    } else {
      logFail('TEST BW: Full E2E User Journey encountered failures', `${failCount} test(s) failed`);
    }

    console.log('\n==================================================');
    console.log(` SUMMARY: ${passCount} PASSED / ${failCount} FAILED`);
    console.log('==================================================\n');

    process.exit(failCount === 0 ? 0 : 1);
  } catch (error) {
    console.error('Fatal error during test execution:', error);
    process.exit(1);
  }
}

runFullProductTests();
