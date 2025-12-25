import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { courseApi } from '../api/courseApi.js';
import useAuthStore from '../store/authStore.js';
import './CourseDetailPage.css';

export default function CourseDetailPage() {
  const { id } = useParams();
  const [course, setCourse] = useState(null);
  const [loading, setLoading] = useState(true);
  const user = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchCourse = async () => {
      try {
        const response = await courseApi.getCourseById(id);
        setCourse(response.data.course);
      } catch (error) {
        console.error('Error fetching course:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchCourse();
  }, [id]);

  if (loading) return <div className="loading-message">Loading...</div>;
  if (!course) return <div className="not-found-message">Course not found</div>;

  const handleEnroll = () => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    if (user.role === 'student') {
      navigate(`/student/enroll/${id}`);
    }
  };

  return (
    <div className="course-detail-page">
      <h1 className="course-detail-title">{course.title}</h1>
      <p className="course-detail-description">{course.description}</p>
      <div className="course-detail-info">
        <div className="info-item">
          <span className="info-label">Level</span>
          <span className="info-value">{course.level}</span>
        </div>
        <div className="info-item">
          <span className="info-label">Teacher</span>
          <span className="info-value">{course.teacher?.fullName}</span>
        </div>
        <div className="info-item">
          <span className="info-label">Price</span>
          <span className="info-value course-price">${course.price}</span>
        </div>
      </div>
      {isAuthenticated && user.role === 'student' && (
        <button onClick={handleEnroll} className="btn-enroll">Enroll Now</button>
      )}
    </div>
  );
}

