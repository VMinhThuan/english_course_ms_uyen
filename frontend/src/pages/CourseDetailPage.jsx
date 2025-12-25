import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { courseApi } from '../api/courseApi.js';
import useAuthStore from '../store/authStore.js';

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

  if (loading) return <div>Loading...</div>;
  if (!course) return <div>Course not found</div>;

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
    <div>
      <h1>{course.title}</h1>
      <p>{course.description}</p>
      <p>Level: {course.level}</p>
      <p>Teacher: {course.teacher?.fullName}</p>
      <p>Price: ${course.price}</p>
      {isAuthenticated && user.role === 'student' && (
        <button onClick={handleEnroll}>Enroll Now</button>
      )}
    </div>
  );
}

