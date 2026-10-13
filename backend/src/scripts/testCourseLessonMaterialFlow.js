import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import mongoose from 'mongoose';
import fs from 'fs';
import User from '../models/User.js';
import Course from '../models/Course.js';
import Lesson from '../models/Lesson.js';
import Material from '../models/Material.js';
import Enrollment from '../models/Enrollment.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../../.env') });

const API_BASE = 'http://localhost:3000/api/v1';

async function runCourseLessonMaterialE2E() {
  console.log('================================================================');
  console.log('🚀 TEACHER/ADMIN COURSE - LESSON - MATERIAL MANAGEMENT E2E TEST');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function logPass(testName, detail = '') {
    passed++;
    console.log(`✅ [PASS] ${testName} ${detail ? `(${detail})` : ''}`);
  }

  function logFail(testName, error) {
    failed++;
    console.error(`❌ [FAIL] ${testName} -> ${error}`);
  }

  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/english_course');

  const ts = Date.now();
  const teacher1Email = `teacher1_${ts}@test.com`;
  const teacher2Email = `teacher2_${ts}@test.com`;
  const studentEmail = `student_${ts}@test.com`;
  const adminEmail = `admin_${ts}@test.com`;
  const password = 'Password123!';

  let teacher1Token = '';
  let teacher2Token = '';
  let studentToken = '';
  let adminToken = '';

  let teacher1Id = '';
  let teacher2Id = '';
  let studentId = '';
  let adminId = '';

  let createdCourseId = '';
  let lesson1Id = '';
  let lesson2Id = '';
  let lesson3Id = '';
  let material1Id = '';
  let material2Id = '';
  let material3Id = '';

  try {
    // ------------------------------------------------------------------------
    // 1. SETUP USERS & TOKENS
    // ------------------------------------------------------------------------
    const t1 = await User.create({
      fullName: 'Teacher One (Owner)',
      email: teacher1Email,
      phoneNumber: `09${Math.floor(10000000 + Math.random() * 90000000)}`,
      password,
      role: 'teacher',
      status: 'active',
    });
    teacher1Id = t1._id.toString();

    const t2 = await User.create({
      fullName: 'Teacher Two (Intruder)',
      email: teacher2Email,
      phoneNumber: `09${Math.floor(10000000 + Math.random() * 90000000)}`,
      password,
      role: 'teacher',
      status: 'active',
    });
    teacher2Id = t2._id.toString();

    const s = await User.create({
      fullName: 'Student Learner',
      email: studentEmail,
      phoneNumber: `09${Math.floor(10000000 + Math.random() * 90000000)}`,
      password,
      role: 'student',
      status: 'active',
    });
    studentId = s._id.toString();

    const a = await User.create({
      fullName: 'System Administrator',
      email: adminEmail,
      phoneNumber: `09${Math.floor(10000000 + Math.random() * 90000000)}`,
      password,
      role: 'admin',
      status: 'active',
    });
    adminId = a._id.toString();

    // Logins
    async function login(email) {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      return data.data?.accessToken || data.data?.token;
    }

    teacher1Token = await login(teacher1Email);
    teacher2Token = await login(teacher2Email);
    studentToken = await login(studentEmail);
    adminToken = await login(adminEmail);

    if (!teacher1Token || !teacher2Token || !studentToken || !adminToken) {
      throw new Error('Failed to acquire auth tokens for all test users');
    }
    logPass('Setup test users and acquired JWT tokens', 'Teacher1, Teacher2, Student, Admin');

    // ------------------------------------------------------------------------
    // 2. TEACHER 1 CREATES DRAFT COURSE
    // ------------------------------------------------------------------------
    const coursePayload = {
      title: `Khóa Học TOEIC Test ${ts}`,
      description: 'Lộ trình từ cơ bản đến nâng cao cho bài thi TOEIC',
      level: 'Intermediate',
      englishType: 'TOEIC',
      category: 'general',
      price: 99,
      isPublished: false, // DRAFT
      skills: ['Listening', 'Reading'],
    };

    const createCourseRes = await fetch(`${API_BASE}/admin/courses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${teacher1Token}`,
      },
      body: JSON.stringify(coursePayload),
    });
    const createCourseData = await createCourseRes.json();

    if (createCourseRes.status === 201 && createCourseData.data?.course?._id) {
      createdCourseId = createCourseData.data.course._id;
      logPass('Teacher 1 creates draft course', `ID: ${createdCourseId}, isPublished: false`);
    } else {
      logFail('Teacher 1 creates draft course', JSON.stringify(createCourseData));
    }

    // ------------------------------------------------------------------------
    // 3. STUDENT CALLS GET /courses -> DRAFT COURSE MUST NOT APPEAR
    // ------------------------------------------------------------------------
    const studentCoursesRes = await fetch(`${API_BASE}/courses`);
    const studentCoursesData = await studentCoursesRes.json();
    const studentList = studentCoursesData.data?.courses || [];
    const draftFound = studentList.some((c) => c._id === createdCourseId || c.id === createdCourseId);

    if (!draftFound) {
      logPass('Draft course is NOT exposed to public/student GET /courses', `Total public: ${studentList.length}`);
    } else {
      logFail('Draft course leaked to public/student GET /courses', 'Draft course was visible!');
    }

    // Teacher 1 calls GET /admin/courses -> draft course is returned
    const teacherCoursesRes = await fetch(`${API_BASE}/admin/courses?status=draft`, {
      headers: { Authorization: `Bearer ${teacher1Token}` },
    });
    const teacherCoursesData = await teacherCoursesRes.json();
    const teacherList = teacherCoursesData.data?.courses || [];
    const teacherFound = teacherList.some((c) => c._id === createdCourseId);

    if (teacherFound) {
      logPass('Teacher 1 sees their draft course in GET /admin/courses', `Total drafts: ${teacherList.length}`);
    } else {
      logFail('Teacher 1 cannot see their draft course in admin list', JSON.stringify(teacherCoursesData));
    }

    // ------------------------------------------------------------------------
    // 4. TEACHER 1 EDITS COURSE
    // ------------------------------------------------------------------------
    const updateCourseRes = await fetch(`${API_BASE}/admin/courses/${createdCourseId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${teacher1Token}`,
      },
      body: JSON.stringify({
        title: `Khóa Học TOEIC Master Updated ${ts}`,
        price: 120,
      }),
    });
    const updateCourseData = await updateCourseRes.json();

    if (updateCourseRes.status === 200 && updateCourseData.data?.course?.price === 120) {
      logPass('Teacher 1 successfully updates course fields', 'Title and price updated');
    } else {
      logFail('Teacher 1 updates course fields', JSON.stringify(updateCourseData));
    }

    // ------------------------------------------------------------------------
    // 5. LESSON MANAGEMENT: CREATE, EDIT, REORDER, DELETE
    // ------------------------------------------------------------------------
    // Create Lesson 1 (published)
    const createL1Res = await fetch(`${API_BASE}/admin/lessons`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${teacher1Token}`,
      },
      body: JSON.stringify({
        title: 'Lesson 1: Overview and Picture Analysis',
        content: 'Detailed strategies for TOEIC Part 1 Photographs',
        courseId: createdCourseId,
        order: 1,
        topic: 'Part 1',
        duration: 30,
        status: 'published',
      }),
    });
    const l1Data = await createL1Res.json();
    lesson1Id = l1Data.data?.lesson?._id;

    // Create Lesson 2 (draft)
    const createL2Res = await fetch(`${API_BASE}/admin/lessons`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${teacher1Token}`,
      },
      body: JSON.stringify({
        title: 'Lesson 2: Question-Response Strategies',
        content: 'Techniques to avoid distractors in Part 2',
        courseId: createdCourseId,
        order: 2,
        topic: 'Part 2',
        duration: 25,
        status: 'draft',
      }),
    });
    const l2Data = await createL2Res.json();
    lesson2Id = l2Data.data?.lesson?._id;

    // Create Lesson 3 (published)
    const createL3Res = await fetch(`${API_BASE}/admin/lessons`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${teacher1Token}`,
      },
      body: JSON.stringify({
        title: 'Lesson 3: Short Conversations',
        content: 'Skimming questions and conversations in Part 3',
        courseId: createdCourseId,
        order: 3,
        topic: 'Part 3',
        duration: 40,
        status: 'published',
      }),
    });
    const l3Data = await createL3Res.json();
    lesson3Id = l3Data.data?.lesson?._id;

    if (lesson1Id && lesson2Id && lesson3Id) {
      logPass('Teacher 1 creates 3 lessons with order and status', 'L1 (pub), L2 (draft), L3 (pub)');
    } else {
      logFail('Teacher 1 creates lessons', 'Missing lesson IDs');
    }

    // Student checks lessons: draft lesson 2 MUST be hidden for student
    const studentLessonsRes = await fetch(`${API_BASE}/lessons/course/${createdCourseId}`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    const studentLessonsData = await studentLessonsRes.json();
    const studentLessons = studentLessonsData.data?.lessons || [];
    const hasDraftL2 = studentLessons.some((l) => l._id === lesson2Id);

    if (!hasDraftL2 && studentLessons.length === 2) {
      logPass('Student cannot see draft lessons in course', 'Only 2 published lessons visible');
    } else {
      logFail('Draft lesson leaked to student lessons view', `studentLessons count: ${studentLessons.length}`);
    }

    // Reorder lessons: reverse order [L3, L2, L1]
    const reorderRes = await fetch(`${API_BASE}/admin/courses/${createdCourseId}/reorder-lessons`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${teacher1Token}`,
      },
      body: JSON.stringify({ lessonIds: [lesson3Id, lesson2Id, lesson1Id] }),
    });
    const reorderData = await reorderRes.json();
    const reorderedLessons = reorderData.data?.lessons || [];
    const l3Order = reorderedLessons.find((l) => l._id === lesson3Id)?.order;
    const l1Order = reorderedLessons.find((l) => l._id === lesson1Id)?.order;

    if (reorderRes.status === 200 && l3Order === 1 && l1Order === 3) {
      logPass('Reorder lessons updates order field across lessons', 'L3 order=1, L1 order=3');
    } else {
      logFail('Reorder lessons failed', JSON.stringify(reorderData));
    }

    // Update Lesson 2 status from draft to published
    const statusUpdateRes = await fetch(`${API_BASE}/admin/lessons/${lesson2Id}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${teacher1Token}`,
      },
      body: JSON.stringify({ status: 'published' }),
    });
    const statusUpdateData = await statusUpdateRes.json();

    if (statusUpdateRes.status === 200 && statusUpdateData.data?.lesson?.status === 'published') {
      logPass('Teacher 1 updates lesson status to published', 'L2 status is now published');
    } else {
      logFail('Update lesson status failed', JSON.stringify(statusUpdateData));
    }

    // ------------------------------------------------------------------------
    // 6. MATERIAL MANAGEMENT: CREATE, DOWNLOAD PERMISSION, EDIT, DELETE
    // ------------------------------------------------------------------------
    // Prepare dummy file in uploads
    if (!fs.existsSync('uploads')) {
      fs.mkdirSync('uploads', { recursive: true });
    }
    const sampleFilePath = 'uploads/test_material_doc.txt';
    fs.writeFileSync(sampleFilePath, 'Sample material contents for testing E2E flow.');

    // Material 1: allowDownload = true
    const createMat1Res = await fetch(`${API_BASE}/admin/materials`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${teacher1Token}`,
      },
      body: JSON.stringify({
        title: 'Handout Part 1 Strategy (Download Allowed)',
        lessonId: lesson1Id,
        filePath: sampleFilePath,
        fileUrl: '/uploads/test_material_doc.txt',
        fileType: 'text/plain',
        fileSize: 48,
        allowDownload: true,
        status: 'published',
      }),
    });
    const mat1Data = await createMat1Res.json();
    material1Id = mat1Data.data?.material?._id;

    // Material 2: allowDownload = false
    const createMat2Res = await fetch(`${API_BASE}/admin/materials`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${teacher1Token}`,
      },
      body: JSON.stringify({
        title: 'Confidential Slide (View Only - No Download)',
        lessonId: lesson1Id,
        filePath: sampleFilePath,
        fileUrl: '/uploads/test_material_doc.txt',
        fileType: 'text/plain',
        fileSize: 48,
        allowDownload: false,
        status: 'published',
      }),
    });
    const mat2Data = await createMat2Res.json();
    material2Id = mat2Data.data?.material?._id;

    // Material 3: status = 'hidden' (draft)
    const createMat3Res = await fetch(`${API_BASE}/admin/materials`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${teacher1Token}`,
      },
      body: JSON.stringify({
        title: 'Draft Unreleased Worksheet',
        lessonId: lesson1Id,
        filePath: sampleFilePath,
        fileUrl: '/uploads/test_material_doc.txt',
        fileType: 'text/plain',
        fileSize: 48,
        allowDownload: true,
        status: 'hidden',
      }),
    });
    const mat3Data = await createMat3Res.json();
    material3Id = mat3Data.data?.material?._id;

    if (material1Id && material2Id && material3Id) {
      logPass('Teacher 1 creates materials with download policies', 'Mat1 (DL allowed), Mat2 (View only), Mat3 (Hidden)');
    } else {
      logFail('Teacher 1 creates materials', 'Failed creating materials');
    }

    // Student fetches materials for Lesson 1: Hidden material 3 MUST NOT be returned
    const studentMatListRes = await fetch(`${API_BASE}/lessons/${lesson1Id}/materials`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    const studentMatListData = await studentMatListRes.json();
    const studentMats = studentMatListData.data?.materials || [];
    const hasHiddenMat3 = studentMats.some((m) => m._id === material3Id);

    if (!hasHiddenMat3 && studentMats.length === 2) {
      logPass('Student material view excludes hidden/draft materials', 'Only 2 published materials returned');
    } else {
      logFail('Hidden material leaked to student', JSON.stringify(studentMatListData));
    }

    // Student downloads Material 1 (allowDownload = true) -> Status 200
    const downloadMat1Res = await fetch(`${API_BASE}/materials/${material1Id}/download`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    if (downloadMat1Res.status === 200) {
      logPass('Student downloads permitted material successfully', 'HTTP 200 OK');
    } else {
      logFail('Student download permitted material failed', `HTTP ${downloadMat1Res.status}`);
    }

    // Student downloads Material 2 (allowDownload = false) -> MUST be 403 Forbidden!
    const downloadMat2Res = await fetch(`${API_BASE}/materials/${material2Id}/download`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    if (downloadMat2Res.status === 403) {
      logPass('Student download blocked when allowDownload=false', 'HTTP 403 Forbidden');
    } else {
      logFail('Security leak: Student downloaded material with allowDownload=false', `HTTP ${downloadMat2Res.status}`);
    }

    // ------------------------------------------------------------------------
    // 7. PUBLISH COURSE & VERIFY STUDENT ACCESS
    // ------------------------------------------------------------------------
    const publishCourseRes = await fetch(`${API_BASE}/admin/courses/${createdCourseId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${teacher1Token}`,
      },
      body: JSON.stringify({ isPublished: true }),
    });
    const publishCourseData = await publishCourseRes.json();

    if (publishCourseRes.status === 200 && publishCourseData.data?.course?.isPublished === true) {
      logPass('Teacher 1 publishes course', 'isPublished: true');
    } else {
      logFail('Publish course failed', JSON.stringify(publishCourseData));
    }

    // Student calls GET /courses -> course now appears!
    const studentCoursesAfterRes = await fetch(`${API_BASE}/courses`);
    const studentCoursesAfterData = await studentCoursesAfterRes.json();
    const studentListAfter = studentCoursesAfterData.data?.courses || [];
    const nowVisible = studentListAfter.some((c) => c._id === createdCourseId || c.id === createdCourseId);

    if (nowVisible) {
      logPass('Published course is now visible to students in GET /courses', `Course: ${createdCourseId}`);
    } else {
      logFail('Published course not visible to students', 'Course still not found in GET /courses');
    }

    // ------------------------------------------------------------------------
    // 8. SECURITY & RBAC ISOLATION (TEACHER 2 & STUDENT RESTRICTIONS)
    // ------------------------------------------------------------------------
    // Teacher 2 tries to update Teacher 1's course -> MUST return 403
    const t2UpdateRes = await fetch(`${API_BASE}/admin/courses/${createdCourseId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${teacher2Token}`,
      },
      body: JSON.stringify({ title: 'Hacked by Teacher 2' }),
    });
    if (t2UpdateRes.status === 403) {
      logPass('Teacher 2 cannot update Teacher 1 course', 'HTTP 403 Forbidden');
    } else {
      logFail('Security breach: Teacher 2 updated another teacher course', `HTTP ${t2UpdateRes.status}`);
    }

    // Teacher 2 tries to change course status -> MUST return 403
    const t2StatusRes = await fetch(`${API_BASE}/admin/courses/${createdCourseId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${teacher2Token}`,
      },
      body: JSON.stringify({ isPublished: false }),
    });
    if (t2StatusRes.status === 403) {
      logPass('Teacher 2 cannot toggle status of Teacher 1 course', 'HTTP 403 Forbidden');
    } else {
      logFail('Security breach: Teacher 2 changed status of another course', `HTTP ${t2StatusRes.status}`);
    }

    // Teacher 2 tries to delete Teacher 1's course -> MUST return 403
    const t2DeleteRes = await fetch(`${API_BASE}/admin/courses/${createdCourseId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${teacher2Token}` },
    });
    if (t2DeleteRes.status === 403) {
      logPass('Teacher 2 cannot delete Teacher 1 course', 'HTTP 403 Forbidden');
    } else {
      logFail('Security breach: Teacher 2 deleted another teacher course', `HTTP ${t2DeleteRes.status}`);
    }

    // Teacher 2 tries to delete Teacher 1's lesson -> MUST return 403
    const t2DelLessonRes = await fetch(`${API_BASE}/admin/lessons/${lesson1Id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${teacher2Token}` },
    });
    if (t2DelLessonRes.status === 403) {
      logPass('Teacher 2 cannot delete Teacher 1 lesson', 'HTTP 403 Forbidden');
    } else {
      logFail('Security breach: Teacher 2 deleted another teacher lesson', `HTTP ${t2DelLessonRes.status}`);
    }

    // Teacher 2 tries to delete Teacher 1's material -> MUST return 403
    const t2DelMatRes = await fetch(`${API_BASE}/admin/materials/${material1Id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${teacher2Token}` },
    });
    if (t2DelMatRes.status === 403) {
      logPass('Teacher 2 cannot delete Teacher 1 material', 'HTTP 403 Forbidden');
    } else {
      logFail('Security breach: Teacher 2 deleted another teacher material', `HTTP ${t2DelMatRes.status}`);
    }

    // Student tries to access admin courses API -> MUST return 403
    const studentAdminRes = await fetch(`${API_BASE}/admin/courses`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    if (studentAdminRes.status === 403) {
      logPass('Student blocked from admin courses endpoint', 'HTTP 403 Forbidden');
    } else {
      logFail('Security breach: Student accessed admin endpoint', `HTTP ${studentAdminRes.status}`);
    }

    // ------------------------------------------------------------------------
    // 9. SAFE DELETE & DATA INTEGRITY (BLOCK DELETE ON ACTIVE ENROLLMENT)
    // ------------------------------------------------------------------------
    // Enroll student in the course
    const enrollment = await Enrollment.create({
      student: studentId,
      course: createdCourseId,
      progress: 25,
      completedLessons: [lesson1Id],
    });

    // Teacher 1 attempts to delete course while student is enrolled -> MUST return 409 Conflict!
    const deleteBlockedRes = await fetch(`${API_BASE}/admin/courses/${createdCourseId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${teacher1Token}` },
    });
    if (deleteBlockedRes.status === 409) {
      logPass('Course deletion safely blocked when student is enrolled', 'HTTP 409 Conflict');
    } else {
      logFail('Safety violation: Course deleted while student was enrolled', `HTTP ${deleteBlockedRes.status}`);
    }

    // Remove enrollment and test safe cascade deletion
    await Enrollment.findByIdAndDelete(enrollment._id);

    // Delete single material
    const delMatRes = await fetch(`${API_BASE}/admin/materials/${material2Id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${teacher1Token}` },
    });
    if (delMatRes.status === 200) {
      const matCheck = await Material.findById(material2Id);
      if (!matCheck) {
        logPass('Single material deletion cleans up database record', 'Material deleted');
      } else {
        logFail('Material record still exists after deletion', '');
      }
    } else {
      logFail('Delete material failed', `HTTP ${delMatRes.status}`);
    }

    // Delete single lesson (Lesson 3)
    const delLessonRes = await fetch(`${API_BASE}/admin/lessons/${lesson3Id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${teacher1Token}` },
    });
    if (delLessonRes.status === 200) {
      const lessonCheck = await Lesson.findById(lesson3Id);
      if (!lessonCheck) {
        logPass('Single lesson deletion cleans up database record', 'Lesson deleted');
      } else {
        logFail('Lesson record still exists after deletion', '');
      }
    } else {
      logFail('Delete lesson failed', `HTTP ${delLessonRes.status}`);
    }

    // Delete entire course: should cascade delete all remaining lessons and materials
    const delCourseRes = await fetch(`${API_BASE}/admin/courses/${createdCourseId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${teacher1Token}` },
    });
    if (delCourseRes.status === 200) {
      const courseCheck = await Course.findById(createdCourseId);
      const remainingLessons = await Lesson.find({ course: createdCourseId });
      const remainingMats = await Material.find({ course: createdCourseId });

      if (!courseCheck && remainingLessons.length === 0 && remainingMats.length === 0) {
        logPass('Safe cascade deletion removed course, all remaining lessons and materials', '0 dangling records');
      } else {
        logFail('Cascade cleanup incomplete', `Lessons left: ${remainingLessons.length}, Mats left: ${remainingMats.length}`);
      }
    } else {
      logFail('Delete course failed', `HTTP ${delCourseRes.status}`);
    }

    // ------------------------------------------------------------------------
    // CLEANUP TEST USERS & TEMP FILE
    // ------------------------------------------------------------------------
    await User.deleteMany({ _id: { $in: [teacher1Id, teacher2Id, studentId, adminId] } });
    if (fs.existsSync(sampleFilePath)) {
      try { fs.unlinkSync(sampleFilePath); } catch (e) {}
    }

  } catch (err) {
    logFail('Test execution unhandled error', err.stack || err.message);
  } finally {
    await mongoose.disconnect();
  }

  console.log('\n================================================================');
  console.log(`📊 TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runCourseLessonMaterialE2E();
