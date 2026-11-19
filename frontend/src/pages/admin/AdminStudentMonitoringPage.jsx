import { useState, useEffect, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import learningApi from '../../api/learningApi.js';
import PageHeader from '../../components/ui/PageHeader.jsx';
import UiButton from '../../components/ui/UiButton.jsx';
import './AdminStudentMonitoring.css';

const formatDuration = (totalSeconds) => {
  const seconds = Math.max(0, Number(totalSeconds) || 0);
  if (seconds < 60) return `${seconds} giây`;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours} giờ${minutes ? ` ${minutes} phút` : ''}`;
  return `${minutes} phút`;
};

const formatDateTime = (value) => {
  if (!value) return 'Chưa có hoạt động';
  try {
    return new Intl.DateTimeFormat('vi-VN', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Asia/Ho_Chi_Minh',
    }).format(new Date(value));
  } catch {
    return '—';
  }
};

export default function AdminStudentMonitoringPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [overview, setOverview] = useState(null);
  const [students, setStudents] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [error, setError] = useState('');

  const page = Number(searchParams.get('page') || 1);
  const search = searchParams.get('search') || '';
  const [searchInput, setSearchInput] = useState(search);

  useEffect(() => {
    let active = true;
    const loadOverview = () => {
      learningApi.getOverview()
        .then((res) => { if (active) setOverview(res.data); })
        .catch((err) => console.warn('Failed to load overview:', err))
        .finally(() => { if (active) setOverviewLoading(false); });
    };

    setOverviewLoading(true);
    loadOverview();
    const timerId = window.setInterval(loadOverview, 30_000);
    return () => {
      active = false;
      window.clearInterval(timerId);
    };
  }, []);

  const loadStudents = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError('');
    try {
      const res = await learningApi.getStudents({ page, limit: 20, search });
      setStudents(res.data?.students || []);
      setPagination(res.data?.pagination || { page: 1, limit: 20, total: 0, pages: 1 });
    } catch (err) {
      setError(err?.response?.data?.message || 'Không thể tải danh sách học viên.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [page, search]);

  useEffect(() => { loadStudents(); }, [loadStudents]);
  useEffect(() => {
    const timerId = window.setInterval(() => loadStudents(true), 30_000);
    return () => window.clearInterval(timerId);
  }, [loadStudents]);

  const applySearch = (value) => {
    const next = new URLSearchParams();
    if (value) next.set('search', value);
    next.set('page', '1');
    setSearchParams(next);
  };

  const handleSearchSubmit = (event) => {
    event.preventDefault();
    applySearch(searchInput.trim());
  };

  const handleClearSearch = () => {
    setSearchInput('');
    applySearch('');
  };

  const changePage = (nextPage) => {
    const next = new URLSearchParams();
    if (search) next.set('search', search);
    next.set('page', String(nextPage));
    setSearchParams(next);
  };

  return (
    <div className="admin-page-container monitoring-page">
      <div className="monitoring-header">
        <PageHeader title="Tiến độ học tập" subtitle="Theo dõi trạng thái hoạt động và thời gian học của từng học viên." />
      </div>

      <section className="monitoring-kpi-grid" aria-label="Chỉ số hoạt động học tập">
        <div className="kpi-card">
          <span className="kpi-card-label">Tổng học viên</span>
          <strong className="kpi-card-value">{overviewLoading ? '...' : (overview?.totalStudents ?? 0)}</strong>
          <span className="kpi-card-sub">Toàn hệ thống</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-card-label">Đang hoạt động</span>
          <strong className="kpi-card-value kpi-card-value--active">{overviewLoading ? '...' : (overview?.currentlyActiveStudents ?? 0)}</strong>
          <span className="kpi-card-sub">Online trong 45 giây gần nhất</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-card-label">Không hoạt động</span>
          <strong className="kpi-card-value kpi-card-value--inactive">{overviewLoading ? '...' : (overview?.currentlyInactiveStudents ?? 0)}</strong>
          <span className="kpi-card-sub">Không có hoạt động gần đây</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-card-label">Thời gian TB mỗi ngày học</span>
          <strong className="kpi-card-value kpi-card-value--duration">{overviewLoading ? '...' : formatDuration(overview?.averageDailyStudySeconds ?? 0)}</strong>
          <span className="kpi-card-sub">30 ngày gần nhất · ngày có học</span>
        </div>
      </section>

      <div className="monitoring-filter-bar">
        <form className="monitoring-search-box" onSubmit={handleSearchSubmit}>
          <input
            type="search"
            aria-label="Tìm học viên"
            placeholder="Tìm theo tên học viên, email hoặc mã..."
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
          />
          {searchInput && (
            <button type="button" className="monitoring-search-clear" onClick={handleClearSearch} title="Xóa tìm kiếm" aria-label="Xóa tìm kiếm">✕</button>
          )}
          <button type="submit" className="admin-quiet-button monitoring-search-submit">Tìm kiếm</button>
        </form>
        <UiButton variant="outline" size="sm" onClick={() => loadStudents()}>
          Làm mới
        </UiButton>
      </div>

      {error && <div className="admin-error">{error}</div>}

      <div className="monitoring-table-container">
        {loading ? (
          <div className="admin-table-skeleton"><i /><i /><i /><i /></div>
        ) : students.length === 0 ? (
          <div className="admin-empty">Không tìm thấy học viên nào phù hợp.</div>
        ) : (
          <table className="monitoring-table monitoring-student-list-table">
            <thead>
              <tr><th>Học viên</th><th>Hoạt động hiện tại</th><th>Thời gian học tập</th><th className="monitoring-action-heading">Thao tác</th></tr>
            </thead>
            <tbody>
              {students.map((student) => (
                <tr key={student._id}>
                  <td className="monitoring-student-column">
                    <div className="student-user-cell">
                      {student.avatar
                        ? <img className="student-avatar-thumb" src={student.avatar} alt="" />
                        : <div className="student-avatar-thumb">{(student.fullName || student.email || 'H').charAt(0).toUpperCase()}</div>}
                      <div className="student-user-copy">
                        <strong>{student.fullName || 'Chưa đặt tên'}</strong>
                        <span>{student.email}</span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className={`activity-status-badge ${student.activityStatus === 'ACTIVE' ? 'is-active' : 'is-inactive'}`}>
                      <i aria-hidden="true" />
                      {student.activityStatus === 'ACTIVE' ? 'Đang hoạt động' : 'Không hoạt động'}
                    </span>
                  </td>
                  <td>
                    <div className="study-time-cell">
                      <div className="study-time-metrics">
                        <div><span>Hôm nay</span><strong>{formatDuration(student.studyTodaySeconds)}</strong></div>
                        <div><span>TB / ngày học</span><strong>{formatDuration(student.averageDailyStudySeconds)}</strong></div>
                        <div><span>Tổng tích lũy</span><strong>{formatDuration(student.totalLearningSeconds)}</strong></div>
                      </div>
                      <div className="study-time-last-active">
                        <span>Lần hoạt động gần nhất</span>
                        <time>{formatDateTime(student.presenceLastActiveAt)}</time>
                      </div>
                    </div>
                  </td>
                  <td className="monitoring-action-cell">
                    <Link to={`/admin/learning-progress/students/${student._id}`} className="admin-primary-button small">
                      Xem chi tiết
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {pagination.pages > 1 && (
        <nav className="admin-pagination" aria-label="Phân trang danh sách học viên">
          <button type="button" disabled={pagination.page <= 1} onClick={() => changePage(pagination.page - 1)}>Trước</button>
          <span>Trang {pagination.page} / {pagination.pages}</span>
          <button type="button" disabled={pagination.page >= pagination.pages} onClick={() => changePage(pagination.page + 1)}>Sau</button>
        </nav>
      )}
    </div>
  );
}
