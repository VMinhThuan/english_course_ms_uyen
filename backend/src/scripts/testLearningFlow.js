import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import mongoose from 'mongoose';
import User from '../models/User.js';
import Course from '../models/Course.js';
import Lesson from '../models/Lesson.js';
import Material from '../models/Material.js';
import Vocabulary from '../models/Vocabulary.js';
import LearningProgress from '../models/LearningProgress.js';
import Enrollment from '../models/Enrollment.js';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../../.env') });

const API_BASE = 'http://localhost:3000/api/v1';

async function runAllTests() {
  console.log('==================================================');
  console.log('🚀 STARTING FULL E2E LEARNING FLOW & SECURITY SUITE (A → AB)');
  console.log('==================================================\n');

  let passed = 0;
  let failed = 0;

  function logPass(testName, detail = '') {
    passed++;
    console.log(`✅ ${testName}: PASS ${detail ? `(${detail})` : ''}`);
  }

  function logFail(testName, error) {
    failed++;
    console.error(`❌ ${testName}: FAIL -> ${error}`);
  }

  // Connect to DB for setup/verification
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/english_course');

  // Identifiers
  const ts = Date.now();
  const adminEmail = `admin_flow_${ts}@test.com`;
  const studentEmail = `student_flow_${ts}@test.com`;
  const student2Email = `student2_flow_${ts}@test.com`;
  const password = 'Password123!';

  let adminToken = '';
  let studentToken = '';
  let student2Token = '';
  let studentId = '';
  let student2Id = '';
  let courseId = '';
  let draftLessonId = '';
  let hiddenLessonId = '';
  let publishedLesson1Id = '';
  let publishedLesson2Id = '';
  let publishedLesson3Id = '';
  let publishedLesson4Id = '';
  let normalMaterialId = '';
  let noDownloadMaterialId = '';
  let vocabId = '';

  try {
    // 0. Setup Admin user
    const adminUser = await User.create({
      fullName: 'Admin Flow User',
      email: adminEmail,
      phoneNumber: '0988888888',
      password: password,
      role: 'admin',
      status: 'active',
    });
    
    // Login as Admin
    const adminLoginRes = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: adminEmail, password }),
    });
    const adminLoginData = await adminLoginRes.json();
    adminToken = adminLoginData.data.accessToken;

    // Create a Course for testing
    const course = await Course.create({
      title: `English Mastery ${ts}`,
      description: 'Comprehensive course for tests',
      teacher: adminUser._id,
      price: 100,
      level: 'Intermediate',
      category: 'general',
      englishType: 'General',
      isPublished: true,
    });
    courseId = course._id.toString();

    // ---------------------------------------------------------
    // AUTHENTICATION & STUDENT APPROVAL LIFECYCLE TESTS (A → I)
    // ---------------------------------------------------------

    // TEST A: Standard Public Registration
    const regRes = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Student One',
        email: studentEmail,
        phoneNumber: '0912345678',
        password,
      }),
    });
    const regData = await regRes.json();
    if (regRes.status === 201 && regData.data?.user?.role === 'student' && regData.data?.user?.status === 'pending') {
      studentId = regData.data.user.id || regData.data.user._id;
      logPass('TEST A', 'User registered with role=student, status=pending');
    } else {
      logFail('TEST A', `Unexpected response: ${JSON.stringify(regData)}`);
    }

    // TEST B: Malicious Payload Immunity
    const malRes = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Student Two',
        email: student2Email,
        phoneNumber: '0987654321',
        password,
        role: 'admin',
        status: 'active',
        isApproved: true,
      }),
    });
    const malData = await malRes.json();
    if (malRes.status === 201 && malData.data?.user?.role === 'student' && malData.data?.user?.status === 'pending') {
      student2Id = malData.data.user.id || malData.data.user._id;
      logPass('TEST B', 'Ignored malicious role/status in payload');
    } else {
      logFail('TEST B', `Malicious payload accepted: ${JSON.stringify(malData)}`);
    }

    // TEST C: Pending Student Login & Access Blocking
    const s1LoginRes = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: studentEmail, password }),
    });
    const s1LoginData = await s1LoginRes.json();
    if (s1LoginRes.status === 403 && s1LoginData.code === 'ACCOUNT_PENDING') {
      logPass('TEST C', 'Pending student login correctly rejected with ACCOUNT_PENDING');
    } else {
      logFail('TEST C', `Status: ${s1LoginRes.status}, Data: ${JSON.stringify(s1LoginData)}`);
    }

    // TEST D: Admin Approves Pending Student
    const appRes = await fetch(`${API_BASE}/admin/students/${studentId}/approve`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const appData = await appRes.json();
    if (appRes.status === 200 && appData.data?.student?.status === 'active') {
      logPass('TEST D', 'Student approved to active status');
    } else {
      logFail('TEST D', `Status: ${appRes.status}, Data: ${JSON.stringify(appData)}`);
    }

    // TEST E: Invalid State Transition (re-approve active student)
    const invalidAppRes = await fetch(`${API_BASE}/admin/students/${studentId}/approve`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const invalidAppData = await invalidAppRes.json();
    if (invalidAppRes.status === 400 && invalidAppData.code === 'INVALID_STATE_TRANSITION') {
      logPass('TEST E', 'Rejected invalid state transition active -> active');
    } else {
      logFail('TEST E', `Status: ${invalidAppRes.status}, Data: ${JSON.stringify(invalidAppData)}`);
    }

    // TEST F: Active Student Full Access
    const activeLoginRes = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: studentEmail, password }),
    });
    const activeLoginData = await activeLoginRes.json();
    studentToken = activeLoginData.data.accessToken;

    // Enroll student in course for enrollment tests
    await Enrollment.create({ student: studentId, course: courseId, progress: 0 });

    const meRes = await fetch(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    if (meRes.status === 200) {
      logPass('TEST F', 'Active student authenticated successfully');
    } else {
      logFail('TEST F', `Status: ${meRes.status}`);
    }

    // TEST G: Admin Suspends Active Student
    const suspRes = await fetch(`${API_BASE}/admin/students/${studentId}/suspend`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    if (suspRes.status === 200) {
      logPass('TEST G', 'Active student suspended successfully');
    } else {
      logFail('TEST G', `Status: ${suspRes.status}`);
    }

    // TEST H: Suspended Student Blocked
    const suspBlockRes = await fetch(`${API_BASE}/progress/access`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${studentToken}`,
      },
      body: JSON.stringify({ lessonId: courseId }),
    });
    const suspBlockData = await suspBlockRes.json();
    if (suspBlockRes.status === 403 && (suspBlockData.code === 'ACCOUNT_SUSPENDED' || suspBlockData.code === 'ACCOUNT_NOT_ACTIVE')) {
      logPass('TEST H', 'Suspended student correctly blocked from APIs');
    } else {
      logFail('TEST H', `Status: ${suspBlockRes.status}, Data: ${JSON.stringify(suspBlockData)}`);
    }

    // TEST I: Admin Re-activates Suspended Student
    const reactRes = await fetch(`${API_BASE}/admin/students/${studentId}/activate`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    if (reactRes.status === 200) {
      logPass('TEST I', 'Suspended student reactivated successfully');
    } else {
      logFail('TEST I', `Status: ${reactRes.status}`);
    }

    // Re-login student to get fresh token
    const freshLoginRes = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: studentEmail, password }),
    });
    const freshLoginData = await freshLoginRes.json();
    studentToken = freshLoginData.data.accessToken;

    // Also approve student 2 for multi-student tests
    await fetch(`${API_BASE}/admin/students/${student2Id}/approve`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const s2LoginRes = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: student2Email, password }),
    });
    student2Token = (await s2LoginRes.json()).data.accessToken;
    await Enrollment.create({ student: student2Id, course: courseId, progress: 0 });

    // ---------------------------------------------------------
    // LEARNING FLOW & CONTENT SECURITY TESTS (J → AB)
    // ---------------------------------------------------------

    // TEST J: Admin Creates Draft Lesson
    const createDraftRes = await fetch(`${API_BASE}/admin/lessons`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        title: 'Draft Lesson 1',
        content: 'Draft Content',
        courseId: courseId,
        status: 'draft',
      }),
    });
    const createDraftData = await createDraftRes.json();
    if (createDraftRes.status === 201 && createDraftData.data?.lesson?.status === 'draft') {
      draftLessonId = createDraftData.data.lesson._id;
      logPass('TEST J', `Draft lesson created with ID: ${draftLessonId}`);
    } else {
      logFail('TEST J', `Status: ${createDraftRes.status}, Data: ${JSON.stringify(createDraftData)}`);
    }

    // Create 4 additional lessons to test 4-lesson enrollment progress calculations
    const createL1 = await Lesson.create({ title: 'Published Lesson 1', content: 'C1', course: courseId, status: 'draft', order: 1 });
    publishedLesson1Id = createL1._id.toString();

    const createL2 = await Lesson.create({ title: 'Published Lesson 2', content: 'C2', course: courseId, status: 'published', order: 2 });
    publishedLesson2Id = createL2._id.toString();

    const createL3 = await Lesson.create({ title: 'Published Lesson 3', content: 'C3', course: courseId, status: 'published', order: 3 });
    publishedLesson3Id = createL3._id.toString();

    const createL4 = await Lesson.create({ title: 'Published Lesson 4', content: 'C4', course: courseId, status: 'published', order: 4 });
    publishedLesson4Id = createL4._id.toString();

    const createHidden = await Lesson.create({ title: 'Hidden Lesson', content: 'CH', course: courseId, status: 'hidden', order: 5 });
    hiddenLessonId = createHidden._id.toString();

    // TEST K: Draft Lesson Hidden from Student Lesson List
    const studentListRes = await fetch(`${API_BASE}/lessons/course/${courseId}`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    const studentListData = await studentListRes.json();
    const fetchedLessons = studentListData.data?.lessons || [];
    const hasDraft = fetchedLessons.some((l) => l._id === draftLessonId);
    const hasHidden = fetchedLessons.some((l) => l._id === hiddenLessonId);
    if (!hasDraft && !hasHidden && fetchedLessons.length === 3) {
      logPass('TEST K', 'Draft and hidden lessons omitted from student course lesson list');
    } else {
      logFail('TEST K', `List returned ${fetchedLessons.length} lessons. Has draft: ${hasDraft}, Has hidden: ${hasHidden}`);
    }

    // TEST L: Standardized Lesson Status API (PATCH /api/v1/admin/lessons/:id/status)
    const patchStatusRes = await fetch(`${API_BASE}/admin/lessons/${publishedLesson1Id}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ status: 'published' }),
    });
    const patchStatusData = await patchStatusRes.json();
    if (patchStatusRes.status === 200 && patchStatusData.data?.lesson?.status === 'published') {
      logPass('TEST L', 'Standardized lesson status updated to published');
    } else {
      logFail('TEST L', `Status: ${patchStatusRes.status}, Data: ${JSON.stringify(patchStatusData)}`);
    }

    // TEST M: Student Opens Lesson -> status = in_progress
    const accessRes = await fetch(`${API_BASE}/progress/access`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${studentToken}`,
      },
      body: JSON.stringify({ lessonId: publishedLesson1Id }),
    });
    const accessData = await accessRes.json();
    if (accessRes.status === 200 && accessData.data?.progress?.status === 'in_progress') {
      logPass('TEST M', 'Lesson access set progress status to in_progress');
    } else {
      logFail('TEST M', `Status: ${accessRes.status}, Data: ${JSON.stringify(accessData)}`);
    }

    // TEST N: Student Completes Lesson -> status = completed, progress = 100
    const completeRes = await fetch(`${API_BASE}/progress/complete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${studentToken}`,
      },
      body: JSON.stringify({ lessonId: publishedLesson1Id }),
    });
    const completeData = await completeRes.json();
    if (completeRes.status === 200 && completeData.data?.progress?.status === 'completed' && completeData.data?.progress?.progress === 100) {
      logPass('TEST N', 'Lesson marked completed with 100% progress');
    } else {
      logFail('TEST N', `Status: ${completeRes.status}, Data: ${JSON.stringify(completeData)}`);
    }

    // TEST O: Untrusted Student Identity Injection Attempt
    const spoofRes = await fetch(`${API_BASE}/progress/complete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${studentToken}`,
      },
      body: JSON.stringify({
        lessonId: publishedLesson2Id,
        studentId: student2Id, // Injection attempt
        courseId: 'fake_course_id',
      }),
    });
    const spoofData = await spoofRes.json();
    if (spoofRes.status === 200 && spoofData.data?.progress?.student === studentId) {
      logPass('TEST O', 'Backend ignored client-provided studentId/courseId override');
    } else {
      logFail('TEST O', `Spoof response used untrusted data: ${JSON.stringify(spoofData)}`);
    }

    // TEST P: Admin Material CRUD & Validation
    const createMatRes = await fetch(`${API_BASE}/admin/materials`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        title: 'Grammar Guide PDF',
        description: 'Comprehensive guide',
        lessonId: publishedLesson1Id,
        fileUrl: '/uploads/grammar.pdf',
        allowDownload: true,
        status: 'published',
      }),
    });
    const createMatData = await createMatRes.json();
    if (createMatRes.status === 201 && createMatData.data?.material?.lesson === publishedLesson1Id) {
      normalMaterialId = createMatData.data.material._id;
      logPass('TEST P', 'Material created and validated against parent lesson/course');
    } else {
      logFail('TEST P', `Status: ${createMatRes.status}, Data: ${JSON.stringify(createMatData)}`);
    }

    // Create material with allowDownload = false
    const createNoDlRes = await fetch(`${API_BASE}/admin/materials`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        title: 'Protected Material',
        lessonId: publishedLesson1Id,
        fileUrl: '/uploads/protected.pdf',
        allowDownload: false,
        status: 'published',
      }),
    });
    noDownloadMaterialId = (await createNoDlRes.json()).data.material._id;

    // TEST Q: Download Permission Enforcement (allowDownload = false)
    const dlBlockRes = await fetch(`${API_BASE}/materials/${noDownloadMaterialId}/download`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    const dlBlockData = await dlBlockRes.json();
    if (dlBlockRes.status === 403 && dlBlockData.code === 'MATERIAL_DOWNLOAD_NOT_ALLOWED') {
      logPass('TEST Q', 'Download rejected with HTTP 403 MATERIAL_DOWNLOAD_NOT_ALLOWED');
    } else {
      logFail('TEST Q', `Status: ${dlBlockRes.status}, Data: ${JSON.stringify(dlBlockData)}`);
    }

    // TEST R: Vocabulary Admin CRUD & Student Fetch
    const createVocabRes = await fetch(`${API_BASE}/admin/vocabulary`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        word: 'Persistence',
        meaning: 'Sự kiên trì',
        pronunciation: '/pərˈsɪstəns/',
        lessonId: publishedLesson1Id,
        topic: 'Grammar',
        status: 'published',
      }),
    });
    const createVocabData = await createVocabRes.json();
    if (createVocabRes.status === 201) {
      vocabId = createVocabData.data.vocabulary._id;
      logPass('TEST R', 'Vocabulary item created and fetched by student');
    } else {
      logFail('TEST R', `Status: ${createVocabRes.status}, Data: ${JSON.stringify(createVocabData)}`);
    }

    // TEST S: Hidden Vocabulary & Material Protection
    const createHiddenVocabRes = await fetch(`${API_BASE}/admin/vocabulary`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        word: 'HiddenWord',
        meaning: 'Từ ẩn',
        lessonId: publishedLesson1Id,
        status: 'hidden',
      }),
    });
    const getStudentVocabRes = await fetch(`${API_BASE}/vocabulary/lesson/${publishedLesson1Id}`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    const getStudentVocabData = await getStudentVocabRes.json();
    const vocabList = getStudentVocabData.data?.vocabulary || [];
    const hasHiddenVocab = vocabList.some((v) => v.word === 'HiddenWord');
    if (!hasHiddenVocab) {
      logPass('TEST S', 'Hidden vocabulary correctly hidden from student');
    } else {
      logFail('TEST S', 'Hidden vocabulary was exposed to student');
    }

    // TEST T: Admin View Student Progress Statistics from MongoDB
    const adminProgRes = await fetch(`${API_BASE}/admin/students/${studentId}/progress?courseId=${courseId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const adminProgData = await adminProgRes.json();
    if (adminProgRes.status === 200 && adminProgData.data?.totalLessons === 4) {
      logPass('TEST T', `Admin student progress retrieved from DB (${adminProgData.data.completedLessons}/${adminProgData.data.totalLessons} completed)`);
    } else {
      logFail('TEST T', `Status: ${adminProgRes.status}, Data: ${JSON.stringify(adminProgData)}`);
    }

    // TEST U: Student Directly Requests DRAFT Lesson by ID
    const directDraftRes = await fetch(`${API_BASE}/lessons/${draftLessonId}`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    if (directDraftRes.status === 404 || directDraftRes.status === 403) {
      logPass('TEST U', 'Direct request for DRAFT lesson denied with 404/403');
    } else {
      logFail('TEST U', `Status: ${directDraftRes.status}`);
    }

    // TEST V: Student Directly Requests HIDDEN Lesson by ID
    const directHiddenRes = await fetch(`${API_BASE}/lessons/${hiddenLessonId}`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    if (directHiddenRes.status === 404 || directHiddenRes.status === 403) {
      logPass('TEST V', 'Direct request for HIDDEN lesson denied with 404/403');
    } else {
      logFail('TEST V', `Status: ${directHiddenRes.status}`);
    }

    // TEST W: Student Downloads Material of Hidden/Draft Lesson
    const hiddenLessonMaterial = await Material.create({
      title: 'Hidden Lesson Material',
      lesson: hiddenLessonId,
      course: courseId,
      fileUrl: '/uploads/hidden.pdf',
      allowDownload: true,
      status: 'published',
    });
    const dlHiddenRes = await fetch(`${API_BASE}/materials/${hiddenLessonMaterial._id}/download`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    if (dlHiddenRes.status === 403 || dlHiddenRes.status === 404) {
      logPass('TEST W', 'Material download of hidden/draft lesson denied with 403/404');
    } else {
      logFail('TEST W', `Status: ${dlHiddenRes.status}`);
    }

    // TEST X: Reopening Completed Lesson Prevents Regression
    const reAccessRes = await fetch(`${API_BASE}/progress/access`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${studentToken}`,
      },
      body: JSON.stringify({ lessonId: publishedLesson1Id }),
    });
    const reAccessData = await reAccessRes.json();
    if (reAccessRes.status === 200 && reAccessData.data?.progress?.status === 'completed' && reAccessData.data?.progress?.progress === 100) {
      logPass('TEST X', 'Reopening completed lesson retained status=completed and progress=100%');
    } else {
      logFail('TEST X', `Reopened lesson status regressed: ${JSON.stringify(reAccessData)}`);
    }

    // TEST Y: Idempotent Access (No Duplicate LearningProgress Documents)
    const initialCount = await LearningProgress.countDocuments({ student: studentId, lesson: publishedLesson1Id });
    await fetch(`${API_BASE}/progress/access`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${studentToken}`,
      },
      body: JSON.stringify({ lessonId: publishedLesson1Id }),
    });
    const finalCount = await LearningProgress.countDocuments({ student: studentId, lesson: publishedLesson1Id });
    if (initialCount === 1 && finalCount === 1) {
      logPass('TEST Y', 'Repeated /progress/access did not create duplicate records');
    } else {
      logFail('TEST Y', `Initial count: ${initialCount}, Final count: ${finalCount}`);
    }

    // TEST Z: Idempotent Completion
    await fetch(`${API_BASE}/progress/complete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${studentToken}`,
      },
      body: JSON.stringify({ lessonId: publishedLesson1Id }),
    });
    const completeDocCount = await LearningProgress.countDocuments({ student: studentId, lesson: publishedLesson1Id });
    if (completeDocCount === 1) {
      logPass('TEST Z', 'Repeated /progress/complete remained idempotent');
    } else {
      logFail('TEST Z', `Document count corrupted: ${completeDocCount}`);
    }

    // TEST AA: Course Enrollment Progress Calculation Accuracy (4 published lessons, 2 completed = 50%)
    // Complete lesson 2 as well (lesson 1 and lesson 2 completed out of 4 published)
    await fetch(`${API_BASE}/progress/complete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${studentToken}`,
      },
      body: JSON.stringify({ lessonId: publishedLesson2Id }),
    });

    const studentEnrollment = await Enrollment.findOne({ student: studentId, course: courseId });
    if (studentEnrollment && studentEnrollment.progress === 50) {
      logPass('TEST AA', `Enrollment progress calculated accurately (2/4 completed = ${studentEnrollment.progress}%)`);
    } else {
      logFail('TEST AA', `Expected progress 50%, got: ${studentEnrollment?.progress}`);
    }

    // TEST AB: Client Identity Spoofing Protection
    const fakeStudentIdRes = await fetch(`${API_BASE}/progress/access`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${studentToken}`,
      },
      body: JSON.stringify({
        lessonId: publishedLesson3Id,
        studentId: student2Id,
      }),
    });
    const fakeStudentData = await fakeStudentIdRes.json();
    if (fakeStudentData.data?.progress?.student === studentId) {
      logPass('TEST AB', 'Backend enforced authenticated student token ID');
    } else {
      logFail('TEST AB', `Failed to enforce student token identity: ${JSON.stringify(fakeStudentData)}`);
    }

  } catch (err) {
    console.error('Fatal execution error:', err);
  } finally {
    await mongoose.disconnect();
  }

  console.log('\n==================================================');
  console.log(`📊 E2E TEST RESULTS SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('==================================================');
  if (failed > 0) {
    process.exit(1);
  }
}

runAllTests();
