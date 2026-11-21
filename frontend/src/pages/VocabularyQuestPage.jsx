import { useEffect, useMemo, useState } from 'react';
import { gamificationApi } from '../api/gamificationApi.js';
import './GamificationPages.css';

function QuestMap({ levels, selected, onSelect }) {
  return <div className="quest-map" aria-label="Bản đồ các cấp độ TOEIC">{levels.map((level, index) => <button key={level.level} type="button" className={`quest-node quest-node--${level.unlocked ? (level.completed ? 'completed' : 'unlocked') : 'locked'} ${selected === level.level ? 'is-selected' : ''}`} onClick={() => level.unlocked && onSelect(level.level)} disabled={!level.unlocked}><span className="quest-node__number">{level.unlocked ? (level.completed ? '✓' : level.level) : '🔒'}</span><strong>Cấp {level.level}</strong><small>{level.range}</small>{level.stars > 0 && <em>{'★'.repeat(level.stars)}</em>}{index < levels.length - 1 && <i className={`quest-connector ${levels[index + 1].unlocked ? 'is-active' : ''}`} />}</button>)}</div>;
}

export default function VocabularyQuestPage() {
  const [overview, setOverview] = useState(null);
  const [level, setLevel] = useState(1);
  const [stage, setStage] = useState(1);
  const [attempt, setAttempt] = useState(null);
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);
  const [remaining, setRemaining] = useState(20);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true); setError('');
    try {
      const response = await gamificationApi.getOverview();
      setOverview(response.data); setLevel(response.data.quest.currentLevel || 1);
      if (response.data.quest.activeAttempt) {
        const active = response.data.quest.activeAttempt;
        setAttempt(active);
        setAnswers(Object.fromEntries((active.savedAnswers || []).map((answer) => [answer.questionId, answer.answer])));
        setRemaining(Math.max(0, Math.ceil((new Date(active.expiresAt).getTime() - Date.now()) / 1000)));
      }
    }
    catch (loadError) { setError(loadError.response?.data?.message || 'Không thể tải bản đồ TOEIC.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);
  const selectedLevel = overview?.quest.levels.find((item) => item.level === level);
  const start = async () => {
    setBusy(true); setError(''); setResult(null); setAnswers({});
    try {
      const nextAttempt = (await gamificationApi.startQuest(level, stage)).data.attempt;
      setAttempt(nextAttempt); setRemaining(Math.max(0, Math.ceil((new Date(nextAttempt.expiresAt).getTime() - Date.now()) / 1000)));
      setAnswers(Object.fromEntries((nextAttempt.savedAnswers || []).map((answer) => [answer.questionId, answer.answer])));
    }
    catch (startError) { setError(startError.response?.data?.message || 'Chưa thể mở chặng chơi này.'); }
    finally { setBusy(false); }
  };
  const unanswered = useMemo(() => attempt?.questions.filter((question) => answers[question.questionId] === undefined).length || 0, [attempt, answers]);
  useEffect(() => {
    if (!attempt || !attempt.questions.some((question) => question.mode === 'timed')) return undefined;
    const timer = window.setInterval(() => setRemaining((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [attempt]);
  const submit = async (force = false) => {
    if (!attempt || (unanswered && !force)) return;
    setBusy(true); setError('');
    try { const response = await gamificationApi.submitQuest(attempt.id, attempt.questions.map((question) => ({ questionId: question.questionId, answer: answers[question.questionId] }))); setResult(response.data.attempt); setAttempt(null); await load(); }
    catch (submitError) { setError(submitError.response?.data?.message || 'Không thể nộp bài.'); }
    finally { setBusy(false); }
  };
  useEffect(() => {
    if (attempt && remaining === 0 && !busy) submit(true);
  }, [attempt, remaining, busy]);
  if (loading) return <main className="game-page"><div className="game-loading"><span /><span /><span />Đang dựng bản đồ TOEIC...</div></main>;
  if (attempt) return <main className="game-page"><header className="game-hero game-hero--quest"><div><p className="game-eyebrow">CẤP {attempt.level} · CHẶNG {attempt.stage}</p><h1>Vượt chướng ngại vật</h1><p>Chọn đáp án đúng cho tất cả câu hỏi. Bạn cần đạt từ 80% để mở cấp tiếp theo.</p></div><div className="quest-timer" aria-label={`Còn ${remaining} giây`}>⏱️ <strong>{remaining}</strong><small>giây</small></div></header>{error && <div className="game-alert" role="alert">{error}</div>}<section className="quest-play-card"><div className="question-card__top"><span>{attempt.questions.length - unanswered} / {attempt.questions.length} câu</span><span className="question-card__mode">{unanswered ? `Còn ${unanswered} câu` : 'Sẵn sàng nộp bài'}</span></div><div className="question-card__progress"><span style={{ width: `${((attempt.questions.length - unanswered) / attempt.questions.length) * 100}%` }} /></div>{attempt.questions.map((question, index) => <div className="quest-question" key={question.questionId}><div className="quest-question__label">CÂU {index + 1} · {question.mode === 'match' ? 'MATCH THE WORDS' : question.mode === 'fill_blank' ? 'FILL IN THE BLANK' : question.mode === 'timed' ? 'TIMED CHALLENGE' : 'MULTIPLE CHOICE'}</div><h2>{question.prompt}</h2>{question.sentence && question.sentence !== question.prompt && <p className="question-sentence">{question.sentence}</p>}<div className="answer-grid">{question.options.map((option) => <button key={option.id} type="button" className={`answer-option ${answers[question.questionId] === option.id ? 'is-selected' : ''}`} onClick={() => { const next = { ...answers, [question.questionId]: option.id }; setAnswers(next); gamificationApi.saveQuestProgress(attempt.id, question.questionId, option.id).catch(() => setError('Không thể lưu tiến độ. Vui lòng kiểm tra kết nối mạng.')); }}>{option.text}</button>)}</div></div>)}<button className="game-primary-button game-submit-button" type="button" disabled={busy || unanswered > 0} onClick={submit}>{busy ? 'Đang chấm điểm...' : unanswered ? `Còn ${unanswered} câu chưa trả lời` : remaining === 0 ? 'Nộp bài hết giờ' : 'Nộp bài đánh giá'}</button></section></main>;
  if (result) return <main className="game-page"><section className={`game-completion-card ${result.passed ? '' : 'game-completion-card--retry'}`}><div className="celebration-orbit" aria-hidden="true">{result.passed ? '🎊' : '💪'}</div><p className="game-eyebrow">KẾT QUẢ ĐÁNH GIÁ CẤP {result.level}</p><h1>{result.passed ? 'Cấp độ đã chinh phục!' : 'Gần đạt rồi, thử lại nhé!'}</h1><div className="completion-stats"><div><strong>{result.accuracy}%</strong><span>Độ chính xác</span></div><div><strong>{'★'.repeat(result.stars)}{'☆'.repeat(3 - result.stars)}</strong><span>Số sao</span></div><div><strong>{result.score}</strong><span>Điểm</span></div></div><p>{result.passed ? 'Cấp tiếp theo đã được mở khóa. Hành trình của bạn đang tăng tốc!' : 'Bạn cần tối thiểu 80%. Đáp án mới sẽ được tạo ở lượt chơi tiếp theo.'}</p><div className="game-actions"><button className="game-primary-button" type="button" onClick={() => { setResult(null); start(); }}>{result.passed ? 'Chơi lại để săn sao' : 'Thử lại cấp này'}</button><button className="game-secondary-button" type="button" onClick={() => { setResult(null); load(); }}>Về bản đồ</button></div></section></main>;

  return <main className="game-page"><header className="game-hero game-hero--quest"><div><p className="game-eyebrow">TOEIC VOCABULARY QUEST</p><h1>Vượt ải TOEIC</h1><p>Đi qua từng vùng từ vựng, tích lũy sao và mở khóa cấp độ mới bằng năng lực thật.</p></div><div className="quest-avatar" aria-hidden="true">🧭</div></header>{error && <div className="game-alert" role="alert">{error}<button type="button" onClick={load}>Thử lại</button></div>}<section className="quest-intro"><div><span className="card-kicker">ĐIỂM ĐẾN HIỆN TẠI</span><h2>{selectedLevel?.title || 'Khởi động TOEIC'}</h2><p>{selectedLevel?.description}</p></div><div className="quest-intro__rule"><strong>80%</strong><span>để mở khóa cấp tiếp theo</span></div></section><QuestMap levels={overview?.quest.levels || []} selected={level} onSelect={setLevel} /><section className="quest-stage-panel"><div className="panel-heading"><div><span className="card-kicker">CẤP {level} · {selectedLevel?.range}</span><h2>Chọn một chặng để bắt đầu</h2></div><span className="quest-best-score">{selectedLevel?.bestAccuracy || 0}% tốt nhất</span></div><div className="stage-grid">{[1, 2, 3, 4].map((item) => <button className={`stage-card ${selectedLevel?.completedStages?.includes(item) ? 'is-complete' : ''} ${stage === item ? 'is-selected' : ''}`} key={item} type="button" onClick={() => setStage(item)}><span>{selectedLevel?.completedStages?.includes(item) ? '✓' : item}</span><strong>Chặng {item}</strong><small>{['Multiple choice', 'Match the words', 'Fill in the blank', 'Timed challenge'][item - 1]}</small></button>)}</div><button className="game-primary-button quest-start-button" type="button" onClick={start} disabled={!selectedLevel?.unlocked || busy}>{busy ? 'Đang chuẩn bị...' : selectedLevel?.completed ? 'Chơi lại cấp này' : 'Bắt đầu chặng chơi →'}</button></section><section className="quest-tip"><span>💡</span><p><strong>Mẹo nhỏ:</strong> Đọc ví dụ tiếng Anh thật kỹ. Câu hỏi được tạo từ dữ liệu từ vựng đã xuất bản trong thư viện TOEIC. Từ trùng với thử thách hôm nay chỉ được tính một lần.</p></section></main>;
}
