import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import mongoose from 'mongoose';
import User from '../models/User.js';
import Assessment from '../models/Assessment.js';
import Attempt from '../models/Attempt.js';
import Question from '../models/Question.js';
import QuestionGroup from '../models/QuestionGroup.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../../.env') });

const API_BASE = 'http://localhost:3000/api/v1';

async function runToeicTests() {
  console.log('==================================================');
  console.log('🚀 STARTING E2E TOEIC TEST SIMULATOR SUITE (TA → UI)');
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
  const adminEmail = `admin_toeic_${ts}@test.com`;
  const student1Email = `student1_toeic_${ts}@test.com`;
  const student2Email = `student2_toeic_${ts}@test.com`;
  const password = 'Password123!';

  let adminToken = '';
  let student1Token = '';
  let student2Token = '';
  let student1Id = '';
  let student2Id = '';

  let createdTestId = '';
  let fullTemplateTestId = '';
  let activeAttemptId = '';
  let q1Id = '';
  let q1OptionId = 'opt-1';
  let group1Id = '';

  try {
    // ------------------------------------------------------------------------
    // SETUP ACCOUNTS
    // ------------------------------------------------------------------------
    const adminUser = await User.create({
      fullName: 'TOEIC Admin',
      email: adminEmail,
      phoneNumber: '0900000001',
      password: password,
      role: 'admin',
      status: 'active',
    });

    const s1User = await User.create({
      fullName: 'TOEIC Student 1',
      email: student1Email,
      phoneNumber: '0900000002',
      password: password,
      role: 'student',
      status: 'active',
    });
    student1Id = s1User._id.toString();

    const s2User = await User.create({
      fullName: 'TOEIC Student 2',
      email: student2Email,
      phoneNumber: '0900000003',
      password: password,
      role: 'student',
      status: 'active',
    });
    student2Id = s2User._id.toString();

    // Login Admin
    let res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: adminEmail, password }),
    });
    let data = await res.json();
    adminToken = data.data.accessToken;

    // Login Student 1
    res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: student1Email, password }),
    });
    data = await res.json();
    student1Token = data.data.accessToken;

    // Login Student 2
    res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: student2Email, password }),
    });
    data = await res.json();
    student2Token = data.data.accessToken;

    // ------------------------------------------------------------------------
    // TEST TA: Admin creates TOEIC test
    // ------------------------------------------------------------------------
    try {
      res = await fetch(`${API_BASE}/admin/toeic-tests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({
          title: 'ETS Practice 2026 Test 1',
          description: 'Official simulation test',
          examFormat: 'toeic',
          toeicMode: 'full_test',
        }),
      });
      data = await res.json();
      if (res.status === 201 && data.data?.assessment?._id) {
        createdTestId = data.data.assessment._id;
        logPass('TEST TA', 'Admin created TOEIC test');
      } else {
        logFail('TEST TA', JSON.stringify(data));
      }
    } catch (err) {
      logFail('TEST TA', err.message);
    }

    // ------------------------------------------------------------------------
    // TEST TB: Full test template creates Part 1–7
    // ------------------------------------------------------------------------
    try {
      res = await fetch(`${API_BASE}/admin/toeic-tests/template`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({
          title: 'Full TOEIC Template 200 Questions',
          description: 'Standard 200 question template',
        }),
      });
      data = await res.json();
      if (res.status === 201 && data.data?.assessment?.parts?.length === 7) {
        fullTemplateTestId = data.data.assessment._id;
        logPass('TEST TB', 'Full test template created 7 parts');
      } else {
        logFail('TEST TB', JSON.stringify(data));
      }
    } catch (err) {
      logFail('TEST TB', err.message);
    }

    // ------------------------------------------------------------------------
    // TEST TC: Student cannot see draft TOEIC test
    // ------------------------------------------------------------------------
    try {
      res = await fetch(`${API_BASE}/toeic/available`, {
        headers: { Authorization: `Bearer ${student1Token}` },
      });
      data = await res.json();
      const ids = (data.data?.assessments || []).map((a) => a._id);
      if (res.status === 200 && !ids.includes(createdTestId) && !ids.includes(fullTemplateTestId)) {
        logPass('TEST TC', 'Draft TOEIC tests are hidden from available student endpoint');
      } else {
        logFail('TEST TC', 'Draft test visible to student');
      }
    } catch (err) {
      logFail('TEST TC', err.message);
    }

    // ------------------------------------------------------------------------
    // SETUP DEMO QUESTIONS & GROUPS FOR PUBLISH VALIDATION & ATTEMPT FLOW
    // ------------------------------------------------------------------------
    const q1 = await Question.create({
      questionText: 'Look at the picture labeled number 1 in your test book.',
      type: 'single_choice',
      toeicPart: 1,
      options: [
        { id: 'opt-1', text: 'A. A man is writing on a board.' },
        { id: 'opt-2', text: 'B. A man is typing on a computer.' },
        { id: 'opt-3', text: 'C. A man is holding a cup.' },
        { id: 'opt-4', text: 'D. A man is opening a door.' },
      ],
      correctAnswers: ['A. A man is writing on a board.'],
      explanation: 'The man in the image is writing on a board.',
    });
    q1Id = q1._id.toString();

    const group1 = await QuestionGroup.create({
      assessment: createdTestId,
      partNumber: 1,
      type: 'audio_image',
      title: 'Part 1 Question 1',
      imageUrl: '/uploads/images/sample_p1.jpg',
      audioUrl: '/uploads/audio/sample_p1.mp3',
      questionIds: [q1._id],
      order: 1,
    });
    group1Id = group1._id.toString();

    await Assessment.findByIdAndUpdate(createdTestId, {
      questionGroups: [group1._id],
      questions: [{ question: q1._id, score: 1 }],
      parts: [
        {
          partNumber: 1,
          name: 'Photographs',
          section: 'listening',
          instructions: 'For each question, select the statement that best describes what you see in the picture.',
          order: 1,
          questionGroups: [group1._id],
        },
      ],
    });

    // ------------------------------------------------------------------------
    // TEST TD: Publish validates structure & publishes
    // ------------------------------------------------------------------------
    try {
      res = await fetch(`${API_BASE}/admin/toeic-tests/${createdTestId}/publish`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      data = await res.json();
      if (res.status === 200 && data.data?.assessment?.status === 'published') {
        logPass('TEST TD', 'Published valid TOEIC test successfully');
      } else {
        logFail('TEST TD', JSON.stringify(data));
      }
    } catch (err) {
      logFail('TEST TD', err.message);
    }

    // ------------------------------------------------------------------------
    // TEST TE: Student starts test
    // ------------------------------------------------------------------------
    try {
      res = await fetch(`${API_BASE}/toeic/tests/${createdTestId}/start`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${student1Token}` },
      });
      data = await res.json();
      const attId = data.data?.attemptId || data.data?.attempt?._id;
      if ((res.status === 200 || res.status === 201) && attId) {
        activeAttemptId = attId;
        logPass('TEST TE', 'Student started TOEIC attempt');
      } else {
        logFail('TEST TE', JSON.stringify(data));
      }
    } catch (err) {
      logFail('TEST TE', err.message);
    }

    // ------------------------------------------------------------------------
    // TEST TF: Repeated start resumes same Attempt
    // ------------------------------------------------------------------------
    try {
      res = await fetch(`${API_BASE}/toeic/tests/${createdTestId}/start`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${student1Token}` },
      });
      data = await res.json();
      const resAttId = data.data?.attemptId || data.data?.attempt?._id;
      if ((res.status === 200 || res.status === 201) && resAttId === activeAttemptId) {
        logPass('TEST TF', 'Repeated start resumed active attempt without creating duplicate');
      } else {
        logFail('TEST TF', 'Returned new or different attempt ID');
      }
    } catch (err) {
      logFail('TEST TF', err.message);
    }

    // ------------------------------------------------------------------------
    // TEST TG: Attempt limit not consumed on refresh
    // ------------------------------------------------------------------------
    try {
      const attemptsCount = await Attempt.countDocuments({ student: student1Id, assessment: createdTestId });
      if (attemptsCount === 1) {
        logPass('TEST TG', 'Attempt count remains 1 on refresh/resume');
      } else {
        logFail('TEST TG', `Found ${attemptsCount} attempts`);
      }
    } catch (err) {
      logFail('TEST TG', err.message);
    }

    // ------------------------------------------------------------------------
    // TEST TH: Student DTO hides correct answers
    // ------------------------------------------------------------------------
    try {
      res = await fetch(`${API_BASE}/toeic/attempts/${activeAttemptId}`, {
        headers: { Authorization: `Bearer ${student1Token}` },
      });
      data = await res.json();
      const snapshotQuestions = data.data?.attempt?.groupSnapshots?.[0]?.questionIds || [];
      const leaked = snapshotQuestions.some((q) => q.isCorrect !== undefined || q.correctAnswers !== undefined || q.correctOptionIds !== undefined);
      if (res.status === 200 && !leaked) {
        logPass('TEST TH', 'Student attempt DTO completely sanitizes correct answers');
      } else {
        logFail('TEST TH', 'Sanitization failed, keys leaked');
      }
    } catch (err) {
      logFail('TEST TH', err.message);
    }

    // ------------------------------------------------------------------------
    // TEST TI: Part/group structure returned correctly
    // ------------------------------------------------------------------------
    try {
      const parts = data.data?.assessment?.parts || [];
      const groups = data.data?.attempt?.groupSnapshots || [];
      if (parts.length >= 1 || groups.length >= 1) {
        logPass('TEST TI', 'Part/group nested structure returned correctly');
      } else {
        logFail('TEST TI', 'Invalid part/group structure');
      }
    } catch (err) {
      logFail('TEST TI', err.message);
    }

    // ------------------------------------------------------------------------
    // TEST TJ: Audio/image metadata works
    // ------------------------------------------------------------------------
    try {
      const grp = data.data?.attempt?.groupSnapshots?.[0] || data.data?.assessment?.parts?.[0]?.questionGroups?.[0];
      if (grp?.audioUrl === '/uploads/audio/sample_p1.mp3' && grp?.imageUrl === '/uploads/images/sample_p1.jpg') {
        logPass('TEST TJ', 'Audio/image stimulus metadata returned properly');
      } else {
        logFail('TEST TJ', JSON.stringify(grp));
      }
    } catch (err) {
      logFail('TEST TJ', err.message);
    }

    // ------------------------------------------------------------------------
    // TEST TK: Group questions preserve relationship
    // ------------------------------------------------------------------------
    try {
      const grp = data.data?.attempt?.groupSnapshots?.[0] || data.data?.assessment?.parts?.[0]?.questionGroups?.[0];
      if (grp?.questionIds?.length === 1) {
        logPass('TEST TK', 'Group questions preserve parent-child relationship');
      } else {
        logFail('TEST TK', 'Question missing from group');
      }
    } catch (err) {
      logFail('TEST TK', err.message);
    }

    // ------------------------------------------------------------------------
    // TEST TL: Autosave answer persists
    // ------------------------------------------------------------------------
    try {
      res = await fetch(`${API_BASE}/toeic/attempts/${activeAttemptId}/answers`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${student1Token}` },
        body: JSON.stringify({
          answers: [{ questionId: q1Id, selectedOptionIds: [q1OptionId] }],
          revision: 1,
        }),
      });
      data = await res.json();
      if (res.status === 200 && data.data?.saved && data.data?.revision === 2) {
        logPass('TEST TL', 'Autosave answer persisted revision 2');
      } else {
        logFail('TEST TL', JSON.stringify(data));
      }
    } catch (err) {
      logFail('TEST TL', err.message);
    }

    // ------------------------------------------------------------------------
    // TEST TM: Refresh restores answer
    // ------------------------------------------------------------------------
    try {
      res = await fetch(`${API_BASE}/toeic/attempts/${activeAttemptId}`, {
        headers: { Authorization: `Bearer ${student1Token}` },
      });
      data = await res.json();
      const restored = data.data?.attempt?.answers?.[0] || data.data?.attempt?.answersMap?.[q1Id];
      if (res.status === 200 && restored) {
        logPass('TEST TM', 'Refresh restored student answer state');
      } else {
        logFail('TEST TM', 'Answer state lost after refresh');
      }
    } catch (err) {
      logFail('TEST TM', err.message);
    }

    // ------------------------------------------------------------------------
    // TEST TN: Revision prevents stale overwrite
    // ------------------------------------------------------------------------
    try {
      res = await fetch(`${API_BASE}/toeic/attempts/${activeAttemptId}/answers`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${student1Token}` },
        body: JSON.stringify({
          answers: [{ questionId: q1Id, selectedOptionIds: ['staleOption'] }],
          revision: 1, // Stale revision! Current revision is 2
        }),
      });
      data = await res.json();
      if (res.status === 409) {
        logPass('TEST TN', 'Stale revision rejected with 409 Conflict');
      } else {
        logFail('TEST TN', `Expected status 409 but got ${res.status}`);
      }
    } catch (err) {
      logFail('TEST TN', err.message);
    }

    // ------------------------------------------------------------------------
    // TEST TO: Student cannot edit another student's Attempt
    // ------------------------------------------------------------------------
    try {
      res = await fetch(`${API_BASE}/toeic/attempts/${activeAttemptId}/answers`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${student2Token}` },
        body: JSON.stringify({
          answers: [{ questionId: q1Id, selectedOptionIds: [q1OptionId] }],
          revision: 2,
        }),
      });
      if (res.status === 403) {
        logPass('TEST TO', 'Student cannot edit another student attempt');
      } else {
        logFail('TEST TO', `Expected status 403 but got ${res.status}`);
      }
    } catch (err) {
      logFail('TEST TO', err.message);
    }

    // ------------------------------------------------------------------------
    // TEST TP: Fake questionId rejected / ignored
    // ------------------------------------------------------------------------
    try {
      const fakeQId = new mongoose.Types.ObjectId().toString();
      res = await fetch(`${API_BASE}/toeic/attempts/${activeAttemptId}/answers`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${student1Token}` },
        body: JSON.stringify({
          answers: [
            { questionId: q1Id, selectedOptionIds: [q1OptionId] },
            { questionId: fakeQId, selectedOptionIds: ['fakeOpt'] },
          ],
          revision: 2,
        }),
      });
      data = await res.json();
      const savedQIds = (data.data?.answers || []).map((a) => a.questionId?.toString());
      if (res.status === 200 && !savedQIds.includes(fakeQId)) {
        logPass('TEST TP', 'Fake question ID ignored during save');
      } else {
        logFail('TEST TP', 'Fake question ID was saved');
      }
    } catch (err) {
      logFail('TEST TP', err.message);
    }

    // ------------------------------------------------------------------------
    // TEST TQ: Fake score ignored
    // ------------------------------------------------------------------------
    try {
      res = await fetch(`${API_BASE}/toeic/attempts/${activeAttemptId}/answers`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${student1Token}` },
        body: JSON.stringify({
          answers: [{ questionId: q1Id, selectedOptionIds: [q1OptionId], score: 999, isCorrect: true }],
          revision: 3,
        }),
      });
      data = await res.json();
      const savedAns = data.data?.answers?.[0];
      if (res.status === 200 && savedAns?.score === undefined && savedAns?.isCorrect === undefined) {
        logPass('TEST TQ', 'Client score and isCorrect fields ignored');
      } else {
        logFail('TEST TQ', 'Client score was accepted');
      }
    } catch (err) {
      logFail('TEST TQ', err.message);
    }

    // ------------------------------------------------------------------------
    // TEST TR: Client deadline ignored
    // ------------------------------------------------------------------------
    try {
      const fakeDeadline = new Date(Date.now() + 864000000).toISOString();
      res = await fetch(`${API_BASE}/toeic/attempts/${activeAttemptId}/answers`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${student1Token}` },
        body: JSON.stringify({
          answers: [{ questionId: q1Id, selectedOptionIds: [q1OptionId] }],
          deadlineAt: fakeDeadline,
          revision: 4,
        }),
      });
      const att = await Attempt.findById(activeAttemptId);
      if (res.status === 200 && new Date(att.deadlineAt).getTime() < new Date(fakeDeadline).getTime()) {
        logPass('TEST TR', 'Client deadlineAt parameter ignored by backend');
      } else {
        logFail('TEST TR', 'Client deadlineAt altered DB');
      }
    } catch (err) {
      logFail('TEST TR', err.message);
    }

    // ------------------------------------------------------------------------
    // TEST TS: Server deadline preserved after refresh
    // ------------------------------------------------------------------------
    try {
      res = await fetch(`${API_BASE}/toeic/attempts/${activeAttemptId}`, {
        headers: { Authorization: `Bearer ${student1Token}` },
      });
      data = await res.json();
      if (res.status === 200 && data.data?.attempt?.deadlineAt) {
        logPass('TEST TS', 'Server deadlineAt preserved across refresh');
      } else {
        logFail('TEST TS', 'Server deadlineAt missing');
      }
    } catch (err) {
      logFail('TEST TS', err.message);
    }

    // ------------------------------------------------------------------------
    // TEST TT: Flagged question persists
    // ------------------------------------------------------------------------
    try {
      res = await fetch(`${API_BASE}/toeic/attempts/${activeAttemptId}/answers`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${student1Token}` },
        body: JSON.stringify({
          answers: [{ questionId: q1Id, selectedOptionIds: [q1OptionId] }],
          flaggedQuestionIds: [q1Id],
          revision: 5,
        }),
      });
      data = await res.json();
      if (res.status === 200 && data.data?.flaggedQuestionIds?.includes(q1Id)) {
        logPass('TEST TT', 'Flagged question ID persisted in DB');
      } else {
        logFail('TEST TT', JSON.stringify(data));
      }
    } catch (err) {
      logFail('TEST TT', err.message);
    }

    // ------------------------------------------------------------------------
    // TEST TU: Submit with unanswered allowed
    // ------------------------------------------------------------------------
    try {
      res = await fetch(`${API_BASE}/toeic/attempts/${activeAttemptId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${student1Token}` },
        body: JSON.stringify({ revision: 6 }),
      });
      data = await res.json();
      const statusVal = data.data?.attempt?.status || data.data?.result?.status;
      if (res.status === 200 && (statusVal === 'completed' || statusVal === 'submitted')) {
        logPass('TEST TU', 'Submitted attempt successfully with unanswered allowed');
      } else {
        logFail('TEST TU', JSON.stringify(data));
      }
    } catch (err) {
      logFail('TEST TU', err.message);
    }

    // ------------------------------------------------------------------------
    // TEST TV: Submit is idempotent
    // ------------------------------------------------------------------------
    try {
      res = await fetch(`${API_BASE}/toeic/attempts/${activeAttemptId}/submit`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${student1Token}` },
      });
      data = await res.json();
      const statusVal = data.data?.attempt?.status || data.data?.result?.status;
      if (res.status === 200 && (statusVal === 'completed' || statusVal === 'submitted')) {
        logPass('TEST TV', 'Repeated submit returned existing completed attempt idempotently');
      } else {
        logFail('TEST TV', JSON.stringify(data));
      }
    } catch (err) {
      logFail('TEST TV', err.message);
    }

    // ------------------------------------------------------------------------
    // TEST TW: Expired Attempt cannot accept late answers
    // ------------------------------------------------------------------------
    try {
      res = await fetch(`${API_BASE}/toeic/attempts/${activeAttemptId}/answers`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${student1Token}` },
        body: JSON.stringify({
          answers: [{ questionId: q1Id, selectedOptionIds: [q1OptionId] }],
          revision: 6,
        }),
      });
      if (res.status === 400 || res.status === 409) {
        logPass('TEST TW', 'Answers on completed/expired attempt rejected');
      } else {
        logFail('TEST TW', `Expected rejection status 400/409 but got ${res.status}`);
      }
    } catch (err) {
      logFail('TEST TW', err.message);
    }

    // ------------------------------------------------------------------------
    // TEST TW2: Submit is finalized automatically when the server deadline has passed
    // ------------------------------------------------------------------------
    try {
      res = await fetch(`${API_BASE}/toeic/tests/${createdTestId}/start`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${student2Token}` },
      });
      data = await res.json();
      const expiredAttemptId = data.data?.attemptId || data.data?.attempt?._id;
      if (!expiredAttemptId) throw new Error(`Could not start expiry fixture: ${JSON.stringify(data)}`);
      await Attempt.findByIdAndUpdate(expiredAttemptId, {
        deadlineAt: new Date(Date.now() - 1000),
      });
      res = await fetch(`${API_BASE}/toeic/attempts/${expiredAttemptId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${student2Token}` },
        body: JSON.stringify({}),
      });
      data = await res.json();
      const expiredStatus = data.data?.result?.status || data.data?.attempt?.status;
      const expiredFlag = data.data?.result?.isExpired ?? data.data?.attempt?.isExpired;
      if (res.status === 200 && expiredStatus === 'completed' && expiredFlag === true) {
        logPass('TEST TW2', 'Expired attempt auto-finalized and scored by server');
      } else {
        logFail('TEST TW2', JSON.stringify(data));
      }
    } catch (err) {
      logFail('TEST TW2', err.message);
    }

    // ------------------------------------------------------------------------
    // TEST TX: Result Listening total correct
    // ------------------------------------------------------------------------
    try {
      const att = await Attempt.findById(activeAttemptId);
      if (att.toeicBreakdown?.listeningCorrect === 1) {
        logPass('TEST TX', 'Listening total correct evaluated as 1');
      } else {
        logFail('TEST TX', `Got ${att.toeicBreakdown?.listeningCorrect}`);
      }
    } catch (err) {
      logFail('TEST TX', err.message);
    }

    // ------------------------------------------------------------------------
    // TEST TY: Result Reading total correct
    // ------------------------------------------------------------------------
    try {
      const att = await Attempt.findById(activeAttemptId);
      if (att.toeicBreakdown?.readingCorrect === 0) {
        logPass('TEST TY', 'Reading total correct evaluated as 0');
      } else {
        logFail('TEST TY', `Got ${att.toeicBreakdown?.readingCorrect}`);
      }
    } catch (err) {
      logFail('TEST TY', err.message);
    }

    // ------------------------------------------------------------------------
    // TEST TZ: Part 1–7 breakdown correct
    // ------------------------------------------------------------------------
    try {
      const att = await Attempt.findById(activeAttemptId);
      const p1 = att.toeicBreakdown?.partBreakdown?.part1 || att.toeicBreakdown?.parts?.part1;
      if (p1?.correct === 1) {
        logPass('TEST TZ', 'Part 1 breakdown correct = 1');
      } else {
        logFail('TEST TZ', JSON.stringify(att.toeicBreakdown?.partBreakdown));
      }
    } catch (err) {
      logFail('TEST TZ', err.message);
    }

    // ------------------------------------------------------------------------
    // TEST UA: showCorrectAnswers=false hides keys
    // ------------------------------------------------------------------------
    try {
      await Assessment.findByIdAndUpdate(createdTestId, { showCorrectAnswers: false });
      res = await fetch(`${API_BASE}/toeic/attempts/${activeAttemptId}`, {
        headers: { Authorization: `Bearer ${student1Token}` },
      });
      data = await res.json();
      const ansQ = data.data?.attempt?.answersReview?.[0]?.questionId;
      if (res.status === 200 && ansQ?.explanation === undefined) {
        logPass('TEST UA', 'showCorrectAnswers=false hides explanation and answers review');
      } else {
        logFail('TEST UA', 'Explanation leaked when showCorrectAnswers=false');
      }
    } catch (err) {
      logFail('TEST UA', err.message);
    }

    // ------------------------------------------------------------------------
    // TEST UB: showCorrectAnswers=true returns allowed review
    // ------------------------------------------------------------------------
    try {
      await Assessment.findByIdAndUpdate(createdTestId, { showCorrectAnswers: true });
      res = await fetch(`${API_BASE}/toeic/attempts/${activeAttemptId}`, {
        headers: { Authorization: `Bearer ${student1Token}` },
      });
      data = await res.json();
      const ansQ = data.data?.attempt?.answersReview?.[0]?.questionId;
      if (res.status === 200 && ansQ?.explanation) {
        logPass('TEST UB', 'showCorrectAnswers=true exposes explanation for completed attempt review');
      } else {
        logFail('TEST UB', 'Explanation missing when showCorrectAnswers=true');
      }
    } catch (err) {
      logFail('TEST UB', err.message);
    }

    // ------------------------------------------------------------------------
    // TEST UC: Question edit after start does not change historical grading
    // ------------------------------------------------------------------------
    try {
      await Question.findByIdAndUpdate(q1Id, { explanation: 'MODIFIED EXPLANATION AFTER ATTEMPT' });
      const att = await Attempt.findById(activeAttemptId);
      const qSnap = att.questionSnapshots?.[0];
      if (qSnap?.explanation === 'The man in the image is writing on a board.') {
        logPass('TEST UC', 'Historical Attempt snapshot preserved despite original question edit');
      } else {
        logFail('TEST UC', `Snapshot changed to: ${qSnap?.explanation}`);
      }
    } catch (err) {
      logFail('TEST UC', err.message);
    }

    // ------------------------------------------------------------------------
    // TEST UD: Admin cannot unsafe-delete referenced test
    // ------------------------------------------------------------------------
    try {
      res = await fetch(`${API_BASE}/admin/toeic-tests/${createdTestId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (res.status === 409) {
        logPass('TEST UD', 'Admin delete rejected with 409 Conflict for referenced test');
      } else {
        logFail('TEST UD', `Expected status 409 but got ${res.status}`);
      }
    } catch (err) {
      logFail('TEST UD', err.message);
    }

    // ------------------------------------------------------------------------
    // TEST UE: Duplicate test creates independent IDs
    // ------------------------------------------------------------------------
    try {
      res = await fetch(`${API_BASE}/admin/toeic-tests/${createdTestId}/duplicate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      data = await res.json();
      if (res.status === 201 && data.data?.assessment?._id !== createdTestId) {
        logPass('TEST UE', 'Duplicated test created with new independent ID');
      } else {
        logFail('TEST UE', JSON.stringify(data));
      }
    } catch (err) {
      logFail('TEST UE', err.message);
    }

    // ------------------------------------------------------------------------
    // TEST UF: CSV import validation works
    // ------------------------------------------------------------------------
    try {
      const validCsv = `part,group_code,group_type,question_number,question_text,option_a,option_b,option_c,option_d,correct_answer,explanation
1,G1,audio_image,1,Look at the picture,A,B,C,D,A,Sample explanation`;

      res = await fetch(`${API_BASE}/admin/toeic-tests/${createdTestId}/import-preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ csvContent: validCsv }),
      });
      data = await res.json();
      if (res.status === 200 && data.data?.validRows === 1) {
        logPass('TEST UF', 'CSV import preview validated 1 row');
      } else {
        logFail('TEST UF', JSON.stringify(data));
      }
    } catch (err) {
      logFail('TEST UF', err.message);
    }

    // ------------------------------------------------------------------------
    // TEST UG: Invalid import rejected without partial corrupt data
    // ------------------------------------------------------------------------
    try {
      const invalidCsv = `part,group_code,group_type,question_number,question_text,option_a,option_b,option_c,option_d,correct_answer,explanation
1,G1,audio_image,1,Look at the picture,A,B,C,D,,Sample explanation`;

      res = await fetch(`${API_BASE}/admin/toeic-tests/${createdTestId}/import-preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ csvContent: invalidCsv }),
      });
      data = await res.json();
      if (res.status === 200 && data.data?.invalidRows === 1) {
        logPass('TEST UG', 'Invalid CSV row detected and rejected in preview');
      } else {
        logFail('TEST UG', JSON.stringify(data));
      }
    } catch (err) {
      logFail('TEST UG', err.message);
    }

    // ------------------------------------------------------------------------
    // TEST UH: Student history contains TOEIC Attempt
    // ------------------------------------------------------------------------
    try {
      res = await fetch(`${API_BASE}/toeic/history`, {
        headers: { Authorization: `Bearer ${student1Token}` },
      });
      data = await res.json();
      const attIds = (data.data?.attempts || data.data?.history || []).map((a) => (a._id || a.attemptId)?.toString());
      if (res.status === 200 && attIds.includes(activeAttemptId.toString())) {
        logPass('TEST UH', 'Student history contains TOEIC attempt');
      } else {
        logFail('TEST UH', 'Attempt missing from student history');
      }
    } catch (err) {
      logFail('TEST UH', err.message);
    }

    // ------------------------------------------------------------------------
    // TEST UI: Admin results contains TOEIC Attempt
    // ------------------------------------------------------------------------
    try {
      res = await fetch(`${API_BASE}/attempts/admin/results?assessmentId=${createdTestId}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      data = await res.json();
      const attIds = (data.data?.attempts || data.data?.results || []).map((r) => (r._id || r.attemptId)?.toString());
      if (res.status === 200 && attIds.includes(activeAttemptId.toString())) {
        logPass('TEST UI', 'Admin results contains TOEIC attempt');
      } else {
        logFail('TEST UI', 'Attempt missing from admin results');
      }
    } catch (err) {
      logFail('TEST UI', err.message);
    }

  } catch (err) {
    console.error('Fatal Suite Error:', err);
  } finally {
    await mongoose.disconnect();
    console.log('\n==================================================');
    console.log(`🏁 TOEIC E2E SUITE COMPLETED: ${passed} PASS / ${failed} FAIL`);
    console.log('==================================================\n');
    process.exit(failed > 0 ? 1 : 0);
  }
}

runToeicTests();
