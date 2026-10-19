import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Course from '../models/Course.js';
import Lesson from '../models/Lesson.js';
import Material from '../models/Material.js';
import Vocabulary from '../models/Vocabulary.js';
import User from '../models/User.js';

dotenv.config();

const sampleCurriculum = [
  {
    title: 'Unit 1: Essential Foundations & Diagnostic Strategy',
    topic: 'Foundation',
    description: 'Nắm vững cấu trúc bài thi, phương pháp tiếp cận và chẩn đoán năng lực khởi đầu.',
    content: `
      <h2>1. Tổng quan & Phương pháp tiếp cận</h2>
      <p>Chào mừng bạn đến với Unit 1. Trong bài học mở đầu này, chúng ta sẽ phân tích toàn diện cấu trúc, các cạm bẫy thường gặp và chiến thuật làm bài hiệu quả nhất.</p>
      
      <h3>Chiến thuật 3 bước làm bài chuẩn:</h3>
      <ol>
        <li><strong>Đọc lướt (Skimming):</strong> Đọc nhanh tiêu đề và các câu hỏi chính trước khi nghe/đọc tài liệu.</li>
        <li><strong>Định vị từ khóa (Keyword Locating):</strong> Xác định các danh từ riêng, số liệu, mốc thời gian và hành động then chốt.</li>
        <li><strong>Đối chiếu đáp án (Option Elimination):</strong> Loại bỏ ngay các phương án bẫy (thừa thông tin, lệch thì, tuyệt đối hóa).</li>
      </ol>

      <div style="padding: 16px; background: #FFF8E7; border-left: 4px solid #D4A373; margin: 20px 0; border-radius: 4px;">
        <strong>💡 Lời khuyên của giảng viên:</strong> Luôn ghi chép từ vựng vào sổ tay và luyện phát âm tối thiểu 15 phút mỗi ngày cùng trợ lý phát âm.
      </div>
    `,
    duration: 35,
    videoUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
    order: 1,
    status: 'published',
  },
  {
    title: 'Unit 2: Core Vocabulary & Collocations in Context',
    topic: 'Vocabulary',
    description: 'Kho từ vựng trọng tâm, cụm từ kết hợp (collocations) và ngữ cảnh sử dụng thực tế.',
    content: `
      <h2>2. Từ vựng & Cụm từ chuyên sâu</h2>
      <p>Từ vựng không chỉ là học thuộc nghĩa đơn lẻ mà phải đặt vào ngữ cảnh sử dụng chính xác.</p>
      
      <h3>Các cụm Collocations phổ biến:</h3>
      <ul>
        <li><strong>Reach an agreement:</strong> Đạt được một thỏa thuận chung.</li>
        <li><strong>Under the supervision of:</strong> Dưới sự giám sát của ai đó.</li>
        <li><strong>Meet the deadline:</strong> Hoàn thành công việc đúng thời hạn.</li>
        <li><strong>Implement new policies:</strong> Triển khai áp dụng các chính sách mới.</li>
      </ul>

      <h3>Ví dụ thực hành:</h3>
      <p><em>"The executive board managed to <strong>reach an agreement</strong> after three hours of intensive negotiation."</em></p>
    `,
    duration: 40,
    videoUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
    order: 2,
    status: 'published',
  },
  {
    title: 'Unit 3: Grammar Mastery - Sentence Patterns & Clause Structure',
    topic: 'Grammar',
    description: 'Làm chủ các mẫu câu phức, mệnh đề quan hệ rút gọn và đảo ngữ nâng cao.',
    content: `
      <h2>3. Ngữ pháp trọng tâm & Mệnh đề</h2>
      <p>Ngữ pháp là khung xương sống giúp bạn đọc hiểu nhanh và viết chuẩn xác.</p>

      <h3>Mệnh đề quan hệ rút gọn (Reduced Relative Clauses):</h3>
      <p>Khi đại từ quan hệ đóng vai trò chủ ngữ:</p>
      <ul>
        <li><strong>Dạng chủ động (V-ing):</strong> <em>The woman <strong>standing</strong> over there is the department head.</em> (Thay cho: who is standing)</li>
        <li><strong>Dạng bị động (V-ed/V3):</strong> <em>The proposal <strong>submitted</strong> yesterday was approved.</em> (Thay cho: which was submitted)</li>
      </ul>
    `,
    duration: 45,
    videoUrl: '',
    order: 3,
    status: 'published',
  },
  {
    title: 'Unit 4: Intensive Practice & Exam Simulation',
    topic: 'Practice',
    description: 'Luyện đề thực chiến với thời gian giới hạn và giải thích chi tiết từng câu hỏi.',
    content: `
      <h2>4. Thực hành giải đề chuyên sâu</h2>
      <p>Vận dụng toàn bộ kiến thức của các Unit trước vào bài tập thực hành bấm giờ.</p>
      <p>Hãy hoàn thành bài tập trắc nghiệm đính kèm bên dưới và kiểm tra kết quả ngay tại phòng thi trực tuyến!</p>
    `,
    duration: 50,
    videoUrl: '',
    order: 4,
    status: 'published',
  },
];

async function seedRealLessons() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const admin = await User.findOne({ role: 'admin' });
    const teacherId = admin ? admin._id : new mongoose.Types.ObjectId();

    const courses = await Course.find();
    console.log(`Found ${courses.length} courses in database.`);

    let createdCount = 0;

    for (const course of courses) {
      // Check existing lessons for this course
      const existingLessons = await Lesson.find({ course: course._id });
      if (existingLessons.length === 0) {
        console.log(`Seeding lessons for course: "${course.title}" (${course._id})...`);
        for (const item of sampleCurriculum) {
          const lesson = await Lesson.create({
            title: `${course.englishType || 'Course'} - ${item.title}`,
            topic: item.topic,
            description: item.description,
            content: item.content,
            course: course._id,
            duration: item.duration,
            videoUrl: item.videoUrl,
            order: item.order,
            status: item.status,
            createdBy: teacherId,
          });

          // Add a sample material
          await Material.create({
            title: `Tài liệu bài học: ${item.title} (PDF)`,
            description: `Tài liệu tóm tắt lý thuyết và bài tập tự luyện cho ${item.title}.`,
            fileUrl: '/uploads/sample_lesson_material.pdf',
            fileType: 'application/pdf',
            fileSize: 1024 * 350,
            allowDownload: true,
            status: 'published',
            lesson: lesson._id,
            course: course._id,
            uploadedBy: teacherId,
          });

          // Add a sample vocabulary
          await Vocabulary.create({
            word: item.topic === 'Vocabulary' ? 'collocation' : 'strategy',
            meaning: item.topic === 'Vocabulary' ? 'sự sắp đặt từ ngữ thành cụm cố định' : 'chiến lược, kế hoạch hành động',
            pronunciation: item.topic === 'Vocabulary' ? '/ˌkɒl.əˈkeɪ.ʃən/' : '/ˈstræt.ə.dʒi/',
            partOfSpeech: 'noun',
            exampleEnglish: 'You need to develop a clear study strategy.',
            exampleVietnamese: 'Bạn cần xây dựng một chiến lược học tập rõ ràng.',
            topic: item.topic,
            status: 'published',
            lesson: lesson._id,
            course: course._id,
            createdBy: teacherId,
          });

          createdCount++;
        }
      } else {
        console.log(`Course "${course.title}" already has ${existingLessons.length} lessons.`);
      }
    }

    console.log(`🎉 SUCCESS! Seeded ${createdCount} realistic lessons, materials and vocabularies across courses!`);
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('Error seeding lessons:', err);
    process.exit(1);
  }
}

seedRealLessons();
