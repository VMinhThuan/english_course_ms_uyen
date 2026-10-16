import { Link, useParams } from 'react-router-dom';
import { useCallback, useEffect, useState } from 'react';
import { courseApi } from '../api/courseApi.js';
import { lessonApi } from '../api/lessonApi.js';
import { enrollmentApi } from '../api/enrollmentApi.js';
import useAuthStore from '../store/authStore.js';
import ProgressBar from '../components/ui/ProgressBar.jsx';
import './CourseLearning.css';

export default function CourseDetailPage() {
  const { id } = useParams(); const isAuthenticated = useAuthStore((state) => state.isAuthenticated); const [course,setCourse]=useState(null); const [lessons,setLessons]=useState([]); const [enrollment,setEnrollment]=useState(null); const [loading,setLoading]=useState(true); const [error,setError]=useState('');
  const load=useCallback(async()=>{setLoading(true);setError('');try{const courseRes=await courseApi.getCourseById(id);setCourse(courseRes.data.course);if(isAuthenticated){const [lessonsRes,myRes]=await Promise.all([lessonApi.getLessonsByCourse(id),enrollmentApi.getMyCourses()]);setLessons(lessonsRes.data.lessons||[]);setEnrollment((myRes.data.enrollments||[]).find((item)=>String(item.course?._id||item.course)===String(courseRes.data.course._id))||null);}}catch{setError('Không thể tải khóa học. Vui lòng thử lại.');}finally{setLoading(false);}},[id,isAuthenticated]);useEffect(()=>{load();},[load]);
  if(loading)return <main className="learning-page"><div className="learning-loading">Đang tải khóa học...</div></main>;if(!course)return <main className="learning-page"><div className="learning-error">{error}<button onClick={load}>Thử lại</button></div></main>;
  const progress=Number(enrollment?.progress||0); const nextLesson=lessons.find((lesson)=>true);
  return <main className="learning-page"><Link className="learning-back" to="/courses">← Tất cả khóa học</Link><section className="course-hero"><div><p className="learning-eyebrow">{course.englishType} · {course.level}</p><h1>{course.title}</h1><p>{course.description}</p>{course.teacherName&&<span className="course-teacher">Giảng viên: {course.teacherName}</span>}</div>{isAuthenticated && (enrollment?<div className="course-progress"><span>Tiến độ học tập</span><strong>{progress}%</strong><ProgressBar value={progress}/><Link className="learning-primary" to={nextLesson?`/student/courses/${course._id}/lessons/${nextLesson._id}`:'/student/my-courses'}>Tiếp tục học</Link></div>:<Link className="learning-primary" to={`/student/enroll/${course._id}`}>Đăng ký học</Link>)}</section>{isAuthenticated&&<section className="lesson-list"><div className="section-title"><h2>Nội dung khóa học</h2><span>{lessons.length} bài học</span></div>{lessons.length?lessons.map((lesson,index)=><article className="lesson-row" key={lesson._id}><span className="lesson-index">{index+1}</span><div><h3>{lesson.title}</h3>{lesson.description&&<p>{lesson.description}</p>}{lesson.duration>0&&<small>{lesson.duration} phút</small>}</div>{enrollment?<Link to={`/student/courses/${course._id}/lessons/${lesson._id}`}>Mở bài học →</Link>:<span className="lesson-lock">Đăng ký để học</span>}</article>):<div className="learning-empty">Khóa học chưa có bài học.</div>}</section>}</main>;
}
