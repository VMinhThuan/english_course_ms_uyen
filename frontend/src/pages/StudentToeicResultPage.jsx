import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { toeicApi } from '../api/toeicApi.js';

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
      <div style={{ padding: '5rem 1rem', textAlign: 'center', color: '#64748B' }}>
        <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>📊</div>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0F172A' }}>Đang tổng hợp kết quả bài thi TOEIC...</h2>
        <p style={{ marginTop: '0.5rem', fontSize: '0.9rem' }}>Vui lòng đợi trong giây lát</p>
      </div>
    );
  }

  if (error || !attempt) {
    return (
      <div style={{ maxWidth: '600px', margin: '4rem auto', padding: '1.5rem', background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#991B1B', borderRadius: '12px', textAlign: 'center' }}>
        <p style={{ marginBottom: '1rem' }}>{error || 'Không tìm thấy kết quả lượt làm bài.'}</p>
        <Link to="/student/toeic" style={{ color: '#0284C7', fontWeight: 700, textDecoration: 'none' }}>
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
    <div style={{ maxWidth: '1050px', margin: '0 auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header Banner */}
      <div
        style={{
          background: '#FFFFFF',
          borderRadius: '16px',
          border: '1px solid #E2E8F0',
          padding: '2rem',
          textAlign: 'center',
          boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)',
        }}
      >
        <span
          style={{
            fontSize: '0.8rem',
            fontWeight: 800,
            padding: '0.25rem 0.85rem',
            borderRadius: '20px',
            background: '#DCFCE7',
            color: '#166534',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          ✓ ĐÃ HOÀN THÀNH BÀI THI
        </span>

        <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0F172A', marginTop: '0.75rem', marginBottom: '0.5rem' }}>
          {assessment?.title || 'TOEIC Test Result'}
        </h1>

        <p style={{ fontSize: '0.9rem', color: '#64748B', marginBottom: '1.5rem' }}>
          Thời gian nộp: {new Date(attempt.submittedAt || attempt.updatedAt).toLocaleString('vi-VN')} • Làm bài: {attempt.duration ? `${Math.round(attempt.duration / 60)} phút` : '---'}
        </p>

        {/* Primary Score Cards Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '1rem', marginTop: '1.25rem' }}>
          {/* Estimated TOEIC Score if available */}
          {estimatedToeicScore !== undefined && (
            <div style={{ background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)', color: '#FFFFFF', padding: '1.25rem', borderRadius: '14px', boxShadow: '0 4px 12px rgba(15, 23, 42, 0.15)' }}>
              <div style={{ fontSize: '0.85rem', color: '#94A3B8', fontWeight: 700 }}>ĐIỂM TOEIC ƯỚC TÍNH</div>
              <div style={{ fontSize: '2.2rem', fontWeight: 800, color: '#38BDF8', marginTop: '0.25rem' }}>
                {estimatedToeicScore} <span style={{ fontSize: '1.1rem', color: '#94A3B8' }}>/ 990</span>
              </div>
              <div style={{ fontSize: '0.75rem', color: '#CBD5E1', marginTop: '0.25rem' }}>
                * Quy đổi theo thang điểm TOEIC
              </div>
            </div>
          )}

          {/* Listening Score & Correct */}
          <div style={{ background: '#F0F9FF', padding: '1.25rem', borderRadius: '14px', border: '1px solid #BAE6FD' }}>
            <div style={{ fontSize: '0.85rem', color: '#0369A1', fontWeight: 700 }}>🎧 LISTENING</div>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: '#0284C7', marginTop: '0.25rem' }}>
              {listeningScore !== undefined ? `${listeningScore} đ` : `${breakdown.listeningCorrect || 0} câu`}
            </div>
            <div style={{ fontSize: '0.85rem', color: '#0369A1', marginTop: '0.25rem', fontWeight: 600 }}>
              Đúng: {breakdown.listeningCorrect ?? 0} / {breakdown.listeningTotal ?? 100} câu
            </div>
          </div>

          {/* Reading Score & Correct */}
          <div style={{ background: '#F0FDF4', padding: '1.25rem', borderRadius: '14px', border: '1px solid #BBF7D0' }}>
            <div style={{ fontSize: '0.85rem', color: '#15803D', fontWeight: 700 }}>📖 READING</div>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: '#166534', marginTop: '0.25rem' }}>
              {readingScore !== undefined ? `${readingScore} đ` : `${breakdown.readingCorrect || 0} câu`}
            </div>
            <div style={{ fontSize: '0.85rem', color: '#15803D', marginTop: '0.25rem', fontWeight: 600 }}>
              Đúng: {breakdown.readingCorrect ?? 0} / {breakdown.readingTotal ?? 100} câu
            </div>
          </div>

          {/* Total Raw Correct & Questions */}
          <div style={{ background: '#F8FAFC', padding: '1.25rem', borderRadius: '14px', border: '1px solid #E2E8F0' }}>
            <div style={{ fontSize: '0.85rem', color: '#64748B', fontWeight: 700 }}>TỔNG CÂU ĐÚNG</div>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: '#334155', marginTop: '0.25rem' }}>
              {totalCorrect} <span style={{ fontSize: '1.1rem', color: '#64748B' }}>/ {totalQuestions}</span>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', fontSize: '0.75rem', marginTop: '0.35rem', color: '#64748B' }}>
              <span>Sai: {attempt.incorrectCount ?? 0}</span>
              <span>•</span>
              <span>Bỏ trống: {attempt.unansweredCount ?? 0}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Part Breakdown Cards */}
      <div style={{ background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E2E8F0', padding: '1.5rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)' }}>
        <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0F172A', marginBottom: '1rem' }}>
          Kết Quả Từng Part (1–7)
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.85rem' }}>
          {[1, 2, 3, 4, 5, 6, 7].map((partNum) => {
            const partStat = breakdown.partBreakdown?.[`part${partNum}`] || breakdown.parts?.[`part${partNum}`] || { correct: 0, total: 0 };
            const pct = partStat.total > 0 ? Math.round((partStat.correct / partStat.total) * 100) : 0;
            const isListening = partNum <= 4;

            return (
              <div key={partNum} style={{ padding: '1rem', background: '#F8FAFC', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '0.15rem 0.4rem', borderRadius: '4px', background: isListening ? '#E0F2FE' : '#DCFCE7', color: isListening ? '#0369A1' : '#166534' }}>
                      {isListening ? 'L' : 'R'}
                    </span>
                    <strong style={{ fontSize: '0.9rem', color: '#0F172A' }}>Part {partNum}</strong>
                  </div>
                  <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0284C7' }}>
                    {partStat.correct} / {partStat.total} ({pct}%)
                  </span>
                </div>

                <div style={{ width: '100%', height: '8px', background: '#E2E8F0', borderRadius: '4px', overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${pct}%`,
                      height: '100%',
                      background: pct >= 70 ? '#22C55E' : pct >= 50 ? '#EAB308' : '#EF4444',
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
        <div style={{ background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E2E8F0', padding: '1.5rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)' }}>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0F172A', marginBottom: '1rem' }}>
            Xem Lại Chi Tiết Đáp Án
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {reviewList.map((item, idx) => {
              const q = typeof item.questionId === 'object' ? item.questionId : item;
              const qNum = q.questionNumber || idx + 1;
              const qText = q.questionText || q.prompt || q.text || '';
              const selectedOpts = item.selectedOptionIds || item.answers || [];
              const isCorrect = item.isCorrect !== undefined ? item.isCorrect : (item.score > 0);

              return (
                <div
                  key={idx}
                  style={{
                    padding: '1.25rem',
                    borderRadius: '12px',
                    border: isCorrect ? '1px solid #BBF7D0' : '1px solid #FECACA',
                    background: isCorrect ? '#F0FDF4' : '#FEF2F2',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                      <span
                        style={{
                          background: isCorrect ? '#166534' : '#991B1B',
                          color: '#FFFFFF',
                          fontSize: '0.8rem',
                          fontWeight: 800,
                          padding: '0.2rem 0.5rem',
                          borderRadius: '6px',
                          flexShrink: 0,
                        }}
                      >
                        Câu {qNum}
                      </span>
                      {qText && (
                        <span style={{ fontWeight: 700, fontSize: '0.95rem', color: '#0F172A', lineHeight: 1.4 }}>
                          {qText}
                        </span>
                      )}
                    </div>

                    <span style={{ fontWeight: 800, fontSize: '0.85rem', color: isCorrect ? '#166534' : '#991B1B', whiteSpace: 'nowrap' }}>
                      {isCorrect ? '✓ Đúng' : '✗ Sai'}
                    </span>
                  </div>

                  {/* Options List */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.5rem' }}>
                    {(q.options || []).map((opt) => {
                      const optId = opt.id || opt._id;
                      const isChosen = selectedOpts.includes(optId);
                      const isRight = (q.correctAnswers || []).includes(opt.text) || (q.correctAnswers || []).includes(optId) || (q.correctOptionIds || []).includes(optId);

                      let optionBg = 'transparent';
                      let optionBorder = 'transparent';
                      let optionColor = '#475569';

                      if (isRight) {
                        optionBg = '#DCFCE7';
                        optionBorder = '#86EFAC';
                        optionColor = '#166534';
                      } else if (isChosen && !isRight) {
                        optionBg = '#FEE2E2';
                        optionBorder = '#FCA5A5';
                        optionColor = '#991B1B';
                      }

                      return (
                        <div
                          key={optId}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            padding: '0.5rem 0.75rem',
                            borderRadius: '8px',
                            background: optionBg,
                            border: `1px solid ${optionBorder}`,
                            color: optionColor,
                            fontSize: '0.9rem',
                            fontWeight: isRight || isChosen ? 700 : 400,
                          }}
                        >
                          <span style={{ width: '20px', textAlign: 'center' }}>
                            {isChosen ? (isRight ? '✓' : '✗') : isRight ? '★' : '○'}
                          </span>
                          <span>{opt.text}</span>
                          {isChosen && <span style={{ fontSize: '0.75rem', marginLeft: 'auto' }}>(Đã chọn)</span>}
                          {isRight && <span style={{ fontSize: '0.75rem', marginLeft: 'auto' }}>(Đáp án đúng)</span>}
                        </div>
                      );
                    })}
                  </div>

                  {/* Explanation */}
                  {q.explanation && (
                    <div style={{ marginTop: '0.75rem', paddingTop: '0.5rem', borderTop: '1px dashed #CBD5E1', fontSize: '0.85rem', color: '#475569', lineHeight: 1.5 }}>
                      <strong>💡 Giải thích:</strong> {q.explanation}
                    </div>
                  )}
                </div>
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
            background: '#0284C7',
            color: '#FFFFFF',
            borderRadius: '10px',
            textDecoration: 'none',
            fontWeight: 800,
            fontSize: '0.95rem',
            boxShadow: '0 2px 8px rgba(2, 132, 199, 0.3)',
          }}
        >
          ← Trở Về Kho Đề TOEIC
        </Link>
        <Link
          to="/student/history"
          style={{
            padding: '0.75rem 1.75rem',
            background: '#F1F5F9',
            color: '#475569',
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
