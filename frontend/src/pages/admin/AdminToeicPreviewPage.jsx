import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { toeicApi } from '../../api/toeicApi.js';

export default function AdminToeicPreviewPage() {
  const { id } = useParams();
  const [assessment, setAssessment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (id) {
      fetchPreview();
    }
  }, [id]);

  const fetchPreview = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await toeicApi.getAdminToeicTestById(id);
      if (res.status === 'success') {
        setAssessment(res.data.assessment);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể tải preview đề thi');
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div style={{ padding: '3rem', textAlign: 'center', color: '#64748B' }}>Đang tải xem trước đề thi TOEIC...</div>;
  if (error || !assessment) return <div style={{ padding: '1.5rem', color: '#991B1B' }}>{error || 'Không tìm thấy đề thi'}</div>;

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Link to={`/admin/toeic-tests/${id}/edit`} style={{ color: '#0284C7', textDecoration: 'none', fontWeight: 600 }}>
          ← Quay lại Chỉnh sửa Đề thi
        </Link>
        <span style={{ background: '#FEF3C7', color: '#D97706', fontWeight: 700, padding: '0.3rem 0.8rem', borderRadius: '6px' }}>
          CHẾ ĐỘ PREVIEW ADMIN (Không tạo dữ liệu làm bài)
        </span>
      </div>

      <div style={{ background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E2E8F0', padding: '2rem', textAlign: 'center' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0F172A', marginBottom: '0.5rem' }}>{assessment.title}</h1>
        <p style={{ color: '#64748B', fontSize: '0.95rem' }}>{assessment.description || 'Đề thi TOEIC mô phỏng thực tế.'}</p>
        <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'center', gap: '1.5rem', fontSize: '0.9rem', color: '#334155' }}>
          <div>Thời gian: <strong>{assessment.durationMinutes || 120} phút</strong></div>
          <div>Tổng số câu: <strong>{assessment.questions?.length || 0} câu</strong></div>
          <div>Loại đề: <strong>{assessment.toeicMode?.toUpperCase()}</strong></div>
        </div>
      </div>

      {/* Parts Breakdown Preview */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0F172A' }}>Cấu Trúc Các Part & Nhóm Câu Hỏi</h2>
        {(assessment.questionGroups || []).map((group, gIdx) => (
          <div key={group._id || gIdx} style={{ background: '#FFFFFF', borderRadius: '12px', border: '1px solid #E2E8F0', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ background: '#E0F2FE', color: '#0369A1', fontWeight: 700, padding: '0.2rem 0.6rem', borderRadius: '6px', fontSize: '0.8rem' }}>
                PART {group.partNumber} — Nhóm #{gIdx + 1} ({group.type})
              </span>
            </div>

            {group.audioUrl && (
              <div>
                <strong style={{ fontSize: '0.85rem', color: '#64748B' }}>Audio Stimulus:</strong>
                <div style={{ marginTop: '0.25rem' }}><audio controls src={group.audioUrl} /></div>
              </div>
            )}

            {group.imageUrl && (
              <div>
                <img src={group.imageUrl} alt="Group visual" style={{ maxWidth: '300px', borderRadius: '8px', border: '1px solid #CBD5E1' }} />
              </div>
            )}

            {(group.passages || []).map((p, pIdx) => (
              <div key={pIdx} style={{ background: '#F8FAFC', padding: '1rem', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                <strong>{p.title || `Passage ${pIdx + 1}`}</strong>
                <p style={{ marginTop: '0.5rem', whiteSpace: 'pre-wrap', fontSize: '0.9rem', color: '#334155' }}>{p.content}</p>
              </div>
            ))}

            {/* Group Questions */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.5rem' }}>
              {(group.questionIds || []).map((q, qIdx) => (
                <div key={q._id || qIdx} style={{ background: '#F1F5F9', padding: '0.85rem', borderRadius: '8px' }}>
                  <strong>Câu #{q.questionNumber || qIdx + 1}: {q.questionText || q.prompt}</strong>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.5rem', marginTop: '0.5rem', fontSize: '0.85rem' }}>
                    {(q.options || []).map((opt, optIdx) => (
                      <div key={opt.id} style={{ color: (q.correctAnswers || []).includes(opt.id) ? '#166534' : '#334155', fontWeight: (q.correctAnswers || []).includes(opt.id) ? 700 : 400 }}>
                        {String.fromCharCode(65 + optIdx)}: {opt.text} {(q.correctAnswers || []).includes(opt.id) ? '✓ (Đáp án đúng)' : ''}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
