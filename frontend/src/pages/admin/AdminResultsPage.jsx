import { useEffect, useRef, useState } from 'react';
import { adminApi } from '../../api/adminApi.js';
import { assessmentApi } from '../../api/assessmentApi.js';
import PageHeader from '../../components/ui/PageHeader.jsx';
import './AdminStudentsPage.css';
import './AdminResultsPage.css';

const dateTime = (value) => value ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—';
const duration = (seconds) => Number.isFinite(seconds) ? `${Math.floor(seconds / 60)} phút${seconds % 60 ? ` ${seconds % 60} giây` : ''}` : '—';
const formatScore = (value) => Number.isFinite(value) ? new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(value) : '—';
const reportStates = [
  ['COMPLETED_SCORED', 'Đã chấm điểm'],
  ['ALL', 'Tất cả trạng thái'],
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

export default function AdminResultsPage() {
  const [assessments, setAssessments] = useState([]);
  const [assessmentPagination, setAssessmentPagination] = useState({ page: 1, pages: 1 });
  const [assessmentPage, setAssessmentPage] = useState(1);
  const [assessmentSearch, setAssessmentSearch] = useState('');
  const [assessmentQuery, setAssessmentQuery] = useState('');
  const [assessmentLoading, setAssessmentLoading] = useState(true);
  const [assessmentError, setAssessmentError] = useState('');
  const [selectedAssessment, setSelectedAssessment] = useState(null);

  const [studentOptions, setStudentOptions] = useState([]);
  const [studentSearch, setStudentSearch] = useState('');
  const [studentQuery, setStudentQuery] = useState('');
  const [selectedStudent, setSelectedStudent] = useState('');
  const [studentLoading, setStudentLoading] = useState(false);
  const [studentError, setStudentError] = useState('');

  const [assessmentType, setAssessmentType] = useState('');
  const [engine, setEngine] = useState('');
  const [state, setState] = useState('COMPLETED_SCORED');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sort, setSort] = useState('score_desc');
  const [page, setPage] = useState(1);
  const [report, setReport] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState('');
  const reportRequest = useRef(0);

  useEffect(() => {
    let active = true;
    setAssessmentLoading(true);
    setAssessmentError('');
    assessmentApi.getAdminReportAssessments({ page: assessmentPage, limit: 50, ...(assessmentQuery ? { search: assessmentQuery } : {}) })
      .then((response) => {
        if (!active) return;
        setAssessments(response.data.assessments || []);
        setAssessmentPagination(response.data.pagination || { page: 1, pages: 1 });
      })
      .catch((requestError) => { if (active) setAssessmentError(requestError.response?.data?.message || 'Không thể tải danh sách đề kiểm tra.'); })
      .finally(() => { if (active) setAssessmentLoading(false); });
    return () => { active = false; };
  }, [assessmentPage, assessmentQuery]);

  useEffect(() => {
    let active = true;
    if (!studentQuery) {
      setStudentOptions([]);
      setStudentLoading(false);
      setStudentError('');
      return () => { active = false; };
    }
    setStudentLoading(true);
    setStudentError('');
    adminApi.getStudents({ search: studentQuery, page: 1, limit: 20, status: 'ALL' })
      .then((response) => { if (active) setStudentOptions(response.data.students || []); })
      .catch((requestError) => { if (active) setStudentError(requestError.response?.data?.message || 'Không thể tìm học viên.'); })
      .finally(() => { if (active) setStudentLoading(false); });
    return () => { active = false; };
  }, [studentQuery]);

  useEffect(() => {
    const requestId = ++reportRequest.current;
    if (!selectedAssessment?._id) {
      setReport(null);
      setReportError('');
      setReportLoading(false);
      return undefined;
    }
    setReport(null);
    setReportLoading(true);
    setReportError('');
    const params = {
      assessmentId: selectedAssessment._id,
      page,
      limit: 20,
      sort,
      state,
      ...(selectedStudent ? { studentId: selectedStudent } : {}),
      ...(assessmentType ? { type: assessmentType } : {}),
      ...(engine ? { engine } : {}),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
    };
    assessmentApi.getAdminResults(params)
      .then((response) => { if (requestId === reportRequest.current) setReport(response.data); })
      .catch((requestError) => {
        if (requestId === reportRequest.current) setReportError(requestError.response?.data?.message || 'Không thể tải báo cáo kết quả.');
      })
      .finally(() => { if (requestId === reportRequest.current) setReportLoading(false); });
    return () => { if (reportRequest.current === requestId) reportRequest.current += 1; };
  }, [selectedAssessment, selectedStudent, assessmentType, engine, state, from, to, sort, page]);

  const changeAssessmentSearch = (event) => {
    event.preventDefault();
    setAssessmentPage(1);
    setAssessmentQuery(assessmentSearch.trim());
  };
  const changeStudentSearch = (event) => {
    event.preventDefault();
    setStudentQuery(studentSearch.trim());
    setSelectedStudent('');
    setPage(1);
  };
  const selectAssessment = (event) => {
    const value = event.target.value;
    const chosen = assessments.find((item) => String(item._id) === value);
    setSelectedAssessment(chosen || null);
    setPage(1);
  };
  const updateFilter = (setter) => (event) => { setter(event.target.value); setPage(1); };
  const summary = report?.summary || {};
  const results = report?.results || [];
  const pagination = report?.pagination || { page: 1, pages: 0, total: 0 };
  const selectedStudentItem = studentOptions.find((item) => String(item._id) === String(selectedStudent));

  return <div className="admin-page-container admin-results-page">
    <PageHeader eyebrow="Báo cáo học tập" title="Kết quả theo đề kiểm tra" description="Chọn một đề để xem từng lượt làm, thứ hạng điểm và các trạng thái chờ xử lý." />

    <section className="admin-panel report-selector-panel">
      <div className="admin-panel-head"><div><h2>Chọn đề kiểm tra</h2><p>Báo cáo chỉ chạy sau khi chọn đề; danh sách đề được tải theo trang.</p></div></div>
      {assessmentError && <div className="admin-error" role="alert">{assessmentError}</div>}
      <form className="report-assessment-search" onSubmit={changeAssessmentSearch}><label htmlFor="report-assessment-search">Tìm đề</label><input id="report-assessment-search" value={assessmentSearch} onChange={(event) => setAssessmentSearch(event.target.value)} maxLength={80} placeholder="Nhập tên đề kiểm tra" /><button type="submit" className="admin-quiet-button">Tìm đề</button></form>
      <div className="report-assessment-select"><label htmlFor="report-assessment">Đề kiểm tra</label><select id="report-assessment" value={selectedAssessment?._id || ''} onChange={selectAssessment} disabled={assessmentLoading}><option value="">{assessmentLoading ? 'Đang tải đề...' : 'Chọn đề kiểm tra'}</option>{selectedAssessment && !assessments.some((item) => String(item._id) === String(selectedAssessment._id)) && <option value={selectedAssessment._id}>{selectedAssessment.title}</option>}{assessments.map((item) => <option key={item._id} value={item._id}>{item.title} · {item.examFormat === 'toeic' ? 'TOEIC' : 'Standard'} · {item.type === 'exam' ? 'Kiểm tra' : 'Bài tập'}</option>)}</select><span>{assessmentPagination.total || 0} đề phù hợp</span></div>
      {assessmentPagination.pages > 1 && <nav className="admin-pagination" aria-label="Phân trang danh sách đề"><button type="button" disabled={assessmentPage <= 1 || assessmentLoading} onClick={() => setAssessmentPage((current) => current - 1)}>Đề trước</button><span>Trang {assessmentPage} / {assessmentPagination.pages}</span><button type="button" disabled={assessmentPage >= assessmentPagination.pages || assessmentLoading} onClick={() => setAssessmentPage((current) => current + 1)}>Đề tiếp</button></nav>}
    </section>

    {selectedAssessment && <>
      <section className="admin-panel report-filters-panel">
        <div className="admin-panel-head"><div><h2>Bộ lọc báo cáo</h2><p>Ngày lọc theo thời điểm bắt đầu lượt làm. Các bộ lọc kết hợp với nhau.</p></div></div>
        <form className="report-student-search" onSubmit={changeStudentSearch}><label htmlFor="report-student-search">Tìm học viên</label><input id="report-student-search" value={studentSearch} onChange={(event) => setStudentSearch(event.target.value)} maxLength={80} placeholder="Tên, email hoặc tên đăng nhập" /><button type="submit" className="admin-quiet-button">Tìm học viên</button><button type="button" className="admin-quiet-button" disabled={!selectedStudent && !studentQuery} onClick={() => { setSelectedStudent(''); setStudentSearch(''); setStudentQuery(''); setPage(1); }}>Xóa</button></form>
        {studentError && <div className="admin-error" role="alert">{studentError}</div>}
        {studentQuery && <label className="report-filter-field">Học viên {studentLoading && <small>Đang tìm...</small>}<select value={selectedStudent} onChange={(event) => { setSelectedStudent(event.target.value); setPage(1); }}><option value="">Tất cả học viên</option>{selectedStudentItem && !studentOptions.some((item) => String(item._id) === String(selectedStudent)) && <option value={selectedStudent}>{selectedStudentItem.fullName || selectedStudentItem.email}</option>}{studentOptions.map((student) => <option key={student._id} value={student._id}>{student.fullName || student.email}{student.username ? ` · @${student.username}` : ''}</option>)}</select></label>}
        <div className="report-filter-grid">
          <label className="report-filter-field">Loại bài<select value={assessmentType} onChange={updateFilter(setAssessmentType)}><option value="">Tất cả</option><option value="exercise">Bài tập</option><option value="exam">Bài kiểm tra</option></select></label>
          <label className="report-filter-field">Engine<select value={engine} onChange={updateFilter(setEngine)}><option value="">Tất cả</option><option value="standard">Standard</option><option value="toeic">TOEIC</option></select></label>
          <label className="report-filter-field">Trạng thái lượt<select value={state} onChange={updateFilter(setState)}>{reportStates.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="report-filter-field">Bắt đầu từ<input type="date" value={from} max={to || undefined} onChange={updateFilter(setFrom)} /></label>
          <label className="report-filter-field">Bắt đầu đến<input type="date" value={to} min={from || undefined} onChange={updateFilter(setTo)} /></label>
          <label className="report-filter-field">Sắp xếp<select value={sort} onChange={updateFilter(setSort)}><option value="score_desc">Điểm cao trước</option><option value="score_asc">Điểm thấp trước</option><option value="completed_asc">Hoàn thành sớm trước</option><option value="started_desc">Bắt đầu gần đây</option><option value="student_asc">Tên học viên</option></select></label>
        </div>
      </section>

      <section className="report-summary-grid" aria-label="Tổng quan kết quả">
        <article className="admin-summary-card"><span>Học viên dự thi khác nhau</span><strong>{summary.distinctStudents ?? '—'}</strong><small>{summary.scoredDistinctStudents ?? 0} học viên có ít nhất một lượt đã chấm.</small></article>
        <article className="admin-summary-card"><span>Lượt đã chấm</span><strong>{summary.scoredAttemptCount ?? '—'}</strong><small>{summary.attemptCount ?? 0} attempt được tìm thấy theo bộ lọc.</small></article>
        <article className="admin-summary-card"><span>Điểm cao nhất / thấp nhất</span><strong>{summary.highestScore == null ? '—' : `${formatScore(summary.highestScore)} / ${formatScore(summary.lowestScore)}`}</strong><small>Trên cùng một đề và thang điểm.</small></article>
        <article className="admin-summary-card"><span>Điểm trung bình</span><strong>{summary.averageScore == null ? '—' : formatScore(summary.averageScore)}</strong><small>Chỉ tính các lượt đã chấm hợp lệ.</small></article>
        <article className="admin-summary-card"><span>Đang làm</span><strong>{summary.inProgressCount ?? '—'}</strong><small>Lượt có deadline còn hiệu lực.</small></article>
        <article className="admin-summary-card"><span>Hết hạn, chờ chấm</span><strong>{summary.expiredPendingCount ?? '—'}</strong><small>Không được tính thành điểm 0.</small></article>
        <article className="admin-summary-card"><span>Chưa xác minh</span><strong>{summary.unverifiedCount ?? '—'}</strong><small>Thiếu dữ liệu finalization hoặc engine không khớp.</small></article>
      </section>

      {reportError && <div className="admin-error" role="alert">{reportError}</div>}
      {reportLoading ? <div className="admin-table-skeleton"><i /><i /><i /><i /></div>
        : reportError ? null
          : results.length === 0 ? <div className="admin-empty report-empty">Không có lượt làm phù hợp với các bộ lọc hiện tại.</div>
            : <><div className="admin-table-container"><table className="admin-data-table report-results-table"><thead><tr><th>Hạng</th><th>Học viên</th><th>Đề / loại bài</th><th>Engine</th><th>Điểm</th><th>Bắt đầu</th><th>Hoàn thành</th><th>Thời lượng</th><th>Trạng thái</th></tr></thead><tbody>{results.map((result, index) => <tr key={result._id}><td>{(page - 1) * 20 + index + 1}</td><td><strong>{result.student?.fullName || result.student?.email || 'Học viên không còn tồn tại'}</strong><small className="assessment-table-sub">{result.student?.username ? `@${result.student.username} · ` : ''}{result.student?.email || ''}</small></td><td><strong>{result.assessment?.title || result.assessmentTitle}</strong><small className="assessment-table-sub">{result.assessmentType === 'exam' ? 'Bài kiểm tra' : 'Bài tập'}</small></td><td>{result.engine === 'toeic' ? 'TOEIC' : result.engine === 'standard' ? 'Standard' : 'Chưa xác minh'}</td><td>{result.isScored ? <><strong>{formatScore(result.score)} / {formatScore(result.maxScore)}</strong>{result.engine === 'toeic' && Number.isFinite(result.toeicEstimatedScore) && <small className="assessment-table-sub">Ước tính TOEIC {result.toeicEstimatedScore}</small>}</> : 'Chưa có điểm'}</td><td>{dateTime(result.startedAt)}</td><td>{dateTime(result.completedAt)}</td><td>{duration(result.duration)}</td><td><span className={`student-attempt-state ${result.logicalStatus?.toLowerCase()}`}>{stateLabels[result.logicalStatus] || 'Chưa xác minh'}</span>{result.isExpired && <small className="assessment-table-sub">Đã hết hạn</small>}</td></tr>)}</tbody></table></div><nav className="admin-pagination" aria-label="Phân trang kết quả"><span>{pagination.total} lượt · trang {pagination.page} / {pagination.pages || 1}</span><button type="button" disabled={page <= 1 || reportLoading} onClick={() => setPage((current) => current - 1)}>Trước</button><button type="button" disabled={page >= pagination.pages || reportLoading} onClick={() => setPage((current) => current + 1)}>Sau</button></nav></>}
    </>}
    {!selectedAssessment && !assessmentLoading && !assessmentError && <div className="admin-empty report-empty">Chọn một đề kiểm tra để xem báo cáo và thống kê.</div>}
  </div>;
}
