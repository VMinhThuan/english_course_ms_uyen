import { useState, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { toeicApi } from '../../api/toeicApi.js';

export default function AdminToeicPreviewPage() {
  const { id } = useParams();
  const [assessment, setAssessment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState(null);
  const [feedback, setFeedback] = useState({ type: '', text: '' });
  const [selectedPartFilter, setSelectedPartFilter] = useState('ALL');

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

  const handlePublish = async () => {
    if (!window.confirm('Bạn có chắc chắn muốn xuất bản đề thi TOEIC này ngay bây giờ?')) return;
    try {
      setPublishing(true);
      setFeedback({ type: '', text: '' });
      const res = await toeicApi.publishToeicTest(id);
      if (res.status === 'success') {
        setFeedback({ type: 'success', text: 'Đã xuất bản đề thi TOEIC thành công!' });
        fetchPreview();
      }
    } catch (err) {
      setFeedback({ type: 'error', text: err.response?.data?.message || 'Lỗi khi xuất bản đề thi' });
    } finally {
      setPublishing(false);
    }
  };

  const handleUnpublish = async () => {
    try {
      setPublishing(true);
      setFeedback({ type: '', text: '' });
      const res = await toeicApi.unpublishToeicTest(id);
      if (res.status === 'success') {
        setFeedback({ type: 'success', text: 'Đã chuyển đề thi về Bản nháp (ẩn khỏi học viên).' });
        fetchPreview();
      }
    } catch (err) {
      setFeedback({ type: 'error', text: err.response?.data?.message || 'Lỗi khi gỡ xuất bản' });
    } finally {
      setPublishing(false);
    }
  };

  const filteredGroups = useMemo(() => {
    if (!assessment || !assessment.questionGroups) return [];
    if (selectedPartFilter === 'ALL') return assessment.questionGroups;
    return assessment.questionGroups.filter((g) => g.partNumber === Number(selectedPartFilter));
  }, [assessment, selectedPartFilter]);

  if (loading) {
    return (
      <div style={{ padding: '4rem', textAlign: 'center', color: '#64748B' }}>
        <div style={{ display: 'inline-block', width: '32px', height: '32px', border: '3px solid #E2E8F0', borderTopColor: '#0284C7', borderRadius: '50%', animation: 'spin 1s linear infinite', marginBottom: '1rem' }} />
        <div>Đang tải xem trước đề thi TOEIC...</div>
      </div>
    );
  }

  if (error || !assessment) {
    return (
      <div style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
        <div style={{ padding: '1.25rem', background: '#FEF2F2', color: '#991B1B', borderRadius: '12px', border: '1px solid #FCA5A5' }}>
          {error || 'Không tìm thấy đề thi'}
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1060px', margin: '0 auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      
      {/* Top Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <Link
          to={`/admin/toeic-tests/${id}/edit`}
          style={{
            color: '#0284C7',
            textDecoration: 'none',
            fontWeight: 700,
            fontSize: '0.9rem',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.4rem',
            background: '#FFFFFF',
            padding: '0.5rem 1rem',
            borderRadius: '8px',
            border: '1px solid #CBD5E1',
          }}
        >
          ← Quay lại Chỉnh sửa (Builder)
        </Link>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <span
            style={{
              background: assessment.status === 'published' ? '#DCFCE7' : '#FEF3C7',
              color: assessment.status === 'published' ? '#166534' : '#B45309',
              fontWeight: 800,
              padding: '0.4rem 0.85rem',
              borderRadius: '8px',
              fontSize: '0.8rem',
            }}
          >
            {assessment.status === 'published' ? '● ĐÃ XUẤT BẢN (PUBLISHED)' : '● BẢN NHÁP (DRAFT)'}
          </span>

          {assessment.status === 'published' ? (
            <button
              onClick={handleUnpublish}
              disabled={publishing}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: '8px',
                border: '1px solid #CBD5E1',
                background: '#FFFFFF',
                color: '#B45309',
                cursor: 'pointer',
                fontWeight: 700,
                fontSize: '0.85rem',
              }}
            >
              Gỡ Xuất Bản (Về Draft)
            </button>
          ) : (
            <button
              onClick={handlePublish}
              disabled={publishing}
              style={{
                padding: '0.5rem 1.25rem',
                borderRadius: '8px',
                border: 'none',
                background: '#16A34A',
                color: '#FFFFFF',
                cursor: 'pointer',
                fontWeight: 700,
                fontSize: '0.85rem',
                boxShadow: '0 2px 4px rgba(22, 163, 74, 0.25)',
              }}
            >
              {publishing ? 'Đang xuất bản...' : '🚀 Xuất Bản Đề Thi'}
            </button>
          )}
        </div>
      </div>

      {feedback.text && (
        <div style={{ padding: '0.85rem 1.25rem', borderRadius: '10px', background: feedback.type === 'success' ? '#DCFCE7' : '#FEF2F2', border: `1px solid ${feedback.type === 'success' ? '#86EFAC' : '#FCA5A5'}`, color: feedback.type === 'success' ? '#166534' : '#991B1B' }}>
          {feedback.text}
        </div>
      )}

      {/* Test Hero Overview */}
      <div style={{ background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E2E8F0', padding: '2rem', textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0F172A', marginBottom: '0.5rem' }}>{assessment.title}</h1>
        <p style={{ color: '#64748B', fontSize: '0.95rem', maxWidth: '680px', margin: '0 auto 1.25rem' }}>
          {assessment.description || 'Bộ đề thi TOEIC tiêu chuẩn.'}
        </p>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '2rem', fontSize: '0.9rem', color: '#334155', flexWrap: 'wrap', borderTop: '1px solid #F1F5F9', paddingTop: '1rem' }}>
          <div>Thời gian: <strong>{assessment.durationMinutes || 120} phút</strong></div>
          <div>Tổng số câu: <strong>{assessment.questions?.length || 0} câu</strong></div>
          <div>Số nhóm câu: <strong>{assessment.questionGroups?.length || 0} nhóm</strong></div>
          <div>Định dạng: <strong>{assessment.toeicMode?.toUpperCase()}</strong></div>
        </div>
      </div>

      {/* Part Filter Bar */}
      <div style={{ display: 'flex', gap: '0.4rem', background: '#FFFFFF', padding: '0.6rem', borderRadius: '12px', border: '1px solid #E2E8F0', flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#64748B', padding: '0 0.5rem' }}>Xem theo Part:</span>
        <button
          onClick={() => setSelectedPartFilter('ALL')}
          style={{
            padding: '0.45rem 0.85rem',
            borderRadius: '6px',
            border: 'none',
            fontWeight: 700,
            fontSize: '0.8rem',
            cursor: 'pointer',
            background: selectedPartFilter === 'ALL' ? '#0284C7' : '#F8FAFC',
            color: selectedPartFilter === 'ALL' ? '#FFFFFF' : '#475569',
          }}
        >
          Tất Cả ({assessment.questionGroups?.length || 0} nhóm)
        </button>
        {[1, 2, 3, 4, 5, 6, 7].map((pNum) => {
          const count = (assessment.questionGroups || []).filter((g) => g.partNumber === pNum).length;
          return (
            <button
              key={pNum}
              onClick={() => setSelectedPartFilter(String(pNum))}
              style={{
                padding: '0.45rem 0.85rem',
                borderRadius: '6px',
                border: 'none',
                fontWeight: 700,
                fontSize: '0.8rem',
                cursor: 'pointer',
                background: selectedPartFilter === String(pNum) ? '#0284C7' : '#F8FAFC',
                color: selectedPartFilter === String(pNum) ? '#FFFFFF' : '#475569',
              }}
            >
              Part {pNum} ({count})
            </button>
          );
        })}
      </div>

      {/* Groups & Questions Preview */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {filteredGroups.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#64748B', background: '#FFFFFF', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
            Không có nhóm câu hỏi nào thuộc bộ lọc này.
          </div>
        ) : (
          filteredGroups.map((group, gIdx) => (
            <div key={group._id || gIdx} style={{ background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E2E8F0', padding: '1.75rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
              
              {/* Group Header Badge */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #F1F5F9', paddingBottom: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <span style={{ background: '#0284C7', color: '#FFFFFF', fontWeight: 800, padding: '0.25rem 0.65rem', borderRadius: '6px', fontSize: '0.8rem' }}>
                    PART {group.partNumber}
                  </span>
                  <span style={{ fontWeight: 700, color: '#0F172A', fontSize: '0.95rem' }}>
                    {group.title || `Nhóm #${gIdx + 1}`}
                  </span>
                </div>
                <span style={{ fontSize: '0.75rem', color: '#64748B', background: '#F1F5F9', padding: '0.2rem 0.6rem', borderRadius: '6px', fontWeight: 600 }}>
                  Loại: {group.type}
                </span>
              </div>

              {group.instructions && (
                <div style={{ fontSize: '0.85rem', color: '#475569', fontStyle: 'italic' }}>
                  {group.instructions}
                </div>
              )}

              {/* Audio Stimulus */}
              {group.audioUrl && (
                <div style={{ background: '#F0F9FF', padding: '1rem', borderRadius: '10px', border: '1px solid #BAE6FD' }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0369A1', marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    🎧 Audio Stimulus:
                  </div>
                  <audio controls src={group.audioUrl} style={{ width: '100%', maxWidth: '420px' }} />
                </div>
              )}

              {/* Image Stimulus */}
              {group.imageUrl && (
                <div>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#475569', marginBottom: '0.4rem' }}>
                    🖼 Hình Ảnh Minh Họa:
                  </div>
                  <img src={group.imageUrl} alt="Group visual" style={{ maxWidth: '320px', maxHeight: '240px', objectFit: 'contain', borderRadius: '8px', border: '1px solid #CBD5E1' }} />
                </div>
              )}

              {/* Passages */}
              {(group.passages || []).map((p, pIdx) => (
                <div key={pIdx} style={{ background: '#F8FAFC', padding: '1.25rem', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                  <strong style={{ fontSize: '0.9rem', color: '#0F172A' }}>{p.title || `Passage ${pIdx + 1}`}</strong>
                  <p style={{ marginTop: '0.6rem', whiteSpace: 'pre-wrap', fontSize: '0.9rem', color: '#334155', lineHeight: 1.6, margin: '0.6rem 0 0' }}>
                    {p.content}
                  </p>
                </div>
              ))}

              {/* Group Questions */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '0.5rem' }}>
                <h4 style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                  Câu Hỏi Trong Nhóm ({group.questionIds?.length || 0} câu):
                </h4>

                {(group.questionIds || []).map((q, qIdx) => (
                  <div key={q._id || qIdx} style={{ background: '#F8FAFC', padding: '1rem', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.6rem' }}>
                      <strong style={{ color: '#0284C7' }}>Câu #{q.questionNumber || qIdx + 1}:</strong>
                      <span style={{ fontWeight: 600, color: '#0F172A' }}>{q.questionText || q.prompt || '(Nhìn tranh/nghe câu hỏi)'}</span>
                    </div>

                    {/* Options list */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.6rem' }}>
                      {(q.options || []).map((opt, optIdx) => {
                        const isCorrect = (q.correctAnswers || []).includes(opt.id);
                        return (
                          <div
                            key={opt.id}
                            style={{
                              padding: '0.5rem 0.75rem',
                              borderRadius: '6px',
                              background: isCorrect ? '#DCFCE7' : '#FFFFFF',
                              border: isCorrect ? '1.5px solid #16A34A' : '1px solid #E2E8F0',
                              color: isCorrect ? '#166534' : '#334155',
                              fontWeight: isCorrect ? 700 : 500,
                              fontSize: '0.85rem',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                            }}
                          >
                            <span>
                              <strong>{String.fromCharCode(65 + optIdx)}:</strong> {opt.text}
                            </span>
                            {isCorrect && <span style={{ fontSize: '0.75rem', color: '#166534', fontWeight: 800 }}>✓ Đáp án đúng</span>}
                          </div>
                        );
                      })}
                    </div>

                    {/* Explanation */}
                    {q.explanation && (
                      <div style={{ marginTop: '0.75rem', padding: '0.6rem 0.85rem', borderRadius: '6px', background: '#EFF6FF', border: '1px solid #BFDBFE', fontSize: '0.8rem', color: '#1E40AF' }}>
                        <strong>Giải thích:</strong> {q.explanation}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
