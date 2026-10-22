import 'dotenv/config';
import mongoose from 'mongoose';
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
import PDFDocument from 'pdfkit';
import mammoth from 'mammoth';
import Course from '../models/Course.js';
import Enrollment from '../models/Enrollment.js';
import Lesson from '../models/Lesson.js';
import Material from '../models/Material.js';
import User from '../models/User.js';
import Vocabulary from '../models/Vocabulary.js';
import { getPrivateUploadDir } from '../utils/uploadConfig.js';

const DEMO_LESSON_TITLE = 'Bài demo: Flashcard và tài liệu đa định dạng';
const DEMO_LESSON_TOPIC = 'Demo tài liệu inline';
const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  let remainder = value;
  for (let bit = 0; bit < 8; bit += 1) remainder = (remainder & 1) ? (0xedb88320 ^ (remainder >>> 1)) : (remainder >>> 1);
  return remainder >>> 0;
});

const crc32 = (buffer) => {
  let remainder = 0xffffffff;
  for (const byte of buffer) remainder = crcTable[(remainder ^ byte) & 0xff] ^ (remainder >>> 8);
  return (remainder ^ 0xffffffff) >>> 0;
};

function makeZip(entries) {
  const localParts = [];
  const centralParts = [];
  let localOffset = 0;

  for (const [name, source] of entries) {
    const filename = Buffer.from(name, 'utf8');
    const data = Buffer.isBuffer(source) ? source : Buffer.from(source, 'utf8');
    const checksum = crc32(data);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0x0021, 12);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(data.length, 18);
    localHeader.writeUInt32LE(data.length, 22);
    localHeader.writeUInt16LE(filename.length, 26);
    localHeader.writeUInt16LE(0, 28);
    localParts.push(localHeader, filename, data);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0x0021, 14);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(data.length, 20);
    centralHeader.writeUInt32LE(data.length, 24);
    centralHeader.writeUInt16LE(filename.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(localOffset, 42);
    centralParts.push(centralHeader, filename);
    localOffset += localHeader.length + filename.length + data.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const endRecord = Buffer.alloc(22);
  endRecord.writeUInt32LE(0x06054b50, 0);
  endRecord.writeUInt16LE(0, 4);
  endRecord.writeUInt16LE(0, 6);
  endRecord.writeUInt16LE(entries.length, 8);
  endRecord.writeUInt16LE(entries.length, 10);
  endRecord.writeUInt32LE(centralDirectory.length, 12);
  endRecord.writeUInt32LE(localOffset, 16);
  endRecord.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, centralDirectory, endRecord]);
}

