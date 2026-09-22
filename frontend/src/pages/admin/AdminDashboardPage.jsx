import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { adminApi } from '../../api/adminApi.js';
import './AdminStudentsPage.css';

export default function AdminDashboardPage() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await adminApi.getStats();
      if (res.status === 'success') {
        setStats(res.data);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể tải thống kê hệ thống');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="admin-page-container">
        <div style={{ textAlign: 'center', padding: '3rem', color: '#64748B' }}>
          Đang tải dữ liệu thống kê...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="admin-page-container">
        <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#991B1B', padding: '1rem', borderRadius: '8px' }}>
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="admin-page-container">
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Admin Dashboard (Tổng Quan)</h1>
          <p className="admin-page-sub">Quản trị toàn bộ hoạt động học tập, phê duyệt tài khoản và dữ liệu từ MongoDB.</p>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem' }}>
        <div style={{ background: '#FFFFFF', padding: '1.25rem', borderRadius: '12px', border: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: '#FEF3C7', color: '#D97706', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
              <circle cx="9" cy="7" r="4"></circle>
            </svg>
          </div>
          <div>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0F172A', lineHeight: 1.2 }}>
              {stats?.pendingStudents || 0}
            </div>
            <div style={{ fontSize: '0.85rem', color: '#64748B' }}>Chờ duyệt (PENDING)</div>
          </div>
        </div>

        <div style={{ background: '#FFFFFF', padding: '1.25rem', borderRadius: '12px', border: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: '#DCFCE7', color: '#166534', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
              <polyline points="22 4 12 14.01 9 11.01"></polyline>
            </svg>
          </div>
          <div>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0F172A', lineHeight: 1.2 }}>
              {stats?.activeStudents || 0}
            </div>
            <div style={{ fontSize: '0.85rem', color: '#64748B' }}>Học viên hoạt động</div>
          </div>
        </div>

        <div style={{ background: '#FFFFFF', padding: '1.25rem', borderRadius: '12px', border: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: '#E0F2FE', color: '#0369A1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
            </svg>
          </div>
          <div>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0F172A', lineHeight: 1.2 }}>
              {stats?.publishedLessons || 0}
            </div>
            <div style={{ fontSize: '0.85rem', color: '#64748B' }}>Bài học đã xuất bản</div>
          </div>
        </div>

        <div style={{ background: '#FFFFFF', padding: '1.25rem', borderRadius: '12px', border: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: '#F3E8FF', color: '#7E22CE', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
            </svg>
          </div>
          <div>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0F172A', lineHeight: 1.2 }}>
              {stats?.averageScore || 0}%
            </div>
            <div style={{ fontSize: '0.85rem', color: '#64748B' }}>Điểm trung bình bài tập/thi</div>
          </div>
        </div>
      </div>

      {/* Pending Approval Section Banner */}
      <div style={{ background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E2E8F0', padding: '1.5rem', marginTop: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0F172A', margin: 0 }}>Học Viên Chờ Phê Duyệt</h2>
          <Link to="/admin/students" style={{ color: '#0284C7', textDecoration: 'none', fontWeight: 600, fontSize: '0.9rem' }}>
            Quản Lý Học Viên →
          </Link>
        </div>

        {stats?.pendingStudents > 0 ? (
          <div style={{ background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: '12px', padding: '1rem 1.25rem', color: '#92400E', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <strong>Có {stats.pendingStudents} học viên đang chờ phê duyệt.</strong> Phê duyệt ngay để học viên có thể học tập.
            </div>
            <Link to="/admin/students" className="btn-action-approve" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', height: '40px' }}>
              Đến Trang Phê Duyệt
            </Link>
          </div>
        ) : (
          <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '1rem 1.25rem', color: '#64748B' }}>
            Không có học viên nào đang chờ phê duyệt.
          </div>
        )}
      </div>

      {/* Recent Student Attempt Results */}
      {stats?.recentStudentResults && stats.recentStudentResults.length > 0 && (
        <div style={{ background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E2E8F0', padding: '1.5rem', marginTop: '1rem' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0F172A', marginBottom: '1rem' }}>Kết Quả Làm Bài Mới Nhất</h2>
          <div className="table-responsive">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Học Viên</th>
                  <th>Bài Kiểm Tra</th>
                  <th>Loại</th>
                  <th>Điểm Số</th>
                  <th>Tỷ Lệ</th>
                  <th>Thời Gian Nộp</th>
                </tr>
              </thead>
              <tbody>
                {stats.recentStudentResults.map((res) => (
                  <tr key={res._id}>
                    <td><strong>{res.student?.fullName || res.student?.email}</strong></td>
                    <td>{res.assessment?.title}</td>
                    <td>
                      <span className={`status-badge ${res.assessment?.type === 'exam' ? 'badge-rejected' : 'badge-active'}`}>
                        {res.assessment?.type === 'exam' ? 'Bài kiểm tra' : 'Bài tập'}
                      </span>
                    </td>
                    <td><strong>{res.score}</strong> / {res.totalScore}</td>
                    <td><strong style={{ color: res.percentage >= 60 ? '#166534' : '#991B1B' }}>{res.percentage}%</strong></td>
                    <td>{new Date(res.submittedAt).toLocaleString('vi-VN')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
