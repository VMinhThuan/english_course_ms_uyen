import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { gamificationApi } from '../api/gamificationApi.js';
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
    <strong>{value}%</strong>
  </div>;
}

function LoadingState() { return <div className="game-loading"><span /><span /><span />Đang tải hành trình học tập...</div>; }

export default function VocabularyStreakChallengePage() {
  const [overview, setOverview] = useState(null);
  const [challenge, setChallenge] = useState(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [selected, setSelected] = useState('');
  const [feedback, setFeedback] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true); setError('');
    try {
      const result = await gamificationApi.getOverview();
      setOverview(result.data);
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
  if (isCompleted) return <main className="game-page"><section className="game-completion-card"><div className="celebration-orbit" aria-hidden="true">🎉</div><p className="game-eyebrow">THỬ THÁCH HÔM NAY ĐÃ XONG</p><h1>20 từ đã được chinh phục!</h1><p>Bạn đã giữ lời hứa học tập hôm nay. Mỗi ngày một chút, mục tiêu TOEIC sẽ gần hơn.</p><div className="completion-stats"><div><strong>{challenge.accuracy || 100}%</strong><span>Độ chính xác</span></div><div><strong>🔥 {overview?.streak.current || 1}</strong><span>Ngày liên tiếp</span></div></div><div className="game-actions"><Link className="game-primary-button" to="/student/vocabulary-quest">Vượt ải TOEIC →</Link><button className="game-secondary-button" type="button" onClick={load}>Xem lại tiến độ</button></div></section></main>;

  return <main className="game-page">
    <header className="game-hero game-hero--streak"><div><p className="game-eyebrow">7-DAY VOCABULARY STREAK</p><h1>Thử thách 7 ngày</h1><p>Mỗi ngày hoàn thành 20 từ để giữ ngọn lửa học TOEIC luôn cháy.</p></div><div className="streak-flame" aria-hidden="true">🔥</div></header>
    {error && <div className="game-alert" role="alert">{error}<button type="button" onClick={load}>Thử lại</button></div>}
    <section className="streak-summary-grid"><article className="streak-card streak-card--primary"><span className="card-kicker">CHUỖI HIỆN TẠI</span><div className="streak-number">🔥 {overview?.streak.current || 0}<small> ngày</small></div><p>Kỷ lục của bạn: <strong>{overview?.streak.longest || 0} ngày</strong></p></article><article className="streak-card streak-card--progress"><div><span className="card-kicker">TIẾN ĐỘ HÔM NAY</span><h2>{challenge?.correctCount || 0}<small> / 20 từ</small></h2><p>{challenge ? 'Tiếp tục từ câu hỏi đang mở.' : 'Sẵn sàng cho 10 phút học tập?'}</p></div><ProgressRing value={progress} /></article></section>
    {!challenge ? <section className="game-start-card"><div className="game-start-icon">⚡</div><div><h2>Bắt đầu nhiệm vụ hôm nay</h2><p>20 câu hỏi ngắn với nhiều dạng bài. Trả lời đúng để ghi nhận từ đã hoàn thành.</p></div><button className="game-primary-button" type="button" onClick={start} disabled={busy}>{busy ? 'Đang mở...' : 'Bắt đầu thử thách'}</button></section> : <section className="question-card"><div className="question-card__top"><span>CÂU {challenge.correctCount + 1} / 20</span><span className="question-card__mode">{currentQuestion?.type === 'fill_blank' ? 'Điền từ' : currentQuestion?.type === 'recognition' ? 'Nhận diện từ' : 'Chọn nghĩa'}</span></div><div className="question-card__progress"><span style={{ width: `${progress}%` }} /></div><h2>{currentQuestion?.prompt}</h2>{currentQuestion?.sentence && currentQuestion.sentence !== currentQuestion.prompt && <p className="question-sentence">{currentQuestion.sentence}</p>}<div className="answer-grid">{currentQuestion?.options.map((option) => <button key={option.id} className={`answer-option ${selected === option.id ? 'is-selected' : ''}`} type="button" onClick={() => answer(option)} disabled={busy}>{option.text}</button>)}</div>{feedback && <div className={`answer-feedback ${feedback.correct ? 'is-correct' : 'is-wrong'}`} role="status">{feedback.correct ? '✓' : '↻'} {feedback.message}</div>}</section>}
    <section className="streak-lower-grid"><div className="game-panel"><div className="panel-heading"><div><span className="card-kicker">LỊCH HỌC TẬP</span><h2>Giữ nhịp mỗi ngày</h2></div><span className="panel-month">{new Intl.DateTimeFormat('vi-VN', { month: 'long', year: 'numeric' }).format(new Date())}</span></div><div className="activity-calendar">{Array.from({ length: 14 }, (_, index) => { const date = new Date(); date.setDate(date.getDate() - (13 - index)); const key = dateKeyInZone(date, overview?.streak.timezone); const complete = overview?.streak.completedDates?.includes(key); return <div className={`calendar-dot ${complete ? 'is-complete' : ''}`} key={key} title={complete ? 'Đã hoàn thành' : 'Chưa hoàn thành'}><span>{new Intl.DateTimeFormat('vi-VN', { timeZone: overview?.streak.timezone || 'Asia/Ho_Chi_Minh', day: 'numeric' }).format(date)}</span><i /></div>; })}</div><p className="calendar-hint">Hoàn thành đủ 20 từ để đánh dấu một ngày màu vàng.</p></div><div className="game-panel"><div className="panel-heading"><div><span className="card-kicker">CỘT MỐC</span><h2>Huy hiệu của bạn</h2></div><Link to="/student/vocabulary-quest">Xem hành trình →</Link></div><div className="badge-row">{[7, 14, 30].map((day) => <div className={`achievement-badge ${((overview?.streak.current || 0) >= day) ? 'is-earned' : ''}`} key={day}><span>{day === 7 ? '🌱' : day === 14 ? '⭐' : '🏆'}</span><strong>{day} ngày</strong><small>{(overview?.streak.current || 0) >= day ? 'Đã mở khóa' : 'Còn một chút nữa'}</small></div>)}</div></div></section>
  </main>;
}
