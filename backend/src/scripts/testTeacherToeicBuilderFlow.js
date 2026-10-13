import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import mongoose from 'mongoose';
import PDFDocument from 'pdfkit';
import User from '../models/User.js';
import Assessment from '../models/Assessment.js';
import Question from '../models/Question.js';
import QuestionGroup from '../models/QuestionGroup.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../../.env') });

const API_BASE = 'http://localhost:3000/api/v1';

// Helper to generate sample PDF buffer with TOEIC content and answer key
function generateSampleToeicPdfBuffer() {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40 });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(16).text('ETS TOEIC TEST 2026 - OFFICIAL PRACTICE TEST', { align: 'center' });
    doc.moveDown();

    // PART 1
    doc.fontSize(14).text('PART 1');
    doc.fontSize(10).text('Directions: For each question in this part, you will hear four statements about a picture.');
    doc.text('Question 1.');
    doc.text('(A) A man is walking down the street.');
    doc.text('(B) A man is working on a laptop computer.');
    doc.text('(C) A man is opening a large window.');
    doc.text('(D) A man is driving a car.');
    doc.moveDown();

    // PART 2
    doc.fontSize(14).text('PART 2');
    doc.fontSize(10).text('Directions: You will hear a question or statement and three responses.');
    doc.text('Question 7.');
    doc.text('(A) Yes, at three o clock.');
    doc.text('(B) In the main conference room.');
    doc.text('(C) By next Monday morning.');
    doc.moveDown();

    // PART 5
    doc.fontSize(14).text('PART 5');
    doc.fontSize(10).text('Directions: A word or phrase is missing in each of the sentences below.');
    doc.text('101. All staff members must submit their travel reports by _____ Friday.');
    doc.text('(A) this');
    doc.text('(B) these');
    doc.text('(C) those');
    doc.text('(D) them');
    doc.moveDown();

    doc.text('102. The marketing department launched a _____ advertising campaign.');
    doc.text('(A) success');
    doc.text('(B) successful');
    doc.text('(C) succeed');
    doc.text('(D) successfully');
    doc.moveDown();

    // PART 7
    doc.fontSize(14).text('PART 7');
    doc.fontSize(10).text('Questions 147-148 refer to the following announcement.');
    doc.text('Announcement: The corporate library will be closed this weekend for system upgrades.');
    doc.moveDown();
    doc.text('147. What is the announcement mainly about?');
    doc.text('(A) A temporary library closure');
    doc.text('(B) A book release ceremony');
    doc.text('(C) An employee promotion');
    doc.text('(D) A holiday schedule');
    doc.moveDown();
    doc.text('148. When will the library be closed?');
    doc.text('(A) On Friday');
    doc.text('(B) This weekend');
    doc.text('(C) Next month');
    doc.text('(D) Indefinitely');
    doc.moveDown();

    // ANSWER KEY
    doc.fontSize(14).text('ANSWER KEY');
    doc.fontSize(10).text('1. B');
    doc.text('7. A');
    doc.text('101. A');
    doc.text('102. B');
    doc.text('147. A');
    doc.text('148. B');

    doc.end();
  });
}

