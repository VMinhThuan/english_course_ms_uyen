import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import mongoose from 'mongoose';
import User from '../models/User.js';
import Assessment from '../models/Assessment.js';
import Question from '../models/Question.js';
import QuestionGroup from '../models/QuestionGroup.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../../.env') });

async function seedBrowserFixture() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/english_course');

  const email = 'student_browser@test.com';
  const password = 'Password123!';

  let student = await User.findOne({ email });
  if (!student) {
    student = await User.create({
      fullName: 'Student Browser Tester',
      email,
      phoneNumber: '0988776655',
      password,
      role: 'student',
      status: 'active',
    });
  }

  let admin = await User.findOne({ role: 'admin' });
  if (!admin) {
    admin = await User.create({
      fullName: 'Admin Tester',
      email: 'admin_fixture@test.com',
      phoneNumber: '0988776656',
      password,
      role: 'admin',
      status: 'active',
    });
  }

  // Check if test fixture already exists
  let existingTest = await Assessment.findOne({ title: 'TOEIC Official Practice Test 2026', status: 'published' });
  if (!existingTest) {
    const test = await Assessment.create({
      title: 'TOEIC Official Practice Test 2026',
      description: 'Luyện tập đề thi chuẩn format ETS TOEIC Listening & Reading đầy đủ từ Part 1 đến Part 7.',
      type: 'exam',
      examFormat: 'toeic',
      toeicMode: 'full_test',
      durationMinutes: 120,
      showCorrectAnswers: true,
      status: 'published',
      createdBy: admin._id,
    });

    // P1
    const q1 = await Question.create({
      questionText: 'Look at the photograph labeled number 1.',
      type: 'single_choice',
      toeicPart: 1,
      questionNumber: 1,
      options: [
        { id: 'opt-1a', text: 'A. A man is walking along the street.' },
        { id: 'opt-1b', text: 'B. A man is writing on a whiteboard.' },
        { id: 'opt-1c', text: 'C. A man is holding a cup.' },
        { id: 'opt-1d', text: 'D. A man is operating machinery.' },
      ],
      correctAnswers: ['B. A man is writing on a whiteboard.'],
      explanation: 'The man is standing in front of a whiteboard holding a marker.',
    });
    const g1 = await QuestionGroup.create({
      assessment: test._id,
      partNumber: 1,
      type: 'audio_image',
      title: 'Part 1: Photographs',
      imageUrl: '/uploads/images/sample_part1.jpg',
      audioUrl: '/uploads/audio/sample_part1.mp3',
      questionIds: [q1._id],
      order: 1,
    });

    // P2
    const q2 = await Question.create({
      questionText: 'Where can I find the quarterly sales report?',
      type: 'single_choice',
      toeicPart: 2,
      questionNumber: 2,
      options: [
        { id: 'opt-2a', text: 'A. On the shared drive under Finance.' },
        { id: 'opt-2b', text: 'B. Yes, sales went up by 15%.' },
        { id: 'opt-2c', text: 'C. Tomorrow morning at nine.' },
      ],
      correctAnswers: ['A. On the shared drive under Finance.'],
      explanation: 'Answers where the report is located.',
    });
    const g2 = await QuestionGroup.create({
      assessment: test._id,
      partNumber: 2,
      type: 'audio',
      title: 'Part 2: Question-Response',
      audioUrl: '/uploads/audio/sample_part2.mp3',
      questionIds: [q2._id],
      order: 2,
    });

    // P3
    const q3 = await Question.create({
      questionText: 'What problem does the woman mention?',
      type: 'single_choice',
      toeicPart: 3,
      questionNumber: 3,
      options: [
        { id: 'opt-3a', text: 'A. The printer is out of toner.' },
        { id: 'opt-3b', text: 'B. The conference room is double-booked.' },
        { id: 'opt-3c', text: 'C. The client arrived late.' },
        { id: 'opt-3d', text: 'D. The projector is missing.' },
      ],
      correctAnswers: ['B. The conference room is double-booked.'],
      explanation: 'The woman states both marketing and sales booked Room 3.',
    });
    const g3 = await QuestionGroup.create({
      assessment: test._id,
      partNumber: 3,
      type: 'audio',
      title: 'Part 3: Office Meeting Scheduling',
      audioUrl: '/uploads/audio/sample_part3.mp3',
      instructions: 'Questions 3 refers to the following conversation.',
      questionIds: [q3._id],
      order: 3,
    });

    // P4
    const q4 = await Question.create({
      questionText: 'Who most likely is the speaker?',
      type: 'single_choice',
      toeicPart: 4,
      questionNumber: 4,
      options: [
        { id: 'opt-4a', text: 'A. A flight attendant' },
        { id: 'opt-4b', text: 'B. A tour guide' },
        { id: 'opt-4c', text: 'C. A museum curator' },
        { id: 'opt-4d', text: 'D. A radio host' },
      ],
      correctAnswers: ['B. A tour guide'],
      explanation: 'The speaker welcomes visitors to the historic city tour.',
    });
    const g4 = await QuestionGroup.create({
      assessment: test._id,
      partNumber: 4,
      type: 'audio',
      title: 'Part 4: Guided Tour Announcement',
      audioUrl: '/uploads/audio/sample_part4.mp3',
      questionIds: [q4._id],
      order: 4,
    });

    // P5
    const q5 = await Question.create({
      questionText: 'All employees must submit their travel expense reports _____ Friday.',
      type: 'single_choice',
      toeicPart: 5,
      questionNumber: 5,
      options: [
        { id: 'opt-5a', text: 'A. by' },
        { id: 'opt-5b', text: 'B. until' },
        { id: 'opt-5c', text: 'C. into' },
        { id: 'opt-5d', text: 'D. along' },
      ],
      correctAnswers: ['A. by'],
      explanation: '"by" signifies a deadline.',
    });
    const g5 = await QuestionGroup.create({
      assessment: test._id,
      partNumber: 5,
      type: 'single',
      title: 'Part 5: Incomplete Sentences',
      questionIds: [q5._id],
      order: 5,
    });

    // P6
    const q6 = await Question.create({
      questionText: 'What is the purpose of this email?',
      type: 'single_choice',
      toeicPart: 6,
      questionNumber: 6,
      options: [
        { id: 'opt-6a', text: 'A. To announce a staff promotion' },
        { id: 'opt-6b', text: 'B. To notify about building maintenance' },
        { id: 'opt-6c', text: 'C. To welcome new clients' },
        { id: 'opt-6d', text: 'D. To reschedule a team lunch' },
      ],
      correctAnswers: ['B. To notify about building maintenance'],
      explanation: 'The email informs staff of elevator repairs.',
    });
    const g6 = await QuestionGroup.create({
      assessment: test._id,
      partNumber: 6,
      type: 'passage',
      title: 'Part 6: Notice of Elevator Maintenance',
      passages: [
        {
          title: 'Facility Management Notice',
          content: 'Please be advised that the main elevators will undergo scheduled servicing this Saturday from 8:00 AM to 1:00 PM. Please use the west stairs during this period.',
        },
      ],
      questionIds: [q6._id],
      order: 6,
    });

    // P7
    const q7 = await Question.create({
      questionText: 'What discount is offered for early registration?',
      type: 'single_choice',
      toeicPart: 7,
      questionNumber: 7,
      options: [
        { id: 'opt-7a', text: 'A. 10 percent' },
        { id: 'opt-7b', text: 'B. 15 percent' },
        { id: 'opt-7c', text: 'C. 20 percent' },
        { id: 'opt-7d', text: 'D. 25 percent' },
      ],
      correctAnswers: ['C. 20 percent'],
      explanation: 'The brochure states: "Register before Nov 1 to receive 20% off".',
    });
    const g7 = await QuestionGroup.create({
      assessment: test._id,
      partNumber: 7,
      type: 'multi_passage',
      title: 'Part 7: Tech Summit Brochure & Registration',
      passages: [
        {
          title: 'Document 1: Conference Program',
          content: 'Annual Tech Innovation Summit\nDate: December 5-7\nVenue: Grand Convention Center\nEarly bird pricing available until November 1.',
        },
        {
          title: 'Document 2: Pricing Table',
          content: 'Standard Pass: $500\nEarly Bird Discount: 20% off standard pass\nStudent Pass: $150.',
        },
      ],
      questionIds: [q7._id],
      order: 7,
    });

    await Assessment.findByIdAndUpdate(test._id, {
      questionGroups: [g1._id, g2._id, g3._id, g4._id, g5._id, g6._id, g7._id],
      questions: [
        { question: q1._id, score: 1 },
        { question: q2._id, score: 1 },
        { question: q3._id, score: 1 },
        { question: q4._id, score: 1 },
        { question: q5._id, score: 1 },
        { question: q6._id, score: 1 },
        { question: q7._id, score: 1 },
      ],
      parts: [
        { partNumber: 1, name: 'Photographs', section: 'listening', questionGroups: [g1._id], order: 1 },
        { partNumber: 2, name: 'Question-Response', section: 'listening', questionGroups: [g2._id], order: 2 },
        { partNumber: 3, name: 'Conversations', section: 'listening', questionGroups: [g3._id], order: 3 },
        { partNumber: 4, name: 'Talks', section: 'listening', questionGroups: [g4._id], order: 4 },
        { partNumber: 5, name: 'Incomplete Sentences', section: 'reading', questionGroups: [g5._id], order: 5 },
        { partNumber: 6, name: 'Text Completion', section: 'reading', questionGroups: [g6._id], order: 6 },
        { partNumber: 7, name: 'Reading Comprehension', section: 'reading', questionGroups: [g7._id], order: 7 },
      ],
    });

    console.log('✅ Created and published TOEIC fixture:', test._id);
  } else {
    console.log('✅ Existing published TOEIC fixture found:', existingTest._id);
  }

  await mongoose.disconnect();
  console.log('Done seeding fixture.');
}

seedBrowserFixture();
