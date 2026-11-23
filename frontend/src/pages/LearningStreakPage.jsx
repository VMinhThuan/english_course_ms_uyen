import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import learningApi from '../api/learningApi.js';
import LearningStreakFlame from '../components/learning/LearningStreakFlame.jsx';
import './LearningStreakPage.css';

const TARGET_SECONDS = 900;
const ACTIVITY_LABELS = {
  lesson: 'Học bài',
  listening: 'Luyện nghe',
  vocabulary: 'Từ vựng',
  exercise: 'Bài tập',
  quiz: 'Quiz',
  assessment: 'Bài kiểm tra',
  interactive: 'Tương tác',
  mini_game: 'Mini game',
};

const formatDuration = (seconds = 0) => {
  const value = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor(value / 60);
  const remainingMinutes = Math.floor((value % 3600) / 60);
  const remainingSeconds = value % 60;
  if (hours > 0) return `${hours} giờ${remainingMinutes ? ` ${remainingMinutes} phút` : ''}${remainingSeconds ? ` ${remainingSeconds} giây` : ''}`;
  return `${minutes} phút ${String(remainingSeconds).padStart(2, '0')} giây`;
};

const formatClock = (seconds = 0) => {
  const value = Math.max(0, Math.floor(Number(seconds) || 0));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
};

const formatDate = (dateKey, timezone) => {
  if (!dateKey) return 'Chưa chọn ngày';
  const date = new Date(`${dateKey}T12:00:00Z`);
  return new Intl.DateTimeFormat('vi-VN', { timeZone: timezone || 'Asia/Ho_Chi_Minh', dateStyle: 'full' }).format(date);
};

const statusLabels = {
  completed: 'Hoàn thành',
  incomplete: 'Chưa đủ mục tiêu',
  missed: 'Bỏ lỡ',
  today: 'Hôm nay',
  future: 'Sắp tới',
  no_data: 'Chưa có dữ liệu',
};

function LoadingState() {
  return <main className="learning-streak-page"><div className="learning-streak-state" role="status">Đang tải chuỗi học tập…</div></main>;
}

function DayDetail({ day, timezone, onClose }) {
  if (!day) return null;
  const seconds = day.validStudySeconds || 0;
  const target = day.targetSeconds || TARGET_SECONDS;
  const hasData = !['no_data', 'future'].includes(day.status);
  const percent = hasData ? Math.min(100, Math.round((seconds / Math.max(1, target)) * 100)) : 0;
  const activities = Object.entries(day.activitySeconds || {}).filter(([, value]) => Number(value) > 0);
  return (
    <aside className="learning-streak-day-detail" aria-label="Chi tiết ngày học">
      <div className="learning-streak-day-detail__header">
        <div><span className="learning-streak-eyebrow">CHI TIẾT NGÀY HỌC</span><h3>{formatDate(day.dateKey, timezone)}</h3></div>
        <button type="button" className="learning-streak-icon-button" onClick={onClose} aria-label="Đóng chi tiết ngày">×</button>
      </div>
      <div className="learning-streak-day-detail__headline"><strong>{hasData ? formatDuration(seconds) : 'Chưa có dữ liệu'}</strong><span>{statusLabels[day.status] || 'Chưa có dữ liệu'}</span></div>
      <div className="learning-streak-detail-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={percent}><span style={{ width: `${percent}%` }} /></div>
      <dl className="learning-streak-detail-stats">
        <div><dt>Mục tiêu</dt><dd>{hasData ? formatDuration(target) : 'Chưa có dữ liệu'}</dd></div>
        <div><dt>Tiến độ</dt><dd>{hasData ? `${percent}%` : '—'}</dd></div>
        {day.sessionCount != null && <div><dt>Số phiên học</dt><dd>{day.sessionCount}</dd></div>}
      </dl>
      {activities.length > 0 ? <div className="learning-streak-activities"><h4>Thời lượng theo hoạt động</h4>{activities.map(([type, value]) => <div key={type}><span>{ACTIVITY_LABELS[type] || type}</span><strong>{formatDuration(value)}</strong></div>)}</div> : <p className="learning-streak-no-detail">{seconds ? 'Backend chưa cung cấp phân loại hoạt động cho ngày này.' : 'Chưa có dữ liệu học tập được xác minh cho ngày này.'}</p>}
    </aside>
  );
}

