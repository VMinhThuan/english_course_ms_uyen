import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { toeicApi } from '../api/toeicApi.js';

export default function StudentToeicLibraryPage() {
  const [tests, setTests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeMode, setActiveMode] = useState('ALL');

  useEffect(() => {
    fetchToeicTests();
  }, []);

  const fetchToeicTests = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await toeicApi.getStudentToeicTests();
      if (res.status === 'success') {
        setTests(res.data.tests || []);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể tải danh sách đề thi TOEIC');
    } finally {
      setLoading(false);
    }
  };

  const filteredTests = tests.filter((t) => {
    if (activeMode === 'ALL') return true;
    return t.toeicMode === activeMode;
  });

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0F172A', marginBottom: '0.25rem' }}>
            Kho Đề Thi TOEIC Trực Tuyến
          </h1>
          <p style={{ fontSize: '0.95rem', color: '#64748B' }}>
            Luyện tập đề thi TOEIC Full 200 câu, Mini Test và Luyện thi từng Part với giao diện mô phỏng thực tế.
          </p>
        </div>

        {/* Mode Filter Buttons */}
        <div style={{ display: 'flex', gap: '0.5rem', background: '#F1F5F9', padding: '0.25rem', borderRadius: '10px' }}>
          <button
            onClick={() => setActiveMode('ALL')}
            style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: 'none', fontWeight: 700, cursor: 'pointer', background: activeMode === 'ALL' ? '#FFFFFF' : 'transparent', color: activeMode === 'ALL' ? '#0F172A' : '#64748B', boxShadow: activeMode === 'ALL' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}
          >
            Tất Cả ({tests.length})
          </button>
          <button
            onClick={() => setActiveMode('full_test')}
            style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: 'none', fontWeight: 700, cursor: 'pointer', background: activeMode === 'full_test' ? '#FFFFFF' : 'transparent', color: activeMode === 'full_test' ? '#0284C7' : '#64748B', boxShadow: activeMode === 'full_test' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}
          >
            Full Test (120')
          </button>
          <button
            onClick={() => setActiveMode('mini_test')}
            style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: 'none', fontWeight: 700, cursor: 'pointer', background: activeMode === 'mini_test' ? '#FFFFFF' : 'transparent', color: activeMode === 'mini_test' ? '#D97706' : '#64748B', boxShadow: activeMode === 'mini_test' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}
          >
            Mini Test
          </button>
          <button
            onClick={() => setActiveMode('practice')}
            style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: 'none', fontWeight: 700, cursor: 'pointer', background: activeMode === 'practice' ? '#FFFFFF' : 'transparent', color: activeMode === 'practice' ? '#166534' : '#64748B', boxShadow: activeMode === 'practice' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}
          >
            Luyện Theo Part
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: '#64748B', background: '#FFFFFF', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
          Đang tải kho đề thi TOEIC...
        </div>
      ) : error ? (
        <div style={{ padding: '1rem', background: '#FEF2F2', color: '#991B1B', borderRadius: '12px' }}>{error}</div>
      ) : filteredTests.length === 0 ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: '#64748B', background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E2E8F0' }}>
          Chưa có đề thi TOEIC nào thuộc danh mục này.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.25rem' }}>
          {filteredTests.map((t) => (
            <div
              key={t._id}
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
                      background: t.toeicMode === 'full_test' ? '#E0F2FE' : '#FEF3C7',
                      color: t.toeicMode === 'full_test' ? '#0369A1' : '#D97706',
                    }}
                  >
                    {t.toeicMode === 'full_test' ? 'FULL TEST (200 CÂU)' : t.toeicMode === 'mini_test' ? 'MINI TEST' : 'PRACTICE'}
                  </span>
                  {t.lastAttempt && (
                    <span style={{ fontSize: '0.8rem', color: '#166534', fontWeight: 700 }}>
                      Điểm gần nhất: {t.lastAttempt.percentage}%
                    </span>
                  )}
                </div>

                <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#0F172A', marginBottom: '0.5rem', lineHeight: 1.3 }}>
                  {t.title}
                </h3>
                <p style={{ fontSize: '0.875rem', color: '#64748B', marginBottom: '1rem', lineHeight: 1.5 }}>
                  {t.description || 'Đề thi trắc nghiệm TOEIC Listening & Reading chuẩn hóa.'}
                </p>

                <div style={{ display: 'flex', gap: '1rem', fontSize: '0.85rem', color: '#475569', flexWrap: 'wrap' }}>
                  <div><strong>{t.questionCount || 200}</strong> câu hỏi</div>
                  <div>•</div>
                  <div><strong>{t.durationMinutes || 120}</strong> phút</div>
                  <div>•</div>
                  <div>Listening + Reading</div>
                </div>
              </div>

              {t.hasActiveAttempt ? (
                <Link
                  to={`/student/toeic/attempt/${t.activeAttemptId}`}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justify: 'center',
                    padding: '0.75rem 1.25rem',
                    background: '#D97706',
                    color: '#FFFFFF',
                    borderRadius: '10px',
                    textDecoration: 'none',
                    fontWeight: 700,
                    fontSize: '0.9rem',
                    textAlign: 'center',
                  }}
                >
                  ⏳ TIẾP TỤC BÀI ĐANG LÀM →
                </Link>
              ) : (
                <Link
                  to={`/student/toeic/${t._id}`}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justify: 'center',
                    padding: '0.75rem 1.25rem',
                    background: '#0284C7',
                    color: '#FFFFFF',
                    borderRadius: '10px',
                    textDecoration: 'none',
                    fontWeight: 700,
                    fontSize: '0.9rem',
                    textAlign: 'center',
                  }}
                >
                  Xem Chi Tiết & Bắt Đầu →
                </Link>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
