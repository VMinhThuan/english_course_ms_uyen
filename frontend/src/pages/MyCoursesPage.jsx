import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { enrollmentApi } from '../api/enrollmentApi.js';
import ProgressBar from '../components/ui/ProgressBar.jsx';
import './CourseLearning.css';
import './MyCoursesPage.css';

export default function MyCoursesPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await enrollmentApi.getMyCourses();
      setItems(res.data.enrollments || []);
    } catch {
      setError('Không thể tải khóa học của bạn.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <main className="learning-page my-courses-page">
      <header className="learning-heading">
        <div>
          <p className="learning-eyebrow">HỌC TẬP</p>
          <h1>Khóa học của tôi</h1>
          <p>Theo dõi và tiếp tục các khóa học bạn đã đăng ký.</p>
        </div>
      </header>
      <nav className="course-view-switch" aria-label="Chuyển danh sách khóa học">
        <Link to="/student/my-courses" aria-current="page">Khóa học của tôi</Link>
        <Link to="/student/courses">Tất cả khóa học</Link>
      </nav>

      {error && (
        <div className="learning-error">
          {error}
          <button onClick={load}>Thử lại</button>
        </div>
      )}

      {loading ? (
        <div className="learning-loading">Đang tải khóa học...</div>
      ) : items.length ? (
        <div className="learning-grid my-course-grid">
          {items.map(({ _id, course, progress }) => {
            const title = course?.title || 'Khóa học';
            const percentage = Number(progress || 0);

            return (
              <article className="my-course-card" key={_id}>
                <div className={`my-course-card__cover${course?.image || course?.thumbnail ? ' my-course-card__cover--image' : ''}`}>
                  {course?.image || course?.thumbnail ? (
                    <img src={course.image || course.thumbnail} alt={`Ảnh bìa khóa học ${title}`} />
                  ) : (
                    <span className="my-course-card__initial" aria-hidden="true">
                      {title.trim().slice(0, 1).toLocaleUpperCase() || 'K'}
                    </span>
                  )}
                  <span className="my-course-card__cover-label">Khóa học</span>
                </div>

                <div className="my-course-card__body">
                  <div className="my-course-card__copy">
                    <h2>{title}</h2>
                    {course?.description && <p>{course.description}</p>}
                  </div>

                  <div className="my-course-progress">
                    <div className="my-course-progress__header">
                      <span>Tiến độ học tập</span>
                      <strong>{percentage}%</strong>
                    </div>
                    <ProgressBar value={progress} className="my-course-progress__bar" />
                  </div>

                  <Link
                    className="learning-primary my-course-card__action"
                    to={`/student/courses/${course?._id}`}
                    aria-label={`Tiếp tục học ${title}`}
                  >
                    <span>Tiếp tục học</span>
                    <span aria-hidden="true">→</span>
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <section className="learning-empty">
          <h2>Bạn chưa đăng ký khóa học nào.</h2>
          <p>Hãy khám phá khóa học phù hợp để bắt đầu.</p>
          <Link className="learning-primary" to="/student/courses">Khám phá khóa học</Link>
        </section>
      )}
    </main>
  );
}
