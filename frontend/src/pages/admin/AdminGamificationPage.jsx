import { Link } from 'react-router-dom';
import PageHeader from '../../components/ui/PageHeader.jsx';
import './AdminGamificationPage.css';

const games = [
  {
    icon: '🔥',
    eyebrow: 'STREAK CHALLENGE',
    title: 'Thử thách 7 ngày',
    description: 'Theo dõi tiến độ học từ vựng hằng ngày và duy trì chuỗi học tập của học viên.',
    rules: ['20 từ hợp lệ mỗi ngày', 'Tự động tính streak theo múi giờ học viên', 'Chống ghi nhận trùng'],
    link: '/admin/vocabulary/catalog',
  },
  {
    icon: '🧭',
    eyebrow: 'VOCABULARY QUEST',
    title: 'Vượt ải TOEIC',
    description: 'Hành trình bốn cấp độ với chặng chơi, điểm số, sao và điều kiện mở khóa 80%.',
    rules: ['4 cấp độ TOEIC', 'Đạt tối thiểu 80% để tiến cấp', 'Tự động lưu và tiếp tục lượt chơi'],
    link: '/admin/vocabulary/catalog',
  },
];

export default function AdminGamificationPage() {
  return (
    <div className="admin-page-container admin-gamification-page">
      <PageHeader
        eyebrow="Gamification workspace"
        title="Quản lý Mini Game"
        description="Kiểm tra cấu hình vận hành của Streak Challenge và Vocabulary Quest trong hệ thống học viên."
      />

      <section className="admin-gamification-status" aria-label="Trạng thái mini game">
        <div>
          <span className="admin-gamification-status__label">TRẠNG THÁI HỆ THỐNG</span>
          <strong>Đang hoạt động</strong>
          <p>Cả hai mini game đang chạy trực tiếp trong website React và dùng dữ liệu từ thư viện từ vựng đã xuất bản.</p>
        </div>
        <span className="admin-gamification-status__badge">● LIVE</span>
      </section>

      <div className="admin-gamification-grid">
        {games.map((game) => (
          <article className="admin-gamification-card" key={game.eyebrow}>
            <div className="admin-gamification-card__top">
              <span className="admin-gamification-card__icon" aria-hidden="true">{game.icon}</span>
              <span className="admin-gamification-card__status">Đang bật</span>
            </div>
            <p className="admin-eyebrow">{game.eyebrow}</p>
            <h2>{game.title}</h2>
            <p className="admin-gamification-card__description">{game.description}</p>
            <ul>
              {game.rules.map((rule) => <li key={rule}>{rule}</li>)}
            </ul>
            <Link className="admin-gamification-card__link" to={game.link}>Quản lý nguồn từ vựng →</Link>
          </article>
        ))}
      </div>

      <section className="admin-gamification-management admin-panel">
        <div className="admin-panel-head">
          <div>
            <h2>Nguồn dữ liệu & vận hành</h2>
            <p>Thay đổi dữ liệu đầu vào tại các workspace hiện có của hệ thống.</p>
          </div>
        </div>
        <div className="admin-gamification-links">
          <Link to="/admin/vocabulary/catalog"><span>📚</span><strong>Quản lý thư viện từ vựng</strong><small>Tag, chapter, draft và published vocabulary</small></Link>
          <Link to="/admin/statistics"><span>📊</span><strong>Xem thống kê hệ thống</strong><small>Kiểm tra số liệu học viên và hoạt động tổng thể</small></Link>
          <Link to="/admin/students"><span>👥</span><strong>Quản lý học viên</strong><small>Kiểm tra tài khoản và trạng thái truy cập</small></Link>
        </div>
      </section>
    </div>
  );
}
