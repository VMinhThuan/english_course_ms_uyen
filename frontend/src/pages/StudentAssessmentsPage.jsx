import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { assessmentApi } from '../api/assessmentApi.js';

export default function StudentAssessmentsPage() {
  const [assessments, setAssessments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filterType, setFilterType] = useState('ALL');

  useEffect(() => {
    fetchAssessments();
  }, []);

  const fetchAssessments = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await assessmentApi.getAvailableAssessments();
      if (res.status === 'success') {
        setAssessments(res.data.assessments || []);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể tải danh sách bài tập & đề thi');
    } finally {
      setLoading(false);
    }
  };

  const filteredAssessments = assessments.filter((a) => {
    if (filterType === 'exercise') return a.type === 'exercise';
    if (filterType === 'exam') return a.type === 'exam';
    return true;
  });

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0F172A', marginBottom: '0.25rem' }}>
            Danh Sách Bài Tập & Đề Thi
          </h1>
          <p style={{ fontSize: '0.95rem', color: '#64748B' }}>
            Chọn bài tập hoặc bài kiểm tra được xuất bản để luyện tập và củng cố kiến thức.
          </p>
        </div>

        {/* Filter Buttons */}
        <div style={{ display: 'flex', gap: '0.5rem', background: '#F1F5F9', padding: '0.25rem', borderRadius: '10px' }}>
          <button
            onClick={() => setFilterType('ALL')}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '8px',
              border: 'none',
              fontWeight: 600,
              fontSize: '0.875rem',
              cursor: 'pointer',
              background: filterType === 'ALL' ? '#FFFFFF' : 'transparent',
              color: filterType === 'ALL' ? '#0F172A' : '#64748B',
              boxShadow: filterType === 'ALL' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
            }}
          >
            Tất Cả ({assessments.length})
          </button>
          <button
            onClick={() => setFilterType('exercise')}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '8px',
              border: 'none',
              fontWeight: 600,
              fontSize: '0.875rem',
              cursor: 'pointer',
              background: filterType === 'exercise' ? '#FFFFFF' : 'transparent',
              color: filterType === 'exercise' ? '#166534' : '#64748B',
              boxShadow: filterType === 'exercise' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
            }}
          >
            Bài Tập
          </button>
          <button
            onClick={() => setFilterType('exam')}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '8px',
              border: 'none',
              fontWeight: 600,
              fontSize: '0.875rem',
              cursor: 'pointer',
              background: filterType === 'exam' ? '#FFFFFF' : 'transparent',
              color: filterType === 'exam' ? '#991B1B' : '#64748B',
              boxShadow: filterType === 'exam' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
            }}
          >
            Bài Kiểm Tra
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: '#64748B', background: '#FFFFFF', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
          Đang tải bài tập & đề thi...
        </div>
      ) : error ? (
        <div style={{ padding: '1rem', background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#991B1B', borderRadius: '12px' }}>
          {error}
        </div>
      ) : filteredAssessments.length === 0 ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: '#64748B', background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E2E8F0' }}>
          Hiện chưa có bài tập hay đề thi nào thuộc danh mục này.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.25rem' }}>
          {filteredAssessments.map((ass) => (
            <div
              key={ass._id}
              style={{
                background: '#FFFFFF',
                borderRadius: '16px',
                border: '1px solid #E2E8F0',
                padding: '1.5rem',
                display: 'flex',
                flexDirection: 'column',
                justify: 'space-between',
                gap: '1rem',
                boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)',
              }}
            >
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <span
                    style={{
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      padding: '0.25rem 0.6rem',
                      borderRadius: '6px',
                      background: ass.type === 'exam' ? '#FEE2E2' : '#DCFCE7',
                      color: ass.type === 'exam' ? '#991B1B' : '#166534',
                    }}
                  >
                    {ass.type === 'exam' ? 'BÀI KIỂM TRA' : 'BÀI TẬP'}
                  </span>
                  <span style={{ fontSize: '0.8rem', color: '#64748B', fontWeight: 600 }}>
                    Điểm đạt: {ass.passScore || 0}/{ass.totalScore || 100}
                  </span>
                </div>

                <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#0F172A', marginBottom: '0.5rem', lineHeight: 1.3 }}>
                  {ass.title}
                </h3>
                <p style={{ fontSize: '0.875rem', color: '#64748B', marginBottom: '1rem', lineHeight: 1.5 }}>
                  {ass.description || 'Bài đánh giá kiểm tra kiến thức của học viên.'}
                </p>

                <div style={{ display: 'flex', gap: '1rem', fontSize: '0.85rem', color: '#475569', flexWrap: 'wrap' }}>
                  <div><strong>{ass.questions?.length || 0}</strong> câu hỏi</div>
                  <div>•</div>
                  <div><strong>{ass.duration || ass.minutes || 30}</strong> phút</div>
                  <div>•</div>
                  <div>Lần làm: <strong>{ass.attemptLimit === 0 ? 'Không giới hạn' : ass.attemptLimit}</strong></div>
                </div>
              </div>

              <Link
                to={`/student/tests/${ass._id}`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '0.75rem 1.25rem',
                  background: '#0284C7',
                  color: '#FFFFFF',
                  borderRadius: '10px',
                  textDecoration: 'none',
                  fontWeight: 600,
                  fontSize: '0.9rem',
                  transition: 'background 0.2s ease',
                  textAlign: 'center',
                }}
              >
                Bắt Đầu Làm Bài →
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
