import { useState, useEffect } from 'react';
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
  const seconds = sec % 60;
  if (hours > 0) {
    return `${hours} giờ ${minutes}p`;
  }
  return `${minutes} phút ${seconds > 0 ? `${seconds}s` : ''}`;
};

export default function AdminCourseReportPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [courses, setCourses] = useState([]);
  const [coursesLoading, setCoursesLoading] = useState(true);

  const selectedCourseId = searchParams.get('courseId') || '';
  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [error, setError] = useState('');

  // 1. Fetch all published courses
  useEffect(() => {
    let active = true;
    setCoursesLoading(true);

    courseApi.getCourses()
      .then((res) => {
        if (!active) return;
        const list = res.data?.courses || [];
        setCourses(list);
        // If no courseId in URL, default to first course
        if (!selectedCourseId && list.length > 0) {
          const next = new URLSearchParams(searchParams);
          next.set('courseId', list[0]._id);
          setSearchParams(next);
        }
      })
      .catch((err) => {
        if (active) setError(err?.response?.data?.message || 'Không thể tải danh sách khóa học.');
      })
      .finally(() => {
        if (active) setCoursesLoading(false);
      });

    return () => { active = false; };
  }, [selectedCourseId, searchParams, setSearchParams]);

  // 2. Fetch course stats when selectedCourseId changes
  useEffect(() => {
    if (!selectedCourseId) return;
    let active = true;
    setStatsLoading(true);
    setError('');

    learningApi.getCourseStats(selectedCourseId)
      .then((res) => {
        if (active) setStats(res.data);
      })
      .catch((err) => {
        if (active) setError(err?.response?.data?.message || 'Không thể tải thống kê khóa học.');
      })
      .finally(() => {
        if (active) setStatsLoading(false);
      });

    return () => { active = false; };
  }, [selectedCourseId]);

  const handleSelectCourse = (e) => {
    const next = new URLSearchParams(searchParams);
    next.set('courseId', e.target.value);
    setSearchParams(next);
  };

  return (
    <div className="admin-page-container monitoring-page">
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <Link to="/admin/learning-progress" className="admin-quiet-button">
          ← Danh sách học viên
        </Link>
      </div>

      <div className="monitoring-header">
        <PageHeader
          title="Báo cáo học tập theo Khóa học"
          subtitle="Thống kê chuyên sâu về tỉ lệ hoàn thành, thời gian học trung bình và bài học theo từng khóa"
        />

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <select
            className="monitoring-select"
            value={selectedCourseId}
            onChange={handleSelectCourse}
            disabled={coursesLoading}
            style={{ minWidth: '220px', fontWeight: 700 }}
          >
            {courses.map((c) => (
              <option key={c._id} value={c._id}>
                {c.title}
              </option>
            ))}
          </select>

          <UiButton variant="outline" size="sm" onClick={() => selectedCourseId && learningApi.getCourseStats(selectedCourseId).then((r) => setStats(r.data))}>
            Làm mới
          </UiButton>
        </div>
      </div>

      {error && <div className="admin-error">{error}</div>}

      {statsLoading ? (
        <div className="admin-table-skeleton"><i /><i /><i /></div>
      ) : stats ? (
        <>
          {/* Course Summary KPI Cards (Section 3.G) */}
          <section className="monitoring-kpi-grid" style={{ gridTemplateColumns: 'repeat(5, minmax(0, 1fr))' }} aria-label="Chỉ số khóa học">
            <div className="kpi-card">
              <span className="kpi-card-label">Học viên ghi danh</span>
              <strong className="kpi-card-value">
                {stats.enrolledStudents ?? 0}
              </strong>
              <span className="kpi-card-sub">Tổng số ghi danh</span>
            </div>

            <div className="kpi-card">
              <span className="kpi-card-label">Đã bắt đầu học</span>
              <strong className="kpi-card-value" style={{ color: '#1b5f9e' }}>
                {stats.startedStudents ?? 0}
              </strong>
              <span className="kpi-card-sub">
                {stats.enrolledStudents > 0
                  ? `${Math.round(((stats.startedStudents || 0) / stats.enrolledStudents) * 100)}% ghi danh`
                  : '0%'}
              </span>
            </div>

            <div className="kpi-card">
              <span className="kpi-card-label">Đã hoàn thành khóa</span>
              <strong className="kpi-card-value" style={{ color: '#1f6b3d' }}>
                {stats.completedStudents ?? 0}
              </strong>
              <span className="kpi-card-sub">Hoàn thành 100% bài</span>
            </div>

            <div className="kpi-card">
              <span className="kpi-card-label">Tỉ lệ hoàn thành TB</span>
              <strong className="kpi-card-value">
                {stats.averageCompletionPercentage ?? 0}%
              </strong>
              <span className="kpi-card-sub">Tiến độ trung bình</span>
            </div>

            <div className="kpi-card">
              <span className="kpi-card-label">Thời gian học TB / HV</span>
              <strong className="kpi-card-value" style={{ fontSize: '20px' }}>
                {formatDuration(stats.averageActiveLearningSeconds)}
              </strong>
              <span className="kpi-card-sub">Tích lũy bình quân</span>
            </div>
          </section>

          {/* Lesson Breakdown Table */}
          <section aria-label="Chi tiết từng bài học trong khóa">
            <h3 style={{ fontSize: '16px', color: 'var(--brand-coffee)', margin: '14px 0 10px' }}>
              Danh sách bài học & thống kê hiệu quả ({stats.lessons?.length || 0} bài)
            </h3>

            <div className="monitoring-table-container">
              {(!stats.lessons || stats.lessons.length === 0) ? (
                <div className="admin-empty">Khóa học này chưa có bài học nào được xuất bản.</div>
              ) : (
                <table className="monitoring-table">
                  <thead>
                    <tr>
                      <th style={{ width: '40px' }}>#</th>
                      <th>Tên bài học</th>
                      <th>Chương / Chủ đề</th>
                      <th>Số HV hoàn thành</th>
                      <th>Tỉ lệ hoàn thành</th>
                      <th>Thời gian học TB</th>
                      <th>Tổng lượt truy cập</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.lessons.map((lesson) => (
                      <tr key={lesson._id}>
                        <td style={{ color: 'var(--brand-muted)' }}>{lesson.order}</td>
                        <td>
                          <strong>{lesson.title}</strong>
                          {lesson.duration > 0 && (
                            <span style={{ display: 'block', fontSize: '11px', color: 'var(--brand-muted)' }}>
                              Thời lượng chuẩn: {lesson.duration} phút
                            </span>
                          )}
                        </td>
                        <td>
                          <span className="course-mini-tag">{lesson.chapter || 'Chương chung'}</span>
                        </td>
                        <td>
                          <strong style={{ color: '#1f6b3d' }}>{lesson.completedStudentsCount}</strong>
                          <span style={{ color: 'var(--brand-muted)', fontSize: '12px' }}>
                            /{stats.enrolledStudents} học viên
                          </span>
                        </td>
                        <td>
                          <div className="progress-bar-cell">
                            <div className="progress-track">
                              <div
                                className={`progress-fill ${lesson.completionRate === 100 ? 'completed' : ''}`}
                                style={{ width: `${lesson.completionRate}%` }}
                              />
                            </div>
                            <div className="progress-text-sub">
                              <span>{lesson.completionRate}%</span>
                            </div>
                          </div>
                        </td>
                        <td style={{ fontWeight: 600, color: 'var(--brand-coffee)' }}>
                          {formatDuration(lesson.averageActiveSeconds)}
                        </td>
                        <td>
                          <strong>{lesson.totalVisits || 0}</strong> lượt
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        </>
      ) : (
        <div className="admin-empty">Vui lòng chọn khóa học để xem thống kê.</div>
      )}
    </div>
  );
}
