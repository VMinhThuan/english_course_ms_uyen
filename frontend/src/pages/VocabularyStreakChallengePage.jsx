import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { gamificationApi } from '../api/gamificationApi.js';
import './GamificationPages.css';
import './VocabularyStreakChallengePage.css';

const dateKeyInZone = (date, timezone) => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone || 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date).reduce((result, part) => {
    if (part.type !== 'literal') result[part.type] = part.value;
    return result;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
};

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
  const [reviewDate, setReviewDate] = useState('');
  const [review, setReview] = useState(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState('');

  const timezone = overview?.streak.timezone || 'Asia/Ho_Chi_Minh';
  const todayKey = dateKeyInZone(new Date(), timezone);
  const monthLabel = new Intl.DateTimeFormat('vi-VN', { timeZone: timezone, month: 'long', year: 'numeric' }).format(new Date());
  const completedDates = overview?.streak.completedDates || [];
  const totalWords = challenge?.totalWords || 20;
  const completedWords = challenge?.correctCount || 0;

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
  const progress = challenge ? Math.round((completedWords / totalWords) * 100) : 0;
  const isCompleted = challenge?.status === 'completed' || challenge?.correctCount >= 20;
  const journey = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() + index - 3);
    const key = dateKeyInZone(date, timezone);
    const complete = completedDates.includes(key);
    const status = complete ? 'completed' : key === todayKey ? 'current' : key < todayKey ? 'missed' : 'upcoming';
    return {
      date,
      key,
      status,
      isToday: key === todayKey,
      label: new Intl.DateTimeFormat('vi-VN', { timeZone: timezone, weekday: 'short' }).format(date),
      day: new Intl.DateTimeFormat('vi-VN', { timeZone: timezone, day: 'numeric' }).format(date),
    };
  });

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

  const openReview = async (dateKey) => {
    setReviewDate(dateKey);
    setReview(null);
    setReviewError('');
    setReviewLoading(true);
    try {
      const result = await gamificationApi.getDailyChallengeHistory(dateKey);
      setReview(result.data.review);
    } catch (reviewLoadError) {
      setReviewError(reviewLoadError.response?.data?.message || 'Không thể tải danh sách từ đã học.');
    } finally {
      setReviewLoading(false);
    }
  };

  if (loading) return <main className="game-page vocabulary-challenge-page"><LoadingState /></main>;

  return <main className="game-page vocabulary-challenge-page">
    <header className="game-hero game-hero--streak"><div><p className="game-eyebrow">7-DAY VOCABULARY STREAK</p><h1>Thử thách 7 ngày</h1><p>Mỗi ngày hoàn thành 20 từ để duy trì nhịp học TOEIC ổn định.</p></div></header>
    {error && <div className="game-alert" role="alert">{error}<button type="button" onClick={load}>Thử lại</button></div>}
    <section className="challenge-metrics" aria-label="Tóm tắt thử thách">
      <article className="challenge-metric"><span className="card-kicker">CHUỖI HIỆN TẠI</span><strong>{overview?.streak.current || 0}<small> ngày</small></strong><p>Nhịp học liên tục</p></article>
      <article className="challenge-metric challenge-metric--progress"><div><span className="card-kicker">TIẾN ĐỘ HÔM NAY</span><strong>{completedWords}<small> / {totalWords} từ</small></strong></div><div className="challenge-progress-track" role="progressbar" aria-label="Tiến độ từ vựng hôm nay" aria-valuemin="0" aria-valuemax={totalWords} aria-valuenow={completedWords}><span style={{ width: `${Math.min(100, progress)}%` }} /></div><p>{challenge ? 'Mỗi đáp án đúng được ghi nhận một lần.' : '20 từ để hoàn thành mục tiêu hôm nay.'}</p></article>
      <article className="challenge-metric"><span className="card-kicker">KỶ LỤC DÀI NHẤT</span><strong>{overview?.streak.longest || 0}<small> ngày</small></strong><p>Chuỗi thử thách tốt nhất</p></article>
    </section>
    {isCompleted ? <section className="game-completion-card challenge-completion-banner"><p className="game-eyebrow">THỬ THÁCH HÔM NAY ĐÃ XONG</p><h1>20 từ đã được chinh phục!</h1><p>Bạn đã giữ lời hứa học tập hôm nay. Nhấn vào ngày đã hoàn thành bên dưới để xem lại danh sách từ.</p><div className="completion-stats"><div><strong>{challenge.accuracy || 100}<small>%</small></strong><span>Độ chính xác</span></div><div><strong>{overview?.streak.current || 1}<small> ngày</small></strong><span>Chuỗi thử thách</span></div></div></section> : !challenge ? <section className="game-start-card"><div className="game-start-card__content"><h2>Bắt đầu nhiệm vụ hôm nay</h2><p>20 câu hỏi ngắn với nhiều dạng bài. Trả lời đúng để ghi nhận từ đã hoàn thành.</p></div><button className="game-primary-button" type="button" onClick={start} disabled={busy}>{busy ? 'Đang mở...' : 'Bắt đầu thử thách'}</button></section> : <section className="question-card"><div className="question-card__top"><span>CÂU {challenge.correctCount + 1} / {totalWords}</span><span className="question-card__mode">{currentQuestion?.type === 'fill_blank' ? 'Điền từ' : currentQuestion?.type === 'recognition' ? 'Nhận diện từ' : 'Chọn nghĩa'}</span></div><div className="question-card__progress"><span style={{ width: `${progress}%` }} /></div><p className="question-card__hint">Chọn một đáp án để kiểm tra ngay</p><h2>{currentQuestion?.prompt}</h2>{currentQuestion?.sentence && currentQuestion.sentence !== currentQuestion.prompt && <p className="question-sentence">{currentQuestion.sentence}</p>}<div className="answer-grid">{currentQuestion?.options.map((option, index) => { const optionLabel = String.fromCharCode(65 + index); const optionState = selected === option.id && feedback ? (feedback.correct ? 'is-correct' : 'is-incorrect') : ''; return <button key={option.id} className={`answer-option ${selected === option.id ? 'is-selected' : ''} ${optionState}`} type="button" onClick={() => answer(option)} disabled={busy} aria-pressed={selected === option.id} aria-label={`${optionLabel}. ${option.text}`}><span className="answer-option__label" aria-hidden="true">{optionLabel}</span><span className="answer-option__text">{option.text}</span></button>; })}</div>{feedback && <div className={`answer-feedback ${feedback.correct ? 'is-correct' : 'is-wrong'}`} role="status">{feedback.correct ? '✓' : '↻'} {feedback.message}</div>}</section>}
    <section className="challenge-journey-section game-panel" aria-labelledby="challenge-journey-title"><div className="panel-heading"><div><span className="card-kicker">HÀNH TRÌNH 7 NGÀY</span><h2 id="challenge-journey-title">Giữ nhịp mỗi ngày</h2></div><span className="panel-month">{monthLabel}</span></div><div className="challenge-journey">{journey.map((day, index) => { const reviewable = day.status === 'completed'; return <button className={`challenge-journey__day is-${day.status} ${day.isToday ? 'is-today' : ''} ${reviewable ? 'is-reviewable' : ''}`} key={day.key} type="button" onClick={() => reviewable && openReview(day.key)} disabled={!reviewable} aria-label={reviewable ? `Xem lại 20 từ ngày ${day.key}` : `${day.key}: ${day.status === 'missed' ? 'bỏ lỡ' : day.status === 'upcoming' ? 'sắp tới' : 'hôm nay'}`}><span className="challenge-journey__index">Ngày {index + 1}</span><strong>{day.label}</strong><span className="challenge-journey__date">{day.day}</span><span className="challenge-journey__status">{day.status === 'completed' ? 'Xem lại' : day.status === 'missed' ? 'Bỏ lỡ' : day.status === 'upcoming' ? 'Sắp tới' : 'Hôm nay'}</span></button>; })}</div><div className="challenge-journey__legend" aria-label="Chú thích trạng thái"><span><i className="is-completed" />Đã hoàn thành · bấm để xem lại</span><span><i className="is-current" />Hôm nay</span><span><i className="is-missed" />Bỏ lỡ</span><span><i className="is-upcoming" />Sắp tới</span></div><details className="challenge-history"><summary>Xem lịch sử chi tiết · {monthLabel}</summary><div className="activity-calendar">{Array.from({ length: 14 }, (_, index) => { const date = new Date(); date.setDate(date.getDate() - (13 - index)); const key = dateKeyInZone(date, timezone); const complete = completedDates.includes(key); const isToday = key === todayKey; const isMissed = !complete && key < todayKey; return <div className={`calendar-dot ${complete ? 'is-complete' : ''} ${isToday ? 'is-today' : ''} ${isMissed ? 'is-missed' : ''}`} key={key} title={complete ? 'Đã hoàn thành' : isToday ? 'Hôm nay' : 'Chưa hoàn thành'} tabIndex="0" aria-label={`${key}: ${complete ? 'đã hoàn thành' : isToday ? 'hôm nay' : 'chưa hoàn thành'}`}><span>{new Intl.DateTimeFormat('vi-VN', { timeZone: timezone, day: 'numeric' }).format(date)}</span><i aria-hidden="true" /></div>; })}</div><p className="calendar-hint">Hoàn thành đủ 20 từ để đánh dấu một ngày màu vàng.</p></details></section>
    {reviewDate && <section className="challenge-review-panel game-panel" aria-labelledby="challenge-review-title"><div className="panel-heading"><div><span className="card-kicker">ÔN LẠI NGÀY ĐÃ HỌC</span><h2 id="challenge-review-title">20 từ ngày {reviewDate}</h2></div><button className="challenge-review-close" type="button" onClick={() => { setReviewDate(''); setReview(null); }}>Đóng</button></div>{reviewLoading && <div className="challenge-review-state" role="status">Đang tải danh sách từ đã học...</div>}{reviewError && <div className="challenge-review-state is-error" role="alert">{reviewError}<button type="button" onClick={() => openReview(reviewDate)}>Thử lại</button></div>}{review && <><p className="challenge-review-summary">{review.correctCount}/{review.totalWords} từ hoàn thành · độ chính xác {review.accuracy}%</p><div className="challenge-review-list">{review.words.map((word, index) => <article className="challenge-review-word" key={`${word.vocabularyId}-${word.questionId}`}><span className="challenge-review-word__index">{String(index + 1).padStart(2, '0')}</span><div><strong>{word.word || 'Từ vựng đã học'}</strong><p>{word.meaning || word.prompt}</p>{word.exampleEnglish && <small>{word.exampleEnglish}</small>}</div></article>)}</div></>}</section>}
    <section className="game-panel challenge-milestones"><div className="panel-heading"><div><span className="card-kicker">CỘT MỐC</span><h2>Huy hiệu của bạn</h2></div><Link to="/student/vocabulary-quest">Xem hành trình →</Link></div><p className="challenge-milestones__note">Chuỗi thử thách tiếp tục được ghi nhận sau tuần đầu tiên.</p><div className="badge-row">{[7, 14, 30].map((day) => { const earned = (overview?.streak.current || 0) >= day; return <div className={`achievement-badge ${earned ? 'is-earned' : 'is-locked'}`} key={day}><span className="achievement-mark" aria-hidden="true">{day}</span><strong>{day} ngày</strong><small>{earned ? 'Đã mở khóa' : 'Còn một chút nữa'}</small></div>; })}</div></section>
  </main>;
}
