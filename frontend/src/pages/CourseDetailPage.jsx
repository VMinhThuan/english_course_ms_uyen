import { Link, useParams, useNavigate, useLocation } from 'react-router-dom';
import { useCallback, useEffect, useState } from 'react';
import { courseApi } from '../api/courseApi.js';
import { lessonApi } from '../api/lessonApi.js';
import useAuthStore from '../store/authStore.js';
import './CourseLearning.css';

const LESSON_DIFFICULTY_LABELS = {
  beginner: 'Cơ bản',
  intermediate: 'Trung cấp',
  advanced: 'Nâng cao',
};

export default function CourseDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const userRole = useAuthStore((state) => state.user?.role);
  const studentShell = location.pathname.startsWith('/student/courses/');
  const [course, setCourse] = useState(null);
  const [lessons, setLessons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      // 1. Fetch course details
      const courseRes = await courseApi.getCourseById(id);
      const courseData = courseRes.data.course;
      setCourse(courseData);

      // 2. Fetch public course lessons outline (works for both guests & students)
      try {
        const lessonsRes = await lessonApi.getLessonsByCourse(id);
        setLessons(lessonsRes.data?.lessons || []);
      } catch (lessonErr) {
        console.warn('Could not load lessons for course:', lessonErr);
        setLessons([]);
      }

    } catch (err) {
      setError(err.response?.data?.message || 'Không thể tải thông tin khóa học. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <main className="learning-page">
        <div className="learning-loading">Đang tải thông tin khóa học...</div>
      </main>
    );
  }

  if (!course) {
    return (
      <main className="learning-page">
        <div className="learning-error">
          <span>{error || 'Không tìm thấy khóa học này.'}</span>
          <button onClick={load}>Thử lại</button>
        </div>
        <Link className="learning-back" to={studentShell ? '/student/courses' : '/courses'}>← Quay lại danh sách khóa học</Link>
      </main>
    );
  }

  const courseListPath = studentShell ? '/student/courses' : '/courses';
  const showStudentSwitcher = studentShell || userRole === 'student';
  const totalDuration = lessons.reduce((acc, l) => acc + (Number(l.duration) || 0), 0);
  const nextLesson = lessons[0];

  return (
    <main className="learning-page course-detail-page">
      {showStudentSwitcher && (
        <nav className="course-view-switch" aria-label="Chuyển danh sách khóa học">
          <Link to="/student/courses" aria-current="page">Bài học</Link>
        </nav>
      )}
      <Link className="learning-back" to={courseListPath}>
        ← {studentShell ? 'Bài học' : 'Tất cả khóa học'}
      </Link>

      {/* Hero Section */}
      <section className="course-hero">
        <div className="course-hero-info">
          <p className="learning-eyebrow">
            {course.englishType || 'TIẾNG ANH'} · {course.level || 'MỌI CẤP ĐỘ'}
          </p>
          <h1>{course.title}</h1>
          <p className="course-desc-text">{course.description}</p>
          
          <div className="course-meta-tags">
            {course.teacherName && (
              <span className="course-teacher">
                👨‍🏫 Giảng viên: <strong>{course.teacherName}</strong>
              </span>
            )}
            <span className="course-lessons-count">
              📚 {lessons.length} bài học ({totalDuration > 0 ? `${totalDuration} phút` : 'Lộ trình chuẩn'})
            </span>
            {course.category && (
              <span className="course-category-tag">
                🎯 Kỹ năng: {course.category.toUpperCase()}
              </span>
            )}
          </div>
        </div>

        {/* Learning action */}
        <div className="course-action-card">
          <div className="course-enroll-card">
            <div className="price-tag-wrap">
              <span className="price-label">Quyền truy cập:</span>
              <span className="price-amount">Dành cho học viên đã được duyệt</span>
            </div>
            {isAuthenticated ? (
              <Link
                className="learning-primary"
                to={nextLesson ? `/student/courses/${course._id}/lessons/${nextLesson._id}` : '/student/courses'}
              >
                {nextLesson ? 'Bắt đầu học ngay →' : 'Xem bài học →'}
              </Link>
            ) : (
              <button
                className="learning-primary"
                onClick={() => navigate(`/login?redirect=${encodeURIComponent(`/student/courses/${course._id}`)}`)}
              >
                🔑 Đăng nhập để học
              </button>
            )}
            <small className="enroll-note">✓ Không cần đăng ký riêng từng khóa học</small>
          </div>
        </div>
      </section>

      {/* Curriculum Outline */}
      <section className="lesson-list">
        <div className="section-title">
          <h2>Đề cương & Danh sách bài học</h2>
          <span>{lessons.length} bài học · {totalDuration} phút học</span>
        </div>

        {lessons.length > 0 ? (
          lessons.map((lesson, index) => (
            <article className="lesson-row" key={lesson._id}>
              <span className="lesson-index">{index + 1}</span>
              <div className="lesson-info-col">
                <div className="lesson-title-row">
                  <h3>{lesson.title}</h3>
                  {lesson.topic && <span className="lesson-topic-badge">{lesson.topic}</span>}
                  {lesson.difficulty && LESSON_DIFFICULTY_LABELS[lesson.difficulty] && (
                    <span className={`lesson-difficulty-badge lesson-difficulty-badge--${lesson.difficulty}`}>
                      {LESSON_DIFFICULTY_LABELS[lesson.difficulty]}
                    </span>
                  )}
                </div>
                {lesson.description && <p>{lesson.description}</p>}
                <div className="lesson-submeta">
                  {lesson.duration > 0 && <small>⏱️ {lesson.duration} phút</small>}
                  {lesson.videoUrl && <small>🎥 Video bài giảng</small>}
                </div>
              </div>

              <div className="lesson-action-col">
                {isAuthenticated ? (
                  <Link
                    to={`/student/courses/${course._id}/lessons/${lesson._id}`}
                    className="btn-open-lesson"
                  >
                    Vào học bài →
                  </Link>
                ) : (
                  <Link className="lesson-lock" to={`/login?redirect=${encodeURIComponent(`/student/courses/${course._id}/lessons/${lesson._id}`)}`}>
                    🔑 Đăng nhập để học
                  </Link>
                )}
              </div>
            </article>
          ))
        ) : (
          <div className="learning-empty course-curriculum-empty">
            <span aria-hidden="true">✦</span>
            <div><strong>Nội dung đang được hoàn thiện</strong><p>Giáo viên đang biên soạn bài học cho khóa học này. Vui lòng quay lại sau nhé.</p></div>
          </div>
        )}
      </section>
    </main>
  );
}
