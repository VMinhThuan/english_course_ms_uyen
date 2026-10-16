import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { adminApi } from '../../api/adminApi.js';
import PageHeader from '../../components/ui/PageHeader.jsx';
import StatusBadge from '../../components/ui/StatusBadge.jsx';
import './AdminStudentsPage.css';
const date = (value) => value ? new Intl.DateTimeFormat('vi-VN').format(new Date(value)) : '—';
export default function AdminStudentDetailPage() {
  const { id } = useParams(); const [student, setStudent] = useState(null); const [error, setError] = useState('');
  useEffect(() => { adminApi.getStudent(id).then((res) => setStudent(res.data.student)).catch(() => setError('Không thể tải thông tin học viên.')); }, [id]);
  if (error) return <div className="admin-page-container"><div className="admin-error">{error}</div></div>;
  if (!student) return <div className="admin-page-container"><div className="admin-table-skeleton"><i /><i /><i /></div></div>;
  const fields = [['Họ và tên', student.fullName], ['Email', student.email], ['Ngày đăng ký', date(student.createdAt)], ['Trạng thái', student.status], ['Ngày được duyệt', date(student.approvedAt)], ['Lần đăng nhập gần nhất', date(student.lastLoginAt)]];
  return <div className="admin-page-container"><PageHeader backTo="/admin/students" backLabel="Học viên" eyebrow="Hồ sơ học viên" title={student.fullName || 'Học viên'} description={student.email} /><section className="admin-panel"><h2>Thông tin tài khoản</h2><div className="student-detail-grid">{fields.map(([name, value]) => <div key={name}><span>{name}</span>{name === 'Trạng thái' ? <StatusBadge status={value} /> : <strong>{value || '—'}</strong>}</div>)}</div></section><section className="admin-panel"><h2>Tiến độ học tập</h2><div className="admin-empty">Chưa có dữ liệu tổng hợp.</div></section></div>;
}
