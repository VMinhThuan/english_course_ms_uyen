import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { assessmentApi } from '../api/assessmentApi.js';

export default function StudentResultDetailPage() {
  const { attemptId } = useParams();
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (attemptId) {
      fetchResult();
    }
  }, [attemptId]);

  const fetchResult = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await assessmentApi.getAttemptResult(attemptId);
      if (res.status === 'success') {
        setResult(res.data);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể tải chi tiết kết quả');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '3rem 1.5rem', textAlign: 'center', color: '#64748B' }}>
        Đang tải kết quả bài làm...
      </div>
    );
  }

  if (error || !result) {
    return (
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '1.5rem' }}>
        <div style={{ padding: '1.25rem', background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#991B1B', borderRadius: '12px', marginBottom: '1rem' }}>
          {error || 'Không tìm thấy kết quả làm bài'}
        </div>
        <Link to="/student/history" style={{ color: '#0284C7', fontWeight: 600, textDecoration: 'none' }}>
          ← Quay lại Lịch sử làm bài
        </Link>
      </div>
    );
  }

  const attemptData = result.attempt || result.result || result;
  const assessmentData = result.assessment || { title: attemptData.assessmentTitle, type: attemptData.assessmentType, passScore: attemptData.passScore };
  const showAnswers = result.showCorrectAnswers !== undefined ? result.showCorrectAnswers : attemptData.showCorrectAnswers;
  const questionsList = result.questionDetails || result.result?.questions || result.questions || [];
  const isPassed = attemptData.score >= (assessmentData.passScore || 0);

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Link to="/student/history" style={{ color: '#0284C7', textDecoration: 'none', fontWeight: 600, fontSize: '0.9rem' }}>
          ← Quay lại Lịch sử làm bài
        </Link>
        <span
          style={{
            fontSize: '0.8rem',
            fontWeight: 700,
            padding: '0.25rem 0.6rem',
            borderRadius: '6px',
            background: assessmentData?.type === 'exam' ? '#FEE2E2' : '#DCFCE7',
            color: assessmentData?.type === 'exam' ? '#991B1B' : '#166534',
          }}
        >
          {assessmentData?.type === 'exam' ? 'BÀI KIỂM TRA' : 'BÀI TẬP'}
        </span>
      </div>

      {/* Result Overview Header Card */}
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
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0F172A', marginBottom: '0.5rem' }}>
          {assessmentData?.title || attemptData?.assessmentTitle || 'Bài đánh giá'}
        </h1>
        <p style={{ fontSize: '0.9rem', color: '#64748B', marginBottom: '1.5rem' }}>
          Thời gian nộp: {attemptData?.submittedAt ? new Date(attemptData.submittedAt).toLocaleString('vi-VN') : '---'}
        </p>

        <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', marginBottom: '1.5rem' }}>
          <div
            style={{
              fontSize: '3rem',
              fontWeight: 900,
              color: isPassed ? '#166534' : '#991B1B',
              lineHeight: 1,
            }}
          >
            {attemptData?.score || 0} <span style={{ fontSize: '1.5rem', color: '#94A3B8' }}>/ {attemptData?.totalScore || attemptData?.maxScore || 100}</span>
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: 700, color: isPassed ? '#166534' : '#991B1B', marginTop: '0.5rem' }}>
            {attemptData?.percentage || 0}% — {isPassed ? 'ĐẠT KẾT QUẢ' : 'CHƯA ĐẠT'}
          </div>
        </div>

        {/* Detailed Stats Row */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
            gap: '1rem',
            background: '#F8FAFC',
            padding: '1.25rem',
            borderRadius: '12px',
            border: '1px solid #E2E8F0',
          }}
        >
          <div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#166534' }}>{attemptData?.correctCount || 0}</div>
            <div style={{ fontSize: '0.8rem', color: '#64748B' }}>Câu đúng</div>
          </div>
          <div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#991B1B' }}>{attemptData?.incorrectCount || 0}</div>
            <div style={{ fontSize: '0.8rem', color: '#64748B' }}>Câu sai</div>
          </div>
          <div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#D97706' }}>{attemptData?.unansweredCount || 0}</div>
            <div style={{ fontSize: '0.8rem', color: '#64748B' }}>Chưa trả lời</div>
          </div>
          <div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0369A1' }}>
              {attemptData?.duration ? `${Math.round(attemptData.duration / 60)} phút` : '---'}
            </div>
            <div style={{ fontSize: '0.8rem', color: '#64748B' }}>Thời gian làm</div>
          </div>
        </div>
      </div>

      {/* Question Review Section */}
      {showAnswers ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0F172A' }}>Xem Lại Chi Tiết Câu Hỏi</h2>
          {questionsList.map((q, idx) => (
            <div
              key={q._id || idx}
              style={{
                background: '#FFFFFF',
                borderRadius: '12px',
                border: `1px solid ${q.isCorrect ? '#86EFAC' : q.studentAnswer ? '#FCA5A5' : '#E2E8F0'}`,
                padding: '1.25rem',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <span style={{ fontWeight: 700, color: '#0F172A' }}>Câu {idx + 1}: {q.prompt || q.questionText}</span>
                <span
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    padding: '0.2rem 0.5rem',
                    borderRadius: '4px',
                    background: q.isCorrect ? '#DCFCE7' : q.studentAnswer ? '#FEE2E2' : '#F1F5F9',
                    color: q.isCorrect ? '#166534' : q.studentAnswer ? '#991B1B' : '#64748B',
                  }}
                >
                  {q.isCorrect ? 'ĐÚNG' : q.studentAnswer ? 'SAI' : 'BỎ QUA'}
                </span>
              </div>

              <div style={{ fontSize: '0.9rem', color: '#334155', marginBottom: '0.5rem' }}>
                <strong>Câu trả lời của bạn:</strong> {Array.isArray(q.studentAnswer) ? q.studentAnswer.join(', ') : q.studentAnswer || '(Chưa trả lời)'}
              </div>

              {(q.correctAnswer || q.correctAnswers) && (
                <div style={{ fontSize: '0.9rem', color: '#166534', fontWeight: 600 }}>
                  <strong>Đáp án đúng:</strong> {Array.isArray(q.correctAnswer || q.correctAnswers) ? (q.correctAnswer || q.correctAnswers).join(', ') : (q.correctAnswer || q.correctAnswers)}
                </div>
              )}

              {q.explanation && (
                <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: '#475569', fontStyle: 'italic', background: '#F8FAFC', padding: '0.5rem', borderRadius: '6px' }}>
                  Giải thích: {q.explanation}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', color: '#92400E', padding: '1.25rem', borderRadius: '12px', textAlign: 'center' }}>
          Bài kiểm tra này không bật chế độ hiển thị đáp án chi tiết sau khi làm.
        </div>
      )}
    </div>
  );
}

