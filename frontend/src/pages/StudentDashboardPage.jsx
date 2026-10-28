import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import useAuthStore from '../store/authStore.js';
import './StudentDashboardPage.css';

const modules = [
  { title: 'Chép chính tả Part 1', description: 'Nghe audio, nhập từng câu và xem kết quả ngay.', href: '/student/part-1', icon: '♫', label: 'TOEIC PART 1' },
  { title: 'Part 2 Challange', description: 'Nghe câu hỏi TOEIC Part 2 và chọn đáp án A, B hoặc C.', href: '/student/part-2-challenge', icon: 'A·C', label: 'TOEIC PART 2' },
  { title: 'Ngân hàng Part 5', description: 'Luyện câu hỏi ngữ pháp và từ vựng TOEIC.', href: '/student/part-5', icon: 'A·D', label: 'TOEIC PART 5' },
  { title: 'Bài tập', description: 'Làm các bài tập đang được mở cho học viên.', href: '/student/assessments', icon: '✓', label: 'LUYỆN TẬP' },
  { title: 'Đề thi TOEIC', description: 'Chọn đề thi đã xuất bản và theo dõi kết quả.', href: '/student/toeic', icon: '⌁', label: 'THI THỬ' },
  { title: 'Từ vựng', description: 'Ôn từ theo bộ và chapter bằng flashcard.', href: '/student/vocabulary-catalog', icon: 'Aa', label: 'VOCABULARY' },
];

export default function StudentDashboardPage() {
  const user = useAuthStore((state) => state.user);
  const studentName = user?.fullName?.trim().split(/\s+/).slice(-1)[0] || 'bạn';

  useEffect(() => { document.title = 'Trang chủ học tập | Ms Uyen'; }, []);

  return <main className="student-dashboard-page standalone-dashboard">
    <header className="standalone-dashboard__welcome"><p>KHÔNG GIAN HỌC TẬP</p><h1>Xin chào, {studentName}!</h1><span>Chọn nội dung bạn muốn luyện hôm nay.</span></header>
    <section className="standalone-dashboard__grid" aria-label="Các nội dung học tập">
      {modules.map((module) => <Link className="standalone-dashboard__card" to={module.href} key={module.href}>
        <span className="standalone-dashboard__icon" aria-hidden="true">{module.icon}</span><small>{module.label}</small><h2>{module.title}</h2><p>{module.description}</p><strong>Mở nội dung <span aria-hidden="true">→</span></strong>
      </Link>)}
    </section>
  </main>;
}
