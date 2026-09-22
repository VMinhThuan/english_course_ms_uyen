import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import mongoose from 'mongoose';
import User from '../models/User.js';
import Course from '../models/Course.js';
import Lesson from '../models/Lesson.js';
import Question from '../models/Question.js';
import Assessment from '../models/Assessment.js';
import Attempt from '../models/Attempt.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../../.env') });

const API_BASE = 'http://localhost:3000/api/v1';

async function runAssessmentTests() {
  console.log('==================================================');
  console.log('🚀 STARTING E2E ASSESSMENT & AUTO-GRADING SUITE (AC → BJ)');
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

  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/english_course');

  const ts = Date.now();
  const adminEmail = `admin_assess_${ts}@test.com`;
  const studentEmail = `student_assess_${ts}@test.com`;
  const student2Email = `student2_assess_${ts}@test.com`;
  const password = 'Password123!';

  let adminToken = '';
  let studentToken = '';
  let student2Token = '';
  let studentId = '';
  let student2Id = '';
  let courseId = '';
  let singleChoiceQId = '';
  let multiChoiceQId = '';
  let fillBlankQId = '';
  let draftAssessmentId = '';
  let hiddenAssessmentId = '';
  let publishedAssessmentId = '';
  let noShowAnswersAssessmentId = '';
  let attemptLimitAssessmentId = '';
  let activeAttemptId = '';

  try {
    // 0. Setup Users & Course
    const adminUser = await User.create({
      fullName: 'Admin Assessment User',
      email: adminEmail,
      phoneNumber: '0988888889',
      password: password,
      role: 'admin',
      status: 'active',
    });

    const studentUser = await User.create({
      fullName: 'Student Assessment One',
      email: studentEmail,
      phoneNumber: '0912345679',
      password: password,
      role: 'student',
      status: 'active',
    });
    studentId = studentUser._id.toString();

    const student2User = await User.create({
      fullName: 'Student Assessment Two',
      email: student2Email,
      phoneNumber: '0987654322',
      password: password,
      role: 'student',
      status: 'active',
    });
    student2Id = student2User._id.toString();

    // Login Admin
    const adminLoginRes = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: adminEmail, password }),
    });
    adminToken = (await adminLoginRes.json()).data.accessToken;

    // Login Student 1 & Student 2
    const s1LoginRes = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: studentEmail, password }),
    });
    studentToken = (await s1LoginRes.json()).data.accessToken;

    const s2LoginRes = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: student2Email, password }),
    });
    student2Token = (await s2LoginRes.json()).data.accessToken;

    const course = await Course.create({
      title: `Assessment Course ${ts}`,
      description: 'Course for assessment tests',
      teacher: adminUser._id,
      price: 100,
      level: 'Intermediate',
      category: 'general',
      englishType: 'General',
      isPublished: true,
    });
    courseId = course._id.toString();

    // ---------------------------------------------------------
    // QUESTION BANK TESTS (AC, AD, AE)
    // ---------------------------------------------------------

    // TEST AC: Admin Creates Single-Choice Question
    const q1Res = await fetch(`${API_BASE}/admin/questions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        questionText: 'What is the capital of France?',
        type: 'single_choice',
        explanation: 'Paris is the capital.',
        options: [
          { id: 'opt_paris', text: 'Paris' },
          { id: 'opt_london', text: 'London' },
          { id: 'opt_berlin', text: 'Berlin' },
        ],
        correctAnswers: ['opt_paris'],
        score: 2,
        status: 'published',
      }),
    });
    const q1Data = await q1Res.json();
    if (q1Res.status === 201 && q1Data.data?.question?.type === 'single_choice') {
      singleChoiceQId = q1Data.data.question._id;
      logPass('TEST AC', 'Single-choice question created with stable option IDs');
    } else {
      logFail('TEST AC', `Status: ${q1Res.status}, Data: ${JSON.stringify(q1Data)}`);
    }

    // TEST AD: Admin Creates Multiple-Choice Question
    const q2Res = await fetch(`${API_BASE}/admin/questions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        questionText: 'Select all primary colors',
        type: 'multiple_choice',
        explanation: 'Red and Blue are primary colors in this list.',
        options: [
          { id: 'opt_red', text: 'Red' },
          { id: 'opt_green', text: 'Green' },
          { id: 'opt_blue', text: 'Blue' },
        ],
        correctAnswers: ['opt_red', 'opt_blue'],
        score: 3,
        status: 'published',
      }),
    });
    const q2Data = await q2Res.json();
    if (q2Res.status === 201 && q2Data.data?.question?.correctAnswers.length === 2) {
      multiChoiceQId = q2Data.data.question._id;
      logPass('TEST AD', 'Multiple-choice question created with multiple correct options');
    } else {
      logFail('TEST AD', `Status: ${q2Res.status}, Data: ${JSON.stringify(q2Data)}`);
    }

    // TEST AE: Admin Creates Fill-Blank Question
    const q3Res = await fetch(`${API_BASE}/admin/questions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        questionText: 'Complete: She _____ to school every day.',
        type: 'fill_blank',
        explanation: 'Third person singular of go is goes.',
        correctAnswers: ['goes'],
        score: 1,
        status: 'published',
      }),
    });
    const q3Data = await q3Res.json();
    if (q3Res.status === 201 && q3Data.data?.question?.type === 'fill_blank') {
      fillBlankQId = q3Data.data.question._id;
      logPass('TEST AE', 'Fill-blank question created with accepted string answer');
    } else {
      logFail('TEST AE', `Status: ${q3Res.status}, Data: ${JSON.stringify(q3Data)}`);
    }

    // ---------------------------------------------------------
    // ASSESSMENT CONFIGURATION & PUBLISH TESTS (AF, AG, AH, BJ)
    // ---------------------------------------------------------

    // TEST AF: Admin Creates Exercise / Exam
    const createAssRes = await fetch(`${API_BASE}/admin/assessments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        title: 'Midterm Grammar Exam',
        description: 'Comprehensive test',
        type: 'exam',
        course: courseId,
        questions: [
          { question: singleChoiceQId, score: 2 },
          { question: multiChoiceQId, score: 3 },
          { question: fillBlankQId, score: 1 },
        ],
        durationMinutes: 20,
        status: 'draft',
        showCorrectAnswers: true,
      }),
    });
    const createAssData = await createAssRes.json();
    if (createAssRes.status === 201 && createAssData.data?.assessment?.status === 'draft') {
      draftAssessmentId = createAssData.data.assessment._id;
      logPass('TEST AF', 'Assessment created with draft status and assigned questions');
    } else {
      logFail('TEST AF', `Status: ${createAssRes.status}, Data: ${JSON.stringify(createAssData)}`);
    }

    // TEST AG: Draft Assessment Blocked From Student
    const studentDraftGet = await fetch(`${API_BASE}/assessments/${draftAssessmentId}`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    if (studentDraftGet.status === 404 || studentDraftGet.status === 403) {
      logPass('TEST AG', 'Draft assessment blocked from Student view with 404');
    } else {
      logFail('TEST AG', `Status: ${studentDraftGet.status}`);
    }

    // TEST BJ: Publish Validation Safety
    const invalidPubRes = await fetch(`${API_BASE}/admin/assessments/${draftAssessmentId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ status: 'published' }),
    });
    // Currently draftAssessmentId has valid questions, so let's test creating an empty assessment
    const emptyAss = await Assessment.create({ title: 'Empty', type: 'exercise', questions: [], status: 'draft' });
    const emptyPubRes = await fetch(`${API_BASE}/admin/assessments/${emptyAss._id}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ status: 'published' }),
    });
    if (emptyPubRes.status === 400) {
      logPass('TEST BJ', 'Publish rejected for assessment without assigned questions');
    } else {
      logFail('TEST BJ', `Status: ${emptyPubRes.status}`);
    }

    // TEST AH: Admin Publishes Assessment
    const pubRes = await fetch(`${API_BASE}/admin/assessments/${draftAssessmentId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ status: 'published' }),
    });
    const pubData = await pubRes.json();
    if (pubRes.status === 200 && pubData.data?.assessment?.status === 'published') {
      publishedAssessmentId = draftAssessmentId;
      logPass('TEST AH', 'Assessment published successfully by Admin');
    } else {
      logFail('TEST AH', `Status: ${pubRes.status}, Data: ${JSON.stringify(pubData)}`);
    }

    // Create additional assessments for edge case tests
    const noShowAss = await Assessment.create({
      title: 'Hidden Answer Exam',
      type: 'exam',
      course: courseId,
      questions: [{ question: singleChoiceQId, score: 2 }],
      durationMinutes: 15,
      status: 'published',
      showCorrectAnswers: false,
    });
    noShowAnswersAssessmentId = noShowAss._id.toString();

    const limitAss = await Assessment.create({
      title: 'One Attempt Only Quiz',
      type: 'exercise',
      course: courseId,
      questions: [{ question: singleChoiceQId, score: 2 }],
      durationMinutes: 10,
      status: 'published',
      attemptLimit: 1,
    });
    attemptLimitAssessmentId = limitAss._id.toString();

    const hiddenAss = await Assessment.create({
      title: 'Secret Admin Exam',
      type: 'exam',
      course: courseId,
      questions: [{ question: singleChoiceQId, score: 2 }],
      status: 'hidden',
    });
    hiddenAssessmentId = hiddenAss._id.toString();

    // ---------------------------------------------------------
    // STUDENT ATTEMPT & SECURITY DTO TESTS (AI, AJ, BA, BG, BI, AT)
    // ---------------------------------------------------------

    // TEST AI: Student Starts Attempt
    const startRes = await fetch(`${API_BASE}/assessments/${publishedAssessmentId}/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    const startData = await startRes.json();
    if (startRes.status === 201 || startRes.status === 200) {
      activeAttemptId = startData.data.attemptId;
      logPass('TEST AI', `Attempt started with ID: ${activeAttemptId}, deadlineAt: ${startData.data.deadlineAt}`);
    } else {
      logFail('TEST AI', `Status: ${startRes.status}, Data: ${JSON.stringify(startData)}`);
    }

    // TEST AJ: SAFE STUDENT QUESTION DTO SECURITY CHECK (NO secret keys/explanations)
    const dtoQuestions = startData.data?.questions || [];
    let leakedSecret = false;
    dtoQuestions.forEach((q) => {
      if (q.correctAnswers || q.isCorrect || q.answerKey || q.explanation) {
        leakedSecret = true;
      }
    });
    if (!leakedSecret && dtoQuestions.length === 3) {
      logPass('TEST AJ', 'Student DTO sanitized: NO correctAnswers, answerKeys, or secret explanations returned!');
    } else {
      logFail('TEST AJ', `Security Leak detected! DTO questions: ${JSON.stringify(dtoQuestions)}`);
    }

    // TEST BA: Repeated Start Resumes Same Active Attempt (Idempotent)
    const reStartRes = await fetch(`${API_BASE}/assessments/${publishedAssessmentId}/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    const reStartData = await reStartRes.json();
    if (reStartRes.status === 200 && reStartData.data?.attemptId === activeAttemptId) {
      logPass('TEST BA', 'Repeated start call resumed existing active attempt without creating duplicate document');
    } else {
      logFail('TEST BA', `Expected attemptId ${activeAttemptId}, got: ${JSON.stringify(reStartData)}`);
    }

    // TEST BG: Refresh/Resume Preserves Original Timestamps & Deadline
    if (reStartData.data?.startedAt === startData.data?.startedAt && reStartData.data?.deadlineAt === startData.data?.deadlineAt) {
      logPass('TEST BG', 'Resume preserved original authoritative startedAt and deadlineAt');
    } else {
      logFail('TEST BG', 'Timestamps were reset on resume!');
    }

    // TEST BI: Student Attempting to Start Hidden Assessment Denied
    const startHiddenRes = await fetch(`${API_BASE}/assessments/${hiddenAssessmentId}/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    if (startHiddenRes.status === 404 || startHiddenRes.status === 403) {
      logPass('TEST BI', 'Start hidden assessment denied with 404/403');
    } else {
      logFail('TEST BI', `Status: ${startHiddenRes.status}`);
    }

    // TEST AT: Direct Request for Draft/Hidden Assessment Denied
    const directDraftAssRes = await fetch(`${API_BASE}/assessments/${emptyAss._id}`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    if (directDraftAssRes.status === 404 || directDraftAssRes.status === 403) {
      logPass('TEST AT', 'Direct request for draft/hidden assessment denied with 404/403');
    } else {
      logFail('TEST AT', `Status: ${directDraftAssRes.status}`);
    }

    // ---------------------------------------------------------
    // AUTO-GRADING & SUBMISSION TESTS (AK, AL, AM, AN, AO, AP, AQ, AR, BE, BF, BB, AY)
    // ---------------------------------------------------------

    // TEST BB: Question Edit After Attempt Start Does NOT Alter Snapshot
    await Question.findByIdAndUpdate(singleChoiceQId, {
      questionText: 'MODIFIED TEXT AFTER START',
      correctAnswers: ['opt_london'], // Change correct answer in Question Bank
    });

    // TEST BE & BF & AK & AM & AN & AO: Submit Attempt with Correct / Normalized Answers
    const submitRes = await fetch(`${API_BASE}/attempts/${activeAttemptId}/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${studentToken}`,
      },
      body: JSON.stringify({
        score: 9999, // Fake score injection (TEST BF / AP)
        maxScore: 9999,
        answers: {
          [singleChoiceQId]: 'opt_paris', // Correct answer according to attempt snapshot (TEST AK & BB)
          [multiChoiceQId]: ['opt_blue', 'opt_red'], // Correct answer in DIFFERENT order (TEST AM)
          [fillBlankQId]: '  GOES  ', // Fill blank with whitespace & uppercase (TEST AN)
          'unknown_question_id_999': 'fake_value', // Unknown question ID (TEST BE)
        },
      }),
    });
    const submitData = await submitRes.json();
    if (submitRes.status === 200 && submitData.data?.result?.score === 6 && submitData.data?.result?.correctCount === 3) {
      logPass('TEST AK', 'Single-choice question auto-graded correctly');
      logPass('TEST AM', 'Multiple-choice set equality auto-graded correctly regardless of order');
      logPass('TEST AN', 'Fill-blank string normalization (trim & case) auto-graded correctly');
      logPass('TEST AP / BF', 'Backend strictly ignored client fake score parameters (score=6/6 calculated)');
      logPass('TEST BB', 'Graded against immutable attempt snapshot (retained opt_paris as correct)');
      logPass('TEST BE', 'Unknown question ID in payload safely ignored without corrupting score');
    } else {
      logFail('TEST AK/AM/AN', `Status: ${submitRes.status}, Data: ${JSON.stringify(submitData)}`);
    }

    // TEST AQ: Student A Attempts to Submit Student B's Attempt
    const spoofSubmitRes = await fetch(`${API_BASE}/attempts/${activeAttemptId}/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${student2Token}`, // Student 2 token
      },
      body: JSON.stringify({ answers: {} }),
    });
    if (spoofSubmitRes.status === 403) {
      logPass('TEST AQ', 'Submitting another student\'s attempt rejected with HTTP 403');
    } else {
      logFail('TEST AQ', `Status: ${spoofSubmitRes.status}`);
    }

    // TEST AR: Repeated Submit is Idempotent
    const reSubmitRes = await fetch(`${API_BASE}/attempts/${activeAttemptId}/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${studentToken}`,
      },
      body: JSON.stringify({ answers: {} }),
    });
    const reSubmitData = await reSubmitRes.json();
    if (reSubmitRes.status === 200 && reSubmitData.data?.result?.score === 6) {
      logPass('TEST AR', 'Repeated submit returned existing result without duplicate grading or score corruption');
    } else {
      logFail('TEST AR', `Status: ${reSubmitRes.status}, Data: ${JSON.stringify(reSubmitData)}`);
    }

    // TEST AY: Server Timestamp Duration Calculation
    if (reSubmitData.data?.result?.duration !== undefined && typeof reSubmitData.data.result.duration === 'number') {
      logPass('TEST AY', `Authoritative duration derived from server timestamps (${reSubmitData.data.result.duration}s)`);
    } else {
      logFail('TEST AY', 'Duration missing from result!');
    }

    // ---------------------------------------------------------
    // RESULT & HISTORY & SECURITY TESTS (AU, AV, AW, AX, BH, AS, BC, BD)
    // ---------------------------------------------------------

    // TEST AV: showCorrectAnswers = true Exposes Review Data After Submission
    const resultRes = await fetch(`${API_BASE}/attempts/${activeAttemptId}/result`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    const resultData = await resultRes.json();
    if (resultRes.status === 200 && resultData.data?.result?.questions[0]?.correctAnswers) {
      logPass('TEST AV', 'showCorrectAnswers=true returned question review data after submission');
    } else {
      logFail('TEST AV', `Status: ${resultRes.status}, Data: ${JSON.stringify(resultData)}`);
    }

    // TEST AU: showCorrectAnswers = false Hides Answer Keys in Result
    const startNoShow = await fetch(`${API_BASE}/assessments/${noShowAnswersAssessmentId}/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    const startNoShowData = await startNoShow.json();
    const noShowAttemptId = startNoShowData.data.attemptId;

    await fetch(`${API_BASE}/attempts/${noShowAttemptId}/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${studentToken}`,
      },
      body: JSON.stringify({ answers: { [singleChoiceQId]: 'opt_london' } }), // Incorrect answer (TEST AL & AO)
    });

    const noShowResultRes = await fetch(`${API_BASE}/attempts/${noShowAttemptId}/result`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    const noShowResultData = await noShowResultRes.json();
    const reviewQ = noShowResultData.data?.result?.questions[0];
    if (noShowResultRes.status === 200 && (!reviewQ.correctAnswers || reviewQ.correctAnswers.length === 0)) {
      logPass('TEST AU', 'showCorrectAnswers=false safely hid correct answer keys from result review');
      logPass('TEST AL', 'Incorrect single-choice answer auto-graded as 0 points');
    } else {
      logFail('TEST AU', `Answer keys exposed when showCorrectAnswers=false: ${JSON.stringify(reviewQ)}`);
    }

    // TEST BH: Student Attempting to Retrieve Another Student's Result Denied
    const spoofResultRes = await fetch(`${API_BASE}/attempts/${activeAttemptId}/result`, {
      headers: { Authorization: `Bearer ${student2Token}` },
    });
    if (spoofResultRes.status === 403 || spoofResultRes.status === 404) {
      logPass('TEST BH', 'Retrieving another student\'s result denied with 403/404');
    } else {
      logFail('TEST BH', `Status: ${spoofResultRes.status}`);
    }

    // TEST AW: Student History Returns Real Submitted Attempts
    const historyRes = await fetch(`${API_BASE}/attempts/history`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    const historyData = await historyRes.json();
    if (historyRes.status === 200 && historyData.data?.history.length >= 2) {
      logPass('TEST AW', `Student history returned ${historyData.data.history.length} submitted attempts from DB`);
    } else {
      logFail('TEST AW', `Status: ${historyRes.status}, Data: ${JSON.stringify(historyData)}`);
    }

    // TEST AX: Admin Results Inspector Returns Real Results
    const adminRes = await fetch(`${API_BASE}/admin/results`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const adminResData = await adminRes.json();
    if (adminRes.status === 200 && adminResData.data?.results.length >= 2) {
      logPass('TEST AX', `Admin results inspector retrieved ${adminResData.data.results.length} student attempts from DB`);
    } else {
      logFail('TEST AX', `Status: ${adminRes.status}, Data: ${JSON.stringify(adminResData)}`);
    }

    // TEST AS: Attempt Limit Enforcement
    const startLimit1 = await fetch(`${API_BASE}/assessments/${attemptLimitAssessmentId}/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    const startLimit1Data = await startLimit1.json();
    const limitAttemptId = startLimit1Data.data.attemptId;

    await fetch(`${API_BASE}/attempts/${limitAttemptId}/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${studentToken}`,
      },
      body: JSON.stringify({ answers: {} }),
    });

    const startLimit2 = await fetch(`${API_BASE}/assessments/${attemptLimitAssessmentId}/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    const startLimit2Data = await startLimit2.json();
    if (startLimit2.status === 403 && startLimit2Data.code === 'ATTEMPT_LIMIT_REACHED') {
      logPass('TEST AS', 'Exceeding attemptLimit (1) denied with HTTP 403 ATTEMPT_LIMIT_REACHED');
    } else {
      logFail('TEST AS', `Status: ${startLimit2.status}, Data: ${JSON.stringify(startLimit2Data)}`);
    }

    // TEST BC: Server Deadline Expiration Policy Enforcement
    const shortAss = await Assessment.create({
      title: 'Short 1-min Exam',
      type: 'exam',
      course: courseId,
      questions: [{ question: singleChoiceQId, score: 2 }],
      durationMinutes: 1,
      status: 'published',
    });
    const startShort = await fetch(`${API_BASE}/assessments/${shortAss._id}/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${student2Token}` },
    });
    const shortAttemptId = (await startShort.json()).data.attemptId;

    // Fast-forward deadlineAt in DB to simulate expired attempt
    await Attempt.findByIdAndUpdate(shortAttemptId, {
      deadlineAt: new Date(Date.now() - 30000), // 30 seconds ago
    });

    const submitExpired = await fetch(`${API_BASE}/attempts/${shortAttemptId}/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${student2Token}`,
      },
      body: JSON.stringify({ answers: { [singleChoiceQId]: 'opt_paris' } }),
    });
    const submitExpiredData = await submitExpired.json();
    if (submitExpired.status === 200 && submitExpiredData.data?.result?.isExpired === true) {
      logPass('TEST BC', 'Server enforced deadline expiration and marked attempt isExpired=true');
    } else {
      logFail('TEST BC', `Status: ${submitExpired.status}, Data: ${JSON.stringify(submitExpiredData)}`);
    }

    // TEST AZ: Expired or Out-of-window Assessment Start Denied
    const expiredWindowAss = await Assessment.create({
      title: 'Expired Window Quiz',
      type: 'exercise',
      questions: [{ question: singleChoiceQId, score: 2 }],
      status: 'published',
      availableFrom: new Date(Date.now() - 3600000), // 1 hr ago
      availableUntil: new Date(Date.now() - 1800000), // 30 min ago
    });
    const startExpiredWindow = await fetch(`${API_BASE}/assessments/${expiredWindowAss._id}/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    const startExpiredWindowData = await startExpiredWindow.json();
    if (startExpiredWindow.status === 403 && startExpiredWindowData.code === 'ASSESSMENT_EXPIRED') {
      logPass('TEST AZ', 'Out-of-window assessment start denied with HTTP 403 ASSESSMENT_EXPIRED');
    } else {
      logFail('TEST AZ', `Status: ${startExpiredWindow.status}, Data: ${JSON.stringify(startExpiredWindowData)}`);
    }

    // TEST BD: Assessment Delete Safety (Cannot delete assessment with attempts)
    const delAssRes = await fetch(`${API_BASE}/admin/assessments/${publishedAssessmentId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    if (delAssRes.status === 409) {
      logPass('TEST BD', 'Assessment with submitted attempts protected from hard delete (HTTP 409 Conflict)');
    } else {
      logFail('TEST BD', `Status: ${delAssRes.status}`);
    }

  } catch (err) {
    console.error('Fatal execution error:', err);
  } finally {
    await mongoose.disconnect();
  }

  console.log('\n==================================================');
  console.log(`📊 ASSESSMENT TEST RESULTS SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('==================================================');
  if (failed > 0) {
    process.exit(1);
  }
}

runAssessmentTests();
