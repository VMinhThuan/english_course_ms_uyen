import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminApi } from '../../api/adminApi.js';
import './AdminStudentsPage.css';

const formatDate = (value) => value ? new Intl.DateTimeFormat('vi-VN').format(new Date(value)) : '—';

export default function AdminDashboardPage() {
  const [stats, setStats] = useState(null); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  useEffect(() => { adminApi.getStats().then((res) => setStats(res.data)).catch(() => setError('Không thể tải dữ liệu tổng quan.')).finally(() => setLoading(false)); }, []);
  const cards = [['Tổng học viên', stats?.totalStudents], ['Đang hoạt động', stats?.activeStudents], ['Chờ phê duyệt', stats?.pendingStudents], ['Đã khóa', stats?.lockedStudents ?? stats?.suspendedStudents ?? 0]];
  return <div className="admin-page-container"><div className="admin-page-header"><div><p className="admin-eyebrow">Teacher portal</p><h1 className="admin-page-title">Tổng quan</h1><p className="admin-page-sub">Theo dõi nhanh tài khoản học viên và các yêu cầu cần xử lý.</p></div></div>{error ? <div className="admin-error">{error}</div> : <><div className="admin-summary-grid">{cards.map(([label, value]) => <div className="admin-summary-card" key={label}><span>{label}</span><strong className={loading ? 'is-skeleton' : ''}>{loading ? '' : value ?? 0}</strong></div>)}</div><section className="admin-panel"><div className="admin-panel-head"><div><h2>Học viên chờ phê duyệt</h2><p>Xử lý các đăng ký mới để học viên có thể bắt đầu học.</p></div><Link to="/admin/students?status=pending" className="admin-text-link">Xem tất cả</Link></div>{loading ? <div className="admin-table-skeleton"><i /><i /><i /></div> : stats?.pendingStudentList?.length ? <div className="admin-pending-list">{stats.pendingStudentList.map((student) => <div className="admin-pending-row" key={student._id}><div><strong>{student.fullName || 'Học viên'}</strong><span>{student.email}</span></div><span>{formatDate(student.createdAt)}</span><span className="status-badge pending">Chờ duyệt</span><Link to={`/admin/students/${student._id}`} className="admin-row-link">Xem</Link></div>)}</div> : <div className="admin-empty">Không có tài khoản nào đang chờ phê duyệt.</div>}</section></>}</div>;
}
