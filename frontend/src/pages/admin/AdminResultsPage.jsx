import { useState, useEffect } from 'react';
import { assessmentApi } from '../../api/assessmentApi.js';
import './AdminStudentsPage.css';

export default function AdminResultsPage() {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filterType, setFilterType] = useState('ALL');

  useEffect(() => {
    fetchAdminResults();
  }, []);

  const fetchAdminResults = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await assessmentApi.getAdminResults();
      if (res.status === 'success') {
        setResults(res.data.attempts || res.data.results || []);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể tải danh sách kết quả làm bài');
    } finally {
      setLoading(false);
    }
  };

  const filteredResults = results.filter((r) => {
    if (filterType === 'ALL') return true;
    return r.assessment?.type === filterType;
  });

  return (
    <div className="admin-page-container">
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Kết Quả Làm Bài Học Viên</h1>
          <p className="admin-page-sub">Theo dõi kết quả làm bài tập và điểm thi thực tế của từng học viên.</p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div style={{ background: '#FFFFFF', padding: '1rem', borderRadius: '12px', border: '1px solid #E2E8F0', marginBottom: '1.5rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button
          onClick={() => setFilterType('ALL')}
          style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: 'none', background: filterType === 'ALL' ? '#0284C7' : '#F1F5F9', color: filterType === 'ALL' ? '#FFFFFF' : '#475569', fontWeight: 600, cursor: 'pointer' }}
        >
          Tất Cả ({results.length})
        </button>
        <button
          onClick={() => setFilterType('exercise')}
          style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: 'none', background: filterType === 'exercise' ? '#0284C7' : '#F1F5F9', color: filterType === 'exercise' ? '#FFFFFF' : '#475569', fontWeight: 600, cursor: 'pointer' }}
        >
          Bài Tập
        </button>
        <button
          onClick={() => setFilterType('exam')}
          style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: 'none', background: filterType === 'exam' ? '#0284C7' : '#F1F5F9', color: filterType === 'exam' ? '#FFFFFF' : '#475569', fontWeight: 600, cursor: 'pointer' }}
        >
          Bài Kiểm Tra
        </button>
      </div>

      {loading ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: '#64748B' }}>Đang tải danh sách kết quả...</div>
      ) : error ? (
        <div style={{ padding: '1rem', background: '#FEF2F2', color: '#991B1B', borderRadius: '8px' }}>{error}</div>
      ) : filteredResults.length === 0 ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: '#64748B', background: '#FFFFFF', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
          Chưa có lượt nộp bài nào được ghi nhận.
        </div>
      ) : (
        <div className="table-responsive">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Học Viên</th>
                <th>Bài Đánh Giá</th>
                <th>Phân Loại</th>
                <th>Điểm Số</th>
                <th>Tỷ Lệ Thành Công</th>
                <th>Thời Gian Làm</th>
                <th>Thời Gian Nộp</th>
              </tr>
            </thead>
            <tbody>
              {filteredResults.map((res) => {
                const passScore = res.assessment?.passScore || 0;
                const isPass = res.score >= passScore;
                return (
                  <tr key={res._id}>
                    <td>
                      <strong>{res.student?.fullName || res.student?.email}</strong>
                      <div style={{ fontSize: '0.8rem', color: '#64748B' }}>{res.student?.email}</div>
                    </td>
                    <td><strong>{res.assessment?.title || 'Bài đánh giá'}</strong></td>
                    <td>
                      <span
                        style={{
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          padding: '0.2rem 0.5rem',
                          borderRadius: '4px',
                          background: res.assessment?.type === 'exam' ? '#FEE2E2' : '#DCFCE7',
                          color: res.assessment?.type === 'exam' ? '#991B1B' : '#166534',
                        }}
                      >
                        {res.assessment?.type === 'exam' ? 'BÀI KIỂM TRA' : 'BÀI TẬP'}
                      </span>
                    </td>
                    <td><strong>{res.score}</strong> / {res.totalScore || 100}</td>
                    <td>
                      <strong style={{ color: isPass ? '#166534' : '#991B1B' }}>
                        {res.percentage}% ({isPass ? 'ĐẠT' : 'CHƯA ĐẠT'})
                      </strong>
                    </td>
                    <td>{res.duration ? `${Math.round(res.duration / 60)} phút` : '---'}</td>
                    <td>{res.submittedAt ? new Date(res.submittedAt).toLocaleString('vi-VN') : '---'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