export default function LearningStreakPage() {
  const [data, setData] = useState(null);
  const [selectedDateKey, setSelectedDateKey] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [celebrationVisible, setCelebrationVisible] = useState(false);

  const load = async () => {
    setLoading(true); setError('');
    try {
      const response = await learningApi.getStreakOverview();
      const nextData = response.data;
      setData(nextData);
      setSelectedDateKey((current) => current || nextData?.today?.dateKey);
    } catch (loadError) {
      setError(loadError.response?.data?.message || 'Không thể tải dữ liệu chuỗi học tập.');
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!data?.today?.completed || !data.today.dateKey) return;
    const key = `learning-streak-celebrated:${data.today.dateKey}`;
    if (window.localStorage.getItem(key) !== '1') {
      window.localStorage.setItem(key, '1');
      setCelebrationVisible(true);
    }
  }, [data]);

  const selectedDay = useMemo(() => selectedDateKey ? data?.calendar?.find((day) => day.dateKey === selectedDateKey) || data?.today : null, [data, selectedDateKey]);
  const streak = data?.streak || {};
  const today = data?.today || {};
  const todayPercent = Math.min(100, Math.round(((today.validStudySeconds || 0) / Math.max(1, today.targetSeconds || TARGET_SECONDS)) * 100));

  if (loading) return <LoadingState />;
  if (error) return <main className="learning-streak-page"><div className="learning-streak-state learning-streak-state--error" role="alert">{error}<button type="button" onClick={load}>Thử lại</button></div></main>;
  if (!data) return <main className="learning-streak-page"><div className="learning-streak-state">Chưa có dữ liệu chuỗi học tập.</div></main>;

  return (
    <main className="learning-streak-page">
      {celebrationVisible && <div className="learning-streak-celebration" role="status"><span>Mục tiêu 15 phút hôm nay đã hoàn thành.</span><button type="button" onClick={() => setCelebrationVisible(false)} aria-label="Đóng thông báo">×</button></div>}
      <header className="learning-streak-overview">
        <div><span className="learning-streak-eyebrow">LEARNING STREAK</span><h1>Chuỗi học tập</h1><p>Duy trì 15 phút học tiếng Anh mỗi ngày.</p></div>
        <div className="learning-streak-overview__score"><LearningStreakFlame tier={streak.currentTier} /><div><strong>{streak.currentStreak || 0}</strong><span>ngày liên tiếp</span><small>{streak.tierName || 'Chưa thắp lửa'}</small></div></div>
        <div className="learning-streak-milestone"><span>Mốc tiếp theo</span><strong>{streak.nextMilestone ? `${streak.nextMilestone} ngày` : 'Đã chinh phục'}</strong><small>{streak.nextMilestone ? `Còn ${Math.max(0, streak.nextMilestone - (streak.currentStreak || 0))} ngày` : 'Không giới hạn'}</small></div>
      </header>

      <section className="learning-streak-goal-section" aria-labelledby="learning-streak-goal-title">
        <div className="learning-streak-section-heading"><div><span className="learning-streak-eyebrow">MỤC TIÊU HÔM NAY</span><h2 id="learning-streak-goal-title">{today.completed ? 'Đã hoàn thành mục tiêu hôm nay' : 'Tiếp tục giữ nhịp học'}</h2></div><strong>{formatClock(today.validStudySeconds)} <small>/ 15:00</small></strong></div>
        <div className="learning-streak-goal-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={todayPercent}><span style={{ width: `${todayPercent}%` }} /></div>
        <div className="learning-streak-goal-footer"><span>{today.completed ? 'Thời gian vượt mục tiêu vẫn được hiển thị chính xác.' : `Còn ${formatDuration(today.remainingSeconds || 0)} để hoàn thành.`}</span><Link to="/student/my-courses">Tiếp tục học</Link></div>
      </section>

      <section className="learning-streak-calendar-section" aria-labelledby="learning-streak-calendar-title">
        <div className="learning-streak-section-heading"><div><span className="learning-streak-eyebrow">LỊCH HỌC TẬP</span><h2 id="learning-streak-calendar-title">35 ngày gần nhất</h2></div><span className="learning-streak-calendar-hint">Chọn một ngày để xem thời lượng</span></div>
        <div className="learning-streak-calendar-legend"><span><i className="is-completed" /> Hoàn thành</span><span><i className="is-incomplete" /> Chưa đủ</span><span><i className="is-no_data" /> Chưa có dữ liệu</span><span><i className="is-today" /> Hôm nay</span></div>
        <div className="learning-streak-calendar" role="list" aria-label="Lịch học 35 ngày gần nhất">{(data.calendar || []).map((day) => <button type="button" role="listitem" key={day.dateKey} className={`learning-streak-day learning-streak-day--${day.status} ${day.dateKey === today.dateKey ? 'learning-streak-day--today' : ''} ${selectedDateKey === day.dateKey ? 'is-selected' : ''}`} onClick={() => setSelectedDateKey(day.dateKey)} aria-label={`${day.dateKey}: ${statusLabels[day.status] || 'Chưa có dữ liệu'}`} aria-pressed={selectedDateKey === day.dateKey}><span>{day.dateKey.slice(8)}</span><i /></button>)}</div>
        <DayDetail day={selectedDay} timezone={data.timezone} onClose={() => setSelectedDateKey(null)} />
      </section>

      <section className="learning-streak-statistics" aria-labelledby="learning-streak-statistics-title">
        <div className="learning-streak-section-heading"><div><span className="learning-streak-eyebrow">THÀNH TỰU</span><h2 id="learning-streak-statistics-title">Tiến bộ của bạn</h2></div></div>
        <div className="learning-streak-stat-grid"><div><span>Chuỗi hiện tại</span><strong>{streak.currentStreak || 0}<small> ngày</small></strong></div><div><span>Kỷ lục dài nhất</span><strong>{streak.longestStreak || 0}<small> ngày</small></strong></div><div><span>Ngày hoàn thành</span><strong>{streak.totalCompletedDays || 0}</strong></div><div><span>Tổng thời gian hợp lệ</span><strong>{formatDuration(data.totalValidStudySeconds || 0)}</strong></div></div>
        <div className="learning-streak-milestones-list">{(data.milestones || []).map((milestone) => <span key={milestone.days} className={milestone.unlocked ? 'is-unlocked' : ''}><b>{milestone.days}</b> ngày</span>)}</div>
      </section>
    </main>
  );
}