function makeDocx() {
  return makeZip([
    ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
        <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
        <Default Extension="xml" ContentType="application/xml"/>
        <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
      </Types>`],
    ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
      </Relationships>`],
    ['word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:body>
          <w:p><w:pPr><w:pStyle w:val="Title"/></w:pPr><w:r><w:t>TOEIC Business Email</w:t></w:r></w:p>
          <w:p><w:r><w:t>Tài liệu DOCX mẫu được render trực tiếp trong trang bài học.</w:t></w:r></w:p>
          <w:p><w:r><w:t>Vocabulary: appointment — cuộc hẹn; confirm — xác nhận; available — có sẵn.</w:t></w:r></w:p>
          <w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>
        </w:body>
      </w:document>`],
  ]);
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  typeBuffer.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 8 + data.length);
  return chunk;
}

function makePng() {
  const width = 720;
  const height = 400;
  const pixels = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (1 + width * 4);
    pixels[rowStart] = 0;
    for (let x = 0; x < width; x += 1) {
      const offset = rowStart + 1 + x * 4;
      const header = y >= 28 && y < 95;
      const titleLine = y >= 145 && y < 171 && x >= 52 && x < 500;
      const bodyLine = y >= 215 && y < 231 && x >= 52 && x < 660;
      const accentLine = y >= 264 && y < 280 && x >= 52 && x < 540;
      const accent = header || titleLine;
      const muted = bodyLine || accentLine;
      pixels[offset] = accent ? 75 : muted ? 198 : 250;
      pixels[offset + 1] = accent ? 64 : muted ? 183 : 246;
      pixels[offset + 2] = accent ? 53 : muted ? 165 : 232;
      pixels[offset + 3] = 255;
    }
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(pixels)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function makeWav() {
  const sampleRate = 22050;
  const durationSeconds = 3;
  const sampleCount = sampleRate * durationSeconds;
  const dataSize = sampleCount * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  for (let index = 0; index < sampleCount; index += 1) {
    const fade = Math.min(1, index / 500, (sampleCount - index) / 500);
    const value = Math.round(Math.sin((2 * Math.PI * 440 * index) / sampleRate) * 0x2800 * fade);
    buffer.writeInt16LE(value, 44 + index * 2);
  }
  return buffer;
}

function makePdf() {
  return new Promise((resolve, reject) => {
    const document = new PDFDocument({ size: 'A4', margin: 54, info: { Title: 'TOEIC lesson preview demo' } });
    const chunks = [];
    document.on('data', (chunk) => chunks.push(chunk));
    document.on('end', () => resolve(Buffer.concat(chunks)));
    document.on('error', reject);
    document.fillColor('#4b4035').fontSize(22).text('TOEIC Lesson Material Preview', { align: 'center' });
    document.moveDown();
    document.fillColor('#806b58').fontSize(13).text('This PDF is rendered directly in the lesson page.');
    document.moveDown();
    document.fillColor('#302a25').fontSize(12).text('Students can read this handout without opening another page.');
    document.end();
  });
}

function makeAudioDescriptionZip() {
  return makeZip([
    ['README.txt', 'Định dạng ZIP đặc biệt: tài liệu này chỉ có nút tải xuống, không render nội dung trong bài học.\n'],
  ]);
}

const writeFixture = async (directory, filename, data) => {
  const filePath = path.join(directory, filename);
  await writeFile(filePath, data);
  return { filePath, fileSize: Buffer.byteLength(data) };
};

async function createFixtures() {
  const directory = path.join(getPrivateUploadDir(), 'lesson-preview-demo');
  await mkdir(directory, { recursive: true });
  const fixtures = [
    { title: 'PDF · Hướng dẫn bài học', filename: 'toeic-demo-handout.pdf', fileType: 'application/pdf', data: await makePdf() },
    { title: 'DOCX · Ghi chú từ vựng', filename: 'toeic-demo-notes.docx', fileType: DOCX_TYPE, data: makeDocx() },
    { title: 'PNG · Hình minh hoạ', filename: 'toeic-demo-illustration.png', fileType: 'image/png', data: makePng() },
    { title: 'Âm thanh · Luyện nghe', filename: 'toeic-demo-listening.wav', fileType: 'audio/wav', data: makeWav() },
    { title: 'ZIP · Tệp tải xuống', filename: 'toeic-demo-special.zip', fileType: 'application/zip', data: makeAudioDescriptionZip() },
  ];

  for (const fixture of fixtures) {
    Object.assign(fixture, await writeFixture(directory, fixture.filename, fixture.data));
    delete fixture.data;
  }
  await mammoth.convertToHtml({ path: fixtures[1].filePath });
  return fixtures;
}

async function findTestStudent() {
  const configuredEmail = process.env.LESSON_PREVIEW_STUDENT_EMAIL;
  if (configuredEmail) {
    const configuredStudent = await User.findOne({ email: configuredEmail.trim().toLowerCase(), role: 'student', status: 'active' });
    if (configuredStudent) return configuredStudent;
  }

  const currentLearner = await User.findOne({ fullName: 'Lê Ngọc Hảo', role: 'student', status: 'active' });
  if (currentLearner) return currentLearner;
  return User.findOne({ email: 'student001@msuyen.local', role: 'student', status: 'active' });
}

async function chooseCourse(student, existingLesson) {
  if (existingLesson) return Course.findById(existingLesson.course);

  if (student) {
    const enrollment = await Enrollment.findOne({ student: student._id })
      .sort({ enrolledAt: 1 })
      .populate({ path: 'course', match: { isPublished: true, englishType: 'TOEIC' } });
    if (enrollment?.course) return enrollment.course;
  }

  const demoCourse = await Course.findOne({ slug: 'toeic-demo-2', isPublished: true, englishType: 'TOEIC' });
  if (demoCourse) return demoCourse;
  return Course.findOne({ isPublished: true, englishType: 'TOEIC' });
}

async function seedLessonPreviewDemo() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  await mongoose.connect(process.env.MONGODB_URI);

  const fixtures = await createFixtures();
  const existingLesson = await Lesson.findOne({ title: DEMO_LESSON_TITLE, topic: DEMO_LESSON_TOPIC });
  const student = await findTestStudent();
  const course = await chooseCourse(student, existingLesson);
  if (!course || !course.isPublished) throw new Error('Không tìm thấy khóa TOEIC đã xuất bản để gắn bài học demo.');

  const lastLesson = existingLesson
    ? null
    : await Lesson.findOne({ course: course._id }).sort({ order: -1 }).select('order');
  const order = existingLesson?.order || (Number(lastLesson?.order || 0) + 1);
  const lesson = await Lesson.findOneAndUpdate(
    { course: course._id, title: DEMO_LESSON_TITLE },
    {
      $set: {
        title: DEMO_LESSON_TITLE,
        description: 'Bài học mẫu để thử flashcard và cách hiển thị tài liệu PDF, DOCX, ảnh, âm thanh, cùng định dạng chỉ tải xuống.',
        content: '<h2>Flashcard và tài liệu bài học</h2><p>Lật thẻ từ vựng để xem toàn bộ từ trong một bài. Các tài liệu PDF, DOCX, PNG và âm thanh sẽ được hiển thị trực tiếp bên dưới.</p>',
        course: course._id,
        topic: DEMO_LESSON_TOPIC,
        status: 'published',
        order,
        duration: 15,
        videoUrl: '',
        audioUrl: '',
      },
    },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
  );

  const vocabularyWords = [
    ['appointment', 'cuộc hẹn', 'noun', '/əˈpɔɪntmənt/', 'I have an appointment with the client at ten.', 'Tôi có cuộc hẹn với khách hàng lúc mười giờ.'],
    ['confirm', 'xác nhận', 'verb', '/kənˈfɜːrm/', 'Please confirm your reservation by email.', 'Vui lòng xác nhận đặt chỗ qua email.'],
    ['available', 'có sẵn; rảnh', 'adjective', '/əˈveɪləbl/', 'The meeting room is available this afternoon.', 'Phòng họp có sẵn vào chiều nay.'],
    ['deadline', 'hạn chót', 'noun', '/ˈdedlaɪn/', 'The team finished the report before the deadline.', 'Nhóm đã hoàn thành báo cáo trước hạn chót.'],
    ['shipment', 'lô hàng', 'noun', '/ˈʃɪpmənt/', 'The shipment will arrive at the warehouse tomorrow.', 'Lô hàng sẽ đến kho vào ngày mai.'],
  ];

  for (const [index, [word, meaning, partOfSpeech, pronunciation, exampleEnglish, exampleVietnamese]] of vocabularyWords.entries()) {
    await Vocabulary.findOneAndUpdate(
      { lesson: lesson._id, word },
      {
        $set: {
          word,
          meaning,
          partOfSpeech,
          pronunciation,
          explanation: `Từ vựng TOEIC dùng trong ngữ cảnh công việc: ${meaning}.`,
          example: exampleEnglish,
          exampleEnglish,
          exampleVietnamese,
          lesson: lesson._id,
          course: course._id,
          topic: DEMO_LESSON_TOPIC,
          order: index + 1,
          status: 'published',
        },
      },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
    );
  }

  for (const fixture of fixtures) {
    await Material.findOneAndUpdate(
      { lesson: lesson._id, title: fixture.title },
      {
        $set: {
          title: fixture.title,
          description: 'Tệp demo để kiểm tra hiển thị tự động trong trang chi tiết bài học.',
          lesson: lesson._id,
          course: course._id,
          fileUrl: `/uploads/private/lesson-preview-demo/${fixture.filename}`,
          filePath: fixture.filePath,
          originalName: fixture.filename,
          fileType: fixture.fileType,
          fileSize: fixture.fileSize,
          allowDownload: true,
          status: 'published',
        },
      },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
    );
  }

  let enrollmentStatus = 'no active test student found';
  const courseLessonCount = await Lesson.countDocuments({ course: course._id });
  const courseUpdate = { $max: { modules: courseLessonCount } };
  if (student) {
    const hasEnrollment = await Enrollment.exists({ student: student._id, course: course._id });
    if (!hasEnrollment) {
      await Enrollment.create({ student: student._id, course: course._id, progress: 0, completedLessons: [] });
      enrollmentStatus = 'added demo-course enrollment';
    } else {
      enrollmentStatus = 'existing course enrollment';
    }
    courseUpdate.$addToSet = { students: student._id };
  }
  await Course.updateOne({ _id: course._id }, courseUpdate);

  console.log('Lesson preview demo is ready.');
  console.log(`Course: ${course.title}`);
  console.log(`Lesson ID: ${lesson._id}`);
  console.log(`Vocabulary words: ${vocabularyWords.length}`);
  console.log(`Materials: ${fixtures.map((fixture) => fixture.filename).join(', ')}`);
  console.log(`Test-student access: ${enrollmentStatus}`);
  console.log(`Lesson route: /student/courses/${course._id}/lessons/${lesson._id}`);
}

seedLessonPreviewDemo()
  .catch((error) => {
    console.error(`Lesson preview demo seed failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
