import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { adminApi } from '../../api/adminApi.js';
import './AdminGamificationPage.css';

const games = [
  {
    eyebrow: 'STREAK CHALLENGE',
    title: 'Thử thách 7 ngày',
    description: 'Theo dõi tiến độ học từ vựng hằng ngày và duy trì chuỗi học tập của học viên.',
    rules: ['20 từ hợp lệ mỗi ngày', 'Tự động tính streak theo múi giờ học viên', 'Chống ghi nhận trùng'],
    game: 'streak',
  },
  {
    eyebrow: 'VOCABULARY QUEST',
    title: 'Vượt ải TOEIC',
    description: 'Hành trình bốn cấp độ với chặng chơi, điểm số, sao và điều kiện mở khóa 80%.',
    rules: ['4 cấp độ TOEIC', 'Đạt tối thiểu 80% để tiến cấp', 'Tự động lưu và tiếp tục lượt chơi'],
    game: 'quest',
  },
];

export default function AdminGamificationPage() {
  const [configs, setConfigs] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [vocabulary, setVocabulary] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.allSettled([
      adminApi.getGamificationConfigs(),
      adminApi.getGamificationAnalytics(),
      adminApi.getGamificationVocabulary({ limit: 1 }),
      adminApi.getGamificationHistory({ limit: 8 }),
    ]).then((results) => {
      const [configsResult, analyticsResult, vocabularyResult, historyResult] = results;
      if (configsResult.status === 'fulfilled') setConfigs(configsResult.value?.data?.configs || []);
      else setError('Không thể tải cấu hình mini game.');
      if (analyticsResult.status === 'fulfilled') setAnalytics(analyticsResult.value?.data || null);
      if (vocabularyResult.status === 'fulfilled') setVocabulary(vocabularyResult.value?.data || null);
      if (historyResult.status === 'fulfilled') setHistory(historyResult.value?.data?.history || []);
    }).finally(() => setLoading(false));
  }, []);

  const isEnabled = (game) => configs.find((config) => config.game === game)?.enabled ?? true;
  const allEnabled = games.every((game) => isEnabled(game.game));
  const questConfig = configs.find((config) => config.game === 'quest');
  const streakConfig = configs.find((config) => config.game === 'streak');
  const getStage = (level, stage) => questConfig?.questStages?.find((item) => item.level === level && item.stage === stage);
  const formatDate = (value) => value ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—';

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
          <strong>{allEnabled ? 'Đang hoạt động' : 'Có game đang tắt'}</strong>
          <p>Cấu hình được áp dụng trực tiếp cho website React và dùng dữ liệu từ thư viện từ vựng đã xuất bản.</p>
        </div>
        <span className="admin-gamification-status__badge">{loading ? 'ĐANG TẢI' : allEnabled ? 'LIVE' : 'PARTIAL'}</span>
      </section>

      {error && <div className="admin-error" role="alert">{error}</div>}

      <section className="admin-gamification-analytics" aria-label="Phân tích mini game">
        <div className="admin-panel-head"><div><h2>Vận hành & phân tích</h2><p>Số liệu tổng hợp từ các lượt học đã được lưu trong database.</p></div><span className="admin-gamification-timezone">Timezone: {analytics?.timezone || streakConfig?.timezone || 'Asia/Ho_Chi_Minh'}</span></div>
        <div className="admin-gamification-analytics-grid">
          {[
            ['Học viên tham gia', analytics?.totalParticipatingLearners ?? '—', 'Streak hoặc Quest'],
            ['DAU mini game', analytics?.dailyActiveLearners ?? '—', 'Trong ngày hiện tại'],
            ['Hoàn thành thử thách', analytics ? `${analytics.challengeCompletionRate}%` : '—', 'Daily Streak'],
            ['Độ chính xác trung bình', analytics ? `${analytics.averageAssessmentAccuracy}%` : '—', 'Quest đã nộp'],
          ].map(([label, value, hint]) => <div className="admin-gamification-metric" key={label}><span>{label}</span><strong>{value}</strong><small>{hint}</small></div>)}
        </div>
      </section>

      <div className="admin-gamification-grid">
        {games.map((game) => (
          <article className="admin-gamification-card" key={game.eyebrow}>
            <div className="admin-gamification-card__top">
              <span className={`admin-gamification-card__status ${isEnabled(game.game) ? '' : 'is-disabled'}`}>{isEnabled(game.game) ? 'Đang bật' : 'Đang tắt'}</span>
            </div>
            <p className="admin-eyebrow">{game.eyebrow}</p>
            <h2>{game.title}</h2>
            <p className="admin-gamification-card__description">{game.description}</p>
            <ul>
              {game.rules.map((rule) => <li key={rule}>{rule}</li>)}
            </ul>
            <Link className="admin-gamification-card__link" to={`/admin/gamification/${game.game}`}>Cấu hình game →</Link>
          </article>
        ))}
      </div>

      <section className="admin-gamification-data-grid">
        <div className="admin-panel">
          <div className="admin-panel-head"><div><h2>Vocabulary đã phân loại</h2><p>Chỉ vocabulary đã publish và có TOEIC level mới được đưa vào pool game.</p></div><Link className="admin-text-link" to="/admin/gamification/vocabulary">Quản lý vocabulary</Link></div>
          <div className="admin-gamification-level-counts admin-gamification-level-counts--dashboard">
            {[1, 2, 3, 4].map((level) => <Link to={`/admin/gamification/vocabulary?level=${level}`} key={level}><span>TOEIC Level {level}</span><strong>{vocabulary?.counts?.[level] ?? '—'}</strong><small>từ đã publish</small></Link>)}
            <Link to="/admin/gamification/vocabulary?level=unclassified"><span>Chưa phân loại</span><strong>{vocabulary?.counts?.unclassified ?? '—'}</strong><small>Cần admin review</small></Link>
          </div>
        </div>

        <div className="admin-panel">
          <div className="admin-panel-head"><div><h2>Tiến độ Quest</h2><p>Đủ bốn level, mỗi level có bốn chặng. Số từ là assignment hiện tại.</p></div><Link className="admin-text-link" to="/admin/gamification/quest">Cấu hình Quest</Link></div>
          <div className="admin-gamification-level-rates">{(analytics?.levelCompletion || [1, 2, 3, 4].map((level) => ({ level }))).map((item) => <div key={item.level}><span>Level {item.level}</span><strong>{item.completionRate ?? '—'}%</strong><small>{item.completedLearners ?? 0} học viên hoàn thành</small></div>)}</div>
        </div>
      </section>

      <section className="admin-panel admin-gamification-stages">
        <div className="admin-panel-head"><div><h2>Nội dung 16 chặng Quest</h2><p>Preview không tạo attempt. Mở trình quản lý vocabulary để thay đổi assignment.</p></div><Link className="admin-text-link" to="/admin/gamification/vocabulary">Gán vocabulary</Link></div>
        <div className="admin-gamification-stage-grid">{[1, 2, 3, 4].flatMap((level) => [1, 2, 3, 4].map((stage) => { const assignment = getStage(level, stage); return <Link className="admin-gamification-stage" to={`/admin/gamification/preview/${level}/${stage}`} key={`${level}-${stage}`}><span>LEVEL {level} · CHẶNG {stage}</span><strong>{assignment?.vocabularyIds?.length || 0} từ</strong><small>{assignment?.vocabularyIds?.length ? 'Đã gán vocabulary' : 'Chưa có assignment'}</small><em>Xem preview</em></Link>; }))}</div>
      </section>

      <section className="admin-panel admin-gamification-history">
        <div className="admin-panel-head"><div><h2>Lịch sử thay đổi cấu hình</h2><p>Mỗi cập nhật admin được lưu cùng giá trị trước và sau.</p></div></div>
        {history.length ? <div className="admin-gamification-history-list">{history.map((item) => <div key={item._id}><strong>{item.game === 'quest' ? 'Vocabulary Quest' : 'Streak Challenge'}</strong><span>{item.changedBy?.fullName || item.changedBy?.email || 'Admin'} · {formatDate(item.createdAt)}</span><small>{item.after?.enabled ? 'Đang bật' : 'Đang tắt'}{item.game === 'quest' ? ` · ${item.after?.timeLimitSeconds || 120}s` : ''}</small></div>)}</div> : <div className="admin-empty">Chưa có thay đổi nào được ghi nhận.</div>}
      </section>

      <section className="admin-gamification-management admin-panel">
        <div className="admin-panel-head">
          <div>
            <h2>Nguồn dữ liệu & vận hành</h2>
            <p>Thay đổi dữ liệu đầu vào tại các workspace hiện có của hệ thống.</p>
          </div>
        </div>
        <div className="admin-gamification-links">
          <Link to="/admin/vocabulary/catalog"><strong>Quản lý thư viện từ vựng</strong><small>Tag, chapter, draft và published vocabulary</small></Link>
          <Link to="/admin/statistics"><strong>Xem thống kê hệ thống</strong><small>Kiểm tra số liệu học viên và hoạt động tổng thể</small></Link>
          <Link to="/admin/students"><strong>Quản lý học viên</strong><small>Kiểm tra tài khoản và trạng thái truy cập</small></Link>
        </div>
      </section>
    </div>
  );
}
