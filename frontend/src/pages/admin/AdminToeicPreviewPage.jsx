import { useState, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { toeicApi } from '../../api/toeicApi.js';
import UiButton from '../../components/ui/UiButton.jsx';
import StatusBadge from '../../components/ui/StatusBadge.jsx';
import { resolveMediaUrl } from '../../utils/mediaUrl.js';
import '../../styles/assessment-screens.css';

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

  const questionCountsByPart = useMemo(() => {
    return (assessment?.questionGroups || []).reduce((counts, group) => {
      counts[group.partNumber] = (counts[group.partNumber] || 0) + (group.questionIds?.length || 0);
      return counts;
    }, {});
  }, [assessment?.questionGroups]);

  const totalQuestionCount = Object.values(questionCountsByPart).reduce((total, count) => total + count, 0);
  const totalGroupCount = assessment?.questionGroups?.length || 0;

  const speakText = (value) => {
    if (typeof window === 'undefined' || !window.speechSynthesis || !String(value || '').trim()) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(String(value));
    utterance.lang = 'en-US';
    window.speechSynthesis.speak(utterance);
  };

  if (loading) {
    return (
      <div className="toeic-preview-screen toeic-preview-screen--state toeic-preview-screen--loading">
        <div style={{ display: 'inline-block', width: '32px', height: '32px', border: '3px solid var(--brand-border)', borderTopColor: 'var(--brand-yellow)', borderRadius: '50%', animation: 'spin 1s linear infinite', marginBottom: '1rem' }} />
        <div>Đang tải xem trước đề thi TOEIC...</div>
      </div>
    );
  }

  if (error || !assessment) {
    return (
      <div className="toeic-preview-screen toeic-preview-screen--state toeic-preview-screen--error">
        <div className="toeic-preview-screen__error-message">
          {error || 'Không tìm thấy đề thi'}
        </div>
      </div>
    );
  }

  return (
    <div className="toeic-preview-screen toeic-preview-screen--detail">
      
      {/* Top Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <Link to={`/admin/toeic-tests/${id}/edit`} className="ds-back-link">
          ← Quay lại Chỉnh sửa (Builder)
        </Link>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <StatusBadge status={assessment.status} label={assessment.status === 'published' ? 'Đã xuất bản' : 'Bản nháp'} />

          {assessment.status === 'published' ? (
            <UiButton variant="secondary" onClick={handleUnpublish} disabled={publishing}>
              Gỡ Xuất Bản (Về Draft)
            </UiButton>
          ) : (
            <UiButton onClick={handlePublish} disabled={publishing}>
              {publishing ? 'Đang xuất bản...' : '🚀 Xuất Bản Đề Thi'}
            </UiButton>
          )}
        </div>
      </div>

      {feedback.text && (
        <div style={{ padding: '0.85rem 1.25rem', borderRadius: '10px', background: feedback.type === 'success' ? 'var(--brand-success-bg)' : 'var(--brand-danger-bg)', border: `1px solid ${feedback.type === 'success' ? 'var(--brand-success-border)' : 'var(--brand-danger-border)'}`, color: feedback.type === 'success' ? 'var(--brand-success)' : 'var(--brand-danger)' }}>
          {feedback.text}
        </div>
      )}

      {/* Test Hero Overview */}
      <div className="ds-card toeic-preview-screen__overview">
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--brand-text)', marginBottom: '0.5rem' }}>{assessment.title}</h1>
        <p style={{ color: 'var(--brand-muted)', fontSize: '0.95rem', maxWidth: '680px', margin: '0 auto 1.25rem' }}>
          {assessment.description || 'Bộ đề thi TOEIC tiêu chuẩn.'}
        </p>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '2rem', fontSize: '0.9rem', color: 'var(--brand-text)', flexWrap: 'wrap', borderTop: '1px solid var(--brand-border-light)', paddingTop: '1rem' }}>
          <div>Thời gian: <strong>{assessment.durationMinutes || 120} phút</strong></div>
          <div>Tổng số câu: <strong>{assessment.questions?.length || 0} câu</strong></div>
          <div>Số nhóm câu: <strong>{assessment.questionGroups?.length || 0} nhóm</strong></div>
          <div>Định dạng: <strong>{assessment.toeicMode?.toUpperCase()}</strong></div>
        </div>
      </div>

      {/* Part Filter Bar */}
      <div style={{ display: 'flex', gap: '0.4rem', background: 'var(--brand-surface)', padding: '0.6rem', borderRadius: '12px', border: '1px solid var(--brand-border)', flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--brand-muted)', padding: '0 0.5rem' }}>Xem theo Part:</span>
        <button
          onClick={() => setSelectedPartFilter('ALL')}
          style={{
            padding: '0.45rem 0.85rem',
            borderRadius: '6px',
            border: 'none',
            fontWeight: 700,
            fontSize: '0.8rem',
            cursor: 'pointer',
            background: selectedPartFilter === 'ALL' ? 'var(--brand-yellow)' : 'var(--brand-bg-sub)',
            color: selectedPartFilter === 'ALL' ? 'var(--brand-text)' : 'var(--brand-muted)',
          }}
        >
          Tất Cả ({totalQuestionCount} câu, {totalGroupCount} nhóm)
        </button>
        {[1, 2, 3, 4, 5, 6, 7].map((pNum) => {
          const groupCount = (assessment.questionGroups || []).filter((g) => g.partNumber === pNum).length;
          const questionCount = questionCountsByPart[pNum] || 0;
          return (
            <button
              key={pNum}
              onClick={() => setSelectedPartFilter(String(pNum))}
              title={`${groupCount} nhóm câu hỏi`}
              style={{
                padding: '0.45rem 0.85rem',
                borderRadius: '6px',
                border: 'none',
                fontWeight: 700,
                fontSize: '0.8rem',
                cursor: 'pointer',
                background: selectedPartFilter === String(pNum) ? 'var(--brand-yellow)' : 'var(--brand-bg-sub)',
                color: selectedPartFilter === String(pNum) ? 'var(--brand-text)' : 'var(--brand-muted)',
              }}
            >
              Part {pNum} ({questionCount} câu)
            </button>
          );
        })}
      </div>

      {/* Groups & Questions Preview */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {filteredGroups.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--brand-muted)', background: 'var(--brand-surface)', borderRadius: '12px', border: '1px solid var(--brand-border)' }}>
            Không có nhóm câu hỏi nào thuộc bộ lọc này.
          </div>
        ) : (
          filteredGroups.map((group, gIdx) => (
            <div key={group._id || gIdx} className="ds-card toeic-preview-screen__question-group">
              
              {/* Group Header Badge */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--brand-border-light)', paddingBottom: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <span style={{ background: 'var(--brand-yellow)', color: 'var(--brand-text)', fontWeight: 800, padding: '0.25rem 0.65rem', borderRadius: '6px', fontSize: '0.8rem' }}>
                    PART {group.partNumber}
                  </span>
                  <span style={{ fontWeight: 700, color: 'var(--brand-text)', fontSize: '0.95rem' }}>
                    {group.title || `Nhóm #${gIdx + 1}`}
                  </span>
                </div>
                <span style={{ fontSize: '0.75rem', color: 'var(--brand-muted)', background: 'var(--brand-bg-sub)', padding: '0.2rem 0.6rem', borderRadius: '6px', fontWeight: 600 }}>
                  Loại: {group.type}
                </span>
              </div>

              {group.instructions && (
                <div style={{ fontSize: '0.85rem', color: 'var(--brand-muted)', fontStyle: 'italic' }}>
                  {group.instructions}
                </div>
              )}

              {/* Audio Stimulus */}
              {group.audioUrl && (
                <div style={{ background: 'var(--brand-yellow-soft)', padding: '1rem', borderRadius: '10px', border: '1px solid var(--brand-border)' }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--brand-coffee)', marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    🎧 Audio Stimulus:
                  </div>
                  <audio controls src={group.audioUrl} style={{ width: '100%', maxWidth: '420px' }} />
                </div>
              )}

              {!group.audioUrl && group.audioText && (
                <div style={{ background: 'var(--brand-yellow-soft)', padding: '1rem', borderRadius: '10px', border: '1px solid var(--brand-border)' }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--brand-coffee)', marginBottom: '0.4rem' }}>🔊 Transcript / Browser TTS</div>
                  <button type="button" onClick={() => speakText(group.audioText)} style={{ border: '1px solid var(--brand-border)', borderRadius: '7px', padding: '0.45rem 0.7rem', background: 'var(--brand-surface)', color: 'var(--brand-coffee)', fontWeight: 700, cursor: 'pointer' }}>
                    Nghe thử bằng giọng đọc trình duyệt
                  </button>
                  <p style={{ margin: '0.65rem 0 0', whiteSpace: 'pre-wrap', color: 'var(--brand-text)', fontSize: '0.85rem', lineHeight: 1.5 }}>{group.audioText}</p>
                  <small style={{ color: 'var(--brand-muted)' }}>Repository không cung cấp MP3; học viên sẽ dùng TTS.</small>
                </div>
              )}

              {/* Image Stimulus */}
              {(group.imageUrls?.length ? group.imageUrls : (group.imageUrl ? [group.imageUrl] : [])).map((imageUrl, imageIndex) => (
                <div key={`${imageUrl}-${imageIndex}`}>
                  {imageIndex === 0 && (
                    <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--brand-muted)', marginBottom: '0.4rem' }}>
                      🖼 Hình Ảnh Minh Họa:
                    </div>
                  )}
                  <img
                    src={resolveMediaUrl(imageUrl)}
                    alt={`Group visual ${imageIndex + 1}`}
                    style={{ width: '100%', maxWidth: '720px', maxHeight: '70vh', objectFit: 'contain', borderRadius: '8px', border: '1px solid var(--brand-border)' }}
                  />
                  {group.imagePageNumbers?.[imageIndex] && (
                    <div style={{ fontSize: '0.72rem', color: 'var(--brand-muted)', marginTop: '0.2rem' }}>
                      Trang {group.imagePageNumbers[imageIndex]} trong PDF
                    </div>
                  )}
                </div>
              ))}

              {/* Passages */}
              {(group.passages || []).map((p, pIdx) => (
                <div key={pIdx} style={{ background: 'var(--brand-bg-sub)', padding: '1.25rem', borderRadius: '10px', border: '1px solid var(--brand-border)' }}>
                  <strong style={{ fontSize: '0.9rem', color: 'var(--brand-text)' }}>{p.title || `Passage ${pIdx + 1}`}</strong>
                  {group.partNumber === 7 && (p.imageUrls?.length || p.imageUrl) ? (
                    <div style={{ display: 'grid', gap: '0.75rem', marginTop: '0.75rem' }}>
                      {(p.imageUrls?.length ? p.imageUrls : [p.imageUrl]).map((imageUrl, imageIndex) => (
                        <img
                          key={`${imageUrl}-${imageIndex}`}
                          src={resolveMediaUrl(imageUrl)}
                          alt={`Ảnh ${p.title || `passage ${pIdx + 1}`}, trang ${imageIndex + 1}`}
                          style={{ display: 'block', width: '100%', maxHeight: '70vh', objectFit: 'contain', borderRadius: '8px', border: '1px solid var(--brand-border)' }}
                        />
                      ))}
                    </div>
                  ) : (
                    <p style={{ marginTop: '0.6rem', whiteSpace: 'pre-wrap', fontSize: '0.9rem', color: 'var(--brand-text)', lineHeight: 1.6, margin: '0.6rem 0 0' }}>
                      {p.content}
                    </p>
                  )}
                </div>
              ))}

              {/* Group Questions */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '0.5rem' }}>
                <h4 style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--brand-text)', margin: 0 }}>
                  Câu Hỏi Trong Nhóm ({group.questionIds?.length || 0} câu):
                </h4>

                {(group.questionIds || []).map((q, qIdx) => (
                  <div key={q._id || qIdx} style={{ background: 'var(--brand-bg-sub)', padding: '1rem', borderRadius: '10px', border: '1px solid var(--brand-border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.6rem' }}>
                      <strong style={{ color: 'var(--brand-coffee)' }}>Câu #{q.questionNumber || qIdx + 1}:</strong>
                      <span style={{ fontWeight: 600, color: 'var(--brand-text)' }}>{q.questionText || q.prompt || '(Nhìn tranh/nghe câu hỏi)'}</span>
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
                              background: isCorrect ? 'var(--brand-success-bg)' : 'var(--brand-surface)',
                              border: isCorrect ? '1.5px solid var(--brand-success-border)' : '1px solid var(--brand-border)',
                              color: isCorrect ? 'var(--brand-success)' : 'var(--brand-text)',
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
                            {isCorrect && <span style={{ fontSize: '0.75rem', color: 'var(--brand-success)', fontWeight: 800 }}>✓ Đáp án đúng</span>}
                          </div>
                        );
                      })}
                    </div>

                    {/* Explanation */}
                    {q.explanation && (
                      <div style={{ marginTop: '0.75rem', padding: '0.6rem 0.85rem', borderRadius: '6px', background: 'var(--brand-yellow-soft)', border: '1px solid var(--brand-border)', fontSize: '0.8rem', color: 'var(--brand-coffee)' }}>
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
