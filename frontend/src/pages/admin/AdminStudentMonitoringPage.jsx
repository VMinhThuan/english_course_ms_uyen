import { useState, useEffect, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import learningApi from '../../api/learningApi.js';
import { courseApi } from '../../api/courseApi.js';
import PageHeader from '../../components/ui/PageHeader.jsx';
import UiButton from '../../components/ui/UiButton.jsx';
import './AdminStudentMonitoring.css';

const formatDuration = (totalSeconds) => {
  const sec = Number(totalSeconds) || 0;
  if (sec <= 0) return '0 phút';
  const hours = Math.floor(sec / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  if (hours > 0) {
    return `${hours} giờ ${minutes > 0 ? `${minutes}p` : ''}`;
  }
  return `${minutes} phút`;
};

const formatDateTime = (value) => {
  if (!value) return '—';
  try {
    return new Intl.DateTimeFormat('vi-VN', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(value));
  } catch {
    return '—';
  }
};

const statusLabels = {
  NOT_STARTED: 'Chưa học',
  IN_PROGRESS: 'Đang học',
  COMPLETED: 'Hoàn thành',
};

export default function AdminStudentMonitoringPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const [overview, setOverview] = useState(null);
  const [courses, setCourses] = useState([]);
  const [students, setStudents] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [error, setError] = useState('');

  // URL Query State
  const page = Number(searchParams.get('page') || 1);
  const search = searchParams.get('search') || '';
  const courseId = searchParams.get('courseId') || '';
  const status = searchParams.get('status') || 'all';

  const [searchInput, setSearchInput] = useState(search);

  // Load KPI overview
  useEffect(() => {
    let active = true;
    setOverviewLoading(true);
    learningApi.getOverview()
      .then((res) => {
        if (active) setOverview(res.data);
      })
      .catch((err) => {
        console.warn('Failed to load overview:', err);
      })
      .finally(() => {
        if (active) setOverviewLoading(false);
      });
    return () => { active = false; };
  }, []);

  // Load published courses list for filter
  useEffect(() => {
    let active = true;
    courseApi.getCourses()
      .then((res) => {
        if (active) setCourses(res.data?.courses || []);
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  // Load student list
  const loadStudents = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await learningApi.getStudents({
        page,
        limit: 20,
        search,
        courseId: courseId || undefined,
        status: status !== 'all' ? status : undefined,
      });
      setStudents(res.data?.students || []);
      setPagination(res.data?.pagination || { page: 1, limit: 20, total: 0, pages: 1 });
    } catch (err) {
      setError(err?.response?.data?.message || 'Không thể tải danh sách tiến độ học tập.');
    } finally {
      setLoading(false);
    }
  }, [page, search, courseId, status]);

  useEffect(() => {
    loadStudents();
  }, [loadStudents]);

  const updateParam = (key, val) => {
    const next = new URLSearchParams(searchParams);
    if (val && val !== 'all') {
      next.set(key, val);
    } else {
      next.delete(key);
    }
    next.set('page', '1');
    setSearchParams(next);
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    updateParam('search', searchInput.trim());
  };

  const handleClearSearch = () => {
    setSearchInput('');
    updateParam('search', '');
  };

  return (
    <div className="admin-page-container monitoring-page">
      <div className="monitoring-header">
        <PageHeader
          title="Tiến độ học tập"
          subtitle="Giám sát thời gian học và tiến độ hoàn thành khóa học của từng học viên"
        />
        <div className="monitoring-header-actions">
          <Link to="/admin/learning-progress/courses" className="admin-quiet-button">
            📊 Thống kê theo khóa học
          </Link>
        </div>
      </div>

      {/* 6 Summary Metric Cards */}
      <section className="monitoring-kpi-grid" aria-label="Chỉ số tổng quan tiến độ">
        <div className="kpi-card">
          <span className="kpi-card-label">Tổng học viên</span>
          <strong className="kpi-card-value">
            {overviewLoading ? '...' : (overview?.totalStudents ?? 0)}
          </strong>
          <span className="kpi-card-sub">Toàn hệ thống</span>
        </div>

        <div className="kpi-card">
          <span className="kpi-card-label">Đang học (Active)</span>
          <strong className="kpi-card-value" style={{ color: '#1b5f9e' }}>
            {overviewLoading ? '...' : (overview?.activeLearners ?? 0)}
          </strong>
          <span className="kpi-card-sub">Đã bắt đầu học</span>
        </div>

        <div className="kpi-card">
          <span className="kpi-card-label">Chưa bắt đầu</span>
          <strong className="kpi-card-value" style={{ color: '#7a7369' }}>
            {overviewLoading ? '...' : (overview?.notStartedStudents ?? 0)}
          </strong>
          <span className="kpi-card-sub">0% tiến độ</span>
        </div>

        <div className="kpi-card">
          <span className="kpi-card-label">Đã hoàn thành</span>
          <strong className="kpi-card-value" style={{ color: '#1f6b3d' }}>
            {overviewLoading ? '...' : (overview?.completedStudents ?? 0)}
          </strong>
          <span className="kpi-card-sub">Hoàn tất khóa</span>
        </div>

        <div className="kpi-card">
          <span className="kpi-card-label">Tổng thời gian học</span>
          <strong className="kpi-card-value" style={{ fontSize: '20px' }}>
            {overviewLoading ? '...' : formatDuration(overview?.totalLearningSeconds ?? 0)}
          </strong>
          <span className="kpi-card-sub">Thời gian tích lũy thực</span>
        </div>

        <div className="kpi-card">
          <span className="kpi-card-label">Tỉ lệ hoàn thành TB</span>
          <strong className="kpi-card-value">
            {overviewLoading ? '...' : `${overview?.averageCompletionPercentage ?? 0}%`}
          </strong>
          <span className="kpi-card-sub">Trung bình các khóa</span>
        </div>
      </section>

      {/* Filter and Search Bar */}
      <div className="monitoring-filter-bar">
        <form className="monitoring-search-box" onSubmit={handleSearchSubmit}>
          <input
            type="search"
            placeholder="Tìm theo tên học viên, email, mã..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          {searchInput && (
            <button
              type="button"
              className="monitoring-search-clear"
              onClick={handleClearSearch}
              title="Xóa tìm kiếm"
            >
              ✕
            </button>
          )}
        </form>

        <div className="monitoring-filter-group">
          <select
            className="monitoring-select"
            value={courseId}
            onChange={(e) => updateParam('courseId', e.target.value)}
          >
            <option value="all">Tất cả khóa học</option>
            {courses.map((c) => (
              <option key={c._id} value={c._id}>{c.title}</option>
            ))}
          </select>

          <select
            className="monitoring-select"
            value={status}
            onChange={(e) => updateParam('status', e.target.value)}
          >
            <option value="all">Tất cả trạng thái</option>
            <option value="in_progress">Đang học</option>
            <option value="completed">Đã hoàn thành</option>
            <option value="not_started">Chưa học</option>
          </select>

          <UiButton variant="outline" size="sm" onClick={loadStudents}>
            Làm mới
          </UiButton>
        </div>
      </div>

      {error && <div className="admin-error">{error}</div>}

      {/* Student Monitoring Table */}
      <div className="monitoring-table-container">
        {loading ? (
          <div className="admin-table-skeleton">
            <i /><i /><i /><i />
          </div>
        ) : students.length === 0 ? (
          <div className="admin-empty">
            Không tìm thấy học viên nào phù hợp với bộ lọc.
          </div>
        ) : (
          <table className="monitoring-table">
            <thead>
              <tr>
                <th>Học viên</th>
                <th>Khóa học</th>
                <th>Hoạt động gần nhất</th>
                <th>Tổng thời gian học</th>
                <th>Số bài xong</th>
                <th>Tiến độ</th>
                <th>Trạng thái</th>
                <th style={{ textAlign: 'right' }}>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {students.map((st) => (
                <tr key={st._id}>
                  <td>
                    <div className="student-user-cell">
                      {st.avatar ? (
                        <img className="student-avatar-thumb" src={st.avatar} alt="" />
                      ) : (
                        <div className="student-avatar-thumb">
                          {(st.fullName || st.email || 'H').charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <strong>{st.fullName || 'Chưa đặt tên'}</strong>
                        <span>{st.email}</span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div className="course-tags-cell">
                      {st.enrolledCourses && st.enrolledCourses.length > 0 ? (
                        st.enrolledCourses.map((c) => (
                          <span key={c._id} className="course-mini-tag" title={c.title}>
                            {c.title}
                          </span>
                        ))
                      ) : (
                        <span style={{ color: 'var(--brand-muted)', fontSize: '12px' }}>Chưa ghi danh</span>
                      )}
                    </div>
                  </td>
                  <td style={{ whiteSpace: 'nowrap', fontSize: '12px' }}>
                    {formatDateTime(st.lastActiveTime)}
                  </td>
                  <td style={{ fontWeight: 700, color: 'var(--brand-coffee)' }}>
                    {formatDuration(st.totalLearningSeconds)}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <strong>{st.completedLessons}</strong>
                    <span style={{ color: 'var(--brand-muted)' }}>/{st.totalLessons} bài</span>
                  </td>
                  <td>
                    <div className="progress-bar-cell">
                      <div className="progress-track">
                        <div
                          className={`progress-fill ${st.progressPercentage === 100 ? 'completed' : ''}`}
                          style={{ width: `${st.progressPercentage}%` }}
                        />
                      </div>
                      <div className="progress-text-sub">
                        <span>{st.progressPercentage}%</span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className={`learning-status-badge ${st.learningStatus}`}>
                      {statusLabels[st.learningStatus] || st.learningStatus}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <Link
                      to={`/admin/learning-progress/students/${st._id}`}
                      className="admin-primary-button small"
                    >
                      Xem chi tiết
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {pagination.pages > 1 && (
        <nav className="admin-pagination" aria-label="Phân trang tiến độ học viên">
          <button
            type="button"
            disabled={pagination.page <= 1}
            onClick={() => {
              const next = new URLSearchParams(searchParams);
              next.set('page', String(pagination.page - 1));
              setSearchParams(next);
            }}
          >
            Trước
          </button>
          <span>Trang {pagination.page} / {pagination.pages}</span>
          <button
            type="button"
            disabled={pagination.page >= pagination.pages}
            onClick={() => {
              const next = new URLSearchParams(searchParams);
              next.set('page', String(pagination.page + 1));
              setSearchParams(next);
            }}
          >
            Sau
          </button>
        </nav>
      )}
    </div>
  );
}
