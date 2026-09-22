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
        setAssessment(res.data.assessment || res.data.attempt.assessment);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể tải kết quả bài thi');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '4rem', textAlign: 'center', color: '#64748B' }}>
        Đang tải kết quả bài thi TOEIC...
      </div>
    );
  }

  if (error || !attempt) {
    return (
      <div style={{ maxWidth: '600px', margin: '3rem auto', padding: '1.5rem', background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#991B1B', borderRadius: '12px' }}>
        {error || 'Không tìm thấy kết quả.'}
      </div>
    );
  }

  const breakdown = attempt.toeicBreakdown || {};
  const showAnswers = assessment?.showCorrectAnswers ?? true;

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header Banner */}
      <div style={{ background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E2E8F0', padding: '2rem', textAlign: 'center', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)' }}>
        <span style={{ fontSize: '0.8rem', fontWeight: 700, padding: '0.25rem 0.75rem', borderRadius: '20px', background: '#DCFCE7', color: '#166534', textTransform: 'uppercase' }}>
          HOÀN THÀNH BÀI THI
        </span>

        <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0F172A', marginTop: '0.5rem', marginBottom: '0.5rem' }}>
          {assessment?.title || 'TOEIC Test Result'}
        </h1>

        <p style={{ fontSize: '0.9rem', color: '#64748B', marginBottom: '1.5rem' }}>
          Ngày thi: {new Date(attempt.submittedAt || attempt.updatedAt).toLocaleString('vi-VN')}
        </p>

        {/* Score Cards Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginTop: '1rem' }}>
          {/* Total Raw Correct */}
          <div style={{ background: '#F8FAFC', padding: '1.25rem', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
            <div style={{ fontSize: '0.85rem', color: '#64748B', fontWeight: 600 }}>TỔNG CÂU ĐÚNG</div>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: '#0284C7', marginTop: '0.25rem' }}>
              {breakdown.totalCorrect || 0} / {breakdown.totalQuestions || 200}
            </div>
          </div>

          {/* Listening Correct */}
          <div style={{ background: '#F0F9FF', padding: '1.25rem', borderRadius: '12px', border: '1px solid #BAE6FD' }}>
            <div style={{ fontSize: '0.85rem', color: '#0369A1', fontWeight: 600 }}>🎧 LISTENING</div>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: '#0284C7', marginTop: '0.25rem' }}>
              {breakdown.listeningCorrect || 0} / {breakdown.listeningTotal || 100}
            </div>
          </div>

          {/* Reading Correct */}
          <div style={{ background: '#F0FDF4', padding: '1.25rem', borderRadius: '12px', border: '1px solid #BBF7D0' }}>
            <div style={{ fontSize: '0.85rem', color: '#15803D', fontWeight: 600 }}>📖 READING</div>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: '#166534', marginTop: '0.25rem' }}>
              {breakdown.readingCorrect || 0} / {breakdown.readingTotal || 100}
            </div>
          </div>

          {/* Estimated TOEIC Score if available */}
          {breakdown.estimatedTotalScore !== undefined && (
            <div style={{ background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)', color: '#FFFFFF', padding: '1.25rem', borderRadius: '12px' }}>
              <div style={{ fontSize: '0.85rem', color: '#94A3B8', fontWeight: 600 }}>ĐIỂM TOEIC ƯỚC TÍNH</div>
              <div style={{ fontSize: '2rem', fontWeight: 800, color: '#38BDF8', marginTop: '0.25rem' }}>
                {breakdown.estimatedTotalScore} / 990
              </div>
              <div style={{ fontSize: '0.7rem', color: '#CBD5E1', marginTop: '0.2rem' }}>
                * Bảng quy đổi tham khảo
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Part Breakdown Table */}
      <div style={{ background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E2E8F0', padding: '1.5rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)' }}>
        <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0F172A', marginBottom: '1rem' }}>
          Chi Tiết Từng Part
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.75rem' }}>
          {[1, 2, 3, 4, 5, 6, 7].map((partNum) => {
            const partStat = breakdown.parts?.[`part${partNum}`] || { correct: 0, total: 0 };
            const pct = partStat.total > 0 ? Math.round((partStat.correct / partStat.total) * 100) : 0;

            return (
              <div key={partNum} style={{ padding: '1rem', background: '#F8FAFC', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 700 }}>
                  <span style={{ color: '#0F172A' }}>Part {partNum}</span>
                  <span style={{ color: '#0284C7' }}>{partStat.correct} / {partStat.total} ({pct}%)</span>
                </div>
                <div style={{ width: '100%', height: '8px', background: '#E2E8F0', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: pct >= 70 ? '#22C55E' : pct >= 50 ? '#EAB308' : '#EF4444' }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Detailed Review if Allowed */}
      {showAnswers && attempt.answers && (
        <div style={{ background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E2E8F0', padding: '1.5rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)' }}>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0F172A', marginBottom: '1rem' }}>
            Xem Lại Đáp Án
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {attempt.answers.map((ans, idx) => {
              const q = ans.questionId;
              if (!q || typeof q !== 'object') return null;

              return (
                <div
                  key={idx}
                  style={{
                    padding: '1rem',
                    borderRadius: '10px',
                    border: ans.isCorrect ? '1px solid #BBF7D0' : '1px solid #FECACA',
                    background: ans.isCorrect ? '#F0FDF4' : '#FEF2F2',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                    <span style={{ fontWeight: 800, fontSize: '0.9rem', color: '#0F172A' }}>
                      Câu {q.questionNumber || idx + 1}: {q.text || ''}
                    </span>
                    <span style={{ fontWeight: 700, fontSize: '0.85rem', color: ans.isCorrect ? '#166534' : '#991B1B' }}>
                      {ans.isCorrect ? '✓ Đúng' : '✗ Sai'} ({ans.score || 0} điểm)
                    </span>
                  </div>

                  <div style={{ fontSize: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.3rem', marginTop: '0.5rem' }}>
                    {(q.options || []).map((opt) => {
                      const isChosen = (ans.selectedOptionIds || []).includes(opt._id);
                      const isRight = (q.correctAnswers || []).includes(opt.text) || (q.correctOptionIds || []).includes(opt._id);

                      let labelStyle = { color: '#475569' };
                      if (isRight) labelStyle = { color: '#15803D', fontWeight: 700 };
                      else if (isChosen) labelStyle = { color: '#B91C1C', fontWeight: 700 };

                      return (
                        <div key={opt._id} style={{ display: 'flex', gap: '0.5rem', ...labelStyle }}>
                          <span>{isChosen ? '➜' : '  '}</span>
                          <span>{opt.text} {isRight ? '(Đáp án đúng)' : ''}</span>
                        </div>
                      );
                    })}
                  </div>

                  {q.explanation && (
                    <div style={{ marginTop: '0.75rem', paddingTop: '0.5rem', borderTop: '1px dashed #CBD5E1', fontSize: '0.85rem', color: '#475569' }}>
                      <strong>Giải thích:</strong> {q.explanation}
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
            padding: '0.75rem 1.5rem',
            background: '#0284C7',
            color: '#FFFFFF',
            borderRadius: '10px',
            textDecoration: 'none',
            fontWeight: 700,
          }}
        >
          ← Trở Về Kho Đề TOEIC
        </Link>
        <Link
          to="/student/history"
          style={{
            padding: '0.75rem 1.5rem',
            background: '#F1F5F9',
            color: '#475569',
            borderRadius: '10px',
            textDecoration: 'none',
            fontWeight: 700,
          }}
        >
          Xem Lịch Sử Làm Bài
        </Link>
      </div>
    </div>
  );
}
