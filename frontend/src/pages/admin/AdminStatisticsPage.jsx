import { useState, useEffect } from 'react';
import { adminApi } from '../../api/adminApi.js';
import './AdminStudentsPage.css';

export default function AdminStatisticsPage() {
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
        <div style={{ padding: '3rem', textAlign: 'center', color: '#64748B' }}>Đang tổng hợp dữ liệu thống kê từ MongoDB...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="admin-page-container">
        <div style={{ padding: '1rem', background: '#FEF2F2', color: '#991B1B', borderRadius: '8px' }}>{error}</div>
      </div>
    );
  }

  return (
    <div className="admin-page-container">
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Thống Kê Hệ Thống Trực Tiếp</h1>
          <p className="admin-page-sub">Báo cáo số liệu thực tế được tính toán trực tiếp từ cơ sở dữ liệu MongoDB.</p>
        </div>
      </div>

      {/* Grid of Real Calculated Statistics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.25rem' }}>
        <div style={{ background: '#FFFFFF', padding: '1.5rem', borderRadius: '16px', border: '1px solid #E2E8F0' }}>
          <div style={{ fontSize: '0.85rem', color: '#64748B', fontWeight: 600, marginBottom: '0.5rem' }}>TỔNG SỐ HỌC VIÊN DỰ TỔNG</div>
          <div style={{ fontSize: '2.25rem', fontWeight: 900, color: '#0F172A' }}>{stats?.totalStudents || 0}</div>
          <div style={{ fontSize: '0.8rem', color: '#166534', marginTop: '0.25rem' }}>
            {stats?.activeStudents || 0} học viên active • {stats?.pendingStudents || 0} đang chờ duyệt
          </div>
        </div>

        <div style={{ background: '#FFFFFF', padding: '1.5rem', borderRadius: '16px', border: '1px solid #E2E8F0' }}>
          <div style={{ fontSize: '0.85rem', color: '#64748B', fontWeight: 600, marginBottom: '0.5rem' }}>BÀI HỌC ĐÃ XUẤT BẢN</div>
          <div style={{ fontSize: '2.25rem', fontWeight: 900, color: '#0284C7' }}>{stats?.publishedLessons || 0}</div>
          <div style={{ fontSize: '0.8rem', color: '#64748B', marginTop: '0.25rem' }}>Đã sẵn sàng cho học viên học tập</div>
        </div>

        <div style={{ background: '#FFFFFF', padding: '1.5rem', borderRadius: '16px', border: '1px solid #E2E8F0' }}>
          <div style={{ fontSize: '0.85rem', color: '#64748B', fontWeight: 600, marginBottom: '0.5rem' }}>LƯỢT NỘP BÀI TẬP & THI</div>
          <div style={{ fontSize: '2.25rem', fontWeight: 900, color: '#7E22CE' }}>{stats?.completedAttempts || 0}</div>
          <div style={{ fontSize: '0.8rem', color: '#64748B', marginTop: '0.25rem' }}>Đã được máy chủ tự động chấm điểm</div>
        </div>

        <div style={{ background: '#FFFFFF', padding: '1.5rem', borderRadius: '16px', border: '1px solid #E2E8F0' }}>
          <div style={{ fontSize: '0.85rem', color: '#64748B', fontWeight: 600, marginBottom: '0.5rem' }}>TỶ LỆ ĐIỂM TRUNG BÌNH</div>
          <div style={{ fontSize: '2.25rem', fontWeight: 900, color: '#D97706' }}>{stats?.averageScore || 0}%</div>
          <div style={{ fontSize: '0.8rem', color: '#64748B', marginTop: '0.25rem' }}>Tính trên tổng tất cả các lượt làm bài</div>
        </div>
      </div>
    </div>
  );
}
