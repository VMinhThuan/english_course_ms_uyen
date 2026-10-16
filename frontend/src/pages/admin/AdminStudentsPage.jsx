import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { adminApi } from '../../api/adminApi.js';
import PageHeader from '../../components/ui/PageHeader.jsx';
import StatusBadge from '../../components/ui/StatusBadge.jsx';
import UiButton from '../../components/ui/UiButton.jsx';
import './AdminStudentsPage.css';

const statuses = [['all', 'Tất cả'], ['pending', 'Chờ duyệt'], ['active', 'Hoạt động'], ['suspended', 'Tạm khóa'], ['rejected', 'Từ chối']];
const formatDate = (value) => value ? new Intl.DateTimeFormat('vi-VN').format(new Date(value)) : '—';

const getApiError = (error, fallback) => error.response?.data?.code === 'INVALID_STATE_TRANSITION'
  ? 'Trạng thái tài khoản vừa thay đổi. Vui lòng tải lại danh sách và thử lại.'
  : error.response?.data?.message || fallback;

export default function AdminStudentsPage() {
  const [params, setParams] = useSearchParams();
  const [students, setStudents] = useState([]);
  const [paging, setPaging] = useState({ page: 1, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState(params.get('search') || '');
  const [modal, setModal] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState('');
  const status = params.get('status') || 'all';
  const page = Number(params.get('page') || 1);
  const committedSearch = params.get('search') || '';

  const loadStudents = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const response = await adminApi.getStudents({ page, limit: 20, status: status === 'all' ? 'ALL' : status, ...(committedSearch ? { search: committedSearch } : {}) });
      setStudents(response.data.students || []);
      setPaging(response.data.pagination || { page: 1, pages: 1 });
    } catch {
      setError('Không thể tải danh sách học viên. Vui lòng thử lại.');
    } finally { setLoading(false); }
  }, [committedSearch, page, status]);

  useEffect(() => { loadStudents(); }, [loadStudents]);
  useEffect(() => {
    if (!toast) return undefined;
    const timeout = window.setTimeout(() => setToast(''), 3500);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const updateParams = (updates) => {
    const next = new URLSearchParams(params);
    Object.entries(updates).forEach(([key, value]) => value && value !== 'all' ? next.set(key, value) : next.delete(key));
    if (!Object.hasOwn(updates, 'page')) next.set('page', '1');
    setParams(next);
  };

  const runAction = async () => {
    const { student, type, reason } = modal;
    setSubmitting(true);
    try {
      const response = type === 'approve' ? await adminApi.approveStudent(student._id)
        : type === 'reject' ? await adminApi.rejectStudent(student._id, reason.trim())
          : type === 'suspend' ? await adminApi.suspendStudent(student._id)
            : await adminApi.activateStudent(student._id);
      const updated = response.data.student;
      setStudents((current) => current.map((item) => item._id === updated._id ? updated : item));
      setModal(null);
      setToast({ approve: `Đã duyệt tài khoản ${student.fullName || student.email}.`, reject: `Đã từ chối yêu cầu của ${student.fullName || student.email}.`, suspend: 'Đã tạm khóa tài khoản học viên.', activate: 'Đã kích hoạt lại tài khoản học viên.' }[type]);
    } catch (requestError) {
      setModal((current) => ({ ...current, error: getApiError(requestError, 'Không thể cập nhật trạng thái tài khoản. Vui lòng thử lại.') }));
    } finally { setSubmitting(false); }
  };

  const Actions = ({ student }) => <div className="student-actions">
    <Link to={`/admin/students/${student._id}`} className="admin-quiet-button">Xem</Link>
    {student.status === 'pending' && <><UiButton size="small" onClick={() => setModal({ student, type: 'approve', reason: '', error: '' })}>Duyệt</UiButton><UiButton variant="danger" onClick={() => setModal({ student, type: 'reject', reason: '', error: '' })}>Từ chối</UiButton></>}
    {student.status === 'active' && <UiButton variant="danger" onClick={() => setModal({ student, type: 'suspend', reason: '', error: '' })}>Tạm khóa</UiButton>}
    {student.status === 'suspended' && <UiButton size="small" onClick={() => setModal({ student, type: 'activate', reason: '', error: '' })}>Kích hoạt</UiButton>}
  </div>;

  const emptyMessage = committedSearch ? 'Không tìm thấy học viên phù hợp.' : status === 'pending' ? 'Hiện không có học viên nào đang chờ duyệt.' : 'Chưa có học viên nào trong danh sách này.';
  const modalCopy = modal && {
    approve: ['Duyệt tài khoản học viên?', 'Sau khi được duyệt, học viên có thể đăng nhập và truy cập nội dung học tập.', 'Duyệt tài khoản'],
    reject: ['Từ chối yêu cầu đăng ký?', 'Học viên sẽ không thể đăng nhập bằng tài khoản này.', 'Từ chối yêu cầu'],
    suspend: ['Tạm khóa tài khoản học viên?', 'Bạn có chắc muốn tạm khóa tài khoản học viên này? Học viên sẽ không thể đăng nhập cho đến khi được kích hoạt lại.', 'Tạm khóa tài khoản'],
    activate: ['Kích hoạt lại tài khoản?', 'Học viên sẽ có thể đăng nhập và tiếp tục học.', 'Kích hoạt lại'],
  }[modal.type];

  return <div className="admin-page-container">
    <PageHeader eyebrow="Teacher portal" title="Học viên" description="Tìm kiếm, duyệt và quản lý trạng thái tài khoản học viên." />
    <div className="admin-filter-tabs" aria-label="Lọc theo trạng thái">{statuses.map(([key, text]) => <button key={key} type="button" className={status === key ? 'active' : ''} onClick={() => updateParams({ status: key, page: '1' })}>{text}</button>)}</div>
    <form className="admin-search-bar" onSubmit={(event) => { event.preventDefault(); updateParams({ search: search.trim(), page: '1' }); }}><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm theo tên, email hoặc số điện thoại..." aria-label="Tìm học viên" />{search && <button type="button" className="admin-clear-search" onClick={() => { setSearch(''); updateParams({ search: '', page: '1' }); }} aria-label="Xóa tìm kiếm">×</button>}<UiButton type="submit">Tìm kiếm</UiButton></form>
    {error && <div className="admin-error" role="alert">{error}</div>}
    <div className="admin-table-container">{loading ? <div className="admin-table-skeleton"><i /><i /><i /><i /><i /></div> : <table className="admin-data-table"><thead><tr><th>Học viên</th><th>Email</th><th>Số điện thoại</th><th>Ngày đăng ký</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>{students.length ? students.map((student) => <tr key={student._id}><td><div className="student-identity"><b>{student.fullName || 'Học viên'}</b></div></td><td>{student.email}</td><td>{student.phoneNumber || '—'}</td><td>{formatDate(student.createdAt)}</td><td><StatusBadge status={student.status} /></td><td><Actions student={student} /></td></tr>) : <tr><td colSpan="6"><div className="admin-empty">{emptyMessage}</div></td></tr>}</tbody></table>}</div>

    {!loading && paging.pages > 1 && <nav className="admin-pagination" aria-label="Phân trang"><button disabled={page === 1} onClick={() => updateParams({ page: String(page - 1) })}>Trước</button><span>Trang {page} / {paging.pages}</span><button disabled={page === paging.pages} onClick={() => updateParams({ page: String(page + 1) })}>Sau</button></nav>}
    {modal && <div className="admin-modal-backdrop" role="presentation"><section className="admin-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="confirm-title"><button className="modal-close" onClick={() => !submitting && setModal(null)} aria-label="Đóng">×</button><h2 id="confirm-title">{modalCopy[0]}</h2><p><strong>{modal.student.fullName || 'Học viên'}</strong><br />{modal.student.email}</p><p>{modalCopy[1]}</p>{modal.type === 'reject' && <label className="admin-modal-label">Lý do từ chối <span>(không bắt buộc)</span><textarea value={modal.reason} onChange={(event) => setModal((current) => ({ ...current, reason: event.target.value }))} rows="3" placeholder="Nhập lý do để lưu vào hồ sơ học viên..." /></label>}{modal.error && <div className="admin-error" role="alert">{modal.error}</div>}<div className="modal-actions"><button className="admin-quiet-button" onClick={() => setModal(null)} disabled={submitting}>Hủy</button><button className={modal.type === 'reject' || modal.type === 'suspend' ? 'admin-danger-button' : 'admin-primary-button'} onClick={runAction} disabled={submitting}>{submitting ? 'Đang xử lý...' : modalCopy[2]}</button></div></section></div>}
    {toast && <div className="admin-toast" role="status">{toast}</div>}
  </div>;
}
