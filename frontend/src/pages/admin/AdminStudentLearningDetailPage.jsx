import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import learningApi from '../../api/learningApi.js';
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

const formatDateTime = (value) => {
  if (!value) return '—';
  try {
    return new Intl.DateTimeFormat('vi-VN', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));
  } catch {
    return '—';
  }
};

const formatDateOnly = (value) => {
  if (!value) return '—';
  try {
    return new Intl.DateTimeFormat('vi-VN', {
      dateStyle: 'medium',
    }).format(new Date(value));
  } catch {
    return '—';
  }
};

const statusLabels = {
  NOT_STARTED: 'Chưa học',
  IN_PROGRESS: 'Đang học',
  COMPLETED: 'Đã hoàn thành',
};

const activityTypeConfig = {
  started_lesson: { label: 'Bắt đầu bài học', icon: '▶', className: 'started' },
  resumed_lesson: { label: 'Tiếp tục học', icon: '⏯', className: 'resumed' },
  completed_lesson: { label: 'Hoàn thành bài học', icon: '✓', className: 'completed' },
  submitted_assessment: { label: 'Nộp bài kiểm tra', icon: '📝', className: 'assessment' },
  submitted_test: { label: 'Nộp bài thi', icon: '📝', className: 'assessment' },
  submitted_exercise: { label: 'Nộp bài tập', icon: '📝', className: 'assessment' },
  completed_course: { label: 'Hoàn thành khóa học', icon: '🏆', className: 'completed' },
};

