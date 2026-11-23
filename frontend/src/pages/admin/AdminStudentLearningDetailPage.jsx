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

const formatLessonDuration = (totalSeconds) => {
  const seconds = Math.max(0, Number(totalSeconds) || 0);
  if (seconds < 60) return `${seconds} giây`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes} phút${remainingSeconds ? ` ${remainingSeconds} giây` : ''}`;
};

const lessonStatusLabels = {
  COMPLETED: 'Đã hoàn thành',
  IN_PROGRESS: 'Đang học',
  NOT_STARTED: 'Chưa bắt đầu',
};

const formatWeekDate = (value) => {
  if (!value) return '—';
  try {
    return new Intl.DateTimeFormat('vi-VN', {
      day: 'numeric',
      month: 'short',
      timeZone: 'Asia/Ho_Chi_Minh',
    }).format(new Date(`${value}T12:00:00Z`));
  } catch {
    return value;
  }
};

const createWeeklyStudyDays = (dailyStudy) => {
  if (!dailyStudy?.weekStartDateKey) return [];
  const [year, month, day] = dailyStudy.weekStartDateKey.split('-').map(Number);
  const secondsByDate = new Map((dailyStudy.rows || []).map((row) => [row.dateKey, Number(row.activeSeconds) || 0]));

  return Array.from({ length: 7 }, (_, offset) => {
    const date = new Date(Date.UTC(year, month - 1, day + offset, 12));
    const dateKey = date.toISOString().slice(0, 10);
    const weekday = new Intl.DateTimeFormat('vi-VN', {
      weekday: 'short',
      timeZone: 'Asia/Ho_Chi_Minh',
    }).format(date);
    return {
      dateKey,
      label: weekday,
      activeSeconds: secondsByDate.get(dateKey) || 0,
    };
  });
};

export default function AdminStudentLearningDetailPage() {
  const { studentId } = useParams();

  const [activeTab, setActiveTab] = useState('learning-progress');
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [learningProgress, setLearningProgress] = useState(null);
  const [learningProgressLoading, setLearningProgressLoading] = useState(false);
  const [learningProgressError, setLearningProgressError] = useState('');

  // Assessments & Attempts
  const [attempts, setAttempts] = useState([]);
  const [attemptLoading, setAttemptLoading] = useState(false);

  const [dailyStudy, setDailyStudy] = useState(null);
  const [dailyStudyLoading, setDailyStudyLoading] = useState(false);
  const [exerciseSubmissions, setExerciseSubmissions] = useState([]);
  const [exerciseLoading, setExerciseLoading] = useState(false);
  const [exerciseError, setExerciseError] = useState('');
  const [streakDetail, setStreakDetail] = useState(null);
  const [streakActivity, setStreakActivity] = useState(null);

  // 1. Load Student Detail & Learning Overview
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    setLearningProgress(null);
    setLearningProgressError('');

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

  useEffect(() => {
    let active = true;
    Promise.all([
      learningApi.getStudentStreak(studentId),
      learningApi.getStudentStreakActivity(studentId, 30),
    ]).then(([streakResponse, activityResponse]) => {
      if (!active) return;
      setStreakDetail(streakResponse.data);
      setStreakActivity(activityResponse.data);
    }).catch(() => {
      if (active) { setStreakDetail(null); setStreakActivity(null); }
    });
    return () => { active = false; };
  }, [studentId]);

  useEffect(() => {
    if (activeTab !== 'learning-progress' || learningProgress) return;
    let active = true;
    setLearningProgressLoading(true);
    setLearningProgressError('');

    learningApi.getStudentProgress(studentId)
      .then((res) => {
        if (active) setLearningProgress(res.data || { courses: [] });
      })
      .catch((err) => {
        if (active) {
          setLearningProgressError(err?.response?.data?.message || 'Không thể tải tiến độ từng bài học.');
        }
      })
      .finally(() => {
        if (active) setLearningProgressLoading(false);
      });

    return () => { active = false; };
  }, [studentId, activeTab, learningProgress]);

  // 2. Load Exam & Exercise Results
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

  const { student, lastLearningActivity, learningOverview = {} } = detail;
  const adminStreak = streakDetail?.streak || learningOverview.streak || {};
  const adminToday = streakDetail?.today || learningOverview.dailyGoal || {};
  const streakCalendar = streakDetail?.calendar || [];
  const activityRows = streakActivity?.rows || [];
  const maxActivitySeconds = Math.max(900, ...activityRows.map((row) => Number(row.validStudySeconds) || 0));
  const weeklyStudyDays = createWeeklyStudyDays(dailyStudy);
  const maxWeeklyStudySeconds = Math.max(1, ...weeklyStudyDays.map((day) => day.activeSeconds));
  const exerciseSummary = exerciseSubmissions.reduce((summary, submission) => ({
    attempts: summary.attempts + 1,
    questions: summary.questions + (Number(submission.total) || submission.questions?.length || 0),
    correct: summary.correct + (Number(submission.correctCount) || 0),
  }), { attempts: 0, questions: 0, correct: 0 });

  return (
    <div className="admin-page-container monitoring-page">
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <Link to="/admin/learning-progress" className="admin-quiet-button">
          ← Danh sách học viên
        </Link>
      </div>

      <PageHeader
        title={`Chi tiết học tập: ${student.fullName || student.email}`}
        subtitle={`Xem học viên đã học gì, tiến độ từng bài và lịch sử làm bài của ${student.fullName || student.email}`}
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

        <div className="kpi-card">
          <span className="kpi-card-label">Tiến độ lộ trình</span>
          <strong className="kpi-card-value kpi-card-value--progress" style={{ fontSize: '20px' }}>
            {learningOverview.overallCompletionPercentage || 0}%
          </strong>
          <span className="kpi-card-sub">{learningOverview.completedLessons || 0}/{learningOverview.totalLessons || 0} bài đã hoàn thành</span>
        </div>

      </section>

      <section className="admin-streak-detail-card" aria-labelledby="admin-streak-title">
        <div className="admin-streak-detail-header">
          <div><span className="kpi-card-label">LEARNING STREAK</span><h2 id="admin-streak-title">Theo dõi chuỗi học</h2><p>Thời gian hợp lệ được tổng hợp từ các phiên học thực tế.</p></div>
          <div className="admin-streak-detail-number"><strong>{adminStreak.currentStreak || 0}</strong><span>ngày hiện tại</span></div>
        </div>
        <div className="admin-streak-detail-stats"><div><span>Kỷ lục dài nhất</span><strong>{adminStreak.longestStreak || 0} ngày</strong></div><div><span>Ngày đã hoàn thành</span><strong>{adminStreak.totalCompletedDays || 0}</strong></div><div><span>Cấp ngọn lửa</span><strong>{adminStreak.tierName || `Tier ${adminStreak.currentTier || 0}`}</strong></div><div><span>Mục tiêu hôm nay</span><strong>{Math.floor((adminToday.validStudySeconds || 0) / 60)} / 15 phút</strong></div></div>
        <div className="admin-streak-progress" role="progressbar" aria-valuemin="0" aria-valuemax="900" aria-valuenow={Math.min(900, adminToday.validStudySeconds || 0)}><span style={{ width: `${Math.min(100, Math.round(((adminToday.validStudySeconds || 0) / 900) * 100))}%` }} /></div>
        <div className="admin-streak-calendar" aria-label="Lịch learning streak 35 ngày">{streakCalendar.map((day) => <div key={day.dateKey} className={`admin-streak-day is-${day.status}`} title={`${day.dateKey}: ${day.validStudySeconds || 0} giây`}><span>{day.dateKey.slice(5)}</span><i /></div>)}</div>
        <div className="admin-streak-chart-wrap"><div className="admin-streak-chart-heading"><h3>Thời lượng học hợp lệ</h3><span>30 ngày gần nhất · đường mục tiêu 15 phút</span></div><div className="admin-streak-chart" role="img" aria-label="Biểu đồ thời lượng học hợp lệ 30 ngày">{activityRows.map((row) => <div className="admin-streak-chart-bar" key={row.localDate} title={`${row.localDate}: ${Math.floor((row.validStudySeconds || 0) / 60)} phút`}><span style={{ height: `${Math.max(3, Math.round(((row.validStudySeconds || 0) / maxActivitySeconds) * 100))}%` }} /><small>{row.localDate.slice(8)}</small></div>)}</div></div>
      </section>

      {/* Detail Tabs Bar */}
      <div className="detail-tabs-bar" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'learning-progress'}
          className={`detail-tab-button ${activeTab === 'learning-progress' ? 'active' : ''}`}
          onClick={() => setActiveTab('learning-progress')}
        >
          📚 Lộ trình & bài học
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
          ✍️ Bài tập đã làm
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'daily-study'}
          className={`detail-tab-button ${activeTab === 'daily-study' ? 'active' : ''}`}
          onClick={() => setActiveTab('daily-study')}
        >
          📊 Thời gian học tuần này
        </button>
      </div>

      {activeTab === 'learning-progress' && (
        <section className="learning-progress-section" aria-label="Tiến độ lộ trình và từng bài học">
          {learningProgressLoading ? (
            <div className="admin-table-skeleton"><i /><i /><i /></div>
          ) : learningProgressError ? (
            <div className="admin-error">{learningProgressError}</div>
          ) : !learningProgress?.courses?.length ? (
            <div className="admin-empty">Học viên chưa được ghi nhận trong khóa học nào có bài học đã xuất bản.</div>
          ) : (
            <>
              <div className="learning-progress-intro">
                <div>
                  <h2>Lộ trình học</h2>
                  <p>Trạng thái được tính từ lịch sử truy cập, thời gian học và thao tác hoàn thành bài.</p>
                </div>
                <div className="learning-progress-intro__summary">
                  <strong>{learningProgress.courses.reduce((sum, course) => sum + (course.completedLessons || 0), 0)}</strong>
                  <span>/ {learningProgress.courses.reduce((sum, course) => sum + (course.totalLessons || 0), 0)} bài hoàn thành</span>
                </div>
              </div>

              <div className="course-progress-list">
                {learningProgress.courses.map((course) => (
                  <details className="course-progress-card" key={course._id} open>
                    <summary className="course-progress-card__header">
                      <div>
                        <h3>{course.title}</h3>
                        <span>{course.level || 'Khóa học'}{course.englishType ? ` · ${course.englishType}` : ''}</span>
                      </div>
                      <div className="course-progress-card__score">
                        <strong>{course.completionPercentage || 0}%</strong>
                        <span>{course.completedLessons || 0}/{course.totalLessons || 0} bài</span>
                      </div>
                    </summary>

                    <div className="course-progress-card__body">
                      <div className="course-progress-bar" aria-label={`Tiến độ ${course.completionPercentage || 0}%`} role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={course.completionPercentage || 0}>
                        <span style={{ width: `${Math.min(100, Math.max(0, course.completionPercentage || 0))}%` }} />
                      </div>

                      <div className="course-chapter-list">
                        {course.chapters.map((chapter) => (
                          <details className="course-chapter-card" key={`${course._id}-${chapter.chapterTitle}`} open>
                            <summary className="course-chapter-card__header">
                              <span>{chapter.chapterTitle}</span>
                              <b>{chapter.completedLessons || 0}/{chapter.totalLessons || 0} bài hoàn thành</b>
                            </summary>
                            <div className="lesson-progress-list">
                              {chapter.lessons.map((lesson, lessonIndex) => {
                                const percentage = Number(lesson.progress) === 100 || lesson.status === 'COMPLETED' ? 100 : 0;
                                return (
                                  <article className="lesson-progress-card" key={lesson._id}>
                                    <div className="lesson-progress-card__main">
                                      <span className="lesson-progress-card__number">{lesson.order || lessonIndex + 1}</span>
                                      <div className="lesson-progress-card__copy">
                                        <strong>{lesson.title}</strong>
                                        <span>{lesson.duration ? `${lesson.duration} phút dự kiến` : 'Bài học'}</span>
                                      </div>
                                      <span className={`learning-status-badge ${lesson.status}`}>
                                        {lessonStatusLabels[lesson.status] || 'Chưa xác định'}
                                      </span>
                                    </div>
                                    <div className="lesson-progress-card__bar" aria-label={`Tiến độ bài học ${percentage}%`} role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={percentage}>
                                      <span className={lesson.status === 'COMPLETED' ? 'is-completed' : ''} style={{ width: `${percentage}%` }} />
                                    </div>
                                    <div className="lesson-progress-card__meta">
                                      <span><b>Tiến độ</b>{percentage}%</span>
                                      <span><b>Thời gian học</b>{formatLessonDuration(lesson.totalActiveDuration)}</span>
                                      <span><b>Số lần truy cập</b>{lesson.numberOfVisits || 0} lần</span>
                                      <span><b>Lần cuối truy cập</b>{formatDateTime(lesson.lastAccessedTime)}</span>
                                    </div>
                                  </article>
                                );
                              })}
                            </div>
                          </details>
                        ))}
                      </div>
                    </div>
                  </details>
                ))}
              </div>
            </>
          )}
        </section>
      )}

      {activeTab === 'daily-study' && (
        <section className="weekly-study-card" aria-label="Biểu đồ thời gian học trong tuần">
          {dailyStudyLoading ? (
            <div className="admin-table-skeleton"><i /><i /><i /></div>
          ) : dailyStudy?.error ? (
            <div className="admin-error">{dailyStudy.error}</div>
          ) : (
            <>
              <header className="weekly-study-header">
                <div>
                  <h2>Thời gian học tuần này</h2>
                </div>
                <span>{formatWeekDate(dailyStudy?.weekStartDateKey)} – {formatWeekDate(dailyStudy?.weekEndDateKey)}</span>
              </header>
              {weeklyStudyDays.length === 0 ? (
                <div className="admin-empty">Chưa thể tải dữ liệu tuần học này.</div>
              ) : (
                <div className="weekly-study-chart-scroll">
                  <div className="weekly-study-chart" role="img" aria-label="Thời gian học từng ngày từ thứ Hai đến Chủ Nhật">
                    {weeklyStudyDays.map((day) => {
                      const barHeight = day.activeSeconds > 0
                        ? Math.max(5, Math.round((day.activeSeconds / maxWeeklyStudySeconds) * 100))
                        : 0;
                      return (
                        <div className="weekly-study-day" key={day.dateKey}>
                          <strong className="weekly-study-day__value">{formatDuration(day.activeSeconds)}</strong>
                          <div className="weekly-study-day__track" aria-hidden="true">
                            <span style={{ height: `${barHeight}%` }} />
                          </div>
                          <span className="weekly-study-day__label">{day.label}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {weeklyStudyDays.length > 0 && weeklyStudyDays.every((day) => day.activeSeconds === 0) && (
                <p className="weekly-study-empty-note">Chưa có thời gian học được ghi nhận trong tuần này.</p>
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
          {!exerciseLoading && !exerciseError && exerciseSubmissions.length > 0 && (
            <div className="exercise-history-summary" aria-label="Tổng quan kết quả bài tập">
              <div><strong>{exerciseSummary.attempts}</strong><span>lượt nộp</span></div>
              <div><strong>{exerciseSummary.correct}/{exerciseSummary.questions}</strong><span>câu đúng</span></div>
              <div><strong>{exerciseSummary.questions > 0 ? Math.round((exerciseSummary.correct / exerciseSummary.questions) * 100) : 0}%</strong><span>tỷ lệ đúng</span></div>
              <p>Mở từng lượt làm bên dưới để xem học viên đã trả lời gì ở từng câu.</p>
            </div>
          )}
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
