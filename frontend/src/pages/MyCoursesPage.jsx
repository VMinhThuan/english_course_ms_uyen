import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { enrollmentApi } from '../api/enrollmentApi.js';
import useAuthStore from '../store/authStore.js';
import './MyCoursesPage.css';

export default function MyCoursesPage() {
  const [enrollments, setEnrollments] = useState([]);
  const [loading, setLoading] = useState(true);
  const user = useAuthStore((state) => state.user);

  useEffect(() => {
    const fetchMyCourses = async () => {
      try {
        const response = await enrollmentApi.getMyCourses();
        setEnrollments(response.data.enrollments || []);
      } catch (error) {
        console.error('Error fetching my courses:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchMyCourses();
  }, []);

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p style={{ color: '#64748B' }}>Đang tải danh sách khóa học...</p>
      </div>
    );
  }

  return (
    <div className="my-courses-container">
      {/* Welcome Banner */}
      <div className="dashboard-hero-card">
        <h1 className="dashboard-hero-title">Xin chào, {user?.fullName || 'Học viên'}! 👋</h1>
        <p className="dashboard-hero-sub">Chào mừng bạn trở lại! Hãy tiếp tục hành trình học tiếng Anh của mình hôm nay.</p>
      </div>

      {/* KPI Cards */}
      <div className="dashboard-kpi-grid">
        <div className="kpi-card">
          <div className="kpi-icon-box">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
            </svg>
          </div>
          <div>
            <div className="kpi-val">{enrollments.length}</div>
            <div className="kpi-label">Khóa học đã đăng ký</div>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon-box" style={{ background: '#FEF3C7', color: '#D97706' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
          </div>
          <div>
            <div className="kpi-val">{enrollments.filter(e => (e.progress?.overallProgress || 0) < 100).length}</div>
            <div className="kpi-label">Đang học</div>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon-box" style={{ background: '#DCFCE7', color: '#166534' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
              <polyline points="22 4 12 14.01 9 11.01"></polyline>
            </svg>
          </div>
          <div>
            <div className="kpi-val">{enrollments.filter(e => (e.progress?.overallProgress || 0) === 100).length}</div>
            <div className="kpi-label">Hoàn thành</div>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon-box" style={{ background: '#F3E8FF', color: '#7E22CE' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="8" r="7"></circle>
              <polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"></polyline>
            </svg>
          </div>
          <div>
            <div className="kpi-val">100%</div>
            <div className="kpi-label">Chỉ số tiến độ</div>
          </div>
        </div>
      </div>

      {/* Courses List */}
      <div>
        <h2 style={{ fontSize: '1.35rem', fontWeight: 600, color: '#1E293B', marginBottom: '1.25rem' }}>Khóa Học Của Tôi</h2>

        {enrollments.length === 0 ? (
          <div style={{ background: '#FFFFFF', borderRadius: '16px', padding: '3rem 1.5rem', textAlign: 'center', border: '1px solid #E2E8F0' }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="1.5" style={{ margin: '0 auto 1rem auto', display: 'block' }}>
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
            </svg>
            <h3 style={{ fontSize: '1.15rem', color: '#334155', marginBottom: '0.5rem' }}>Bạn chưa đăng ký khóa học nào</h3>
            <p style={{ color: '#64748B', fontSize: '0.95rem', marginBottom: '1.5rem' }}>Khám phá các khóa học tiếng Anh trực tuyến chất lượng để đăng ký ngay.</p>
            <Link to="/courses" className="btn-continue-learning" style={{ maxWidth: '240px', margin: '0 auto' }}>
              Khám Phá Khóa Học
            </Link>
          </div>
        ) : (
          <div className="courses-grid">
            {enrollments.map((enrollment) => {
              const course = enrollment.course || {};
              const progress = enrollment.progress?.overallProgress || 0;
              return (
                <div key={enrollment._id} className="enrolled-course-card">
                  {course.thumbnail ? (
                    <img src={course.thumbnail} alt={course.title} className="course-card-banner" />
                  ) : (
                    <div className="course-card-banner" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#49BBBD', color: '#FFF', fontWeight: 700, fontSize: '1.25rem' }}>
                      {course.title?.substring(0, 2).toUpperCase() || 'EN'}
                    </div>
                  )}

                  <div className="course-card-body">
                    <h3 className="course-card-title line-clamp-1">{course.title || 'Khóa Học Tiếng Anh'}</h3>
                    <p className="course-card-desc line-clamp-2">{course.description || 'Chưa có mô tả chi tiết.'}</p>
                    
                    <div style={{ marginTop: 'auto' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: '#475569', marginBottom: '6px', fontWeight: 500 }}>
                        <span>Tiến độ</span>
                        <span>{progress}%</span>
                      </div>
                      <div className="progress-bar-container">
                        <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
                      </div>
                    </div>

                    <Link to={`/courses/${course._id}`} className="btn-continue-learning" style={{ marginTop: '1rem' }}>
                      Tiếp Tục Học
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
