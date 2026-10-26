import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { courseApi } from '../api/courseApi.js';
import { lessonApi } from '../api/lessonApi.js';
import PageHeader from '../components/ui/PageHeader.jsx';
import './StudentToeic.css';

const isToeicListeningCourse = (course) => course?.englishType === 'TOEIC' && course?.category === 'listening';

export default function StudentToeicPart1Page() {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const courseResponse = await courseApi.getCourses({ englishType: 'TOEIC', category: 'listening' });
      const available = (courseResponse.data?.courses || [])
        .filter(isToeicListeningCourse);
      setCourses(await Promise.all(available.map(async (course) => {
        const lessonResponse = await lessonApi.getLessonsByCourse(course._id);
        return { ...course, lessons: lessonResponse.data?.lessons || [] };
      })));
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Không thể tải các bài luyện nghe Part 1.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return <main className="toeic-page" data-testid="toeic-part1-student-page">
    <PageHeader eyebrow="TOEIC · Listening" title="Luyện nghe Part 1" description="Các bài học TOEIC Listening đã được xuất bản." actions={<Link className="ds-button ds-button--secondary" to="/student/toeic">Kho đề thi TOEIC</Link>} />
    {loading ? <div className="ds-loading-state">Đang tải bài luyện nghe Part 1...</div>
      : error ? <div className="toeic-error ds-error-state"><strong>{error}</strong><button type="button" className="ds-button ds-button--danger" onClick={load}>Thử lại</button></div>
        : courses.length === 0 ? <div className="ds-empty-state"><p>Chưa có Course TOEIC Listening với bài Part 1 được xuất bản.</p><Link className="ds-button ds-button--primary" to="/student/courses">Xem khóa học TOEIC</Link></div>
          : <div className="toeic-library-grid">{courses.map((course) => <section className="toeic-test-card" key={course._id}><div><div className="toeic-card-meta"><span>TOEIC LISTENING</span><span>PART 1</span></div><h2>{course.title}</h2><p>{course.description || 'Luyện nghe TOEIC Part 1: Photographs.'}</p>{course.lessons.length === 0 ? <p>Chưa có bài học Part 1 được xuất bản.</p> : <div className="toeic-specs" aria-label={`Bài học Part 1 của ${course.title}`}>{course.lessons.map((lesson) => <Link key={lesson._id} to={`/student/courses/${course._id}/lessons/${lesson._id}`}>{lesson.title}</Link>)}</div>}</div></section>)}</div>}
  </main>;
}