export default function AdminStudentLearningDetailPage() {
  const { studentId } = useParams();

  const [activeTab, setActiveTab] = useState('progress'); // progress | assessments | history
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Course Progress Hierarchy
  const [courseHierarchy, setCourseHierarchy] = useState([]);
  const [progressLoading, setProgressLoading] = useState(false);
  const [openChapters, setOpenChapters] = useState({});

  // Assessments & Attempts
  const [attempts, setAttempts] = useState([]);
  const [attemptLoading, setAttemptLoading] = useState(false);

  // Learning Activity History
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPagination, setHistoryPagination] = useState({ page: 1, limit: 20, total: 0, pages: 1 });

  // 1. Load Student Detail & Learning Overview
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');

    learningApi.getStudentDetail(studentId)
      .then((res) => {
        if (active) setDetail(res.data);
      })
      .catch((err) => {
        if (active) setError(err?.response?.data?.message || 'Không thể tải thông tin học viên.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [studentId]);

  // 2. Load Course Progress Hierarchy
  useEffect(() => {
    if (activeTab !== 'progress') return;
    let active = true;
    setProgressLoading(true);

    learningApi.getStudentProgress(studentId)
      .then((res) => {
        if (!active) return;
        const courses = res.data?.courses || [];
        setCourseHierarchy(courses);
        // Default open all chapters
        const openState = {};
        courses.forEach((c) => {
          (c.chapters || []).forEach((ch) => {
            openState[`${c._id}_${ch.chapterTitle}`] = true;
          });
        });
        setOpenChapters(openState);
      })
      .catch((err) => {
        console.warn('Failed to load progress hierarchy:', err);
      })
      .finally(() => {
        if (active) setProgressLoading(false);
      });

    return () => { active = false; };
  }, [studentId, activeTab]);

  // 3. Load Exam & Exercise Results
  useEffect(() => {
    if (activeTab !== 'assessments') return;
    let active = true;
    setAttemptLoading(true);

    learningApi.getStudentAttempts(studentId, { limit: 50 })
      .then((res) => {
        if (active) setAttempts(res.data?.results || res.data?.attempts || []);
      })
      .catch((err) => {
        console.warn('Failed to load student attempts:', err);
      })
      .finally(() => {
        if (active) setAttemptLoading(false);
      });

    return () => { active = false; };
  }, [studentId, activeTab]);

  // 4. Load Learning Activity Timeline
  useEffect(() => {
    if (activeTab !== 'history') return;
    let active = true;
    setHistoryLoading(true);

    learningApi.getStudentHistory(studentId, { page: historyPage, limit: 20 })
      .then((res) => {
        if (!active) return;
        setHistory(res.data?.activities || []);
        setHistoryPagination(res.data?.pagination || { page: 1, limit: 20, total: 0, pages: 1 });
      })
      .catch((err) => {
        console.warn('Failed to load history:', err);
      })
      .finally(() => {
        if (active) setHistoryLoading(false);
      });

    return () => { active = false; };
  }, [studentId, activeTab, historyPage]);

  const toggleChapter = (key) => {
    setOpenChapters((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  if (loading) {
    return (
      <div className="admin-page-container monitoring-page">
        <div className="admin-table-skeleton"><i /><i /><i /></div>
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="admin-page-container monitoring-page">
        <div className="admin-error">{error || 'Không tìm thấy dữ liệu học viên.'}</div>
        <Link to="/admin/learning-progress" className="admin-quiet-button" style={{ alignSelf: 'flex-start' }}>
          ← Quay lại danh sách tiến độ
        </Link>
      </div>
    );
  }

  const { student, enrolledCourses = [], lastLearningActivity, learningOverview = {} } = detail;

  return (
    <div className="admin-page-container monitoring-page">
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <Link to="/admin/learning-progress" className="admin-quiet-button">
          ← Danh sách học viên
        </Link>
      </div>

      <PageHeader
        title={`Chi tiết học tập: ${student.fullName || student.email}`}
        subtitle={`Theo dõi hành trình học, bài kiểm tra và thời gian học tích lũy của ${student.fullName || student.email}`}
      />

      {/* Student Profile Card (Section 3.B) */}
      <section className="student-status-card" style={{ background: '#fff' }} aria-label="Thông tin học viên">
        <div className="student-status-card__summary">
          <div className="student-user-cell">
            {student.avatar ? (
              <img className="student-avatar-thumb" style={{ width: '48px', height: '48px' }} src={student.avatar} alt="" />
            ) : (
              <div className="student-avatar-thumb" style={{ width: '48px', height: '48px', fontSize: '18px' }}>
                {(student.fullName || student.email || 'H').charAt(0).toUpperCase()}
              </div>
            )}
            <div>
              <strong style={{ fontSize: '17px' }}>{student.fullName || 'Chưa đặt tên'}</strong>
              <span>{student.email} • {student.phoneNumber || 'Chưa có SĐT'} {student.groupName ? `• Nhóm: ${student.groupName}` : ''}</span>
              <span style={{ marginTop: '4px' }}>
                Tham gia ngày: {formatDateOnly(student.createdAt)} • Hoạt động gần nhất: <strong>{formatDateTime(lastLearningActivity)}</strong>
              </span>
            </div>
          </div>
        </div>

        <div className="student-status-card__actions">
          <Link to={`/admin/students/${student._id}`} className="admin-quiet-button">
            Xem hồ sơ tài khoản
          </Link>
        </div>
      </section>

      {/* Learning Overview KPI Cards (Section 3.B) */}
      <section className="monitoring-kpi-grid" style={{ gridTemplateColumns: 'repeat(5, minmax(0, 1fr))' }} aria-label="Tổng quan học tập">
        <div className="kpi-card">
          <span className="kpi-card-label">Tổng thời gian học</span>
          <strong className="kpi-card-value" style={{ fontSize: '20px' }}>
            {formatDuration(learningOverview.totalLearningSeconds)}
          </strong>
          <span className="kpi-card-sub">Thời gian tích lũy thực</span>
        </div>

        <div className="kpi-card">
          <span className="kpi-card-label">Đã hoàn thành</span>
          <strong className="kpi-card-value" style={{ color: '#1f6b3d' }}>
            {learningOverview.completedLessons ?? 0}
          </strong>
          <span className="kpi-card-sub">/{learningOverview.totalLessons ?? 0} bài học</span>
        </div>

        <div className="kpi-card">
          <span className="kpi-card-label">Đang học</span>
          <strong className="kpi-card-value" style={{ color: '#1b5f9e' }}>
            {learningOverview.inProgressLessons ?? 0}
          </strong>
          <span className="kpi-card-sub">Đang trong tiến trình</span>
        </div>

        <div className="kpi-card">
          <span className="kpi-card-label">Chưa bắt đầu</span>
          <strong className="kpi-card-value" style={{ color: '#7a7369' }}>
            {learningOverview.notStartedLessons ?? 0}
          </strong>
          <span className="kpi-card-sub">Chưa truy cập</span>
        </div>

        <div className="kpi-card">
          <span className="kpi-card-label">Tiến độ tổng quan</span>
          <strong className="kpi-card-value">
            {learningOverview.overallCompletionPercentage ?? 0}%
          </strong>
          <span className="kpi-card-sub">Toàn bộ khóa học</span>
        </div>
      </section>

      {/* Detail Tabs Bar */}
      <div className="detail-tabs-bar" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'progress'}
          className={`detail-tab-button ${activeTab === 'progress' ? 'active' : ''}`}
          onClick={() => setActiveTab('progress')}
        >
          📚 Tiến độ khóa học
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'assessments'}
          className={`detail-tab-button ${activeTab === 'assessments' ? 'active' : ''}`}
          onClick={() => setActiveTab('assessments')}
        >
          📝 Kết quả bài tập & đề thi
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'history'}
          className={`detail-tab-button ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          ⏱ Nhật ký hoạt động
        </button>
      </div>

      {/* TAB 1: Course Progress Hierarchy: Course → Chapter → Lesson (Section 3.B) */}
      {activeTab === 'progress' && (
        <section aria-label="Tiến độ chi tiết từng bài học">
          {progressLoading ? (
            <div className="admin-table-skeleton"><i /><i /><i /></div>
          ) : courseHierarchy.length === 0 ? (
            <div className="admin-empty">Học viên chưa ghi danh khóa học nào hoặc khóa học chưa có bài học xuất bản.</div>
          ) : (
            courseHierarchy.map((course) => (
              <div key={course._id} style={{ marginBottom: '28px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '18px', color: 'var(--brand-coffee)' }}>{course.title}</h3>
                    <span style={{ fontSize: '12px', color: 'var(--brand-muted)' }}>
                      Cấp độ: {course.level || 'Cơ bản'} • {course.englishType || 'TOEIC'} • {course.completedLessons}/{course.totalLessons} bài hoàn thành ({course.completionPercentage}%)
                    </span>
                  </div>
                  <div style={{ width: '140px' }}>
                    <div className="progress-track">
                      <div className={`progress-fill ${course.completionPercentage === 100 ? 'completed' : ''}`} style={{ width: `${course.completionPercentage}%` }} />
                    </div>
                  </div>
                </div>

                {course.chapters && course.chapters.length > 0 ? (
                  course.chapters.map((chap) => {
                    const chapterKey = `${course._id}_${chap.chapterTitle}`;
                    const isOpen = Boolean(openChapters[chapterKey]);

                    return (
                      <div key={chapterKey} className="chapter-accordion">
                        <div className="chapter-accordion-header" onClick={() => toggleChapter(chapterKey)}>
                          <div>
                            <strong>📖 {chap.chapterTitle}</strong>
                            <span style={{ marginLeft: '10px', fontSize: '12px', color: 'var(--brand-muted)' }}>
                              ({chap.completedLessons}/{chap.totalLessons} bài xong)
                            </span>
                          </div>
                          <span style={{ fontSize: '12px', color: 'var(--brand-muted)' }}>
                            {isOpen ? '▲ Thu gọn' : '▼ Mở rộng'}
                          </span>
                        </div>

                        {isOpen && (
                          <div className="chapter-accordion-body">
                            <table className="monitoring-table">
                              <thead>
                                <tr>
                                  <th style={{ width: '40px' }}>#</th>
                                  <th>Bài học</th>
                                  <th>Trạng thái</th>
                                  <th>Lần cuối học</th>
                                  <th>Thời gian tích lũy</th>
                                  <th>Lượt xem</th>
                                  <th>Ngày hoàn thành</th>
                                </tr>
                              </thead>
                              <tbody>
                                {chap.lessons.map((lesson, idx) => (
                                  <tr key={lesson._id}>
                                    <td style={{ color: 'var(--brand-muted)' }}>{lesson.order || idx + 1}</td>
                                    <td>
                                      <strong>{lesson.title}</strong>
                                      {lesson.duration > 0 && (
                                        <span style={{ display: 'block', fontSize: '11px', color: 'var(--brand-muted)' }}>
                                          Thời lượng thiết kế: {lesson.duration} phút
                                        </span>
                                      )}
                                    </td>
                                    <td>
                                      <span className={`learning-status-badge ${lesson.status}`}>
                                        {statusLabels[lesson.status] || lesson.status}
                                      </span>
                                    </td>
                                    <td style={{ fontSize: '12px', whiteSpace: 'nowrap' }}>
                                      {formatDateTime(lesson.lastAccessedTime)}
                                    </td>
                                    <td style={{ fontWeight: 700, color: 'var(--brand-coffee)' }}>
                                      {formatDuration(lesson.totalActiveDuration)}
                                    </td>
                                    <td>
                                      <strong>{lesson.numberOfVisits || 0}</strong> lần
                                    </td>
                                    <td style={{ fontSize: '12px', whiteSpace: 'nowrap' }}>
                                      {formatDateTime(lesson.completionDate)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <div className="admin-empty">Khóa học chưa có bài học nào.</div>
                )}
              </div>
            ))
          )}
        </section>
      )}

      {/* TAB 2: Exam & Exercise Results (Section 3.E) */}
      {activeTab === 'assessments' && (
        <section aria-label="Kết quả bài tập và đề thi">
          {attemptLoading ? (
            <div className="admin-table-skeleton"><i /><i /><i /></div>
          ) : attempts.length === 0 ? (
            <div className="admin-empty">Học viên chưa thực hiện bài tập hoặc đề thi nào.</div>
          ) : (
            <div className="monitoring-table-container">
              <table className="monitoring-table">
                <thead>
                  <tr>
                    <th>Ngày làm bài</th>
                    <th>Bài thi / Bài tập</th>
                    <th>Điểm số</th>
                    <th>Đúng / Sai</th>
                    <th>Thời gian làm</th>
                    <th>Lần làm</th>
                    <th>Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {attempts.map((att) => {
                    const assessmentTitle = att.assessment?.title || att.__assessment?.title || 'Bài đánh giá';
                    const scoreText = Number.isFinite(att.score)
                      ? `${att.score}${att.maxScore ? ` / ${att.maxScore}` : ''}`
                      : '—';
                    const percentage = att.scorePercentage ?? (att.maxScore > 0 ? Math.round((att.score / att.maxScore) * 100) : null);

                    return (
                      <tr key={att._id}>
                        <td style={{ whiteSpace: 'nowrap', fontSize: '12px' }}>
                          {formatDateTime(att.submittedAt || att.startedAt)}
                        </td>
                        <td>
                          <strong>{assessmentTitle}</strong>
                          <span style={{ display: 'block', fontSize: '11px', color: 'var(--brand-muted)' }}>
                            {att.engine === 'toeic' ? 'Đề thi TOEIC' : 'Bài kiểm tra chuẩn'}
                          </span>
                        </td>
                        <td>
                          <strong style={{ color: 'var(--brand-coffee)' }}>{scoreText}</strong>
                          {percentage !== null && (
                            <span style={{ display: 'block', fontSize: '11px', color: percentage >= 50 ? '#1f6b3d' : '#b91c1c' }}>
                              ({percentage}%)
                            </span>
                          )}
                        </td>
                        <td>
                          <span style={{ color: '#1f6b3d', fontWeight: 700 }}>✓ {att.correctCount ?? '—'}</span>
                          {' / '}
                          <span style={{ color: '#b91c1c', fontWeight: 700 }}>✗ {att.incorrectCount ?? '—'}</span>
                        </td>
                        <td style={{ fontSize: '12px' }}>
                          {att.duration ? formatDuration(att.duration) : '—'}
                        </td>
                        <td>
                          {att.attemptNumber || att.revision || 1}
                        </td>
                        <td>
                          <span className={`status-badge ${att.status === 'completed' || att.status === 'submitted' ? 'active' : 'pending'}`}>
                            {att.status === 'completed' || att.status === 'submitted' ? 'Đã hoàn thành' : 'Đang làm'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* TAB 3: Learning History Timeline (Section 3.F) */}
      {activeTab === 'history' && (
        <section aria-label="Lịch sử hoạt động học tập">
          {historyLoading ? (
            <div className="admin-table-skeleton"><i /><i /><i /></div>
          ) : history.length === 0 ? (
            <div className="admin-empty">Chưa có nhật ký hoạt động học tập nào được ghi nhận.</div>
          ) : (
            <>
              <div className="timeline-list">
                {history.map((act) => {
                  const cfg = activityTypeConfig[act.eventType] || { label: act.eventType, icon: '•', className: '' };
                  const targetTitle = act.lesson?.title || act.assessment?.title || act.course?.title || act.metadata?.lessonTitle || act.metadata?.assessmentTitle || '';

                  return (
                    <div key={act._id} className="timeline-item">
                      <div className={`timeline-dot ${cfg.className}`}>
                        {cfg.icon}
                      </div>
                      <div className="timeline-content">
                        <div className="timeline-header">
                          <span className="timeline-title">{cfg.label}</span>
                          <span className="timeline-time">{formatDateTime(act.timestamp)}</span>
                        </div>
                        {targetTitle && (
                          <div style={{ marginTop: '4px', fontWeight: 600, color: 'var(--brand-coffee)' }}>
                            {targetTitle}
                          </div>
                        )}
                        {act.course?.title && act.lesson?.title && (
                          <div className="timeline-meta">
                            Khóa học: {act.course.title}
                          </div>
                        )}
                        {act.metadata?.score !== undefined && (
                          <div className="timeline-meta">
                            Điểm số: {act.metadata.score}/{act.metadata.maxScore} ({act.metadata.percentage}%)
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {historyPagination.pages > 1 && (
                <nav className="admin-pagination" style={{ marginTop: '16px' }} aria-label="Phân trang nhật ký">
                  <button
                    type="button"
                    disabled={historyPage <= 1}
                    onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                  >
                    Trước
                  </button>
                  <span>Trang {historyPage} / {historyPagination.pages}</span>
                  <button
                    type="button"
                    disabled={historyPage >= historyPagination.pages}
                    onClick={() => setHistoryPage((p) => Math.min(historyPagination.pages, p + 1))}
                  >
                    Sau
                  </button>
                </nav>
              )}
            </>
          )}
        </section>
      )}
    </div>
  );
}
