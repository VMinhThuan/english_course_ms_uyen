import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toeicApi } from '../api/toeicApi.js';

export default function StudentToeicOverviewPage() {
  const { assessmentId } = useParams();
  const navigate = useNavigate();

  const [test, setTest] = useState(null);
  const [activeAttempt, setActiveAttempt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadOverview();
  }, [assessmentId]);

  const loadOverview = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await toeicApi.getStudentToeicTestOverview(assessmentId);
      if (res.status === 'success') {
        setTest(res.data.assessment);
        setActiveAttempt(res.data.assessment.hasActiveAttempt ? { _id: res.data.assessment.activeAttemptId } : null);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể tải thông tin đề thi TOEIC');
    } finally {
      setLoading(false);
    }
  };

  const handleStartOrResume = async () => {
    if (activeAttempt?._id) {
      navigate(`/student/toeic/attempt/${activeAttempt._id}`);
      return;
    }
    try {
      setSubmitting(true);
      const res = await toeicApi.startToeicAttempt(assessmentId);
      if (res.status === 'success') {
        const attemptId = res.data?.attemptId || res.data?.attempt?._id;
        navigate(`/student/toeic/attempt/${attemptId}`);
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Không thể bắt đầu bài thi');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center', color: '#64748B' }}>
        Đang tải thông tin tổng quan đề thi...
      </div>
    );
  }

  if (error || !test) {
    return (
      <div style={{ maxWidth: '800px', margin: '2rem auto', padding: '1.5rem', background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#991B1B', borderRadius: '12px' }}>
        {error || 'Không tìm thấy đề thi'}
      </div>
    );
  }

  const parts = test.parts || [];
  const listeningParts = parts.filter((p) => p.section === 'listening');
  const readingParts = parts.filter((p) => p.section === 'reading');

  const totalQuestions = test.toeicConfig?.totalQuestions || test.questions?.length || 200;
  const durationMinutes = test.toeicConfig?.durationMinutes || test.duration || 120;

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header Banner */}
      <div
        style={{
          background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)',
          color: '#FFFFFF',
          borderRadius: '16px',
          padding: '2rem',
          boxShadow: '0 10px 25px -5px rgba(15, 23, 42, 0.15)',
        }}
      >
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginBottom: '0.75rem' }}>
          <span
            style={{
              padding: '0.25rem 0.75rem',
              borderRadius: '20px',
              fontSize: '0.8rem',
              fontWeight: 700,
              background: '#0284C7',
              color: '#FFFFFF',
              textTransform: 'uppercase',
            }}
          >
            {test.toeicMode === 'full_test' ? 'FULL TOEIC TEST' : test.toeicMode === 'mini_test' ? 'MINI TEST' : 'PRACTICE'}
          </span>
          <span style={{ fontSize: '0.85rem', color: '#94A3B8' }}>• Standard Simulation</span>
        </div>

        <h1 style={{ fontSize: '1.75rem', fontWeight: 800, marginBottom: '0.75rem', lineHeight: 1.3 }}>
          {test.title}
        </h1>
        {test.description && (
          <p style={{ color: '#CBD5E1', fontSize: '0.95rem', lineHeight: 1.6, marginBottom: '1.25rem' }}>
            {test.description}
          </p>
        )}

        <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', fontSize: '0.9rem', color: '#E2E8F0', borderTop: '1px solid #334155', paddingTop: '1rem' }}>
          <div>⏱️ Thời gian: <strong>{durationMinutes} phút</strong></div>
          <div>📝 Tổng câu hỏi: <strong>{totalQuestions} câu</strong></div>
          <div>🔄 Giới hạn làm bài: <strong>{test.attemptLimit === 0 ? 'Không giới hạn' : `${test.attemptLimit} lần`}</strong></div>
        </div>
      </div>

      {/* Test Parts Breakdown */}
      <div style={{ background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E2E8F0', padding: '1.5rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)' }}>
        <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#0F172A', marginBottom: '1rem' }}>
          Cấu Trúc Đề Thi
        </h2>

        {/* Listening Section */}
        <div style={{ marginBottom: '1.5rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#0284C7', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            🎧 LISTENING SECTION ({test.toeicMode === 'full_test' ? '100 câu' : test.toeicMode === 'mini_test' ? '25 câu' : 'Part 1–4'})
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '0.75rem' }}>
            {listeningParts.map((part) => {
              const qCount = part.questionGroups?.reduce((gAcc, g) => gAcc + (g.questionIds?.length || 0), 0) || 0;
              return (
                <div key={part.partNumber} style={{ padding: '0.85rem 1rem', background: '#F8FAFC', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#0F172A' }}>Part {part.partNumber}: {part.name}</div>
                  <div style={{ fontSize: '0.8rem', color: '#64748B', marginTop: '0.2rem' }}>
                    {qCount > 0 ? `${qCount} câu hỏi` : part.instructions ? 'Chuẩn hóa TOEIC' : 'Listening'}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Reading Section */}
        <div>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#166534', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            📖 READING SECTION ({test.toeicMode === 'full_test' ? '100 câu' : test.toeicMode === 'mini_test' ? '25 câu' : 'Part 5–7'})
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '0.75rem' }}>
            {readingParts.map((part) => {
              const qCount = part.questionGroups?.reduce((gAcc, g) => gAcc + (g.questionIds?.length || 0), 0) || 0;
              return (
                <div key={part.partNumber} style={{ padding: '0.85rem 1rem', background: '#F8FAFC', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#0F172A' }}>Part {part.partNumber}: {part.name}</div>
                  <div style={{ fontSize: '0.8rem', color: '#64748B', marginTop: '0.2rem' }}>
                    {qCount > 0 ? `${qCount} câu hỏi` : part.instructions ? 'Chuẩn hóa TOEIC' : 'Reading'}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Instructions & Notice */}
      <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '16px', padding: '1.25rem', color: '#1E40AF', fontSize: '0.9rem', lineHeight: 1.6 }}>
        <strong>📌 Hướng dẫn làm bài:</strong>
        <ul style={{ margin: '0.5rem 0 0 1.25rem', padding: 0 }}>
          <li>Hệ thống tự động lưu đáp án khi chọn (Autosave). Khi mở lại bài làm, thời gian và đáp án sẽ được khôi phục.</li>
          <li>Đảm bảo giữ kết nối Internet ổn định trong suốt quá trình làm bài.</li>
          <li>Bài thi sẽ tự động nộp khi hết thời gian countdown trên Server.</li>
        </ul>
      </div>

      {/* Action Footer */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem' }}>
        <button
          onClick={handleStartOrResume}
          disabled={submitting}
          style={{
            padding: '1rem 2.5rem',
            background: activeAttempt ? '#D97706' : '#0284C7',
            color: '#FFFFFF',
            borderRadius: '12px',
            fontSize: '1.1rem',
            fontWeight: 800,
            border: 'none',
            cursor: submitting ? 'not-allowed' : 'pointer',
            boxShadow: '0 4px 14px rgba(2, 132, 199, 0.3)',
            transition: 'transform 0.1s ease',
          }}
        >
          {submitting ? 'ĐANG KHỞI TẠO...' : activeAttempt ? '▶ TIẾP TỤC BÀI THI DANG DỞ' : '🚀 BẮT ĐẦU BÀI THI'}
        </button>
      </div>
    </div>
  );
}
