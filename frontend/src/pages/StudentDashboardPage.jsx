import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { progressApi } from '../api/progressApi.js';
import './StudentDashboardPage.css';

export default function StudentDashboardPage() {
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    document.title = 'Trang chủ học tập | Ms Uyen';
    fetchDashboard();
  }, []);

  const fetchDashboard = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await progressApi.getStudentDashboard();
      if (res.status === 'success') {
        setDashboard(res.data);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể tải dữ liệu bảng điều khiển học viên');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="student-dashboard-page">
        <div className="dashboard-loading">Đang tải bảng điều khiển học tập Ms Uyen...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="student-dashboard-page">
        <div className="dashboard-error-card">{error}</div>
      </div>
    );
  }

  const studentName = dashboard?.studentName || 'Học viên';
  const avatarValue = typeof dashboard?.studentAvatar === 'string' ? dashboard.studentAvatar.trim() : '';
  const avatarSource = /^https:\/\//i.test(avatarValue) || /^\/(?!\/)/.test(avatarValue) ? avatarValue : '';
  const avatarInitials = studentName.split(/\s+/).filter(Boolean).slice(-2).map((part) => part[0]).join('').toLocaleUpperCase('vi-VN') || 'HV';

  return (
    <div className="student-dashboard-page">
      {/* Welcome Banner */}
      <div className="dashboard-welcome-banner">
        <div className="welcome-identity">
          <div className="dashboard-student-avatar" role="img" aria-label={`Ảnh đại diện ${studentName}`}>
            <span aria-hidden="true">{avatarInitials}</span>
            {avatarSource && <img src={avatarSource} alt="" onError={(event) => event.currentTarget.remove()} />}
          </div>
          <div className="welcome-text">
            <h1>Xin chào, {studentName}! 👋</h1>
            <p>Hôm nay mình tiếp tục tiến trình học tập cùng Ms Uyen nhé.</p>
          </div>
        </div>
        <div className="quick-nav-pills">
          <Link to="/student/my-courses" className="quick-pill">📚 Bài học</Link>
          <Link to="/student/assessments" className="quick-pill">⚡ Luyện tập</Link>
          <Link to="/student/toeic" className="quick-pill">🏆 Thi thử TOEIC</Link>
        </div>
      </div>

      {/* Overview Metrics Cards */}
      <div className="dashboard-metrics-grid">
        <div className="metric-card">
          <div className="metric-icon lesson-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
            </svg>
          </div>
          <div className="metric-info">
            <div className="metric-value">{dashboard?.totalAvailableLessons || 0}</div>
            <div className="metric-label">Tổng bài học</div>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-icon completed-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
              <polyline points="22 4 12 14.01 9 11.01"></polyline>
            </svg>
          </div>
          <div className="metric-info">
            <div className="metric-value">{dashboard?.completedLessons || 0}</div>
            <div className="metric-label">Đã hoàn thành</div>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-icon progress-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
          </div>
          <div className="metric-info">
            <div className="metric-value">{dashboard?.inProgressLessons || 0}</div>
            <div className="metric-label">Đang học dở</div>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-icon overall-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
            </svg>
          </div>
          <div className="metric-info">
            <div className="metric-value">{dashboard?.overallProgress || 0}%</div>
            <div className="metric-label">Tiến độ tổng thể</div>
          </div>
        </div>
      </div>

      {/* Continue Learning Highlight Banner */}
      {dashboard?.continueLearningLesson ? (
        <div className="continue-learning-card">
          <div className="continue-content">
            <div className="badge-continue">TIẾP TỤC HỌC</div>
            <h2>{dashboard.continueLearningLesson.title}</h2>
            <p>{dashboard.continueLearningLesson.description || 'Tiếp tục bài học gần nhất để hoàn thành mục tiêu học tập.'}</p>
            <div className="progress-bar-outer">
              <div
                className="progress-bar-inner"
                style={{ width: `${dashboard.continueLearningLesson.progress || 0}%` }}
              />
            </div>
            <div className="progress-text">{dashboard.continueLearningLesson.progress || 0}% hoàn thành</div>
          </div>
          <div className="continue-action">
            <Link
              to={`/student/courses/${dashboard.continueLearningLesson.course?._id || dashboard.continueLearningLesson.course}/lessons/${dashboard.continueLearningLesson._id}`}
              className="btn-continue"
            >
              Học Tiếp Ngay →
            </Link>
          </div>
        </div>
      ) : (
        <div className="continue-learning-card empty-continue">
          <div>
            <h3>Sẵn sàng bắt đầu bài học mới?</h3>
            <p>Khám phá danh sách bài học do Ms Uyen biên soạn.</p>
          </div>
          <Link to="/student/my-courses" className="btn-continue">Khám Phá Bài Học →</Link>
        </div>
      )}

      <div className="dashboard-two-columns dashboard-discovery-grid">
        <section className="dashboard-section-card" aria-labelledby="dashboard-recent-lessons-title">
          <div className="section-card-header">
            <h3 id="dashboard-recent-lessons-title">Bài học mới</h3>
            <Link to="/student/my-courses" className="link-see-all">Khóa học của tôi →</Link>
          </div>
          {dashboard?.recentLessons?.length ? (
            <div className="dashboard-discovery-list">
              {dashboard.recentLessons.map((lesson) => (
                <Link
                  key={lesson._id}
                  className="dashboard-discovery-item"
                  to={`/student/courses/${lesson.course?._id || lesson.course}/lessons/${lesson._id}`}
                >
                  <span><strong>{lesson.title}</strong><small>{lesson.course?.title || 'Bài học'}</small></span>
                  <span className="dashboard-discovery-progress">{lesson.progress || 0}%</span>
                </Link>
              ))}
            </div>
          ) : <p className="empty-state-text">Chưa có bài học mới.</p>}
        </section>

        <section className="dashboard-section-card" aria-labelledby="dashboard-recent-materials-title">
          <div className="section-card-header">
            <h3 id="dashboard-recent-materials-title">Tài liệu mới</h3>
            <Link to="/student/my-courses" className="link-see-all">Khóa học của tôi →</Link>
          </div>
          {dashboard?.recentMaterials?.length ? (
            <div className="dashboard-discovery-list">
              {dashboard.recentMaterials.map((material) => (
                <Link
                  key={material._id}
                  className="dashboard-discovery-item"
                  to={`/student/courses/${material.lesson?.course?._id || material.lesson?.course}/lessons/${material.lesson?._id}`}
                >
                  <span><strong>{material.title}</strong><small>{material.lesson?.title || 'Tài liệu bài học'}</small></span>
                  <span className="dashboard-discovery-type">{String(material.fileType || 'Tài liệu').split('/').pop()}</span>
                </Link>
              ))}
            </div>
          ) : <p className="empty-state-text">Chưa có tài liệu mới.</p>}
        </section>
      </div>

      <div className="dashboard-two-columns">
        {/* Available Exercises & Exams */}
        <div className="dashboard-section-card">
          <div className="section-card-header">
            <h3>Nhiệm vụ cần làm</h3>
            <Link to="/student/assessments" className="link-see-all">Xem tất cả →</Link>
          </div>
          {dashboard?.availableAssessments && dashboard.availableAssessments.length > 0 ? (
            <div className="assessment-list">
              {dashboard.availableAssessments.map((ass) => (
                <div key={ass._id} className="assessment-item">
                  <div className="assessment-item-info">
                    <span className={`badge-type ${ass.type === 'exam' ? 'exam' : 'exercise'}`}>
                      {ass.type === 'exam' ? 'Bài kiểm tra' : 'Bài tập'}
                    </span>
                    <h4>{ass.title}</h4>
                    <div className="dashboard-task-meta">
                      <span className="meta-text">{ass.questions?.length || 0} câu hỏi • {ass.durationMinutes || ass.duration || ass.minutes || 30} phút</span>
                      <span className="meta-text">{ass.availableUntil ? `Hạn nộp: ${new Date(ass.availableUntil).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })}` : ass.availableFrom ? `Mở từ: ${new Date(ass.availableFrom).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })}` : 'Không có hạn nộp'}</span>
                      <span className="meta-text">{ass.submittedAttemptCount > 0 ? 'Đã làm' : 'Chưa làm'}</span>
                    </div>
                  </div>
                  <Link to={`/student/tests/${ass._id}`} className="btn-start-test">
                    Làm bài
                  </Link>
                </div>
              ))}
            </div>
          ) : (
            <p className="empty-state-text">Chưa có bài tập hay đề thi nào mới.</p>
          )}
        </div>

        {/* Recent Results */}
        <div className="dashboard-section-card">
          <div className="section-card-header">
            <h3>Kết Quả Làm Bài Gần Đây</h3>
            <Link to="/student/history" className="link-see-all">Xem lịch sử →</Link>
          </div>
          {dashboard?.recentResults && dashboard.recentResults.length > 0 ? (
            <div className="results-list">
              {dashboard.recentResults.map((res) => (
                <div key={res._id} className="result-item">
                  <div className="result-item-info">
                    <h4>{res.assessment?.title}</h4>
                    <span className="meta-text">{new Date(res.submittedAt).toLocaleDateString('vi-VN')}</span>
                  </div>
                  <div className="result-score-tag">
                    <span className="score-num">{res.score}</span> / {res.totalScore}
                    <span className={`pass-badge ${res.passed === true ? 'pass' : 'fail'}`}>
                      {res.passed === true ? 'ĐẠT' : 'CHƯA ĐẠT'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="empty-state-text">Bạn chưa hoàn thành bài tập hoặc đề thi nào.</p>
          )}
        </div>
      </div>
    </div>
  );
}
