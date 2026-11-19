import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import learningApi from '../../api/learningApi.js';
import PageHeader from '../../components/ui/PageHeader.jsx';
import ExerciseSubmissionTree from '../../components/learning/ExerciseSubmissionTree.jsx';
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

export default function AdminStudentLearningDetailPage() {
  const { studentId } = useParams();

  const [activeTab, setActiveTab] = useState('progress');
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

  const [dailyStudy, setDailyStudy] = useState(null);
  const [dailyStudyLoading, setDailyStudyLoading] = useState(false);
  const [exerciseSubmissions, setExerciseSubmissions] = useState([]);
  const [exerciseLoading, setExerciseLoading] = useState(false);
  const [exerciseError, setExerciseError] = useState('');

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

    learningApi.getStudentAttempts(studentId, { limit: 50, state: 'COMPLETED_SCORED' })
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

  useEffect(() => {
    if (activeTab !== 'daily-study') return;
    let active = true;
    setDailyStudyLoading(true);
    learningApi.getStudentDailyStudy(studentId)
      .then((res) => { if (active) setDailyStudy(res.data); })
      .catch((err) => {
        if (active) setDailyStudy({ error: err?.response?.data?.message || 'Không thể tải thời gian học theo ngày.' });
      })
      .finally(() => { if (active) setDailyStudyLoading(false); });
    return () => { active = false; };
  }, [studentId, activeTab]);

  useEffect(() => {
    if (activeTab !== 'exercises') return;
    let active = true;
    setExerciseLoading(true);
    setExerciseError('');
    learningApi.getStudentExerciseSubmissions(studentId)
      .then((res) => {
        if (!active) return;
        setExerciseSubmissions(res.data?.submissions || []);
      })
      .catch((err) => {
        if (active) {
          setExerciseSubmissions([]);
          setExerciseError(err?.response?.data?.message || 'Không thể tải lịch sử nộp bài tập.');
          console.warn('Failed to load exercise submissions:', err);
        }
      })
      .finally(() => { if (active) setExerciseLoading(false); });
    return () => { active = false; };
  }, [studentId, activeTab]);

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
                {' '}• Trạng thái: <strong>{student.activityStatus === 'ACTIVE' ? 'Đang hoạt động' : 'Không hoạt động'}</strong>
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
      <section className="monitoring-kpi-grid monitoring-kpi-grid--detail" aria-label="Tổng quan học tập">
        <div className="kpi-card">
          <span className="kpi-card-label">Tổng thời gian học</span>
          <strong className="kpi-card-value" style={{ fontSize: '20px' }}>
            {formatDuration(learningOverview.totalLearningSeconds)}
          </strong>
          <span className="kpi-card-sub">Thời gian tích lũy thực</span>
        </div>

        <div className="kpi-card">
          <span className="kpi-card-label">Thời gian hôm nay</span>
          <strong className="kpi-card-value" style={{ fontSize: '20px' }}>
            {formatDuration(learningOverview.studyTodaySeconds)}
          </strong>
          <span className="kpi-card-sub">Theo ngày Việt Nam</span>
        </div>

        <div className="kpi-card">
          <span className="kpi-card-label">TB mỗi ngày học</span>
          <strong className="kpi-card-value" style={{ fontSize: '20px' }}>
            {formatDuration(learningOverview.averageDailyStudySeconds)}
          </strong>
          <span className="kpi-card-sub">30 ngày gần nhất · {learningOverview.studyDaysInLast30Days || 0} ngày có học</span>
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
          aria-selected={activeTab === 'daily-study'}
          className={`detail-tab-button ${activeTab === 'daily-study' ? 'active' : ''}`}
          onClick={() => setActiveTab('daily-study')}
        >
          📅 Thời gian theo ngày
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'assessments'}
          className={`detail-tab-button ${activeTab === 'assessments' ? 'active' : ''}`}
          onClick={() => setActiveTab('assessments')}
        >
          🧾 Đề thi TOEIC
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'exercises'}
          className={`detail-tab-button ${activeTab === 'exercises' ? 'active' : ''}`}
          onClick={() => setActiveTab('exercises')}
        >
          ✍️ Lịch sử bài tập
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
                            <div className="lesson-progress-list">
                              {chap.lessons.map((lesson, idx) => (
                                <article className={`lesson-progress-card is-${String(lesson.status || 'NOT_STARTED').toLowerCase()}`} key={lesson._id}>
                                  <div className="lesson-progress-card__main">
                                    <span className="lesson-progress-card__number">{lesson.order || idx + 1}</span>
                                    <div className="lesson-progress-card__copy">
                                      <strong>{lesson.title}</strong>
                                      <span>{lesson.duration > 0 ? `Thời lượng dự kiến ${lesson.duration} phút` : 'Bài học'}</span>
                                    </div>
                                    <span className={`learning-status-badge ${String(lesson.status || 'NOT_STARTED').toUpperCase()}`}>
                                      {lesson.status === 'COMPLETED' ? 'Đã hoàn thành' : lesson.status === 'IN_PROGRESS' ? 'Đang học' : 'Chưa học'}
                                    </span>
                                  </div>
                                  <div className="lesson-progress-card__meta">
                                    <span><b>Thời gian học</b>{formatDuration(lesson.totalActiveDuration)}</span>
                                    <span><b>Lượt truy cập</b>{lesson.numberOfVisits || 0}</span>
                                    <span><b>Hoạt động gần nhất</b>{formatDateTime(lesson.lastAccessedTime)}</span>
                                    {lesson.completionDate && <span><b>Hoàn thành lúc</b>{formatDateTime(lesson.completionDate)}</span>}
                                  </div>
                                </article>
                              ))}
                            </div>
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

      {activeTab === 'daily-study' && (
        <section aria-label="Thời gian học theo ngày">
          {dailyStudyLoading ? (
            <div className="admin-table-skeleton"><i /><i /><i /></div>
          ) : dailyStudy?.error ? (
            <div className="admin-error">{dailyStudy.error}</div>
          ) : (
            <>
              {(dailyStudy?.rows || []).length === 0 ? (
                <div className="admin-empty">Chưa có thời gian hoạt động nào được ghi nhận. Dữ liệu bắt đầu tích lũy từ khi tracker được triển khai.</div>
              ) : (
                <div className="monitoring-table-container">
                  <table className="monitoring-table">
                    <thead>
                      <tr><th>Ngày (giờ Việt Nam)</th><th>Thời gian hoạt động</th><th>Hoạt động cuối ngày</th></tr>
                    </thead>
                    <tbody>
                      {dailyStudy.rows.map((row) => (
                        <tr key={row._id}>
                          <td>{row.dateKey}</td>
                          <td><strong>{formatDuration(row.activeSeconds)}</strong></td>
                          <td>{formatDateTime(row.lastActiveAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </section>
      )}

      {/* TOEIC assessments remain in their own Attempt history. */}
      {activeTab === 'assessments' && (
        <section aria-label="Lịch sử nộp đề thi TOEIC">
          {attemptLoading ? (
            <div className="admin-table-skeleton"><i /><i /><i /></div>
          ) : attempts.length === 0 ? (
            <div className="admin-empty">Học viên chưa nộp đề thi TOEIC nào.</div>
          ) : (
            <div className="monitoring-table-container">
              <table className="monitoring-table">
                <thead>
                  <tr>
                    <th>Ngày làm bài</th>
                    <th>Assessment</th>
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

      {activeTab === 'exercises' && (
        <section aria-label="Lịch sử nộp bài tập">
          <div className="admin-exercise-history-heading">
            <h2>Lịch sử bài tập</h2>
            {!exerciseLoading && !exerciseError && <span>{exerciseSubmissions.length} lượt nộp</span>}
          </div>
          <ExerciseSubmissionTree
            submissions={exerciseSubmissions}
            loading={exerciseLoading}
            error={exerciseError}
          />
        </section>
      )}
    </div>
  );
}
