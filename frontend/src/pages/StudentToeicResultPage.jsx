import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { toeicApi } from '../api/toeicApi.js';
import StatusBadge from '../components/ui/StatusBadge.jsx';
import AssessmentQuestionReviewCard from '../components/assessment/AssessmentQuestionReviewCard.jsx';
import '../styles/assessment-screens.css';

export default function StudentToeicResultPage() {
  const { attemptId } = useParams();
  const [attempt, setAttempt] = useState(null);
  const [assessment, setAssessment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadResult();
  }, [attemptId]);

  const loadResult = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await toeicApi.getToeicAttempt(attemptId);
      if (res.status === 'success') {
        setAttempt(res.data.attempt);
        setAssessment(res.data.assessment || res.data.attempt?.assessment);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể tải kết quả bài thi');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="toeic-result-screen toeic-result-screen--state toeic-result-screen--loading">
        <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>📊</div>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--brand-text)' }}>Đang tổng hợp kết quả bài thi TOEIC...</h2>
        <p style={{ marginTop: '0.5rem', fontSize: '0.9rem' }}>Vui lòng đợi trong giây lát</p>
      </div>
    );
  }

  if (error || !attempt) {
    return (
      <div className="toeic-result-screen toeic-result-screen--state toeic-result-screen--error">
        <p style={{ marginBottom: '1rem' }}>{error || 'Không tìm thấy kết quả lượt làm bài.'}</p>
        <Link to="/student/toeic">
          ← Quay lại Kho Đề TOEIC
        </Link>
      </div>
    );
  }

  const breakdown = attempt.toeicBreakdown || {};
  const showAnswers = assessment?.showCorrectAnswers ?? true;

  const totalCorrect = attempt.correctCount ?? (breakdown.listeningCorrect + breakdown.readingCorrect) ?? attempt.score ?? 0;
  const totalQuestions = attempt.maxScore ?? (breakdown.listeningTotal + breakdown.readingTotal) ?? 200;
  const estimatedToeicScore = breakdown.estimatedToeicScore ?? breakdown.estimatedTotalScore;
  const listeningScore = breakdown.listeningScore;
  const readingScore = breakdown.readingScore;

  const reviewList = attempt.answersReview && attempt.answersReview.length > 0
    ? attempt.answersReview
    : Array.isArray(attempt.answers) ? attempt.answers : [];

  return (
    <div className="toeic-result-screen toeic-result-screen--report">
      {/* Header Banner */}
      <div className="ds-card toeic-result-screen__overview">
        <StatusBadge status="completed" label="✓ ĐÃ HOÀN THÀNH BÀI THI" />

        <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--brand-text)', marginTop: '0.75rem', marginBottom: '0.5rem' }}>
          {assessment?.title || 'TOEIC Test Result'}
        </h1>

        <p style={{ fontSize: '0.9rem', color: 'var(--brand-muted)', marginBottom: '1.5rem' }}>
          Thời gian nộp: {new Date(attempt.submittedAt || attempt.updatedAt).toLocaleString('vi-VN')} • Làm bài: {attempt.duration ? `${Math.round(attempt.duration / 60)} phút` : '---'}
        </p>

        {/* Primary Score Cards Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '1rem', marginTop: '1.25rem' }}>
          {/* Estimated TOEIC Score if available */}
          {estimatedToeicScore !== undefined && (
            <div className="toeic-result-screen__score-highlight" style={{ padding: '1.25rem', borderRadius: '14px' }}>
              <div className="toeic-result-screen__score-highlight-label" style={{ fontSize: '0.85rem', fontWeight: 700 }}>ĐIỂM TOEIC ƯỚC TÍNH</div>
              <div className="toeic-result-screen__score-highlight-value" style={{ fontSize: '2.2rem', fontWeight: 800, marginTop: '0.25rem' }}>
                {estimatedToeicScore} <span style={{ fontSize: '1.1rem' }}>/ 990</span>
              </div>
              <div className="toeic-result-screen__score-highlight-note" style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>
                * Quy đổi theo thang điểm TOEIC
              </div>
            </div>
          )}

          {/* Listening Score & Correct */}
          <div style={{ background: 'var(--brand-yellow-soft)', padding: '1.25rem', borderRadius: '14px', border: '1px solid var(--brand-border)' }}>
            <div style={{ fontSize: '0.85rem', color: 'var(--brand-coffee)', fontWeight: 700 }}>🎧 LISTENING</div>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--brand-coffee)', marginTop: '0.25rem' }}>
              {listeningScore !== undefined ? `${listeningScore} đ` : `${breakdown.listeningCorrect || 0} câu`}
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--brand-coffee)', marginTop: '0.25rem', fontWeight: 600 }}>
              Đúng: {breakdown.listeningCorrect ?? 0} / {breakdown.listeningTotal ?? 100} câu
            </div>
          </div>

          {/* Reading Score & Correct */}
          <div style={{ background: 'var(--brand-success-bg)', padding: '1.25rem', borderRadius: '14px', border: '1px solid var(--brand-success-border)' }}>
            <div style={{ fontSize: '0.85rem', color: 'var(--brand-success)', fontWeight: 700 }}>📖 READING</div>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--brand-success)', marginTop: '0.25rem' }}>
              {readingScore !== undefined ? `${readingScore} đ` : `${breakdown.readingCorrect || 0} câu`}
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--brand-success)', marginTop: '0.25rem', fontWeight: 600 }}>
              Đúng: {breakdown.readingCorrect ?? 0} / {breakdown.readingTotal ?? 100} câu
            </div>
          </div>

          {/* Total Raw Correct & Questions */}
          <div style={{ background: 'var(--brand-bg-sub)', padding: '1.25rem', borderRadius: '14px', border: '1px solid var(--brand-border)' }}>
            <div style={{ fontSize: '0.85rem', color: 'var(--brand-muted)', fontWeight: 700 }}>TỔNG CÂU ĐÚNG</div>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--brand-text)', marginTop: '0.25rem' }}>
              {totalCorrect} <span style={{ fontSize: '1.1rem', color: 'var(--brand-muted)' }}>/ {totalQuestions}</span>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', fontSize: '0.75rem', marginTop: '0.35rem', color: 'var(--brand-muted)' }}>
              <span>Sai: {attempt.incorrectCount ?? 0}</span>
              <span>•</span>
              <span>Bỏ trống: {attempt.unansweredCount ?? 0}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Part Breakdown Cards */}
      <div className="ds-card toeic-result-screen__section">
        <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--brand-text)', marginBottom: '1rem' }}>
          Kết Quả Từng Part (1–7)
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.85rem' }}>
          {[1, 2, 3, 4, 5, 6, 7].map((partNum) => {
            const partStat = breakdown.partBreakdown?.[`part${partNum}`] || breakdown.parts?.[`part${partNum}`] || { correct: 0, total: 0 };
            const pct = partStat.total > 0 ? Math.round((partStat.correct / partStat.total) * 100) : 0;
            const isListening = partNum <= 4;

            return (
              <div key={partNum} style={{ padding: '1rem', background: 'var(--brand-bg-sub)', borderRadius: '12px', border: '1px solid var(--brand-border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '0.15rem 0.4rem', borderRadius: '4px', background: isListening ? 'var(--brand-yellow-soft)' : 'var(--brand-success-bg)', color: isListening ? 'var(--brand-coffee)' : 'var(--brand-success)' }}>
                      {isListening ? 'L' : 'R'}
                    </span>
                    <strong style={{ fontSize: '0.9rem', color: 'var(--brand-text)' }}>Part {partNum}</strong>
                  </div>
                  <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--brand-coffee)' }}>
                    {partStat.correct} / {partStat.total} ({pct}%)
                  </span>
                </div>

                <div style={{ width: '100%', height: '8px', background: 'var(--brand-bg-sub)', borderRadius: '4px', overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${pct}%`,
                      height: '100%',
                      background: pct >= 70 ? 'var(--brand-success)' : pct >= 50 ? 'var(--brand-yellow-hover)' : 'var(--brand-danger)',
                      borderRadius: '4px',
                      transition: 'width 0.3s ease',
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Detailed Review Section if Allowed by Assessment Policy */}
      {showAnswers && reviewList.length > 0 && (
        <div className="ds-card toeic-result-screen__section">
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--brand-text)', marginBottom: '1rem' }}>
            Xem Lại Chi Tiết Đáp Án
          </h2>

          <div className="assessment-review-list">
            {reviewList.map((item, idx) => {
              const q = typeof item.questionId === 'object' ? item.questionId : item;
              const qNum = q.questionNumber || idx + 1;
              const selectedOpts = item.selectedOptionIds || item.answers || [];
              const isCorrect = item.isCorrect !== undefined ? item.isCorrect : (item.score > 0);
              const correctAnswers = [
                ...(Array.isArray(q.correctAnswers) ? q.correctAnswers : []),
                ...(Array.isArray(q.correctOptionIds) ? q.correctOptionIds : []),
              ];
              const reviewQuestion = {
                ...q,
                correctAnswers,
                studentAnswer: selectedOpts,
                isCorrect,
              };
              const questionKey = q._id
                || (typeof item.questionId === 'string' ? item.questionId : item.questionId?._id)
                || idx;

              return (
                <AssessmentQuestionReviewCard
                  key={questionKey}
                  question={reviewQuestion}
                  questionNumber={qNum}
                  showCorrectAnswer={showAnswers}
                  variant="options"
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Navigation Footer */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', marginTop: '1rem' }}>
        <Link
          to="/student/toeic"
          style={{
            padding: '0.75rem 1.75rem',
            background: 'var(--brand-yellow)',
            color: 'var(--brand-text)',
            borderRadius: '10px',
            textDecoration: 'none',
            fontWeight: 800,
            fontSize: '0.95rem',
            boxShadow: 'var(--shadow-hover)',
          }}
        >
          ← Trở Về Kho Đề TOEIC
        </Link>
        <Link
          to="/student/history"
          style={{
            padding: '0.75rem 1.75rem',
            background: 'var(--brand-bg-sub)',
            color: 'var(--brand-muted)',
            borderRadius: '10px',
            textDecoration: 'none',
            fontWeight: 700,
            fontSize: '0.95rem',
          }}
        >
          Xem Lịch Sử Làm Bài
        </Link>
      </div>
    </div>
  );
}
