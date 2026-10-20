import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { adminApi } from '../../api/adminApi.js';
import PageHeader from '../../components/ui/PageHeader.jsx';
import StatusBadge from '../../components/ui/StatusBadge.jsx';
import UiButton from '../../components/ui/UiButton.jsx';
import './AdminStudentsPage.css';

const dateTime = (value) => value ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—';
const dateOnly = (value) => value ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium' }).format(new Date(value)) : '—';
const duration = (seconds) => Number.isFinite(seconds) ? `${Math.floor(seconds / 60)} phút${seconds % 60 ? ` ${seconds % 60} giây` : ''}` : '—';
const attemptStates = [
  ['ALL', 'Tất cả trạng thái'],
  ['COMPLETED_SCORED', 'Đã chấm'],
  ['IN_PROGRESS', 'Đang làm'],
  ['EXPIRED_PENDING_FINALIZATION', 'Hết hạn, chờ chấm'],
  ['LEGACY_UNVERIFIED', 'Chưa xác minh điểm'],
];
const stateLabels = {
  COMPLETED_SCORED: 'Đã chấm điểm',
  IN_PROGRESS: 'Đang làm',
  EXPIRED_PENDING_FINALIZATION: 'Hết hạn · chờ chấm',
  LEGACY_UNVERIFIED: 'Chưa xác minh điểm',
};
const actionContent = {
  approve: ['Duyệt tài khoản học viên?', 'Học viên sẽ có thể đăng nhập và truy cập nội dung học tập ngay sau khi được duyệt.', 'Duyệt tài khoản'],
  reject: ['Từ chối yêu cầu đăng ký?', 'Học viên sẽ không thể đăng nhập bằng tài khoản này.', 'Từ chối yêu cầu'],
  suspend: ['Tạm khóa tài khoản?', 'Học viên sẽ không thể đăng nhập cho đến khi tài khoản được kích hoạt lại.', 'Tạm khóa'],
  activate: ['Kích hoạt lại tài khoản?', 'Học viên sẽ có thể đăng nhập và tiếp tục học.', 'Kích hoạt tài khoản'],
};

function Pagination({ label, page, pages, onChange }) {
  if (!pages || pages <= 1) return null;
  return <nav className="admin-pagination" aria-label={label}>
    <button type="button" disabled={page <= 1} onClick={() => onChange(page - 1)}>Trước</button>
    <span>Trang {page} / {pages}</span>
    <button type="button" disabled={page >= pages} onClick={() => onChange(page + 1)}>Sau</button>
  </nav>;
}

