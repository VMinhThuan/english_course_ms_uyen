import { Link } from 'react-router-dom';
import { useCallback, useEffect, useState } from 'react';
import { courseApi } from '../api/courseApi.js';
import './CourseLearning.css';

export default function CourseListPage() {
  const [courses, setCourses] = useState([]); const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [search, setSearch] = useState('');
  const load = useCallback(async () => { setLoading(true); setError(''); try { const res = await courseApi.getCourses(search.trim() ? { search: search.trim() } : {}); setCourses(res.data.courses || []); } catch { setError('Không thể tải danh sách khóa học. Vui lòng thử lại.'); } finally { setLoading(false); } }, [search]);
  useEffect(() => { const id = setTimeout(load, search ? 300 : 0); return () => clearTimeout(id); }, [load, search]);
  return <main className="learning-page course-catalog">
    <header className="learning-heading course-catalog__header">
      <div className="course-catalog__intro"><p className="learning-eyebrow">KHÓA HỌC</p><h1>Khám phá hành trình học của bạn</h1><p>Chọn khóa học phù hợp và bắt đầu học theo tốc độ riêng.</p></div>
      <label className="learning-search course-catalog__search"><span>Tìm khóa học</span><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tên hoặc nội dung khóa học" /></label>
    </header>
    {error && <div className="learning-error">{error}<button onClick={load}>Thử lại</button></div>}
    {loading ? <div className="learning-grid">{[1,2,3].map((x) => <div key={x} className="learning-card learning-skeleton" />)}</div> : courses.length ? <>
      <p className="course-catalog__count">{courses.length} khóa học phù hợp</p>
      <div className="learning-grid">{courses.map((course) => <article className="learning-card" key={course._id}>
        <div className="learning-card-cover">
          {course.image || course.thumbnail ? <img src={course.image || course.thumbnail} alt="" /> : <span>{course.title?.slice(0, 1)}</span>}
          <small>{course.englishType || 'English'}</small>
        </div>
        <div className="learning-card-body"><div className="learning-card-meta"><span>{course.level || 'Mọi trình độ'}</span>{course.teacherName && <span>{course.teacherName}</span>}</div><h2>{course.title}</h2><p>{course.description || 'Khám phá nội dung và lộ trình học của khóa học này.'}</p><Link to={`/courses/${course._id}`} className="learning-primary">Xem khóa học <span aria-hidden="true">→</span></Link></div>
      </article>)}</div>
    </> : <section className="learning-empty"><h2>Chưa có khóa học.</h2><p>Hãy quay lại sau để xem các khóa học mới.</p></section>}
  </main>;
}
