import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { adminApi } from '../../api/adminApi.js';
import './AdminStudentsPage.css';
const date = (value) => value ? new Intl.DateTimeFormat('vi-VN').format(new Date(value)) : '—';
export default function AdminStudentDetailPage() {
  const { id } = useParams(); const [student, setStudent] = useState(null); const [error, setError] = useState('');
  useEffect(() => { adminApi.getStudent(id).then((res) => setStudent(res.data.student)).catch(() => setError('Không thể tải thông tin học viên.')); }, [id]);
  if (error) return <div className="admin-page-container"><div className="admin-error">{error}</div></div>;
  if (!student) return <div className="admin-page-container"><div className="admin-table-skeleton"><i /><i /><i /></div></div>;
  const fields = [['Họ và tên', student.fullName], ['Email', student.email], ['Ngày đăng ký', date(student.createdAt)], ['Trạng thái', student.status], ['Ngày được duyệt', date(student.approvedAt)], ['Lần đăng nhập gần nhất', date(student.lastLoginAt)]];
  return <div className="admin-page-container"><div><Link to="/admin/students" className="admin-text-link">← Học viên</Link><p className="admin-eyebrow" style={{ marginTop: 20 }}>Hồ sơ học viên</p><h1 className="admin-page-title">{student.fullName || 'Học viên'}</h1><p className="admin-page-sub">{student.email}</p></div><section className="admin-panel"><h2>Thông tin tài khoản</h2><div className="student-detail-grid">{fields.map(([name, value]) => <div key={name}><span>{name}</span><strong>{value || '—'}</strong></div>)}</div></section><section className="admin-panel"><h2>Tiến độ học tập</h2><div className="admin-empty">Chưa có dữ liệu tổng hợp.</div></section></div>;
}