export default function AdminStudentDetailPage() {
  const { id } = useParams();
  const [student, setStudent] = useState(null);
  const [studentLoading, setStudentLoading] = useState(true);
  const [error, setError] = useState('');
  const [action, setAction] = useState(null);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState('');

  const [progress, setProgress] = useState(null);
  const [progressLoading, setProgressLoading] = useState(true);
  const [progressError, setProgressError] = useState('');
  const [lessonPage, setLessonPage] = useState(1);
  const [coursePage, setCoursePage] = useState(1);
  const [courseFilter, setCourseFilter] = useState('');

  const [attempts, setAttempts] = useState(null);
  const [attemptLoading, setAttemptLoading] = useState(true);
  const [attemptError, setAttemptError] = useState('');
  const [attemptPage, setAttemptPage] = useState(1);
  const [attemptState, setAttemptState] = useState('ALL');
  const [attemptEngine, setAttemptEngine] = useState('');

  useEffect(() => {
    let active = true;
    setStudentLoading(true);
    setError('');
    adminApi.getStudent(id)
      .then((response) => { if (active) setStudent(response.data.student); })
      .catch((requestError) => {
        if (active) setError(requestError.response?.data?.message || 'Không thể tải thông tin học viên.');
      })
      .finally(() => { if (active) setStudentLoading(false); });
    return () => { active = false; };
  }, [id]);

  useEffect(() => {
    let active = true;
    setProgressLoading(true);
    setProgressError('');
    adminApi.getStudentProgress(id, {
      page: lessonPage,
      limit: 20,
      coursePage,
      courseLimit: 20,
      ...(courseFilter ? { courseId: courseFilter } : {}),
    })
      .then((response) => { if (active) setProgress(response.data); })
      .catch((requestError) => {
        if (active) setProgressError(requestError.response?.data?.message || 'Không thể tải tiến độ học tập.');
      })
      .finally(() => { if (active) setProgressLoading(false); });
    return () => { active = false; };
  }, [id, lessonPage, coursePage, courseFilter]);

  useEffect(() => {
    let active = true;
    setAttemptLoading(true);
    setAttemptError('');
    adminApi.getStudentAttempts(id, {
      page: attemptPage,
      limit: 20,
      state: attemptState,
      sort: 'started_desc',
      ...(attemptEngine ? { engine: attemptEngine } : {}),
    })
      .then((response) => { if (active) setAttempts(response.data); })
      .catch((requestError) => {
        if (active) setAttemptError(requestError.response?.data?.message || 'Không thể tải lịch sử bài làm.');
      })
      .finally(() => { if (active) setAttemptLoading(false); });
    return () => { active = false; };
  }, [id, attemptPage, attemptState, attemptEngine]);

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

  if (studentLoading) return <div className="admin-page-container"><div className="admin-table-skeleton"><i /><i /><i /></div></div>;
  if (error) return <div className="admin-page-container"><div className="admin-error" role="alert">{error}</div></div>;
  if (!student) return <div className="admin-page-container"><div className="admin-empty">Không tìm thấy học viên.</div></div>;

  const fields = [
    ['Họ và tên', student.fullName],
    ['Email', student.email],
    ['Tên đăng nhập', student.username ? `@${student.username}` : '—'],
    ['Số điện thoại', student.phoneNumber],
    ['Ngày đăng ký', dateOnly(student.createdAt)],
    ['Ngày được duyệt', dateOnly(student.approvedAt)],
    ['Lần đăng nhập gần nhất', dateTime(student.lastLoginAt)],
  ];
  const content = action ? actionContent[action] : null;
  const courseSummary = courseFilter
    ? (progress?.courses || []).find((course) => String(course._id) === String(courseFilter))
    : null;
  const visibleProgress = courseSummary || progress;
  const attemptSummary = attempts?.summary || {};

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

    <section className="admin-panel student-detail-panel"><div className="admin-panel-head"><div><h2>Thông tin tài khoản</h2><p>Thông tin đăng ký và hoạt động gần nhất của học viên.</p></div></div><dl className="student-detail-grid">{fields.map(([name, value]) => <div key={name}><dt>{name}</dt><dd title={value || ''}>{value || '—'}</dd></div>)}</dl></section>

    <section className="admin-summary-grid student-learning-summary" aria-label="Tổng quan học tập">
      <article className="admin-summary-card"><span>Khóa học đã đăng ký</span><strong>{progress?.totalCourses ?? '—'}</strong><small>Các khóa được lấy từ enrollment và liên kết học viên cũ.</small></article>
      <article className="admin-summary-card"><span>Bài học hoàn thành</span><strong>{visibleProgress?.completedLessons ?? '—'} / {visibleProgress?.totalLessons ?? '—'}</strong><small>{visibleProgress?.completionPercentage ?? 0}% bài học đã xuất bản.</small></article>
      <article className="admin-summary-card"><span>Lượt đã chấm</span><strong>{attemptSummary.scoredAttemptCount ?? '—'}</strong><small>{attemptSummary.distinctStudents ? 'Tổng số lượt làm được giữ riêng.' : 'Điểm 0 hợp lệ vẫn được tính khi có thang điểm.'}</small></article>
      <article className="admin-summary-card"><span>Đang làm / chờ chấm</span><strong>{attemptSummary.inProgressCount ?? '—'} / {attemptSummary.expiredPendingCount ?? '—'}</strong><small>GET báo cáo chỉ đọc, không tự chấm attempt.</small></article>
    </section>

    <section className="admin-panel student-detail-panel">
      <div className="admin-panel-head"><div><h2>Khóa học đã đăng ký</h2><p>Tiến độ được tính trên các bài học đã xuất bản; bài ẩn và chưa xuất bản không nằm trong mẫu số.</p></div></div>
      {progressError && <div className="admin-error" role="alert">{progressError}</div>}
      {progressLoading ? <div className="admin-table-skeleton"><i /><i /><i /></div> : (progress?.courses || []).length === 0
        ? <div className="admin-empty">Học viên chưa có khóa học nào được ghi nhận.</div>
        : <><div className="admin-table-container"><table className="admin-data-table student-detail-table"><thead><tr><th>Khóa học</th><th>Ngày đăng ký</th><th>Bài hoàn thành</th><th>Tiến độ</th><th>Hoạt động gần nhất</th><th></th></tr></thead><tbody>{progress.courses.map((course) => <tr key={course._id}><td><strong>{course.title}</strong></td><td>{dateOnly(course.enrolledAt)}</td><td>{course.completedLessons} / {course.totalLessons}</td><td>{course.completionPercentage}%</td><td>{dateTime(course.lastLearningActivity)}</td><td><button type="button" className="admin-quiet-button" onClick={() => { setCourseFilter(String(course._id)); setLessonPage(1); }}>Bài học</button></td></tr>)}</tbody></table></div><Pagination label="Phân trang khóa học" page={progress.coursePagination?.page || 1} pages={progress.coursePagination?.pages || 0} onChange={setCoursePage} /></>}
    </section>

    <section className="admin-panel student-detail-panel">
      <div className="admin-panel-head"><div><h2>Bài học và tiến độ</h2><p>{progress?.lastLearningActivity ? `Hoạt động học gần nhất: ${dateTime(progress.lastLearningActivity)}.` : 'Chưa ghi nhận hoạt động học tập.'}</p></div><label className="student-history-filter">Lọc khóa học<select value={courseFilter} onChange={(event) => { setCourseFilter(event.target.value); setLessonPage(1); }}><option value="">Tất cả khóa học</option>{(progress?.courses || []).map((course) => <option key={course._id} value={course._id}>{course.title}</option>)}</select></label></div>
      {progressError ? null : progressLoading ? <div className="admin-table-skeleton"><i /><i /></div> : (progress?.lessons || []).length === 0
        ? <div className="admin-empty">Không có bài học đã xuất bản trong phạm vi này.</div>
        : <><div className="admin-table-container"><table className="admin-data-table student-detail-table"><thead><tr><th>Bài học</th><th>Khóa học</th><th>Trạng thái</th><th>Tiến độ</th><th>Hoàn thành</th><th>Truy cập gần nhất</th></tr></thead><tbody>{progress.lessons.map((lesson) => <tr key={lesson._id}><td><strong>{lesson.title}</strong></td><td>{lesson.course?.title || '—'}</td><td><span className={`student-learning-state ${lesson.status}`}>{({ completed: 'Hoàn thành', in_progress: 'Đang học', not_started: 'Chưa bắt đầu' })[lesson.status] || 'Chưa xác định'}</span></td><td>{lesson.progress}%</td><td>{dateTime(lesson.completedAt)}</td><td>{dateTime(lesson.lastAccessedAt)}</td></tr>)}</tbody></table></div><Pagination label="Phân trang bài học" page={progress.lessonPagination?.page || 1} pages={progress.lessonPagination?.pages || 0} onChange={setLessonPage} /></>}
    </section>

    <section className="admin-panel student-detail-panel">
      <div className="admin-panel-head"><div><h2>Lịch sử bài tập và bài kiểm tra</h2><p>Standard và TOEIC dùng chung cách diễn giải trạng thái; snapshot câu hỏi và câu trả lời không được trả về.</p></div><div className="student-history-filters"><label>Engine<select value={attemptEngine} onChange={(event) => { setAttemptEngine(event.target.value); setAttemptPage(1); }}><option value="">Tất cả</option><option value="standard">Standard</option><option value="toeic">TOEIC</option></select></label><label>Trạng thái<select value={attemptState} onChange={(event) => { setAttemptState(event.target.value); setAttemptPage(1); }}>{attemptStates.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div></div>
      {attemptError && <div className="admin-error" role="alert">{attemptError}</div>}
      {attemptLoading ? <div className="admin-table-skeleton"><i /><i /><i /></div> : (attempts?.results || []).length === 0
        ? <div className="admin-empty">Chưa có lượt làm bài trong phạm vi bộ lọc.</div>
        : <><div className="admin-table-container"><table className="admin-data-table student-detail-table"><thead><tr><th>Đề đánh giá</th><th>Engine / loại</th><th>Trạng thái</th><th>Điểm</th><th>Bắt đầu</th><th>Hoàn thành</th><th>Thời lượng</th></tr></thead><tbody>{attempts.results.map((attempt) => <tr key={attempt._id}><td><strong>{attempt.assessment?.title || attempt.assessmentTitle || 'Đề thi đã bị xóa'}</strong><small className="assessment-table-sub">{attempt.assessmentType === 'exam' ? 'Bài kiểm tra' : 'Bài tập'} · #{String(attempt._id).slice(-8)}</small></td><td>{attempt.engine === 'toeic' ? 'TOEIC' : attempt.engine === 'standard' ? 'Standard' : 'Chưa xác minh'}</td><td><span className={`student-attempt-state ${attempt.logicalStatus?.toLowerCase()}`}>{stateLabels[attempt.logicalStatus] || 'Chưa xác minh'}</span>{attempt.isExpired && <small className="assessment-table-sub">Đã hết hạn</small>}</td><td>{attempt.isScored ? <><strong>{attempt.score} / {attempt.maxScore}</strong>{attempt.engine === 'toeic' && Number.isFinite(attempt.toeicEstimatedScore) && <small className="assessment-table-sub">Ước tính TOEIC: {attempt.toeicEstimatedScore}</small>}</> : 'Chưa có điểm'}</td><td>{dateTime(attempt.startedAt)}</td><td>{dateTime(attempt.completedAt)}</td><td>{duration(attempt.duration)}</td></tr>)}</tbody></table></div><Pagination label="Phân trang lịch sử bài làm" page={attempts.pagination?.page || 1} pages={attempts.pagination?.pages || 0} onChange={setAttemptPage} /></>}
    </section>

    {action && <div className="admin-modal-backdrop" role="presentation"><section className="admin-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="student-action-title"><button className="modal-close" onClick={() => !submitting && setAction(null)} aria-label="Đóng">×</button><h2 id="student-action-title">{content[0]}</h2><p><strong>{student.fullName || 'Học viên'}</strong><br />{student.email}</p><p>{content[1]}</p>{action === 'reject' && <label className="admin-modal-label">Lý do từ chối <span>(không bắt buộc)</span><textarea value={reason} onChange={(event) => setReason(event.target.value)} rows="3" placeholder="Nhập lý do để lưu vào hồ sơ học viên..." /></label>}{actionError && <div className="admin-error" role="alert">{actionError}</div>}<div className="modal-actions"><button className="admin-quiet-button" onClick={() => setAction(null)} disabled={submitting}>Hủy</button><button className={action === 'reject' || action === 'suspend' ? 'admin-danger-button' : 'admin-primary-button'} onClick={runAction} disabled={submitting}>{submitting ? 'Đang xử lý...' : content[2]}</button></div></section></div>}
  </div>;
}
