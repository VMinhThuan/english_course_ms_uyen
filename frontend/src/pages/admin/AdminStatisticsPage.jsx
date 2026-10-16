import { useEffect, useState } from 'react';
import { adminApi } from '../../api/adminApi.js';
import PageHeader from '../../components/ui/PageHeader.jsx';
import './AdminStudentsPage.css';

export default function AdminStatisticsPage() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  useEffect(() => { fetchStats(); }, []);
  const fetchStats = async () => {
    try { setLoading(true); setError(null); const res = await adminApi.getStats(); if (res.status === 'success') setStats(res.data); }
    catch (err) { setError(err.response?.data?.message || 'Không thể tải thống kê hệ thống'); }
    finally { setLoading(false); }
  };
  const cards = [
    ['Tổng số học viên dự tổng', stats?.totalStudents || 0, `${stats?.activeStudents || 0} học viên active · ${stats?.pendingStudents || 0} đang chờ duyệt`],
    ['Bài học đã xuất bản', stats?.publishedLessons || 0, 'Đã sẵn sàng cho học viên học tập'],
    ['Lượt nộp bài tập & thi', stats?.completedAttempts || 0, 'Đã được máy chủ tự động chấm điểm'],
    ['Tỷ lệ điểm trung bình', `${stats?.averageScore || 0}%`, 'Tính trên tổng tất cả các lượt làm bài'],
  ];
  return <div className="admin-page-container"><PageHeader eyebrow="Báo cáo" title="Thống kê hệ thống" description="Báo cáo số liệu thực tế được tính toán trực tiếp từ cơ sở dữ liệu MongoDB." />{loading ? <div className="ds-loading-state">Đang tổng hợp dữ liệu thống kê từ MongoDB...</div> : error ? <div className="ds-error-state">{error}</div> : <div className="admin-summary-grid admin-stat-grid">{cards.map(([label, value, detail]) => <article className="admin-summary-card" key={label}><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>)}</div>}</div>;
}
