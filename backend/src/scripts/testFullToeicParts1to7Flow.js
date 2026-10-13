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

async function runFullToeicParts1to7Suite() {
  console.log('================================================================');
  console.log('🚀 RUNNING COMPREHENSIVE TOEIC PARTS 1–7 STUDENT FLOW E2E TEST');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, testName, detail = '') {
    if (condition) {
      passed++;
      console.log(`✅ [PASS] ${testName} ${detail ? `(${detail})` : ''}`);
    } else {
      failed++;
      console.error(`❌ [FAIL] ${testName} ${detail ? `(${detail})` : ''}`);
    }
  }

  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/english_course');

  const ts = Date.now();
  const adminEmail = `admin_full7_${ts}@test.com`;
  const studentEmail = `student_full7_${ts}@test.com`;
  const password = 'Password123!';

  let adminToken = '';
  let studentToken = '';
  let studentId = '';

  let testId = '';
  let attemptId = '';

  try {
    // 1. SETUP ACCOUNTS
    const adminUser = await User.create({
      fullName: 'Full TOEIC Admin',
      email: adminEmail,
      phoneNumber: '0911000001',
      password: password,
      role: 'admin',
      status: 'active',
    });

    const studentUser = await User.create({
      fullName: 'Full TOEIC Student',
      email: studentEmail,
      phoneNumber: '0911000002',
      password: password,
      role: 'student',
      status: 'active',
    });
    studentId = studentUser._id.toString();

    // Login Admin
    let res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: adminEmail, password }),
    });
    let data = await res.json();
    adminToken = data.data.accessToken;

    // Login Student
    res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: studentEmail, password }),
    });
    data = await res.json();
    studentToken = data.data.accessToken;

    // 2. CREATE TOEIC TEST
    res = await fetch(`${API_BASE}/admin/toeic-tests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        title: `TOEIC Comprehensive 7-Part Exam ${ts}`,
        description: 'Complete 7 Parts Assessment Simulation',
        toeicMode: 'full_test',
        durationMinutes: 120,
        showCorrectAnswers: true,
      }),
    });
    data = await res.json();
    assert(res.status === 201 && data.data?.assessment?._id, 'Admin created TOEIC test container');
    testId = data.data.assessment._id;

    // 3. CREATE FIXTURES FOR ALL 7 PARTS
    // Part 1: Photograph
    const q1 = await Question.create({
      questionText: 'Look at the photograph labeled number 1.',
      type: 'single_choice',
      toeicPart: 1,
      questionNumber: 1,
      options: [
        { id: 'p1-opt-a', text: 'A. A man is walking along the street.' },
        { id: 'p1-opt-b', text: 'B. A man is writing on a whiteboard.' },
        { id: 'p1-opt-c', text: 'C. A man is driving a car.' },
        { id: 'p1-opt-d', text: 'D. A man is cooking dinner.' },
      ],
      correctAnswers: ['B. A man is writing on a whiteboard.'],
      explanation: 'The photograph clearly shows a man writing on a whiteboard in a classroom.',
    });
    const g1 = await QuestionGroup.create({
      assessment: testId,
      partNumber: 1,
      type: 'audio_image',
      title: 'Part 1: Photographs',
      imageUrl: '/uploads/images/sample_part1.jpg',
      audioUrl: '/uploads/audio/sample_part1.mp3',
      questionIds: [q1._id],
      order: 1,
    });

    // Part 2: Question-Response
    const q2 = await Question.create({
      questionText: 'Where is the conference room located?',
      type: 'single_choice',
      toeicPart: 2,
      questionNumber: 2,
      options: [
        { id: 'p2-opt-a', text: 'A. On the second floor, next to the stairs.' },
        { id: 'p2-opt-b', text: 'B. Yes, at 3 o\'clock.' },
        { id: 'p2-opt-c', text: 'C. About twenty people attended.' },
      ],
      correctAnswers: ['A. On the second floor, next to the stairs.'],
      explanation: 'The question asks about location ("Where"), so option A is the appropriate response.',
    });
    const g2 = await QuestionGroup.create({
      assessment: testId,
      partNumber: 2,
      type: 'audio',
      title: 'Part 2: Question-Response',
      audioUrl: '/uploads/audio/sample_part2.mp3',
      questionIds: [q2._id],
      order: 2,
    });

    // Part 3: Conversations (Questions 3 & 4)
    const q3 = await Question.create({
      questionText: 'What are the speakers discussing?',
      type: 'single_choice',
      toeicPart: 3,
      questionNumber: 3,
      options: [
        { id: 'p3-opt-1a', text: 'A. A budget proposal' },
        { id: 'p3-opt-1b', text: 'B. An office renovation' },
        { id: 'p3-opt-1c', text: 'C. A client meeting' },
        { id: 'p3-opt-1d', text: 'D. New software training' },
      ],
      correctAnswers: ['B. An office renovation'],
      explanation: 'They discuss painting the walls and ordering new furniture.',
    });
    const q4 = await Question.create({
      questionText: 'What will the man probably do next?',
      type: 'single_choice',
      toeicPart: 3,
      questionNumber: 4,
      options: [
        { id: 'p3-opt-2a', text: 'A. Call the supplier' },
        { id: 'p3-opt-2b', text: 'B. Email the director' },
        { id: 'p3-opt-2c', text: 'C. Sign the contract' },
        { id: 'p3-opt-2d', text: 'D. Check the schedule' },
      ],
      correctAnswers: ['A. Call the supplier'],
      explanation: 'The man explicitly states he will call the supplier to confirm delivery.',
    });
    const g3 = await QuestionGroup.create({
      assessment: testId,
      partNumber: 3,
      type: 'audio',
      title: 'Part 3: Office Renovation Conversation',
      audioUrl: '/uploads/audio/sample_part3.mp3',
      instructions: 'Questions 3-4 refer to the following conversation.',
      questionIds: [q3._id, q4._id],
      order: 3,
    });

    // Part 4: Talks (Question 5)
    const q5 = await Question.create({
      questionText: 'What is the announcement mainly about?',
      type: 'single_choice',
      toeicPart: 4,
      questionNumber: 5,
      options: [
        { id: 'p4-opt-a', text: 'A. Flight delay' },
        { id: 'p4-opt-b', text: 'B. Annual sale' },
        { id: 'p4-opt-c', text: 'C. Weather emergency' },
        { id: 'p4-opt-d', text: 'D. Power outage' },
      ],
      correctAnswers: ['A. Flight delay'],
      explanation: 'The speaker announces that flight 204 to Tokyo is delayed due to weather.',
    });
    const g4 = await QuestionGroup.create({
      assessment: testId,
      partNumber: 4,
      type: 'audio',
      title: 'Part 4: Airport Announcement',
      audioUrl: '/uploads/audio/sample_part4.mp3',
      instructions: 'Question 5 refers to the following announcement.',
      questionIds: [q5._id],
      order: 4,
    });

    // Part 5: Incomplete Sentences (Questions 6 & 7)
    const q6 = await Question.create({
      questionText: 'Ms. Carter will deliver her presentation _____ the board members arrive.',
      type: 'single_choice',
      toeicPart: 5,
      questionNumber: 6,
      options: [
        { id: 'p5-opt-1a', text: 'A. as soon as' },
        { id: 'p5-opt-1b', text: 'B. because of' },
        { id: 'p5-opt-1c', text: 'C. in spite' },
        { id: 'p5-opt-1d', text: 'D. despite' },
      ],
      correctAnswers: ['A. as soon as'],
      explanation: '"As soon as" is the appropriate time conjunction joining two clauses.',
    });
    const q7 = await Question.create({
      questionText: 'The new employee demonstrated _____ skills in data analysis.',
      type: 'single_choice',
      toeicPart: 5,
      questionNumber: 7,
      options: [
        { id: 'p5-opt-2a', text: 'A. exceptional' },
        { id: 'p5-opt-2b', text: 'B. exceptionally' },
        { id: 'p5-opt-2c', text: 'C. exception' },
        { id: 'p5-opt-2d', text: 'D. excepting' },
      ],
      correctAnswers: ['A. exceptional'],
      explanation: 'An adjective is required to modify the noun "skills".',
    });
    const g5 = await QuestionGroup.create({
      assessment: testId,
      partNumber: 5,
      type: 'single',
      title: 'Part 5: Incomplete Sentences',
      questionIds: [q6._id, q7._id],
      order: 5,
    });

    // Part 6: Text Completion (Questions 8 & 9 with shared passage)
    const q8 = await Question.create({
      questionText: 'Select the best word for blank [8].',
      type: 'single_choice',
      toeicPart: 6,
      questionNumber: 8,
      options: [
        { id: 'p6-opt-1a', text: 'A. announced' },
        { id: 'p6-opt-1b', text: 'B. announce' },
        { id: 'p6-opt-1c', text: 'C. announcement' },
        { id: 'p6-opt-1d', text: 'D. announcing' },
      ],
      correctAnswers: ['A. announced'],
      explanation: 'Past tense verb completes the main clause.',
    });
    const q9 = await Question.create({
      questionText: 'Select the best phrase for blank [9].',
      type: 'single_choice',
      toeicPart: 6,
      questionNumber: 9,
      options: [
        { id: 'p6-opt-2a', text: 'A. in order to' },
        { id: 'p6-opt-2b', text: 'B. as well as' },
        { id: 'p6-opt-2c', text: 'C. so that' },
        { id: 'p6-opt-2d', text: 'D. instead of' },
      ],
      correctAnswers: ['A. in order to'],
      explanation: '"in order to" expresses purpose followed by base verb.',
    });
    const g6 = await QuestionGroup.create({
      assessment: testId,
      partNumber: 6,
      type: 'passage',
      title: 'Part 6: Company Internal Notice',
      passages: [
        {
          title: 'Memorandum',
          content: 'To: All Staff\nFrom: Management\nDate: October 10\nWe recently [8] the upgrade of our internal network. The upgrade was performed [9] improve security across all departments.',
        },
      ],
      questionIds: [q8._id, q9._id],
      order: 6,
    });

    // Part 7: Reading Comprehension (Questions 10 & 11 with double passage)
    const q10 = await Question.create({
      questionText: 'Why did Mr. Henderson write the email?',
      type: 'single_choice',
      toeicPart: 7,
      questionNumber: 10,
      options: [
        { id: 'p7-opt-1a', text: 'A. To inquire about a job opening' },
        { id: 'p7-opt-1b', text: 'B. To request a quotation for catering services' },
        { id: 'p7-opt-1c', text: 'C. To cancel an event booking' },
        { id: 'p7-opt-1d', text: 'D. To file a formal complaint' },
      ],
      correctAnswers: ['B. To request a quotation for catering services'],
      explanation: 'Mr. Henderson explicitly requests a quote for the upcoming company gala dinner.',
    });
    const q11 = await Question.create({
      questionText: 'According to the invoice, what is the payment due date?',
      type: 'single_choice',
      toeicPart: 7,
      questionNumber: 11,
      options: [
        { id: 'p7-opt-2a', text: 'A. November 15' },
        { id: 'p7-opt-2b', text: 'B. November 30' },
        { id: 'p7-opt-2c', text: 'C. December 1' },
        { id: 'p7-opt-2d', text: 'D. October 31' },
      ],
      correctAnswers: ['B. November 30'],
      explanation: 'The invoice footer states: "Payment due by November 30".',
    });
    const g7 = await QuestionGroup.create({
      assessment: testId,
      partNumber: 7,
      type: 'multi_passage',
      title: 'Part 7: Email and Invoice Set',
      passages: [
        {
          title: 'Document 1: Email Request',
          content: 'Dear Delight Catering,\nWe are planning our annual year-end gala for 150 guests on December 15. Please provide an itemized quote for a three-course dinner.\nSincerely,\nArthur Henderson',
        },
        {
          title: 'Document 2: Official Invoice #849',
          content: 'Delight Catering Services\nInvoice Date: October 15\nClient: Arthur Henderson\nTotal Amount: $4,500.00\nPayment due by November 30.',
        },
      ],
      questionIds: [q10._id, q11._id],
      order: 7,
    });

    // Update Assessment with all groups & questions
    const allGroupIds = [g1._id, g2._id, g3._id, g4._id, g5._id, g6._id, g7._id];
    const allQuestionsList = [q1, q2, q3, q4, q5, q6, q7, q8, q9, q10, q11];

    await Assessment.findByIdAndUpdate(testId, {
      questionGroups: allGroupIds,
      questions: allQuestionsList.map((q) => ({ question: q._id, score: 1 })),
      parts: [
        { partNumber: 1, name: 'Part 1: Photographs', section: 'listening', questionGroups: [g1._id], order: 1 },
        { partNumber: 2, name: 'Part 2: Question-Response', section: 'listening', questionGroups: [g2._id], order: 2 },
        { partNumber: 3, name: 'Part 3: Conversations', section: 'listening', questionGroups: [g3._id], order: 3 },
        { partNumber: 4, name: 'Part 4: Talks', section: 'listening', questionGroups: [g4._id], order: 4 },
        { partNumber: 5, name: 'Part 5: Incomplete Sentences', section: 'reading', questionGroups: [g5._id], order: 5 },
        { partNumber: 6, name: 'Part 6: Text Completion', section: 'reading', questionGroups: [g6._id], order: 6 },
        { partNumber: 7, name: 'Part 7: Reading Comprehension', section: 'reading', questionGroups: [g7._id], order: 7 },
      ],
    });

    // 4. PUBLISH TOEIC TEST
    res = await fetch(`${API_BASE}/admin/toeic-tests/${testId}/publish`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    data = await res.json();
    assert(res.status === 200 && data.data?.assessment?.status === 'published', 'Admin published TOEIC test with Parts 1–7');

    // 5. STUDENT LIST PUBLISHED TESTS
    res = await fetch(`${API_BASE}/toeic/tests`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    data = await res.json();
    const tests = data.data?.tests || [];
    const foundPublished = tests.find((t) => t._id === testId);
    assert(res.status === 200 && foundPublished, 'Student lists published TOEIC tests');
    assert(foundPublished?.questionCount === 11, 'Published test reports 11 questions');

    // 6. STUDENT GET TEST OVERVIEW
    res = await fetch(`${API_BASE}/toeic/tests/${testId}`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    data = await res.json();
    assert(res.status === 200 && data.data?.assessment?._id === testId, 'Student gets test overview');
    assert(data.data?.assessment?.hasActiveAttempt === false, 'Initially has no active attempt');

    // 7. STUDENT STARTS ATTEMPT
    res = await fetch(`${API_BASE}/toeic/tests/${testId}/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    data = await res.json();
    assert((res.status === 200 || res.status === 201) && data.data?.attemptId, 'Student starts new attempt');
    attemptId = data.data.attemptId;

    // SECURITY CHECK: Verify Student DTO hides correct answers
    const questionsSnapshot = data.data.questions || [];
    const hasLeak = questionsSnapshot.some((q) => q.correctAnswers || q.correctOptionIds || q.explanation || q.isCorrect !== undefined);
    assert(!hasLeak, 'Security: Student attempt start payload does NOT leak correctAnswers or grading secrets');

    // Verify deadlineAt is server-authoritative
    const serverDeadline = new Date(data.data.deadlineAt).getTime();
    const serverStarted = new Date(data.data.startedAt).getTime();
    assert(serverDeadline > serverStarted && (serverDeadline - serverStarted) <= 120 * 60 * 1000 + 5000, 'Server deadlineAt is authoritative (120 minutes)');

    // 8. STUDENT ANSWERS QUESTIONS ACROSS ALL 7 PARTS
    // q1 (P1): choose correct 'p1-opt-b'
    // q2 (P2): choose correct 'p2-opt-a'
    // q3 (P3): choose correct 'p3-opt-1b'
    // q4 (P3): choose incorrect 'p3-opt-2b' (wrong option)
    // q5 (P4): choose correct 'p4-opt-a'
    // q6 (P5): choose correct 'p5-opt-1a'
    // q7 (P5): choose correct 'p5-opt-2a'
    // q8 (P6): choose correct 'p6-opt-1a'
    // q9 (P6): choose incorrect 'p6-opt-2b' (wrong option)
    // q10 (P7): choose correct 'p7-opt-1b'
    // q11 (P7): leave UNANSWERED to verify unanswered warning & handling
    const studentAnswersPayload = [
      { questionId: q1._id.toString(), selectedOptionIds: ['p1-opt-b'] },
      { questionId: q2._id.toString(), selectedOptionIds: ['p2-opt-a'] },
      { questionId: q3._id.toString(), selectedOptionIds: ['p3-opt-1b'] },
      { questionId: q4._id.toString(), selectedOptionIds: ['p3-opt-2b'] },
      { questionId: q5._id.toString(), selectedOptionIds: ['p4-opt-a'] },
      { questionId: q6._id.toString(), selectedOptionIds: ['p5-opt-1a'] },
      { questionId: q7._id.toString(), selectedOptionIds: ['p5-opt-2a'] },
      { questionId: q8._id.toString(), selectedOptionIds: ['p6-opt-1a'] },
      { questionId: q9._id.toString(), selectedOptionIds: ['p6-opt-2b'] },
      { questionId: q10._id.toString(), selectedOptionIds: ['p7-opt-1b'] },
    ];

    // 9. AUTOSAVE ANSWERS VIA TOEIC AUTOSAVE ENDPOINT
    res = await fetch(`${API_BASE}/toeic/attempts/${attemptId}/answers`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${studentToken}` },
      body: JSON.stringify({
        answers: studentAnswersPayload,
        flaggedQuestionIds: [q4._id.toString()],
        revision: 1,
      }),
    });
    data = await res.json();
    assert(res.status === 200 && data.data?.saved === true, 'Autosave answers succeeded via /toeic/attempts/:id/answers');
    assert(data.data?.revision === 2, 'Revision incremented to 2');

    // 10. STALE REVISION PROTECTION TEST
    res = await fetch(`${API_BASE}/toeic/attempts/${attemptId}/answers`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${studentToken}` },
      body: JSON.stringify({
        answers: studentAnswersPayload,
        revision: 1, // Stale! Current is 2
      }),
    });
    assert(res.status === 409, 'Stale autosave revision rejected with 409 Conflict');

    // 11. REFRESH / RESUME FLOW
    // Fetch attempt state as if page was reloaded
    res = await fetch(`${API_BASE}/toeic/attempts/${attemptId}`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    data = await res.json();
    const fetchedAtt = data.data?.attempt;
    assert(res.status === 200 && fetchedAtt?._id === attemptId, 'Refresh retrieves same attempt state');
    assert(fetchedAtt?.deadlineAt && new Date(fetchedAtt.deadlineAt).getTime() === serverDeadline, 'Timer persistence: deadlineAt did not reset on refresh');
    assert(fetchedAtt?.answersMap?.[q1._id.toString()]?.[0] === 'p1-opt-b', 'Refresh restores Part 1 answer');
    assert(fetchedAtt?.answersMap?.[q10._id.toString()]?.[0] === 'p7-opt-1b', 'Refresh restores Part 7 answer');
    assert(fetchedAtt?.flaggedQuestionIds?.includes(q4._id.toString()), 'Refresh restores flagged question IDs');

    // Verify repeated start resumes without duplicate
    res = await fetch(`${API_BASE}/toeic/tests/${testId}/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    data = await res.json();
    assert(data.data?.attemptId === attemptId, 'Repeated start call resumes active attempt without creating duplicate');

    // Check count of attempts for student is still exactly 1
    const attCount = await Attempt.countDocuments({ student: studentId, assessment: testId });
    assert(attCount === 1, 'Attempt count remains strictly 1');

    // 12. SUBMIT ATTEMPT
    res = await fetch(`${API_BASE}/toeic/attempts/${attemptId}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${studentToken}` },
      body: JSON.stringify({}),
    });
    data = await res.json();
    const result = data.data?.result || data.data?.attempt;
    assert(res.status === 200 && (result?.status === 'completed' || result?.status === 'submitted'), 'Submit TOEIC attempt succeeds');

    // Verify grading results
    // Listening questions: q1(ok), q2(ok), q3(ok), q4(wrong), q5(ok) => 4/5 correct
    // Reading questions: q6(ok), q7(ok), q8(ok), q9(wrong), q10(ok), q11(unanswered) => 4/6 correct
    // Total correct: 8 / 11
    // Unanswered: 1 / 11
    const breakdown = result?.toeicBreakdown || {};
    assert(breakdown.listeningCorrect === 4, `Listening correct = 4 (got ${breakdown.listeningCorrect})`);
    assert(breakdown.readingCorrect === 4, `Reading correct = 4 (got ${breakdown.readingCorrect})`);
    assert(result.correctCount === 8, `Total correct count = 8 (got ${result.correctCount})`);
    assert(result.unansweredCount === 1, `Unanswered count = 1 (got ${result.unansweredCount})`);
    assert(result.incorrectCount === 2, `Incorrect count = 2 (got ${result.incorrectCount})`);
    assert(breakdown.listeningScore > 0, `Estimated Listening score calculated (>0): ${breakdown.listeningScore}`);
    assert(breakdown.readingScore > 0, `Estimated Reading score calculated (>0): ${breakdown.readingScore}`);
    assert(breakdown.estimatedToeicScore === (breakdown.listeningScore + breakdown.readingScore), 'Estimated Total TOEIC score = Listening + Reading');

    // Verify Part 1–7 breakdowns exist
    assert(breakdown.partBreakdown?.part1?.correct === 1, 'Part 1 breakdown: 1/1 correct');
    assert(breakdown.partBreakdown?.part2?.correct === 1, 'Part 2 breakdown: 1/1 correct');
    assert(breakdown.partBreakdown?.part3?.correct === 1, 'Part 3 breakdown: 1/2 correct');
    assert(breakdown.partBreakdown?.part4?.correct === 1, 'Part 4 breakdown: 1/1 correct');
    assert(breakdown.partBreakdown?.part5?.correct === 2, 'Part 5 breakdown: 2/2 correct');
    assert(breakdown.partBreakdown?.part6?.correct === 1, 'Part 6 breakdown: 1/2 correct');
    assert(breakdown.partBreakdown?.part7?.correct === 1, 'Part 7 breakdown: 1/2 correct');

    // 13. DUPLICATE SUBMIT PROTECTION
    res = await fetch(`${API_BASE}/toeic/attempts/${attemptId}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${studentToken}` },
      body: JSON.stringify({}),
    });
    data = await res.json();
    assert(res.status === 200, 'Duplicate submit returns early without error');
    assert(data.data?.result?.attemptId === attemptId, 'Duplicate submit returns original result');

    // 14. RESULT REVIEW WITH SHOWCORRECTANSWERS
    res = await fetch(`${API_BASE}/toeic/attempts/${attemptId}`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    data = await res.json();
    const answersReview = data.data?.attempt?.answersReview || [];
    assert(answersReview.length === 11, 'Answers review returned 11 items');
    const p1Review = answersReview.find((r) => r.questionId?._id === q1._id.toString() || r.questionId?.questionNumber === 1);
    assert(p1Review?.isCorrect === true, 'Review indicates Question 1 was correct');
    assert(p1Review?.questionId?.explanation?.includes('classroom'), 'Review reveals explanation for completed attempt');

    const p4Review = answersReview.find((r) => r.questionId?._id === q4._id.toString() || r.questionId?.questionNumber === 4);
    assert(p4Review?.isCorrect === false, 'Review indicates Question 4 was incorrect');

    // 15. STUDENT TOEIC HISTORY ENDPOINTS
    res = await fetch(`${API_BASE}/toeic/history`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    data = await res.json();
    const toeicHistory = data.data?.history || data.data?.attempts || [];
    const foundInHistory = toeicHistory.find((h) => h.attemptId === attemptId || h._id === attemptId);
    assert(res.status === 200 && foundInHistory, 'Student TOEIC history endpoint (/toeic/history) contains attempt');
    assert(foundInHistory?.toeicBreakdown?.estimatedToeicScore > 0, 'History includes TOEIC breakdown');

    // Also verify standard attempt history
    res = await fetch(`${API_BASE}/attempts/history`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    data = await res.json();
    const stdHistory = data.data?.history || data.data?.attempts || [];
    const foundInStdHistory = stdHistory.find((h) => (h.attemptId || h._id) === attemptId);
    assert(res.status === 200 && foundInStdHistory, 'Standard /attempts/history includes TOEIC attempt');
    assert(foundInStdHistory?.assessment?.examFormat === 'toeic', 'Standard history identifies examFormat as "toeic"');

  } catch (err) {
    console.error('Fatal Suite Error:', err);
    failed++;
  } finally {
    await mongoose.disconnect();
    console.log('\n================================================================');
    console.log(`🏁 FULL 7-PART TOEIC SUITE COMPLETED: ${passed} PASS / ${failed} FAIL`);
    console.log('================================================================\n');
    process.exit(failed > 0 ? 1 : 0);
  }
}

runFullToeicParts1to7Suite();
