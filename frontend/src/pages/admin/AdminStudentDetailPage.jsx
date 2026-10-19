import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { adminApi } from '../../api/adminApi.js';
import PageHeader from '../../components/ui/PageHeader.jsx';
import StatusBadge from '../../components/ui/StatusBadge.jsx';
import UiButton from '../../components/ui/UiButton.jsx';
import './AdminStudentsPage.css';

const date = (value) => value ? new Intl.DateTimeFormat('vi-VN').format(new Date(value)) : '—';
const actionContent = {
  approve: ['Duyệt tài khoản học viên?', 'Học viên sẽ có thể đăng nhập và truy cập nội dung học tập ngay sau khi được duyệt.', 'Duyệt tài khoản'],
  reject: ['Từ chối yêu cầu đăng ký?', 'Học viên sẽ không thể đăng nhập bằng tài khoản này.', 'Từ chối yêu cầu'],
  suspend: ['Tạm khóa tài khoản?', 'Học viên sẽ không thể đăng nhập cho đến khi tài khoản được kích hoạt lại.', 'Tạm khóa'],
  activate: ['Kích hoạt lại tài khoản?', 'Học viên sẽ có thể đăng nhập và tiếp tục học.', 'Kích hoạt tài khoản'],
};

export default function AdminStudentDetailPage() {
  const { id } = useParams();
  const [student, setStudent] = useState(null);
  const [error, setError] = useState('');
  const [action, setAction] = useState(null);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState('');

  useEffect(() => { adminApi.getStudent(id).then((res) => setStudent(res.data.student)).catch(() => setError('Không thể tải thông tin học viên.')); }, [id]);
  const openAction = (type) => { setAction(type); setReason(''); setActionError(''); };
  const runAction = async () => {
    if (!student || !action) return;
    setSubmitting(true); setActionError('');
    try {
      const response = action === 'approve' ? await adminApi.approveStudent(student._id)
        : action === 'reject' ? await adminApi.rejectStudent(student._id, reason.trim())
          : action === 'suspend' ? await adminApi.suspendStudent(student._id) : await adminApi.activateStudent(student._id);
      setStudent(response.data.student); setAction(null);
    } catch (requestError) { setActionError(requestError.response?.data?.message || 'Không thể cập nhật trạng thái tài khoản. Vui lòng thử lại.'); }
    finally { setSubmitting(false); }
  };

  if (error) return <div className="admin-page-container"><div className="admin-error">{error}</div></div>;
  if (!student) return <div className="admin-page-container"><div className="admin-table-skeleton"><i /><i /><i /></div></div>;
  const fields = [['Họ và tên', student.fullName], ['Email', student.email], ['Số điện thoại', student.phoneNumber], ['Ngày đăng ký', date(student.createdAt)], ['Ngày được duyệt', date(student.approvedAt)], ['Lần đăng nhập gần nhất', date(student.lastLoginAt)]];
  const content = action ? actionContent[action] : null;

  return <div className="admin-page-container admin-student-detail-page">
    <PageHeader backTo="/admin/students" backLabel="Học viên" eyebrow="Hồ sơ học viên" title={student.fullName || 'Học viên'} description={student.email} />
    <section className="student-status-card">
      <div><span className="student-status-card__eyebrow">Trạng thái tài khoản</span><div className="student-status-card__summary"><StatusBadge status={student.status} /><p>{student.status === 'pending' ? 'Tài khoản đang chờ bạn xét duyệt.' : 'Quản lý quyền truy cập của học viên tại đây.'}</p></div></div>
      <div className="student-status-card__actions">
        {student.status === 'pending' && <><UiButton onClick={() => openAction('approve')}>✓ Duyệt tài khoản</UiButton><UiButton variant="danger" onClick={() => openAction('reject')}>Từ chối</UiButton></>}
        {student.status === 'active' && <UiButton variant="danger" onClick={() => openAction('suspend')}>Tạm khóa tài khoản</UiButton>}
        {student.status === 'suspended' && <UiButton onClick={() => openAction('activate')}>Kích hoạt lại</UiButton>}
      </div>
    </section>
    <section className="admin-panel student-detail-panel"><div className="admin-panel-head"><div><h2>Thông tin tài khoản</h2><p>Thông tin đăng ký và hoạt động gần nhất của học viên.</p></div></div><dl className="student-detail-grid">{fields.map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{value || '—'}</dd></div>)}</dl></section>
    <section className="admin-panel student-detail-panel"><div className="admin-panel-head"><div><h2>Tiến độ học tập</h2><p>Dữ liệu học tập sẽ được hiển thị khi học viên bắt đầu tham gia khóa học.</p></div></div><div className="student-progress-empty"><span aria-hidden="true">◌</span><div><strong>Chưa có hoạt động học tập</strong><p>Học viên chưa có dữ liệu tiến độ để tổng hợp.</p></div></div></section>
    {action && <div className="admin-modal-backdrop" role="presentation"><section className="admin-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="student-action-title"><button className="modal-close" onClick={() => !submitting && setAction(null)} aria-label="Đóng">×</button><h2 id="student-action-title">{content[0]}</h2><p><strong>{student.fullName || 'Học viên'}</strong><br />{student.email}</p><p>{content[1]}</p>{action === 'reject' && <label className="admin-modal-label">Lý do từ chối <span>(không bắt buộc)</span><textarea value={reason} onChange={(event) => setReason(event.target.value)} rows="3" placeholder="Nhập lý do để lưu vào hồ sơ học viên..." /></label>}{actionError && <div className="admin-error" role="alert">{actionError}</div>}<div className="modal-actions"><button className="admin-quiet-button" onClick={() => setAction(null)} disabled={submitting}>Hủy</button><button className={action === 'reject' || action === 'suspend' ? 'admin-danger-button' : 'admin-primary-button'} onClick={runAction} disabled={submitting}>{submitting ? 'Đang xử lý...' : content[2]}</button></div></section></div>}
  </div>;
}