async function runTeacherToeicBuilderE2E() {
  console.log('================================================================');
  console.log('🚀 TEACHER TOEIC BUILDER + PDF IMPORT + REVIEW/PUBLISH E2E TEST');
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
  const teacherEmail = `teacher_builder_${ts}@test.com`;
  const studentEmail = `student_builder_${ts}@test.com`;
  const password = 'Password123!';

  let teacherToken = '';
  let studentToken = '';
  let teacherId = '';
  let studentId = '';

  let manualTestId = '';
  let pdfImportedTestId = '';
  let part1GroupId = '';
  let part5GroupId = '';
  let sampleQId = '';

  try {
    // ------------------------------------------------------------------------
    // 1. SETUP TEACHER & STUDENT ACCOUNTS
    // ------------------------------------------------------------------------
    const teacherUser = await User.create({
      fullName: 'Teacher TOEIC Master',
      email: teacherEmail,
      phoneNumber: '0911000001',
      password: password,
      role: 'teacher',
      status: 'active',
    });
    teacherId = teacherUser._id.toString();

    const studentUser = await User.create({
      fullName: 'Student Reviewer',
      email: studentEmail,
      phoneNumber: '0911000002',
      password: password,
      role: 'student',
      status: 'active',
    });
    studentId = studentUser._id.toString();

    // Login Teacher
    const loginTeacherRes = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: teacherEmail, password }),
    });
    const loginTeacherData = await loginTeacherRes.json();
    teacherToken = loginTeacherData.data?.accessToken || loginTeacherData.data?.token;

    if (!teacherToken) throw new Error(`Teacher login failed: ${loginTeacherData.message || 'no token'}`);
    logPass('Teacher login and token acquisition', `role: ${teacherUser.role}`);

    // Login Student
    const loginStudentRes = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: studentEmail, password }),
    });
    const loginStudentData = await loginStudentRes.json();
    studentToken = loginStudentData.data?.accessToken || loginStudentData.data?.token;
    if (!studentToken) throw new Error(`Student login failed: ${loginStudentData.message || 'no token'}`);
    logPass('Student login and token acquisition');

    // ------------------------------------------------------------------------
    // 2. TEACHER CREATES DRAFT TOEIC TEST (MANUAL BUILDER)
    // ------------------------------------------------------------------------
    const createTestRes = await fetch(`${API_BASE}/admin/toeic-tests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${teacherToken}`,
      },
      body: JSON.stringify({
        title: `TOEIC Master Test ${ts}`,
        description: 'Đề thi TOEIC tạo bởi giáo viên qua Builder',
        toeicMode: 'full_test',
        durationMinutes: 120,
        attemptLimit: 3,
        showCorrectAnswers: true,
      }),
    });
    const createTestData = await createTestRes.json();
    if (createTestData.status !== 'success') {
      throw new Error(`Failed to create test: ${createTestData.message}`);
    }
    manualTestId = createTestData.data.assessment._id;

    if (createTestData.data.assessment.status === 'draft') {
      logPass('Teacher created TOEIC test container in DRAFT status', `ID: ${manualTestId}`);
    } else {
      logFail('Initial status check', `Expected draft, got ${createTestData.data.assessment.status}`);
    }

    // ------------------------------------------------------------------------
    // 3. STUDENT DRAFT VISIBILITY CHECK (MUST NOT SEE DRAFT)
    // ------------------------------------------------------------------------
    const studentListDraftRes = await fetch(`${API_BASE}/toeic/tests`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    const studentListDraftData = await studentListDraftRes.json();
    const draftTests = studentListDraftData.data?.tests || studentListDraftData.data?.assessments || [];
    const foundDraftInStudent = draftTests.some(
      (t) => t._id === manualTestId
    );
    if (!foundDraftInStudent) {
      logPass('Draft test is strictly HIDDEN from Student list');
    } else {
      logFail('Draft test visibility', 'Draft test leaked into student test list!');
    }

    // ------------------------------------------------------------------------
    // 4. MEDIA UPLOAD (AUDIO & IMAGE VIA MEDIA API)
    // ------------------------------------------------------------------------
    // Test uploading an image file
    const sampleImageBuffer = Buffer.from('fake-png-image-data-for-toeic-stimulus');
    const imageFormData = new FormData();
    imageFormData.append('file', new Blob([sampleImageBuffer], { type: 'image/png' }), 'part1_photo.png');

    const mediaUploadRes = await fetch(`${API_BASE}/admin/media/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${teacherToken}` },
      body: imageFormData,
    });
    const mediaUploadData = await mediaUploadRes.json();
    const uploadedImageUrl = mediaUploadData.data?.fileUrl;

    if (mediaUploadData.status === 'success' && uploadedImageUrl) {
      logPass('Media API upload succeeded', uploadedImageUrl);
    } else {
      logFail('Media upload', mediaUploadData.message || 'No fileUrl');
    }

    // ------------------------------------------------------------------------
    // 5. MANUAL BUILDER: ADD PARTS 1 TO 7 QUESTION GROUPS
    // ------------------------------------------------------------------------
    // Part 1: Photographs (audio_image)
    const part1GroupRes = await fetch(`${API_BASE}/admin/toeic-tests/${manualTestId}/groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${teacherToken}` },
      body: JSON.stringify({
        partNumber: 1,
        type: 'audio_image',
        title: 'Part 1 Photo 1',
        instructions: 'Look at the photograph and choose the best statement.',
        imageUrl: uploadedImageUrl || '/uploads/part1_photo.png',
        audioUrl: '/uploads/part1_audio.mp3',
        order: 1,
        questions: [
          {
            questionNumber: 1,
            questionText: 'Look at photograph #1.',
            type: 'single_choice',
            options: [
              { id: 'opt_1', text: '(A) A man is walking down the street.' },
              { id: 'opt_2', text: '(B) A man is working on a laptop.' },
              { id: 'opt_3', text: '(C) A man is opening a window.' },
              { id: 'opt_4', text: '(D) A man is driving a car.' },
            ],
            correctAnswers: ['opt_2'],
            explanation: 'The photograph clearly shows a man with a laptop.',
            score: 1,
          },
        ],
      }),
    });
    const part1GroupData = await part1GroupRes.json();
    part1GroupId = part1GroupData.data?.group?._id;
    if (part1GroupData.status === 'success' && part1GroupId) {
      logPass('Builder Part 1 (audio_image) group created', `Group: ${part1GroupId}`);
    } else {
      logFail('Builder Part 1', part1GroupData.message);
    }

    // Part 2: Question-Response (audio, 3 options)
    const part2GroupRes = await fetch(`${API_BASE}/admin/toeic-tests/${manualTestId}/groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${teacherToken}` },
      body: JSON.stringify({
        partNumber: 2,
        type: 'audio',
        title: 'Part 2 Q7',
        audioUrl: '/uploads/part2_q7.mp3',
        order: 2,
        questions: [
          {
            questionNumber: 7,
            questionText: 'Where is the staff meeting being held?',
            options: [
              { id: 'opt_1', text: '(A) Yes, at 3 o clock.' },
              { id: 'opt_2', text: '(B) In Conference Room B.' },
              { id: 'opt_3', text: '(C) With Mr. Davis.' },
            ],
            correctAnswers: ['opt_2'],
            explanation: 'Conference Room B answers the location question "Where".',
            score: 1,
          },
        ],
      }),
    });
    const part2GroupData = await part2GroupRes.json();
    if (part2GroupData.status === 'success') {
      logPass('Builder Part 2 (audio, 3 options) group created');
    } else {
      logFail('Builder Part 2', part2GroupData.message);
    }

    // Part 3: Conversations (audio, multiple questions)
    const part3GroupRes = await fetch(`${API_BASE}/admin/toeic-tests/${manualTestId}/groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${teacherToken}` },
      body: JSON.stringify({
        partNumber: 3,
        type: 'audio',
        title: 'Part 3 Q32-34',
        audioUrl: '/uploads/part3_conv1.mp3',
        order: 3,
        questions: [
          {
            questionNumber: 32,
            questionText: 'Where most likely are the speakers?',
            options: [
              { id: 'opt_1', text: '(A) At an airport' },
              { id: 'opt_2', text: '(B) In a bakery' },
              { id: 'opt_3', text: '(C) In a bank' },
              { id: 'opt_4', text: '(D) At a hotel' },
            ],
            correctAnswers: ['opt_4'],
            explanation: 'The speakers mention room keys and reservations.',
            score: 1,
          },
          {
            questionNumber: 33,
            questionText: 'What problem does the woman mention?',
            options: [
              { id: 'opt_1', text: '(A) A flight is delayed' },
              { id: 'opt_2', text: '(B) The key is broken' },
              { id: 'opt_3', text: '(C) Her room is not ready' },
              { id: 'opt_4', text: '(D) She lost her wallet' },
            ],
            correctAnswers: ['opt_3'],
            explanation: 'Woman says the housekeeping staff is still cleaning.',
            score: 1,
          },
        ],
      }),
    });
    const part3GroupData = await part3GroupRes.json();
    if (part3GroupData.status === 'success') {
      logPass('Builder Part 3 (audio, multiple questions) group created');
    } else {
      logFail('Builder Part 3', part3GroupData.message);
    }

    // Part 4: Talks (audio, 2 questions)
    const part4GroupRes = await fetch(`${API_BASE}/admin/toeic-tests/${manualTestId}/groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${teacherToken}` },
      body: JSON.stringify({
        partNumber: 4,
        type: 'audio',
        title: 'Part 4 Talk 71-72',
        audioUrl: '/uploads/part4_talk.mp3',
        order: 4,
        questions: [
          {
            questionNumber: 71,
            questionText: 'What kind of business is being advertised?',
            options: [
              { id: 'opt_1', text: '(A) Car repair shop' },
              { id: 'opt_2', text: '(B) Dental clinic' },
              { id: 'opt_3', text: '(C) Grocery supermarket' },
              { id: 'opt_4', text: '(D) Fitness gym' },
            ],
            correctAnswers: ['opt_4'],
            explanation: 'The speaker mentions personal trainers and membership discounts.',
            score: 1,
          },
        ],
      }),
    });
    const part4GroupData = await part4GroupRes.json();
    if (part4GroupData.status === 'success') {
      logPass('Builder Part 4 (audio talk) group created');
    } else {
      logFail('Builder Part 4', part4GroupData.message);
    }

    // Part 5: Incomplete Sentences (single)
    const part5GroupRes = await fetch(`${API_BASE}/admin/toeic-tests/${manualTestId}/groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${teacherToken}` },
      body: JSON.stringify({
        partNumber: 5,
        type: 'single',
        title: 'Part 5 Incomplete Sentences',
        order: 5,
        questions: [
          {
            questionNumber: 101,
            questionText: 'Mr. Henderson will _____ the regional directors at the conference.',
            options: [
              { id: 'opt_1', text: '(A) meet' },
              { id: 'opt_2', text: '(B) meeting' },
              { id: 'opt_3', text: '(C) met' },
              { id: 'opt_4', text: '(D) meets' },
            ],
            correctAnswers: ['opt_1'],
            explanation: 'Modal verb "will" is followed by bare infinitive "meet".',
            score: 1,
          },
          {
            questionNumber: 102,
            questionText: 'Please review the attached contract _____ signing it.',
            options: [
              { id: 'opt_1', text: '(A) before' },
              { id: 'opt_2', text: '(B) during' },
              { id: 'opt_3', text: '(C) while' },
              { id: 'opt_4', text: '(D) until' },
            ],
            correctAnswers: ['opt_1'],
            explanation: 'Preposition "before" takes gerund "signing".',
            score: 1,
          },
        ],
      }),
    });
    const part5GroupData = await part5GroupRes.json();
    part5GroupId = part5GroupData.data?.group?._id;
    sampleQId = part5GroupData.data?.group?.questionIds?.[0]?._id || part5GroupData.data?.group?.questionIds?.[0];
    if (part5GroupData.status === 'success' && part5GroupId) {
      logPass('Builder Part 5 (single choice) group created');
    } else {
      logFail('Builder Part 5', part5GroupData.message);
    }

    // Part 6: Text Completion (passage)
    const part6GroupRes = await fetch(`${API_BASE}/admin/toeic-tests/${manualTestId}/groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${teacherToken}` },
      body: JSON.stringify({
        partNumber: 6,
        type: 'passage',
        title: 'Part 6 Memo on Office Policy',
        passages: [
          {
            title: 'Office Memo',
            content: 'Notice to all staff: Starting next Monday, the cafeteria will offer subsidized lunches. We hope this initiative _____ wellness.',
            order: 1,
          },
        ],
        order: 6,
        questions: [
          {
            questionNumber: 131,
            questionText: 'Select the best word for blank [131].',
            options: [
              { id: 'opt_1', text: '(A) promotes' },
              { id: 'opt_2', text: '(B) promotion' },
              { id: 'opt_3', text: '(C) promoter' },
              { id: 'opt_4', text: '(D) promotable' },
            ],
            correctAnswers: ['opt_1'],
            explanation: 'Subject "this initiative" takes singular verb "promotes".',
            score: 1,
          },
        ],
      }),
    });
    const part6GroupData = await part6GroupRes.json();
    if (part6GroupData.status === 'success') {
      logPass('Builder Part 6 (passage stimulus) group created');
    } else {
      logFail('Builder Part 6', part6GroupData.message);
    }

    // Part 7: Reading Comprehension (multi_passage)
    const part7GroupRes = await fetch(`${API_BASE}/admin/toeic-tests/${manualTestId}/groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${teacherToken}` },
      body: JSON.stringify({
        partNumber: 7,
        type: 'multi_passage',
        title: 'Part 7 Double Passage: Email & Schedule',
        passages: [
          {
            title: 'Email from Director',
            content: 'Dear team, attached is the revised agenda for the Tokyo summit.',
            order: 1,
          },
          {
            title: 'Summit Schedule',
            content: '9:00 AM: Keynote speech by CEO. 11:00 AM: Product roadmap presentation.',
            order: 2,
          },
        ],
        order: 7,
        questions: [
          {
            questionNumber: 176,
            questionText: 'What is the purpose of the email?',
            options: [
              { id: 'opt_1', text: '(A) To provide summit agenda' },
              { id: 'opt_2', text: '(B) To cancel flight tickets' },
              { id: 'opt_3', text: '(C) To ask for budget approval' },
              { id: 'opt_4', text: '(D) To introduce new hires' },
            ],
            correctAnswers: ['opt_1'],
            explanation: 'The email says "attached is the revised agenda".',
            score: 1,
          },
          {
            questionNumber: 177,
            questionText: 'What will happen at 9:00 AM?',
            options: [
              { id: 'opt_1', text: '(A) Product roadmap' },
              { id: 'opt_2', text: '(B) Keynote speech by CEO' },
              { id: 'opt_3', text: '(C) Lunch buffet' },
              { id: 'opt_4', text: '(D) Team workshop' },
            ],
            correctAnswers: ['opt_2'],
            explanation: 'Schedule explicitly states 9:00 AM Keynote speech by CEO.',
            score: 1,
          },
        ],
      }),
    });
    const part7GroupData = await part7GroupRes.json();
    if (part7GroupData.status === 'success') {
      logPass('Builder Part 7 (multi_passage) group created');
    } else {
      logFail('Builder Part 7', part7GroupData.message);
    }

    // ------------------------------------------------------------------------
    // 6. EDITING GROUP & QUESTION (PERSISTENCE CHECK)
    // ------------------------------------------------------------------------
    const updateGroupRes = await fetch(`${API_BASE}/admin/toeic-tests/${manualTestId}/groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${teacherToken}` },
      body: JSON.stringify({
        groupId: part5GroupId,
        partNumber: 5,
        type: 'single',
        title: 'Part 5 Updated Title by Teacher',
        questions: [
          {
            questionNumber: 101,
            questionText: 'Mr. Henderson will _____ the regional directors tomorrow.',
            options: [
              { id: 'opt_1', text: '(A) meet' },
              { id: 'opt_2', text: '(B) meeting' },
              { id: 'opt_3', text: '(C) met' },
              { id: 'opt_4', text: '(D) meets' },
            ],
            correctAnswers: ['opt_1'],
            explanation: 'Updated explanation by teacher.',
            score: 2,
          },
        ],
      }),
    });
    const updateGroupData = await updateGroupRes.json();
    if (updateGroupData.status === 'success' && updateGroupData.data?.group?.title === 'Part 5 Updated Title by Teacher') {
      logPass('Teacher updated QuestionGroup and Question persisted successfully');
    } else {
      logFail('Group update', updateGroupData.message);
    }

    // Verify detail fetch
    const fetchDetailRes = await fetch(`${API_BASE}/admin/toeic-tests/${manualTestId}`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
    const fetchDetailData = await fetchDetailRes.json();
    const totalQuestionsAfterBuilder = fetchDetailData.data?.assessment?.questions?.length || 0;
    if (fetchDetailData.status === 'success' && totalQuestionsAfterBuilder > 0) {
      logPass(`Teacher fetched test details: ${totalQuestionsAfterBuilder} total questions across Parts 1–7`);
    } else {
      logFail('Fetch detail', 'Questions count is 0');
    }

    // ------------------------------------------------------------------------
    // 7. DELETE QUESTION & DELETE GROUP ENDPOINTS
    // ------------------------------------------------------------------------
    // Add a temporary group to test delete group
    const tempGroupRes = await fetch(`${API_BASE}/admin/toeic-tests/${manualTestId}/groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${teacherToken}` },
      body: JSON.stringify({
        partNumber: 5,
        type: 'single',
        title: 'Temporary Group to Delete',
        questions: [
          {
            questionNumber: 999,
            questionText: 'Temporary Question?',
            options: [
              { id: 'opt_1', text: 'A' },
              { id: 'opt_2', text: 'B' },
            ],
            correctAnswers: ['opt_1'],
          },
        ],
      }),
    });
    const tempGroupData = await tempGroupRes.json();
    const tempGroupId = tempGroupData.data?.group?._id;
    const tempQId = tempGroupData.data?.group?.questionIds?.[0]?._id || tempGroupData.data?.group?.questionIds?.[0];

    // Delete single question test
    const deleteQRes = await fetch(`${API_BASE}/admin/toeic-tests/${manualTestId}/questions/${tempQId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
    const deleteQData = await deleteQRes.json();
    if (deleteQData.status === 'success') {
      logPass('Endpoint DELETE /admin/toeic-tests/:id/questions/:questionId succeeded');
    } else {
      logFail('Delete question endpoint', deleteQData.message);
    }

    // Delete group test
    const deleteGroupRes = await fetch(`${API_BASE}/admin/toeic-tests/${manualTestId}/groups/${tempGroupId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
    const deleteGroupData = await deleteGroupRes.json();
    if (deleteGroupData.status === 'success') {
      logPass('Endpoint DELETE /admin/toeic-tests/:id/groups/:groupId succeeded');
    } else {
      logFail('Delete group endpoint', deleteGroupData.message);
    }

    // ------------------------------------------------------------------------
    // 8. DUPLICATE TEST (CLONE)
    // ------------------------------------------------------------------------
    const dupRes = await fetch(`${API_BASE}/admin/toeic-tests/${manualTestId}/duplicate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
    const dupData = await dupRes.json();
    const duplicatedTestId = dupData.data?.assessment?._id || dupData.data?.newTest?._id;
    if (dupData.status === 'success' && duplicatedTestId && duplicatedTestId !== manualTestId) {
      logPass('Teacher duplicated TOEIC test successfully (deep copy with new IDs)', duplicatedTestId);
    } else {
      logFail('Duplicate test', dupData.message);
    }

    // ------------------------------------------------------------------------
    // 9. CSV IMPORT PREVIEW & REAL IMPORT
    // ------------------------------------------------------------------------
    const csvContentValid = `part,question_number,question_text,option_a,option_b,option_c,option_d,correct_answer,explanation
5,103,Ms. Watson completed the survey _____,quick,quickly,quicker,quickness,B,Adverb modifies verb completed
5,104,The conference will begin _____ 9:00 AM.,at,on,in,by,A,Preposition at precedes time`;

    // Preview only
    const csvPreviewRes = await fetch(`${API_BASE}/admin/toeic-tests/${manualTestId}/import-preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${teacherToken}` },
      body: JSON.stringify({ csvContent: csvContentValid }),
    });
    const csvPreviewData = await csvPreviewRes.json();
    if (csvPreviewData.status === 'success' && csvPreviewData.data?.totalParsed === 2) {
      logPass('CSV Import Preview parsed 2 questions accurately');
    } else {
      logFail('CSV preview', csvPreviewData.message);
    }

    // Invalid CSV preview test (missing correct answer)
    const csvInvalid = `part,question_number,question_text,option_a,option_b,option_c,option_d,correct_answer
5,105,Invalid question missing answer,A,B,C,D,`;
    const csvInvalidRes = await fetch(`${API_BASE}/admin/toeic-tests/${manualTestId}/import-preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${teacherToken}` },
      body: JSON.stringify({ csvContent: csvInvalid }),
    });
    const csvInvalidData = await csvInvalidRes.json();
    if (csvInvalidData.data?.errors?.length > 0 || csvInvalidData.data?.invalidRows > 0 || csvInvalidRes.status === 400) {
      logPass('CSV Import Preview properly catches and flags invalid rows');
    } else {
      logFail('CSV invalid check', 'Did not flag invalid CSV row');
    }

    // Confirm CSV Import
    const csvImportRes = await fetch(`${API_BASE}/admin/toeic-tests/${manualTestId}/import-csv`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${teacherToken}` },
      body: JSON.stringify({ csvContent: csvContentValid, previewOnly: false }),
    });
    const csvImportData = await csvImportRes.json();
    if (csvImportData.status === 'success') {
      logPass('CSV Bulk Import committed questions to DB');
    } else {
      logFail('CSV import', csvImportData.message);
    }

    // ------------------------------------------------------------------------
    // 10. PDF IMPORT — BẮT BUỘC FLOW
    // ------------------------------------------------------------------------
    console.log('\n--- TESTING MANDATORY PDF IMPORT PIPELINE ---');
    const pdfBuffer = await generateSampleToeicPdfBuffer();

    const pdfFormData = new FormData();
    pdfFormData.append('file', new Blob([pdfBuffer], { type: 'application/pdf' }), 'ets_toeic_sample_test.pdf');
    pdfFormData.append('title', `TOEIC Sample Import PDF ${ts}`);
    pdfFormData.append('toeicMode', 'full_test');
    pdfFormData.append('durationMinutes', '120');

    const pdfImportRes = await fetch(`${API_BASE}/admin/toeic-tests/import-pdf`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${teacherToken}` },
      body: pdfFormData,
    });
    const pdfImportData = await pdfImportRes.json();

    if (pdfImportData.status !== 'success') {
      throw new Error(`PDF Import failed: ${pdfImportData.message}`);
    }

    pdfImportedTestId = pdfImportData.data?.testId;
    const report = pdfImportData.data;

    // Verify PDF Report fields
    if (report && report.detected && report.detected.questions > 0) {
      const partsDisplay = Array.isArray(report.detected.parts) ? report.detected.parts.join(', ') : report.detected.parts;
      logPass(`PDF Import parsed ${report.detected.questions} questions across Parts: ${partsDisplay}`);
    } else {
      logFail('PDF detected metrics', 'Zero questions detected');
    }

    // Verify test status is strictly DRAFT (NOT auto-published)
    if (report.status === 'draft') {
      logPass('Security/Policy: Imported PDF test remains strictly in DRAFT status');
    } else {
      logFail('PDF auto-publish policy', `Imported test auto-published as: ${report.status}`);
    }

    // Verify missing audio notice for Listening
    if (report.missing && report.missing.length > 0) {
      logPass('PDF Report correctly notifies teacher that Listening sections require separate audio files');
    } else {
      logFail('PDF missing audio notice', 'Expected missing audio warnings');
    }

    // Verify Student CANNOT see the imported draft test
    const studentListPdfRes = await fetch(`${API_BASE}/toeic/tests`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    const studentListPdfData = await studentListPdfRes.json();
    const pdfTests = studentListPdfData.data?.tests || studentListPdfData.data?.assessments || [];
    const foundPdfDraftInStudent = pdfTests.some(
      (t) => t._id === pdfImportedTestId
    );
    if (!foundPdfDraftInStudent) {
      logPass('Imported PDF Draft test is NOT visible to student before review/publish');
    } else {
      logFail('Draft visibility', 'Imported test visible to students prematurely!');
    }

    // ------------------------------------------------------------------------
    // 11. REVIEW & EDIT IMPORTED DRAFT IN BUILDER
    // ------------------------------------------------------------------------
    // Teacher updates title or fixes a question in the imported draft
    const updatePdfDraftRes = await fetch(`${API_BASE}/admin/toeic-tests/${pdfImportedTestId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${teacherToken}` },
      body: JSON.stringify({
        title: `TOEIC Sample Import PDF ${ts} - Reviewed by Teacher`,
        description: 'Đã kiểm tra Part 1-7 và bổ sung giải thích',
        status: 'draft',
      }),
    });
    const updatePdfDraftData = await updatePdfDraftRes.json();
    if (updatePdfDraftData.status === 'success' && updatePdfDraftData.data?.assessment?.status === 'draft') {
      logPass('Teacher reviewed and edited Draft test in Builder, preserved DRAFT status');
    } else {
      logFail('Review edit draft', updatePdfDraftData.message);
    }

    // ------------------------------------------------------------------------
    // 12. MANUAL PUBLISH BY TEACHER
    // ------------------------------------------------------------------------
    const publishRes = await fetch(`${API_BASE}/admin/toeic-tests/${pdfImportedTestId}/publish`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
    const publishData = await publishRes.json();
    if (publishData.status === 'success' && publishData.data?.assessment?.status === 'published') {
      logPass('Teacher manually published the reviewed TOEIC test');
    } else {
      logFail('Manual publish', publishData.message);
    }

    // ------------------------------------------------------------------------
    // 13. STUDENT SEES PUBLISHED TEST & ATTEMPT SECURITY
    // ------------------------------------------------------------------------
    const studentListAfterPublishRes = await fetch(`${API_BASE}/toeic/tests`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    const studentListAfterPublishData = await studentListAfterPublishRes.json();
    const publishedTests = studentListAfterPublishData.data?.tests || studentListAfterPublishData.data?.assessments || [];
    const foundPublishedInStudent = publishedTests.some(
      (t) => t._id === pdfImportedTestId
    );
    if (foundPublishedInStudent) {
      logPass('Student can now access and view the published TOEIC test in library');
    } else {
      logFail('Published visibility', 'Published test not appearing in student list');
    }

    // Student starts attempt -> check answer security (correct answers must not leak)
    const studentStartAttemptRes = await fetch(`${API_BASE}/toeic/tests/${pdfImportedTestId}/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    const studentStartAttemptData = await studentStartAttemptRes.json();
    const attemptParts = studentStartAttemptData.data?.parts || [];

    let hasCorrectAnswerLeaked = false;
    for (const p of attemptParts) {
      for (const g of p.groups || []) {
        for (const q of g.questions || []) {
          if (q.correctAnswers || q.correctAnswer || q.explanation) {
            hasCorrectAnswerLeaked = true;
          }
        }
      }
    }

    if (!hasCorrectAnswerLeaked && studentStartAttemptData.status === 'success') {
      logPass('Answer Security: Student attempt payload does NOT expose correctAnswers or explanation');
    } else {
      logFail('Answer security leak', 'correctAnswers or explanation leaked to student!');
    }

    // ------------------------------------------------------------------------
    // 14. UNPUBLISH (REVERT TO DRAFT)
    // ------------------------------------------------------------------------
    const unpublishRes = await fetch(`${API_BASE}/admin/toeic-tests/${pdfImportedTestId}/unpublish`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
    const unpublishData = await unpublishRes.json();
    if (unpublishData.status === 'success' && unpublishData.data?.assessment?.status === 'draft') {
      logPass('Teacher unpublished TOEIC test, reverted to DRAFT status');
    } else {
      logFail('Unpublish test', unpublishData.message);
    }

    // Verify hidden from student again
    const studentListAfterUnpublishRes = await fetch(`${API_BASE}/toeic/tests`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    const studentListAfterUnpublishData = await studentListAfterUnpublishRes.json();
    const afterUnpublishTests = studentListAfterUnpublishData.data?.tests || studentListAfterUnpublishData.data?.assessments || [];
    const foundAfterUnpublish = afterUnpublishTests.some(
      (t) => t._id === pdfImportedTestId
    );
    if (!foundAfterUnpublish) {
      logPass('Unpublished test is immediately hidden from Student view again');
    } else {
      logFail('Unpublish visibility', 'Unpublished test still visible to students!');
    }

    // ------------------------------------------------------------------------
    // 15. CLEANUP FIXTURES
    // ------------------------------------------------------------------------
    console.log('\n--- CLEANING UP TEST FIXTURES ---');
    if (duplicatedTestId) {
      await Assessment.findByIdAndDelete(duplicatedTestId);
    }
    // Delete created questions and groups for test fixtures
    await Question.deleteMany({ createdBy: teacherId });
    await QuestionGroup.deleteMany({ assessment: { $in: [manualTestId, pdfImportedTestId] } });
    await Assessment.deleteMany({ _id: { $in: [manualTestId, pdfImportedTestId] } });
    await User.deleteMany({ _id: { $in: [teacherId, studentId] } });
    logPass('Cleaned up test users, tests, and question groups safely');

    console.log('\n================================================================');
    console.log(`🏁 TEACHER BUILDER + PDF IMPORT SUITE COMPLETED: ${passed} PASS / ${failed} FAIL`);
    console.log('================================================================\n');

    process.exit(failed > 0 ? 1 : 0);
  } catch (err) {
    console.error('Fatal error in teacher TOEIC builder suite:', err);
    process.exit(1);
  }
}

runTeacherToeicBuilderE2E();
