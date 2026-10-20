import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toeicApi } from '../api/toeicApi.js';
import StatusBadge from '../components/ui/StatusBadge.jsx';
import UiButton from '../components/ui/UiButton.jsx';
import './StudentToeic.css';

export default function StudentToeicOverviewPage() {
  const { assessmentId } = useParams();
  const navigate = useNavigate();
  const [test, setTest] = useState(null);
  const [activeAttempt, setActiveAttempt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [errorCode, setErrorCode] = useState('');
  useEffect(() => { loadOverview(); }, [assessmentId]);
  const loadOverview = async () => {
    try { setLoading(true); setError(null); setErrorCode(''); const res = await toeicApi.getStudentToeicTestOverview(assessmentId); if (res.status === 'success') { setTest(res.data.assessment); setActiveAttempt(res.data.assessment.hasActiveAttempt ? { _id: res.data.assessment.activeAttemptId } : null); } }
    catch (err) { setError(err.response?.data?.message || 'Không thể tải thông tin đề thi TOEIC'); setErrorCode(err.response?.data?.code || ''); }
    finally { setLoading(false); }
  };
  const handleStartOrResume = async () => {
    if (activeAttempt?._id) { navigate(`/student/toeic/attempt/${activeAttempt._id}`); return; }
    try { setSubmitting(true); const res = await toeicApi.startToeicAttempt(assessmentId); if (res.status === 'success') navigate(`/student/toeic/attempt/${res.data?.attemptId || res.data?.attempt?._id}`); }
    catch (err) { setErrorCode(err.response?.data?.code || ''); setError(err.response?.data?.code === 'ATTEMPT_LIMIT_REACHED' ? 'Bạn đã sử dụng hết số lượt làm bài kiểm tra này.' : (err.response?.data?.message || 'Không thể bắt đầu bài thi')); }
    finally { setSubmitting(false); }
  };
  if (loading) return <div className="toeic-page"><div className="ds-loading-state">Đang tải thông tin tổng quan đề thi...</div></div>;
  if (error || !test) return <div className="toeic-page"><div className="ds-error-state">{error || 'Không tìm thấy đề thi'}</div></div>;
  const parts = test.parts || [];
  const listeningParts = parts.filter((part) => part.section === 'listening');
  const readingParts = parts.filter((part) => part.section === 'reading');
  const totalQuestions = test.toeicConfig?.totalQuestions || test.questions?.length || 200;
  const durationMinutes = test.toeicConfig?.durationMinutes || test.duration || 120;
  const exhausted = !activeAttempt && Number(test.attemptLimit || 0) > 0 && Number(test.submittedCount || 0) >= Number(test.attemptLimit);
  const renderPart = (part) => { const count = part.questionGroups?.reduce((sum, group) => sum + (group.questionIds?.length || 0), 0) || 0; return <article key={part.partNumber} className="toeic-part-card"><strong>Part {part.partNumber}: {part.name}</strong><span>{count > 0 ? `${count} câu hỏi` : part.instructions ? 'Chuẩn hóa TOEIC' : part.section === 'listening' ? 'Listening' : 'Reading'}</span></article>; };
  const mode = test.toeicMode === 'full_test' ? 'FULL TOEIC TEST' : test.toeicMode === 'mini_test' ? 'MINI TEST' : 'PRACTICE';
  return <div className="toeic-overview">
    <section className="toeic-overview-hero"><StatusBadge label={mode} variant="warning" /><h1>{test.title}</h1>{test.description && <p>{test.description}</p>}<div className="toeic-overview-facts"><span>⏱️ Thời gian: <strong>{durationMinutes} phút</strong></span><span>📝 Tổng câu hỏi: <strong>{totalQuestions} câu</strong></span><span>🔄 Đã làm: <strong>{test.submittedCount} lượt</strong></span><span>🎯 Còn lượt: <strong>{test.remainingAttempts === null ? 'Không giới hạn' : test.remainingAttempts}</strong></span></div></section>
    {error && <div className="toeic-notice" role="alert"><strong>{errorCode === 'ATTEMPT_LIMIT_REACHED' ? 'Đã hết lượt làm bài' : 'Không thể bắt đầu bài thi'}</strong><div>{error}</div><button type="button" className="ds-button ds-button--secondary" onClick={() => navigate('/student/toeic')}>Quay về Kho Đề TOEIC</button></div>}
    <section className="toeic-overview-panel"><h2>Cấu trúc đề thi</h2><div className="toeic-section"><h3>🎧 LISTENING SECTION ({test.toeicMode === 'full_test' ? '100 câu' : test.toeicMode === 'mini_test' ? '25 câu' : 'Part 1–4'})</h3><div className="toeic-part-grid">{listeningParts.map(renderPart)}</div></div><div className="toeic-section"><h3>📖 READING SECTION ({test.toeicMode === 'full_test' ? '100 câu' : test.toeicMode === 'mini_test' ? '25 câu' : 'Part 5–7'})</h3><div className="toeic-part-grid">{readingParts.map(renderPart)}</div></div></section>
    <section className="toeic-notice"><strong>📌 Hướng dẫn làm bài</strong><ul><li>Hệ thống tự động lưu đáp án khi chọn. Khi mở lại bài làm, thời gian và đáp án sẽ được khôi phục.</li><li>Đảm bảo giữ kết nối Internet ổn định trong suốt quá trình làm bài.</li><li>Bài thi sẽ tự động nộp khi hết thời gian countdown trên Server.</li></ul></section>
    <div className="toeic-action"><UiButton size="large" onClick={handleStartOrResume} disabled={submitting || exhausted}>{submitting ? 'ĐANG KHỞI TẠO...' : activeAttempt ? '▶ TIẾP TỤC BÀI THI DANG DỞ' : exhausted ? 'ĐÃ HẾT LƯỢT LÀM BÀI' : '🚀 BẮT ĐẦU BÀI THI'}</UiButton></div>
  </div>;
}
