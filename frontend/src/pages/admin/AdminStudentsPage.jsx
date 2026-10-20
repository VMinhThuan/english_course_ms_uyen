import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { adminApi } from '../../api/adminApi.js';
import PageHeader from '../../components/ui/PageHeader.jsx';
import StatusBadge from '../../components/ui/StatusBadge.jsx';
import UiButton from '../../components/ui/UiButton.jsx';
import useAuthStore from '../../store/authStore.js';
import './AdminStudentsPage.css';

const statuses = [['all', 'Tất cả'], ['pending', 'Chờ duyệt'], ['active', 'Hoạt động'], ['suspended', 'Tạm khóa'], ['rejected', 'Từ chối']];
const formatDate = (value) => value ? new Intl.DateTimeFormat('vi-VN').format(new Date(value)) : '—';
const emptyStudentForm = { fullName: '', email: '', username: '', password: '' };
const foldSearchText = (value) => String(value || '').normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/gi, 'd').toLowerCase().replace(/\s+/g, ' ').trim();

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
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState(emptyStudentForm);
  const [createErrors, setCreateErrors] = useState({});
  const currentUser = useAuthStore((state) => state.user);
  const canCreateStudent = ['admin', 'teacher'].includes(currentUser?.role);
  const status = params.get('status') || 'all';
  const page = Number(params.get('page') || 1);
  const committedSearch = params.get('search') || '';

  const loadStudents = useCallback(async (overrides = {}) => {
    const requestedPage = overrides.page ?? page;
    const requestedStatus = overrides.status ?? status;
    const requestedSearch = overrides.search ?? committedSearch;
    setLoading(true); setError('');
    try {
      const response = await adminApi.getStudents({ page: requestedPage, limit: 20, status: requestedStatus === 'all' ? 'ALL' : requestedStatus, ...(requestedSearch ? { search: requestedSearch } : {}) });
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

  const closeCreate = () => {
    if (submitting) return;
    setShowCreate(false);
    setCreateForm(emptyStudentForm);
    setCreateErrors({});
  };

  const submitCreateStudent = async (event) => {
    event.preventDefault();
    const errors = {};
    const fullName = createForm.fullName.trim().replace(/\s+/g, ' ');
    const email = createForm.email.trim().toLowerCase();
    const username = createForm.username.trim().toLowerCase();
    if (!fullName) errors.fullName = 'Vui lòng nhập họ và tên.';
    else if (fullName.length > 100) errors.fullName = 'Họ và tên không được vượt quá 100 ký tự.';
    else if (/[\u0000-\u001f\u007f]/.test(fullName)) errors.fullName = 'Họ và tên chứa ký tự không hợp lệ.';
    if (!email) errors.email = 'Vui lòng nhập email.';
    else if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Email không hợp lệ.';
    if (!username) errors.username = 'Vui lòng nhập tên đăng nhập.';
    else if (!/^[a-z0-9._-]{3,30}$/.test(username)) errors.username = 'Dùng 3–30 ký tự chữ không dấu, số, dấu chấm, gạch dưới hoặc gạch ngang.';
    if (!createForm.password) errors.password = 'Vui lòng nhập mật khẩu ban đầu.';
    else if (createForm.password.length < 6 || new TextEncoder().encode(createForm.password).length > 72) errors.password = 'Mật khẩu phải có ít nhất 6 ký tự và tối đa 72 byte UTF-8.';
    if (Object.keys(errors).length) { setCreateErrors(errors); return; }

    setSubmitting(true);
    setCreateErrors({});
    try {
      const response = await adminApi.createStudent({ fullName, email, username, password: createForm.password });
      const created = response.data.student;
      setShowCreate(false);
      setCreateForm(emptyStudentForm);
      setCreateErrors({});

      // The active account may not match a pending/rejected status filter or an unrelated search.
      // Adjust only those filters needed to make the new row visible immediately.
      const next = new URLSearchParams(params);
      next.delete('status');
      next.set('page', '1');
      const keepSearch = !committedSearch || [created.fullName, created.email, created.username, created.phoneNumber]
        .some((value) => foldSearchText(value).includes(foldSearchText(committedSearch)));
      const nextSearch = keepSearch ? committedSearch : '';
      if (!keepSearch) {
        next.delete('search');
        setSearch('');
      }
      setParams(next);
      await loadStudents({ page: 1, status: 'all', search: nextSearch });
      setToast('Tài khoản đã được tạo và có thể đăng nhập ngay. Bộ lọc được cập nhật để hiển thị học viên mới.');
    } catch (requestError) {
      const responseErrors = requestError.response?.data?.errors || {};
      const field = requestError.response?.data?.field;
      if (field) responseErrors[field] = requestError.response?.data?.message || 'Giá trị đã được sử dụng.';
      setCreateErrors(Object.keys(responseErrors).length
        ? responseErrors
        : { form: requestError.response?.data?.message || 'Không thể tạo học viên. Vui lòng thử lại.' });
    } finally { setSubmitting(false); }
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
    <PageHeader eyebrow="Teacher portal" title="Học viên" description="Tìm kiếm, duyệt và quản lý trạng thái tài khoản học viên." actions={canCreateStudent && <UiButton onClick={() => { setCreateForm(emptyStudentForm); setCreateErrors({}); setShowCreate(true); }}>+ Thêm học viên</UiButton>} />
    <div className="admin-filter-tabs" aria-label="Lọc theo trạng thái">{statuses.map(([key, text]) => <button key={key} type="button" className={status === key ? 'active' : ''} onClick={() => updateParams({ status: key, page: '1' })}>{text}</button>)}</div>
    <form className="admin-search-bar" onSubmit={(event) => { event.preventDefault(); updateParams({ search: search.trim(), page: '1' }); }}><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm theo tên, email hoặc số điện thoại..." aria-label="Tìm học viên" />{search && <button type="button" className="admin-clear-search" onClick={() => { setSearch(''); updateParams({ search: '', page: '1' }); }} aria-label="Xóa tìm kiếm">×</button>}<UiButton type="submit">Tìm kiếm</UiButton></form>
    {error && <div className="admin-error" role="alert">{error}</div>}
    <div className="admin-table-container">{loading ? <div className="admin-table-skeleton"><i /><i /><i /><i /><i /></div> : <table className="admin-data-table"><thead><tr><th>Học viên</th><th>Email</th><th>Số điện thoại</th><th>Ngày đăng ký</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>{students.length ? students.map((student) => <tr key={student._id}><td><div className="student-identity"><b>{student.fullName || 'Học viên'}</b>{student.username && <small className="assessment-table-sub">@{student.username}</small>}</div></td><td>{student.email}</td><td>{student.phoneNumber || '—'}</td><td>{formatDate(student.createdAt)}</td><td><StatusBadge status={student.status} /></td><td><Actions student={student} /></td></tr>) : <tr><td colSpan="6"><div className="admin-empty">{emptyMessage}</div></td></tr>}</tbody></table>}</div>

    {!loading && paging.pages > 1 && <nav className="admin-pagination" aria-label="Phân trang"><button disabled={page === 1} onClick={() => updateParams({ page: String(page - 1) })}>Trước</button><span>Trang {page} / {paging.pages}</span><button disabled={page === paging.pages} onClick={() => updateParams({ page: String(page + 1) })}>Sau</button></nav>}
    {showCreate && <div className="admin-modal-backdrop" role="presentation"><section className="admin-confirm-modal student-create-modal" role="dialog" aria-modal="true" aria-labelledby="create-student-title"><button className="modal-close" type="button" onClick={closeCreate} disabled={submitting} aria-label="Đóng">×</button><h2 id="create-student-title">Thêm học viên</h2><p>Tài khoản được kích hoạt ngay. Học viên có thể đăng nhập bằng email hoặc tên đăng nhập.</p><form onSubmit={submitCreateStudent} noValidate>
      <label className="student-create-field">Họ và tên<input autoFocus value={createForm.fullName} onChange={(event) => { setCreateForm((value) => ({ ...value, fullName: event.target.value })); setCreateErrors((value) => ({ ...value, fullName: '', form: '' })); }} autoComplete="name" maxLength={100} aria-invalid={Boolean(createErrors.fullName)} />{createErrors.fullName && <small role="alert">{createErrors.fullName}</small>}</label>
      <label className="student-create-field">Email<input type="email" value={createForm.email} onChange={(event) => { setCreateForm((value) => ({ ...value, email: event.target.value })); setCreateErrors((value) => ({ ...value, email: '', form: '' })); }} autoComplete="email" maxLength={254} aria-invalid={Boolean(createErrors.email)} />{createErrors.email && <small role="alert">{createErrors.email}</small>}</label>
      <label className="student-create-field">Tên đăng nhập<input value={createForm.username} onChange={(event) => { setCreateForm((value) => ({ ...value, username: event.target.value })); setCreateErrors((value) => ({ ...value, username: '', form: '' })); }} autoComplete="username" maxLength={30} aria-invalid={Boolean(createErrors.username)} />{createErrors.username && <small role="alert">{createErrors.username}</small>}</label>
      <label className="student-create-field">Mật khẩu ban đầu<input type="password" value={createForm.password} onChange={(event) => { setCreateForm((value) => ({ ...value, password: event.target.value })); setCreateErrors((value) => ({ ...value, password: '', form: '' })); }} autoComplete="new-password" maxLength={128} aria-invalid={Boolean(createErrors.password)} />{createErrors.password && <small role="alert">{createErrors.password}</small>}<small>Mật khẩu dài tối thiểu 6 ký tự; tối đa 72 byte UTF-8 theo giới hạn bcrypt.</small></label>
      {createErrors.form && <div className="admin-error" role="alert">{createErrors.form}</div>}
      <div className="modal-actions"><button type="button" className="admin-quiet-button" onClick={closeCreate} disabled={submitting}>Hủy</button><button type="submit" className="admin-primary-button" disabled={submitting}>{submitting ? 'Đang tạo...' : 'Tạo tài khoản'}</button></div>
    </form></section></div>}
    {modal && <div className="admin-modal-backdrop" role="presentation"><section className="admin-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="confirm-title"><button className="modal-close" onClick={() => !submitting && setModal(null)} aria-label="Đóng">×</button><h2 id="confirm-title">{modalCopy[0]}</h2><p><strong>{modal.student.fullName || 'Học viên'}</strong><br />{modal.student.email}</p><p>{modalCopy[1]}</p>{modal.type === 'reject' && <label className="admin-modal-label">Lý do từ chối <span>(không bắt buộc)</span><textarea value={modal.reason} onChange={(event) => setModal((current) => ({ ...current, reason: event.target.value }))} rows="3" placeholder="Nhập lý do để lưu vào hồ sơ học viên..." /></label>}{modal.error && <div className="admin-error" role="alert">{modal.error}</div>}<div className="modal-actions"><button className="admin-quiet-button" onClick={() => setModal(null)} disabled={submitting}>Hủy</button><button className={modal.type === 'reject' || modal.type === 'suspend' ? 'admin-danger-button' : 'admin-primary-button'} onClick={runAction} disabled={submitting}>{submitting ? 'Đang xử lý...' : modalCopy[2]}</button></div></section></div>}
    {toast && <div className="admin-toast" role="status">{toast}</div>}
  </div>;
}
