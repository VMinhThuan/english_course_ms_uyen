import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { gamificationApi } from '../api/gamificationApi.js';
import learningApi from '../api/learningApi.js';
import './GamificationPages.css';

const dateKeyInZone = (date, timezone) => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone || 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date).reduce((result, part) => {
    if (part.type !== 'literal') result[part.type] = part.value;
    return result;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
};

function ProgressRing({ value }) {
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  return <div className="game-progress-ring" style={{ '--progress': `${Math.min(100, value)}%`, '--dash': `${circumference * Math.min(100, value) / 100}` }} aria-label={`Tiến độ ${value}%`}>
    <svg viewBox="0 0 120 120" aria-hidden="true"><circle className="ring-track" cx="60" cy="60" r={radius} /><circle className="ring-value" cx="60" cy="60" r={radius} /></svg>
    <strong><span>{value}</span><small>%</small></strong>
  </div>;
}

function LoadingState() { return <div className="game-loading"><span /><span /><span />Đang tải hành trình học tập...</div>; }

function FlameMark({ tier = 0 }) {
  return <div className={`learning-flame learning-flame--tier-${tier}`} aria-label={`Cấp lửa ${tier}`}>
    <svg viewBox="0 0 100 120" aria-hidden="true" focusable="false">
      <path className="learning-flame__outer" d="M52 4c4 22-12 27-4 43 4 8 13 12 17 4 8 13 16 23 13 37-3 17-16 28-34 28S10 104 10 83c0-18 12-31 25-46 0 15 6 21 13 22C52 50 45 31 52 4Z" />
      <path className="learning-flame__inner" d="M51 48c8 14 17 19 15 32-1 10-9 17-20 17-12 0-19-8-18-19 1-8 7-14 13-21 1 7 4 10 8 11 4-5 3-11 2-20Z" />
    </svg>
  </div>;
}

function LearningStreakPanel({ data, onRefresh }) {
  const [celebrationVisible, setCelebrationVisible] = useState(false);
  const today = data?.today || {};
  useEffect(() => {
    if (!data || !today.completed || !today.dateKey) return;
    const storageKey = `learning-streak-celebrated:${today.dateKey}`;
    if (window.localStorage.getItem(storageKey) !== '1') {
      window.localStorage.setItem(storageKey, '1');
      setCelebrationVisible(true);
    }
  }, [data, today.completed, today.dateKey]);
  if (!data) return null;
  const streak = data.streak || {};
  const percent = Math.min(100, Math.round((today.validStudySeconds / Math.max(1, today.targetSeconds || 900)) * 100));
  const status = today.completed ? 'Hoàn thành' : today.validStudySeconds ? (percent >= 80 ? 'Sắp đạt mục tiêu' : 'Đang học') : 'Chưa bắt đầu';
  const calendar = data.calendar || [];
  return <section className="learning-streak-panel" aria-labelledby="learning-streak-title">
    {celebrationVisible && <div className="learning-streak-celebration" role="status"><div><strong>Mục tiêu hôm nay đã hoàn thành!</strong><span>Bạn đang duy trì chuỗi {streak.currentStreak || 0} ngày học liên tục.</span></div><button type="button" onClick={() => setCelebrationVisible(false)} aria-label="Đóng thông báo">×</button></div>}
    <div className="learning-streak-hero">
      <div className="learning-streak-hero__copy">
        <p className="game-eyebrow">LEARNING STREAK</p>
        <h1 id="learning-streak-title">Giữ nhịp học, tiến bộ mỗi ngày</h1>
        <p>Học đủ 15 phút hợp lệ trong ngày để duy trì chuỗi của bạn.</p>
        <div className="learning-streak-hero__actions">
          <Link className="game-primary-button" to="/student/my-courses">Tiếp tục học</Link>
          <button className="game-secondary-button" type="button" onClick={onRefresh}>Cập nhật</button>
        </div>
      </div>
      <div className="learning-streak-flame-card">
        <FlameMark tier={streak.currentTier || 0} />
        <div><strong>{streak.currentStreak || 0}</strong><span>ngày liên tiếp</span><small>{streak.tierName || 'Chưa thắp lửa'}</small></div>
      </div>
    </div>
    <div className="learning-streak-grid">
      <article className="learning-streak-goal">
        <div className="learning-streak-section-heading"><div><span className="card-kicker">MỤC TIÊU HÔM NAY</span><h2>{status}</h2></div><strong>{Math.floor((today.validStudySeconds || 0) / 60)}:{String((today.validStudySeconds || 0) % 60).padStart(2, '0')} <small>/ 15:00</small></strong></div>
        <div className="learning-streak-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={percent}><span style={{ width: `${percent}%` }} /></div>
        <p>{today.completed ? 'Ngày học đã được ghi nhận. Chuỗi của bạn đang được duy trì.' : `Còn ${Math.ceil((today.remainingSeconds || 0) / 60)} phút học hợp lệ để hoàn thành mục tiêu.`}</p>
      </article>
      <article className="learning-streak-stats">
        <div><span>Chuỗi dài nhất</span><strong>{streak.longestStreak || 0}<small> ngày</small></strong></div>
        <div><span>Ngày đã hoàn thành</span><strong>{streak.totalCompletedDays || 0}</strong></div>
        <div><span>Tổng thời gian hợp lệ</span><strong>{Math.floor((data.totalValidStudySeconds || 0) / 3600)}<small> giờ</small></strong></div>
        <div><span>Mốc tiếp theo</span><strong>{streak.nextMilestone || '—'}<small>{streak.nextMilestone ? ' ngày' : ''}</small></strong></div>
      </article>
    </div>
    <div className="learning-streak-calendar-card">
      <div className="learning-streak-section-heading"><div><span className="card-kicker">LỊCH SỬ HỌC TẬP</span><h2>35 ngày gần nhất</h2></div><span className="learning-streak-legend"><i className="is-complete" /> Hoàn thành <i className="is-incomplete" /> Chưa đủ</span></div>
      <div className="learning-streak-calendar" role="list" aria-label="Lịch học 35 ngày gần nhất">{calendar.map((day) => <div key={day.dateKey} role="listitem" className={`learning-streak-day is-${day.status}`} title={`${day.dateKey}: ${day.validStudySeconds || 0} giây`}><span>{day.dateKey.slice(8)}</span><i /></div>)}</div>
    </div>
    <div className="learning-streak-milestones"><span className="card-kicker">CỘT MỐC NGỌN LỬA</span>{(data.milestones || []).map((milestone) => <span key={milestone.days} className={milestone.unlocked ? 'is-unlocked' : ''}><b>{milestone.days}</b> ngày</span>)}</div>
  </section>;
}

export default function VocabularyStreakChallengePage() {
  const [overview, setOverview] = useState(null);
  const [challenge, setChallenge] = useState(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [selected, setSelected] = useState('');
  const [feedback, setFeedback] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [learningStreak, setLearningStreak] = useState(null);

  const timezone = overview?.streak.timezone || 'Asia/Ho_Chi_Minh';
  const todayKey = dateKeyInZone(new Date(), timezone);
  const monthLabel = new Intl.DateTimeFormat('vi-VN', { timeZone: timezone, month: 'long', year: 'numeric' }).format(new Date());

  const load = async () => {
    setLoading(true); setError('');
    try {
      const [result, streakResult] = await Promise.all([
        gamificationApi.getOverview(),
        learningApi.getStreakOverview().catch(() => null),
      ]);
      setOverview(result.data);
      if (streakResult?.data) setLearningStreak(streakResult.data);
      if (result.data.today.challenge) setChallenge(result.data.today.challenge);
    } catch (loadError) { setError(loadError.response?.data?.message || 'Không thể tải thử thách.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const currentQuestion = useMemo(() => {
    if (!challenge) return null;
    const completed = new Set(challenge.completedVocabularyIds || []);
    return challenge.questions.find((question) => !completed.has(question.vocabularyId)) || challenge.questions[questionIndex];
  }, [challenge, questionIndex]);
  const progress = challenge ? Math.round((challenge.correctCount / challenge.totalWords) * 100) : 0;
  const isCompleted = challenge?.status === 'completed' || challenge?.correctCount >= 20;

  const start = async () => {
    setBusy(true); setError('');
    try { setChallenge((await gamificationApi.startDaily()).data.challenge); }
    catch (startError) { setError(startError.response?.data?.message || 'Chưa thể bắt đầu thử thách.'); }
    finally { setBusy(false); }
  };
  const answer = async (option) => {
    if (!currentQuestion || busy) return;
    setSelected(option.id); setBusy(true); setFeedback(null);
    try {
      const result = await gamificationApi.answerDaily(challenge.id, { questionId: currentQuestion.questionId, answer: option.id });
      setChallenge(result.data.challenge);
      setFeedback({ correct: result.data.isCorrect, message: result.data.isCorrect ? 'Chính xác! +1 từ hoàn thành' : 'Chưa đúng, thử lại nhé.' });
      if (result.data.isCorrect && !result.data.completed) {
        window.setTimeout(() => { setSelected(''); setFeedback(null); setQuestionIndex((index) => index + 1); }, 650);
      }
      if (result.data.completed) {
        const refreshed = await gamificationApi.getOverview();
        setOverview(refreshed.data);
      }
    } catch (answerError) { setError(answerError.response?.data?.message || 'Không thể ghi nhận đáp án.'); }
    finally { setBusy(false); }
  };

  if (loading) return <main className="game-page"><LoadingState /></main>;
  if (isCompleted) return <main className="game-page"><LearningStreakPanel data={learningStreak} onRefresh={load} /><section className="game-completion-card"><p className="game-eyebrow">THỬ THÁCH HÔM NAY ĐÃ XONG</p><h1>20 từ đã được chinh phục!</h1><p>Bạn đã giữ lời hứa học tập hôm nay. Mỗi ngày một chút, mục tiêu TOEIC sẽ gần hơn.</p><div className="completion-stats"><div><strong>{challenge.accuracy || 100}<small>%</small></strong><span>Độ chính xác</span></div><div><strong>{overview?.streak.current || 1}<small> ngày</small></strong><span>Ngày liên tiếp</span></div></div><div className="game-actions"><Link className="game-primary-button" to="/student/vocabulary-quest">Vượt ải TOEIC →</Link><button className="game-secondary-button" type="button" onClick={load}>Xem lại tiến độ</button></div></section></main>;

  return <main className="game-page"><LearningStreakPanel data={learningStreak} onRefresh={load} />
    <header className="game-hero game-hero--streak"><div><p className="game-eyebrow">7-DAY VOCABULARY STREAK</p><h1>Thử thách 7 ngày</h1><p>Mỗi ngày hoàn thành 20 từ để duy trì nhịp học TOEIC ổn định.</p></div></header>
    {error && <div className="game-alert" role="alert">{error}<button type="button" onClick={load}>Thử lại</button></div>}
    <section className="streak-summary-grid">
      <article className="streak-card streak-card--primary"><span className="card-kicker">CHUỖI HIỆN TẠI</span><div className="streak-number"><strong>{overview?.streak.current || 0}</strong><span>ngày</span></div><p className="streak-record">Kỷ lục của bạn <strong>{overview?.streak.longest || 0}</strong><span>ngày</span></p></article>
      <article className="streak-card streak-card--progress"><div><span className="card-kicker">TIẾN ĐỘ HÔM NAY</span><h2 className="streak-progress-value"><span>{challenge?.correctCount || 0}</span><span className="streak-progress-divider">/</span><span>20</span><small>từ</small></h2><p>{challenge ? 'Tiếp tục từ câu hỏi đang mở.' : 'Sẵn sàng cho 10 phút học tập?'}</p></div><ProgressRing value={progress} /></article>
    </section>
    {!challenge ? <section className="game-start-card"><div className="game-start-card__content"><h2>Bắt đầu nhiệm vụ hôm nay</h2><p>20 câu hỏi ngắn với nhiều dạng bài. Trả lời đúng để ghi nhận từ đã hoàn thành.</p></div><button className="game-primary-button" type="button" onClick={start} disabled={busy}>{busy ? 'Đang mở...' : 'Bắt đầu thử thách'}</button></section> : <section className="question-card"><div className="question-card__top"><span>CÂU {challenge.correctCount + 1} / 20</span><span className="question-card__mode">{currentQuestion?.type === 'fill_blank' ? 'Điền từ' : currentQuestion?.type === 'recognition' ? 'Nhận diện từ' : 'Chọn nghĩa'}</span></div><div className="question-card__progress"><span style={{ width: `${progress}%` }} /></div><h2>{currentQuestion?.prompt}</h2>{currentQuestion?.sentence && currentQuestion.sentence !== currentQuestion.prompt && <p className="question-sentence">{currentQuestion.sentence}</p>}<div className="answer-grid">{currentQuestion?.options.map((option) => <button key={option.id} className={`answer-option ${selected === option.id ? 'is-selected' : ''}`} type="button" onClick={() => answer(option)} disabled={busy}>{option.text}</button>)}</div>{feedback && <div className={`answer-feedback ${feedback.correct ? 'is-correct' : 'is-wrong'}`} role="status">{feedback.correct ? '✓' : '↻'} {feedback.message}</div>}</section>}
    <section className="streak-lower-grid">
      <div className="game-panel"><div className="panel-heading"><div><span className="card-kicker">LỊCH HỌC TẬP</span><h2>Giữ nhịp mỗi ngày</h2></div><span className="panel-month">{monthLabel}</span></div><div className="activity-calendar">{Array.from({ length: 14 }, (_, index) => { const date = new Date(); date.setDate(date.getDate() - (13 - index)); const key = dateKeyInZone(date, timezone); const complete = overview?.streak.completedDates?.includes(key); const isToday = key === todayKey; const isMissed = !complete && key < todayKey; return <div className={`calendar-dot ${complete ? 'is-complete' : ''} ${isToday ? 'is-today' : ''} ${isMissed ? 'is-missed' : ''}`} key={key} title={complete ? 'Đã hoàn thành' : isToday ? 'Hôm nay' : 'Chưa hoàn thành'} tabIndex="0" aria-label={`${key}: ${complete ? 'đã hoàn thành' : isToday ? 'hôm nay' : 'chưa hoàn thành'}`}><span>{new Intl.DateTimeFormat('vi-VN', { timeZone: timezone, day: 'numeric' }).format(date)}</span><i aria-hidden="true" /></div>; })}</div><p className="calendar-hint">Hoàn thành đủ 20 từ để đánh dấu một ngày màu vàng.</p></div>
      <div className="game-panel"><div className="panel-heading"><div><span className="card-kicker">CỘT MỐC</span><h2>Huy hiệu của bạn</h2></div><Link to="/student/vocabulary-quest">Xem hành trình →</Link></div><div className="badge-row">{[7, 14, 30].map((day) => { const earned = (overview?.streak.current || 0) >= day; return <div className={`achievement-badge ${earned ? 'is-earned' : 'is-locked'}`} key={day}><span className="achievement-mark" aria-hidden="true">{day}</span><strong>{day} ngày</strong><small>{earned ? 'Đã mở khóa' : 'Còn một chút nữa'}</small></div>; })}</div></div>
    </section>
  </main>;
}
