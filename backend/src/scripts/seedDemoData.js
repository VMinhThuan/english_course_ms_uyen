import dotenv from 'dotenv';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { mkdir, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import User from '../models/User.js';
import Instructor from '../models/Instructor.js';
import Course from '../models/Course.js';
import Lesson from '../models/Lesson.js';
import Material from '../models/Material.js';
import Vocabulary from '../models/Vocabulary.js';
import Question from '../models/Question.js';
import Assessment from '../models/Assessment.js';
import QuestionGroup from '../models/QuestionGroup.js';
import Enrollment from '../models/Enrollment.js';
import LearningProgress from '../models/LearningProgress.js';
import Attempt from '../models/Attempt.js';
import Test from '../models/Test.js';
import Rating from '../models/Rating.js';
import Review from '../models/Review.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const backendRoot = join(__dirname, '../..');
dotenv.config({ path: join(backendRoot, '.env') });

const PASSWORD = 'Demo@12345';
const now = new Date();
const day = 24 * 60 * 60 * 1000;

const counts = (documents) => Object.fromEntries(
  Object.entries(documents).map(([name, values]) => [name, values.length])
);

const buildOptions = (key) => [
  { id: `${key}_a`, text: 'Đáp án A' },
  { id: `${key}_b`, text: 'Đáp án B' },
  { id: `${key}_c`, text: 'Đáp án C' },
  { id: `${key}_d`, text: 'Đáp án D' },
];

function standardQuestion({ key, lesson, topic, createdBy, index }) {
  const type = ['single_choice', 'multiple_choice', 'fill_blank', 'typed_answer'][index % 4];
  const options = ['single_choice', 'multiple_choice'].includes(type) ? buildOptions(key) : [];
  const correctAnswers = type === 'multiple_choice'
    ? [`${key}_a`, `${key}_c`]
    : type === 'single_choice'
      ? [`${key}_b`]
      : [`answer-${index + 1}`];

  return {
    questionText: type === 'fill_blank'
      ? `Hoàn thành câu ${index + 1}: The meeting will begin ____ nine o'clock.`
      : `Câu hỏi luyện tập ${index + 1}: Chọn đáp án phù hợp trong ngữ cảnh TOEIC.`,
    type,
    options,
    correctAnswers,
    explanation: `Giải thích cho câu hỏi luyện tập ${index + 1}.`,
    score: index % 5 === 0 ? 2 : 1,
    lesson,
    topic,
    status: 'published',
    order: index + 1,
    createdBy,
  };
}

function toeicQuestion({ assessmentId, groupId, partNumber, questionNumber, createdBy }) {
  const key = `toeic_${assessmentId}_${questionNumber}`;
  const questionText = partNumber === 7
    ? `Theo đoạn văn, thông tin nào đúng ở câu ${questionNumber}?`
    : partNumber === 6
      ? `Chọn từ phù hợp để hoàn thành đoạn văn ở câu ${questionNumber}.`
      : `Câu hỏi TOEIC Part ${partNumber}, số ${questionNumber}.`;
  return {
    questionText,
    type: 'single_choice',
    options: buildOptions(key),
    correctAnswers: [`${key}_b`],
    explanation: `Giải thích mẫu cho câu TOEIC ${questionNumber}.`,
    score: 1,
    topic: `TOEIC Part ${partNumber}`,
    status: 'published',
    toeicPart: partNumber,
    questionGroup: groupId,
    questionNumber,
    order: questionNumber,
    createdBy,
  };
}

function snapshot(question) {
  return {
    questionId: question._id.toString(),
    type: question.type,
    questionText: question.questionText,
    options: question.options,
    correctAnswers: question.correctAnswers,
    score: question.score,
    explanation: question.explanation,
    toeicPart: question.toeicPart,
    questionGroupId: question.questionGroup?.toString(),
    questionNumber: question.questionNumber,
    order: question.order,
  };
}

function answerFor(question, isCorrect) {
  if (!isCorrect) {
    if (question.type === 'multiple_choice') return [question.options[1].id];
    if (question.type === 'single_choice') return question.options[0].id;
    return 'incorrect-answer';
  }
  return question.type === 'multiple_choice'
    ? question.correctAnswers
    : question.correctAnswers[0];
}

function scoreAttempt(questions, percentCorrect) {
  const answers = {};
  let score = 0;
  let correctCount = 0;
  let unansweredCount = 0;

  questions.forEach((question, index) => {
    const unanswered = index % 11 === 10;
    if (unanswered) {
      unansweredCount += 1;
      return;
    }
    const isCorrect = (index % 100) < percentCorrect;
    answers[question._id.toString()] = answerFor(question, isCorrect);
    if (isCorrect) {
      score += question.score;
      correctCount += 1;
    }
  });

  const maxScore = questions.reduce((total, question) => total + question.score, 0);
  return {
    answers,
    score,
    maxScore,
    correctCount,
    incorrectCount: questions.length - correctCount - unansweredCount,
    unansweredCount,
    scorePercentage: maxScore ? Math.round((score / maxScore) * 100) : 0,
  };
}

function toeicBreakdown(questions, percentCorrect) {
  const byPart = {};
  let listeningCorrect = 0;
  let readingCorrect = 0;
  let listeningTotal = 0;
  let readingTotal = 0;

  for (const question of questions) {
    const part = question.toeicPart;
    const correct = (question.questionNumber % 100) < percentCorrect;
    if (!byPart[part]) byPart[part] = { correct: 0, total: 0 };
    byPart[part].total += 1;
    if (correct) byPart[part].correct += 1;
    if (part <= 4) {
      listeningTotal += 1;
      if (correct) listeningCorrect += 1;
    } else {
      readingTotal += 1;
      if (correct) readingCorrect += 1;
    }
  }

  const partBreakdown = Object.fromEntries(
    Object.entries(byPart).map(([part, value]) => [`part${part}`, value])
  );
  const listeningScore = Math.max(5, Math.round((listeningCorrect / listeningTotal) * 495));
  const readingScore = Math.max(5, Math.round((readingCorrect / readingTotal) * 495));

  return {
    listeningCorrect,
    readingCorrect,
    listeningTotal,
    readingTotal,
    listeningScore,
    readingScore,
    estimatedToeicScore: listeningScore + readingScore,
    partBreakdown,
  };
}

async function ensureEmptyDatabase() {
  const models = [
    User, Instructor, Course, Lesson, Material, Vocabulary, Question, Assessment,
    QuestionGroup, Enrollment, LearningProgress, Attempt, Test, Rating, Review,
  ];
  const existing = await Promise.all(models.map(async (model) => [model.modelName, await model.countDocuments()]));
  const populated = existing.filter(([, count]) => count > 0);
  if (populated.length) {
    throw new Error(`Database already contains data: ${populated.map(([name, count]) => `${name}=${count}`).join(', ')}. This seed only runs on an empty database.`);
  }
}

async function createDownloadFixture() {
  const uploadsDir = join(backendRoot, 'uploads');
  await mkdir(uploadsDir, { recursive: true });
  const filePath = join(uploadsDir, 'tai-lieu-demo-ms-uyen.txt');
  await writeFile(filePath, 'Tài liệu demo của website học tiếng Anh Ms Uyên.\n', 'utf8');
  return filePath;
}

async function seedDemoData() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  await mongoose.connect(process.env.MONGODB_URI);
  await ensureEmptyDatabase();

  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const adminId = new mongoose.Types.ObjectId();
  const teacherIds = Array.from({ length: 4 }, () => new mongoose.Types.ObjectId());
  const activeStudentIds = Array.from({ length: 120 }, () => new mongoose.Types.ObjectId());
  const pendingStudentIds = Array.from({ length: 12 }, () => new mongoose.Types.ObjectId());
  const rejectedStudentIds = Array.from({ length: 5 }, () => new mongoose.Types.ObjectId());
  const suspendedStudentIds = Array.from({ length: 5 }, () => new mongoose.Types.ObjectId());

  const users = [
    {
      _id: adminId,
      fullName: 'Quản trị viên Ms Uyên',
      email: 'admin@msuyen.local',
      password: passwordHash,
      phoneNumber: '0900000000',
      role: 'admin',
      status: 'active',
      isActive: true,
    },
    ...teacherIds.map((id, index) => ({
      _id: id,
      fullName: `Giáo viên TOEIC ${index + 1}`,
      email: `teacher${index + 1}@msuyen.local`,
      password: passwordHash,
      phoneNumber: `09000000${String(index + 1).padStart(2, '0')}`,
      role: 'teacher',
      status: 'active',
      isActive: true,
    })),
    ...activeStudentIds.map((id, index) => ({
      _id: id,
      fullName: `Học viên demo ${String(index + 1).padStart(3, '0')}`,
      email: `student${String(index + 1).padStart(3, '0')}@msuyen.local`,
      password: passwordHash,
      phoneNumber: `091${String(index + 1).padStart(7, '0')}`,
      role: 'student',
      status: 'active',
      isActive: true,
      approvedAt: new Date(now - (index + 5) * day),
      approvedBy: adminId,
    })),
    ...pendingStudentIds.map((id, index) => ({
      _id: id,
      fullName: `Học viên chờ duyệt ${String(index + 1).padStart(2, '0')}`,
      email: `pending${String(index + 1).padStart(2, '0')}@msuyen.local`,
      password: passwordHash,
      phoneNumber: `092${String(index + 1).padStart(7, '0')}`,
      role: 'student',
      status: 'pending',
      isActive: true,
    })),
    ...rejectedStudentIds.map((id, index) => ({
      _id: id,
      fullName: `Học viên bị từ chối ${String(index + 1).padStart(2, '0')}`,
      email: `rejected${String(index + 1).padStart(2, '0')}@msuyen.local`,
      password: passwordHash,
      phoneNumber: `094${String(index + 1).padStart(7, '0')}`,
      role: 'student',
      status: 'rejected',
      isActive: false,
      rejectedAt: new Date(now - (index + 3) * day),
      rejectedBy: adminId,
      rejectionReason: 'Hồ sơ demo chưa đáp ứng điều kiện duyệt.',
    })),
    ...suspendedStudentIds.map((id, index) => ({
      _id: id,
      fullName: `Học viên tạm khoá ${String(index + 1).padStart(2, '0')}`,
      email: `suspended${String(index + 1).padStart(2, '0')}@msuyen.local`,
      password: passwordHash,
      phoneNumber: `093${String(index + 1).padStart(7, '0')}`,
      role: 'student',
      status: 'suspended',
      isActive: false,
      suspendedAt: new Date(now - (index + 2) * day),
      suspendedBy: adminId,
    })),
  ];
  await User.insertMany(users);

  const instructors = await Instructor.insertMany(teacherIds.map((user, index) => ({
    user,
    name: `Giáo viên TOEIC ${index + 1}`,
    title: ['Giảng viên TOEIC', 'Giảng viên Listening', 'Giảng viên Reading', 'Giảng viên Ngữ pháp'][index],
    specialization: ['TOEIC tổng quát', 'TOEIC Listening', 'TOEIC Reading', 'TOEIC Grammar'][index],
    experience: `${5 + index} năm giảng dạy`,
    bio: `Giáo viên demo phục vụ kiểm thử quản trị nội dung và khóa học ${index + 1}.`,
    rating: 4.5 + index / 10,
    students: 30 + index * 20,
    courses: 2,
    avatar: `GV${index + 1}`,
    isActive: true,
  })));

  const courseSpecs = [
    ['TOEIC Foundation A1', 'Beginner', 'general', 'Nền tảng từ vựng và ngữ pháp TOEIC cho người mới bắt đầu.'],
    ['TOEIC Listening Part 1–4', 'Beginner', 'listening', 'Luyện nghe và làm quen bốn phần Listening TOEIC.'],
    ['TOEIC Reading Part 5–7', 'Intermediate', 'reading', 'Luyện ngữ pháp, đọc hiểu và chiến lược làm bài Reading.'],
    ['TOEIC Vocabulary Workplace', 'Intermediate', 'business', 'Từ vựng giao tiếp công sở theo chủ đề TOEIC.'],
    ['TOEIC Mini Test Strategy', 'Intermediate', 'all-skills', 'Rèn chiến thuật với đề mini test và phân tích kết quả.'],
    ['TOEIC Target 700+', 'Advanced', 'all-skills', 'Lộ trình nâng cao hướng tới mục tiêu TOEIC 700 trở lên.'],
  ];
  const courseIds = courseSpecs.map(() => new mongoose.Types.ObjectId());
  const courses = courseSpecs.map(([title, level, category, description], index) => ({
    _id: courseIds[index],
    slug: `toeic-demo-${index + 1}`,
    title,
    description,
    teacher: teacherIds[index % teacherIds.length],
    price: 0,
    level,
    category,
    englishType: 'TOEIC',
    skills: ['Listening', 'Reading', 'Vocabulary', 'Grammar'],
    rating: 4.4 + (index % 5) / 10,
    ratingCount: 20 + index * 7,
    modules: 8,
    hoursLeft: 12 + index * 2,
    isPublished: true,
    students: [],
  }));
  await Course.insertMany(courses);

  const lessons = [];
  const lessonsByCourse = new Map();
  for (let courseIndex = 0; courseIndex < courses.length; courseIndex += 1) {
    const courseLessons = [];
    for (let order = 1; order <= 8; order += 1) {
      const status = order <= 6 ? 'published' : order === 7 ? 'draft' : 'hidden';
      const lesson = {
        _id: new mongoose.Types.ObjectId(),
        title: `${courses[courseIndex].title} — Bài ${order}`,
        description: `Nội dung bài học ${order} thuộc ${courses[courseIndex].title}.`,
        content: `<h2>Bài ${order}</h2><p>Nội dung học tập demo, từ vựng và hướng dẫn làm bài.</p>`,
        course: courses[courseIndex]._id,
        topic: `Unit ${Math.ceil(order / 2)}`,
        status,
        order,
        duration: 35 + order * 5,
      };
      lessons.push(lesson);
      courseLessons.push(lesson);
    }
    lessonsByCourse.set(courses[courseIndex]._id.toString(), courseLessons);
  }
  await Lesson.insertMany(lessons);

  const downloadPath = await createDownloadFixture();
  const materials = lessons.flatMap((lesson, index) => [
    {
      title: `Tài liệu bài ${lesson.order}`,
      description: 'Tài liệu demo có thể tải xuống.',
      lesson: lesson._id,
      course: lesson.course,
      fileUrl: '/uploads/tai-lieu-demo-ms-uyen.txt',
      filePath: downloadPath,
      fileType: 'text/plain',
      fileSize: 64,
      allowDownload: index % 5 !== 0,
      status: lesson.status === 'published' ? 'published' : 'hidden',
    },
    {
      title: `Bài tập bổ trợ bài ${lesson.order}`,
      description: 'Tài liệu bổ trợ demo.',
      lesson: lesson._id,
      course: lesson.course,
      fileUrl: '/uploads/tai-lieu-demo-ms-uyen.txt',
      filePath: downloadPath,
      fileType: 'text/plain',
      fileSize: 64,
      allowDownload: true,
      status: lesson.status === 'published' ? 'published' : 'hidden',
    },
  ]);
  await Material.insertMany(materials);

  const vocabulary = lessons.flatMap((lesson) => Array.from({ length: 20 }, (_, index) => ({
    word: `toeic-word-${lesson.order}-${index + 1}`,
    meaning: `Nghĩa tiếng Việt của từ vựng ${index + 1}.`,
    partOfSpeech: ['noun', 'verb', 'adjective', 'adverb'][index % 4],
    pronunciation: `/ˈdɛməʊ ${index + 1}/`,
    explanation: `Giải thích sử dụng từ vựng ${index + 1} trong ngữ cảnh TOEIC.`,
    example: `This is an example sentence for vocabulary item ${index + 1}.`,
    exampleEnglish: `This is an example sentence for vocabulary item ${index + 1}.`,
    exampleVietnamese: `Đây là ví dụ tiếng Việt cho từ vựng ${index + 1}.`,
    lesson: lesson._id,
    course: lesson.course,
    topic: lesson.topic,
    order: index + 1,
    status: lesson.status === 'published' ? 'published' : 'hidden',
  })));
  await Vocabulary.insertMany(vocabulary);

  const publishedLessons = lessons.filter((lesson) => lesson.status === 'published');
  const standardQuestions = publishedLessons.flatMap((lesson) => Array.from({ length: 10 }, (_, index) => (
    standardQuestion({
      key: `standard_${lesson._id}_${index + 1}`,
      lesson: lesson._id,
      topic: lesson.topic,
      createdBy: teacherIds[index % teacherIds.length],
      index,
    })
  )));
  const createdStandardQuestions = await Question.insertMany(standardQuestions);
  const standardQuestionsByLesson = new Map();
  for (const question of createdStandardQuestions) {
    const key = question.lesson.toString();
    standardQuestionsByLesson.set(key, [...(standardQuestionsByLesson.get(key) || []), question]);
  }

  const standardAssessments = publishedLessons.map((lesson, index) => {
    const questions = standardQuestionsByLesson.get(lesson._id.toString());
    return {
      _id: new mongoose.Types.ObjectId(),
      title: `${index % 2 ? 'Bài kiểm tra' : 'Bài luyện tập'} ${lesson.topic} — ${lesson.title}`,
      description: `Assessment demo cho ${lesson.title}.`,
      type: index % 2 ? 'exam' : 'exercise',
      lesson: lesson._id,
      course: lesson.course,
      questions: questions.map((question) => ({ question: question._id, score: question.score })),
      durationMinutes: index % 2 ? 25 : 15,
      totalScore: questions.reduce((sum, question) => sum + question.score, 0),
      passScore: index % 2 ? 60 : 0,
      status: 'published',
      availableFrom: new Date(now - 30 * day),
      availableUntil: new Date(now.getTime() + 90 * day),
      attemptLimit: index % 3 === 0 ? 1 : 0,
      showCorrectAnswers: index % 2 === 0,
      examFormat: 'standard',
      createdBy: teacherIds[index % teacherIds.length],
    };
  });
  await Assessment.insertMany(standardAssessments);

  const toeicSpecs = [
    { title: 'TOEIC Practice Test 01', mode: 'practice', distribution: [2, 4, 6, 4, 6, 3, 10], duration: 35 },
    { title: 'TOEIC Mini Test 01', mode: 'mini_test', distribution: [4, 10, 12, 10, 10, 6, 18], duration: 70 },
    { title: 'TOEIC Full Test 01', mode: 'full_test', distribution: [6, 25, 39, 30, 30, 16, 54], duration: 120 },
  ];
  const toeicAssessments = toeicSpecs.map((spec) => ({
    _id: new mongoose.Types.ObjectId(),
    title: spec.title,
    description: `Đề ${spec.mode} có đủ cấu trúc Part 1–7 để kiểm thử luồng TOEIC.`,
    type: 'exam',
    durationMinutes: spec.duration,
    totalScore: spec.distribution.reduce((sum, count) => sum + count, 0),
    passScore: 0,
    status: 'published',
    availableFrom: new Date(now - 30 * day),
    availableUntil: new Date(now.getTime() + 90 * day),
    attemptLimit: 0,
    showCorrectAnswers: true,
    examFormat: 'toeic',
    toeicMode: spec.mode,
    toeicConfig: {
      totalQuestions: spec.distribution.reduce((sum, count) => sum + count, 0),
      durationMinutes: spec.duration,
      listeningQuestionCount: spec.distribution.slice(0, 4).reduce((sum, count) => sum + count, 0),
      readingQuestionCount: spec.distribution.slice(4).reduce((sum, count) => sum + count, 0),
      listeningDurationMinutes: Math.round(spec.duration * 0.4),
      readingDurationMinutes: Math.round(spec.duration * 0.6),
      scoringMode: 'estimated_toeic',
    },
    parts: Array.from({ length: 7 }, (_, index) => ({
      partNumber: index + 1,
      name: `Part ${index + 1}`,
      section: index < 4 ? 'listening' : 'reading',
      instructions: `Hướng dẫn làm bài Part ${index + 1}.`,
      order: index + 1,
    })),
    questionGroups: [],
    createdBy: adminId,
  }));
  await Assessment.insertMany(toeicAssessments);

  const groupKinds = ['image', 'audio', 'audio', 'audio', 'single', 'passage', 'multi_passage'];
  const toeicGroups = [];
  const toeicQuestions = [];
  const toeicQuestionsByAssessment = new Map();
  for (let assessmentIndex = 0; assessmentIndex < toeicAssessments.length; assessmentIndex += 1) {
    const assessment = toeicAssessments[assessmentIndex];
    const spec = toeicSpecs[assessmentIndex];
    let questionNumber = 1;
    const groups = [];
    for (let partIndex = 0; partIndex < 7; partIndex += 1) {
      const groupId = new mongoose.Types.ObjectId();
      const group = {
        _id: groupId,
        assessment: assessment._id,
        partNumber: partIndex + 1,
        type: groupKinds[partIndex],
        title: `Part ${partIndex + 1}`,
        instructions: `Nội dung demo của TOEIC Part ${partIndex + 1}.`,
        passages: partIndex >= 5 ? [{
          title: `Passage Part ${partIndex + 1}`,
          content: 'Đây là đoạn văn mẫu phục vụ kiểm thử hiển thị passage TOEIC.',
          order: 1,
        }] : [],
        questionIds: [],
        order: partIndex + 1,
      };
      groups.push(group);
      toeicGroups.push(group);
      for (let offset = 0; offset < spec.distribution[partIndex]; offset += 1) {
        toeicQuestions.push(toeicQuestion({
          assessmentId: assessment._id,
          groupId,
          partNumber: partIndex + 1,
          questionNumber,
          createdBy: adminId,
        }));
        questionNumber += 1;
      }
    }
    toeicQuestionsByAssessment.set(assessment._id.toString(), groups);
  }
  await QuestionGroup.insertMany(toeicGroups);
  const createdToeicQuestions = await Question.insertMany(toeicQuestions);

  const groupUpdates = new Map();
  const assessmentQuestionMap = new Map();
  for (const question of createdToeicQuestions) {
    const groupKey = question.questionGroup.toString();
    groupUpdates.set(groupKey, [...(groupUpdates.get(groupKey) || []), question._id]);
    const assessment = toeicGroups.find((group) => group._id.toString() === groupKey).assessment.toString();
    assessmentQuestionMap.set(assessment, [...(assessmentQuestionMap.get(assessment) || []), question]);
  }
  await QuestionGroup.bulkWrite([...groupUpdates.entries()].map(([groupId, questionIds]) => ({
    updateOne: { filter: { _id: groupId }, update: { $set: { questionIds } } },
  })));
  for (const [groupId, questionIds] of groupUpdates.entries()) {
    const group = toeicGroups.find((item) => item._id.toString() === groupId);
    group.questionIds = questionIds;
  }
  await Assessment.bulkWrite(toeicAssessments.map((assessment) => ({
    updateOne: {
      filter: { _id: assessment._id },
      update: {
        $set: {
          questionGroups: toeicQuestionsByAssessment.get(assessment._id.toString()).map((group) => group._id),
          questions: (assessmentQuestionMap.get(assessment._id.toString()) || []).map((question) => ({ question: question._id, score: question.score })),
        },
      },
    },
  })));

  const enrollments = [];
  const progressRecords = [];
  const courseStudentMap = new Map(courseIds.map((id) => [id.toString(), []]));
  activeStudentIds.forEach((studentId, studentIndex) => {
    for (let offset = 0; offset < 3; offset += 1) {
      const courseId = courseIds[(studentIndex + offset) % courseIds.length];
      const courseLessons = lessonsByCourse.get(courseId.toString()).filter((lesson) => lesson.status === 'published');
      const completedCount = (studentIndex + offset) % 5;
      const completedLessons = courseLessons.slice(0, completedCount).map((lesson) => lesson._id);
      enrollments.push({
        student: studentId,
        course: courseId,
        completedLessons,
        progress: Math.round((completedLessons.length / courseLessons.length) * 100),
        enrolledAt: new Date(now - (studentIndex % 60 + 1) * day),
      });
      courseStudentMap.get(courseId.toString()).push(studentId);
      courseLessons.slice(0, 4).forEach((lesson, lessonIndex) => {
        const completed = lessonIndex < completedCount;
        progressRecords.push({
          student: studentId,
          lesson: lesson._id,
          course: courseId,
          status: completed ? 'completed' : lessonIndex === completedCount ? 'in_progress' : 'not_started',
          progress: completed ? 100 : 0,
          startedAt: new Date(now - (lessonIndex + 2) * day),
          completedAt: completed ? new Date(now - (lessonIndex + 1) * day) : undefined,
          lastAccessedAt: new Date(now - lessonIndex * day),
        });
      });
    }
  });
  await Enrollment.insertMany(enrollments);
  await LearningProgress.insertMany(progressRecords);
  await Course.bulkWrite(courses.map((course) => ({
    updateOne: { filter: { _id: course._id }, update: { $set: { students: courseStudentMap.get(course._id.toString()) } } },
  })));

  const attempts = [];
  const assessmentsByCourse = new Map();
  standardAssessments.forEach((assessment) => {
    const key = assessment.course.toString();
    assessmentsByCourse.set(key, [...(assessmentsByCourse.get(key) || []), assessment]);
  });
  activeStudentIds.slice(0, 90).forEach((studentId, index) => {
    const enrollment = enrollments[index * 3];
    const assessment = assessmentsByCourse.get(enrollment.course.toString())[index % 6];
    const questions = standardQuestionsByLesson.get(assessment.lesson.toString());
    const result = scoreAttempt(questions, 55 + (index % 4) * 10);
    const submittedAt = new Date(now - (index % 20 + 1) * day);
    attempts.push({
      student: studentId,
      assessment: assessment._id,
      assessmentType: assessment.type,
      startedAt: new Date(submittedAt.getTime() - 12 * 60 * 1000),
      deadlineAt: new Date(submittedAt.getTime() + assessment.durationMinutes * 60 * 1000),
      submittedAt,
      status: 'submitted',
      questionSnapshots: questions.map(snapshot),
      answers: result.answers,
      score: result.score,
      maxScore: result.maxScore,
      scorePercentage: result.scorePercentage,
      passScore: assessment.passScore,
      passed: assessment.passScore === 0 || result.scorePercentage >= assessment.passScore,
      correctCount: result.correctCount,
      incorrectCount: result.incorrectCount,
      unansweredCount: result.unansweredCount,
      duration: 12 * 60,
    });
  });

  activeStudentIds.slice(90, 100).forEach((studentId, index) => {
    const enrollment = enrollments[(index + 90) * 3];
    const assessment = assessmentsByCourse.get(enrollment.course.toString())[index % 6];
    const questions = standardQuestionsByLesson.get(assessment.lesson.toString());
    const partial = scoreAttempt(questions.slice(0, 3), 100);
    attempts.push({
      student: studentId,
      assessment: assessment._id,
      assessmentType: assessment.type,
      startedAt: new Date(now - (index + 1) * 60 * 60 * 1000),
      deadlineAt: new Date(now.getTime() + (assessment.durationMinutes - 5) * 60 * 1000),
      status: 'in_progress',
      questionSnapshots: questions.map(snapshot),
      answers: partial.answers,
      maxScore: questions.reduce((sum, question) => sum + question.score, 0),
      duration: 5 * 60,
    });
  });

  activeStudentIds.slice(0, 18).forEach((studentId, index) => {
    const assessment = toeicAssessments[index % toeicAssessments.length];
    const questions = assessmentQuestionMap.get(assessment._id.toString());
    const percentCorrect = 50 + (index % 5) * 10;
    const result = scoreAttempt(questions, percentCorrect);
    const submittedAt = new Date(now - (index + 1) * day);
    attempts.push({
      student: studentId,
      assessment: assessment._id,
      assessmentType: 'exam',
      startedAt: new Date(submittedAt.getTime() - 35 * 60 * 1000),
      deadlineAt: new Date(submittedAt.getTime() + assessment.durationMinutes * 60 * 1000),
      submittedAt,
      status: 'submitted',
      questionSnapshots: questions.map(snapshot),
      groupSnapshots: toeicQuestionsByAssessment.get(assessment._id.toString()).map((group) => ({
        groupId: group._id.toString(),
        partNumber: group.partNumber,
        type: group.type,
        title: group.title,
        instructions: group.instructions,
        imageUrl: group.imageUrl,
        audioUrl: group.audioUrl,
        passages: group.passages,
        questionIds: group.questionIds.map((id) => id.toString()),
        order: group.order,
      })),
      answers: result.answers,
      score: result.score,
      maxScore: result.maxScore,
      scorePercentage: result.scorePercentage,
      passScore: 0,
      passed: true,
      correctCount: result.correctCount,
      incorrectCount: result.incorrectCount,
      unansweredCount: result.unansweredCount,
      duration: 35 * 60,
      toeicBreakdown: toeicBreakdown(questions, percentCorrect),
    });
  });
  await Attempt.insertMany(attempts);

  const legacyTests = await Test.insertMany(courses.map((course, index) => ({
    lesson: lessonsByCourse.get(course._id.toString())[0]._id,
    type: index % 2 ? 'listening' : 'reading',
    title: `Bài test legacy ${index + 1}`,
    questions: [{
      question: 'What is the correct answer?',
      type: 'multiple-choice',
      options: ['A', 'B', 'C', 'D'],
      correctAnswer: 'B',
      points: 1,
    }],
    timeLimit: 15,
  })));

  await Rating.insertMany(courses.map((course) => ({
    course: course._id,
    ratings: { 5: 18, 4: 7, 3: 2, 2: 0, 1: 0 },
    totalRatings: 27,
    averageRating: 4.6,
  })));
  await Review.insertMany(courses.flatMap((course, index) => [0, 1, 2].map((offset) => ({
    course: course._id,
    user: activeStudentIds[(index * 3 + offset) % activeStudentIds.length],
    userName: `Học viên demo ${String(index * 3 + offset + 1).padStart(3, '0')}`,
    userAvatar: 'HV',
    rating: offset === 2 ? 4 : 5,
    text: `Nhận xét demo ${offset + 1} cho ${course.title}.`,
    timeAgo: `${offset + 1} tuần trước`,
    isApproved: true,
  }))));

  console.log('Demo seed completed.');
  console.table(counts({
    users,
    instructors,
    courses,
    lessons,
    materials,
    vocabulary,
    questions: [...createdStandardQuestions, ...createdToeicQuestions],
    assessments: [...standardAssessments, ...toeicAssessments],
    questionGroups: toeicGroups,
    enrollments,
    learningProgress: progressRecords,
    attempts,
    legacyTests,
  }));
  console.log(`Login accounts: admin@msuyen.local / ${PASSWORD}; teacher1@msuyen.local / ${PASSWORD}; student001@msuyen.local / ${PASSWORD}`);
}

seedDemoData()
  .catch((error) => {
    console.error(`Demo seed failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
