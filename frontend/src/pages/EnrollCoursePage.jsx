import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { enrollmentApi } from '../api/enrollmentApi.js';
import { courseApi } from '../api/courseApi.js';

/**
 * VÍ DỤ CODE: Đăng ký khóa học (FE gọi BE)
 * 
 * Flow:
 * 1. Frontend hiển thị thông tin khóa học
 * 2. User click "Enroll"
 * 3. Frontend gọi API POST /api/v1/enrollments với courseId
 * 4. Backend xử lý logic đăng ký (kiểm tra đã đăng ký chưa, tạo enrollment)
 * 5. Backend trả về JSON response
 * 6. Frontend hiển thị thông báo và redirect
 */
export default function EnrollCoursePage() {
  const { courseId } = useParams();
  const navigate = useNavigate();
  const [course, setCourse] = useState(null);
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const fetchCourse = async () => {
      try {
        const response = await courseApi.getCourseById(courseId);
        setCourse(response.data.course);
      } catch (error) {
        console.error('Error fetching course:', error);
        setMessage('Error loading course');
      } finally {
        setLoading(false);
      }
    };

    fetchCourse();
  }, [courseId]);

  const handleEnroll = async () => {
    setEnrolling(true);
    setMessage('');

    try {
      // Frontend gọi API Backend
      const response = await enrollmentApi.enrollCourse(courseId);

      if (response.status === 'success') {
        setMessage('Enrolled successfully!');
        setTimeout(() => {
          navigate('/student/my-courses');
        }, 2000);
      }
    } catch (error) {
      setMessage(
        error.response?.data?.message || 'Failed to enroll in course'
      );
    } finally {
      setEnrolling(false);
    }
  };

  if (loading) return <div>Loading...</div>;
  if (!course) return <div>Course not found</div>;

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto' }}>
      <h2>Enroll in Course</h2>
      <div style={{ border: '1px solid #ccc', padding: '1rem', marginBottom: '1rem' }}>
        <h3>{course.title}</h3>
        <p>{course.description}</p>
        <p>Level: {course.level}</p>
        <p>Teacher: {course.teacher?.fullName}</p>
      </div>

      {message && (
        <div
          style={{
            padding: '1rem',
            marginBottom: '1rem',
            background: message.includes('success') ? '#d4edda' : '#f8d7da',
            color: message.includes('success') ? '#155724' : '#721c24',
            borderRadius: '4px',
          }}
        >
          {message}
        </div>
      )}

      <button
        onClick={handleEnroll}
        disabled={enrolling}
        style={{
          padding: '0.75rem 1.5rem',
          fontSize: '1rem',
          background: '#007bff',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: enrolling ? 'not-allowed' : 'pointer',
        }}
      >
        {enrolling ? 'Enrolling...' : 'Confirm Enrollment'}
      </button>

      <div style={{ marginTop: '2rem', padding: '1rem', background: '#f8f9fa', borderRadius: '4px' }}>
        <h4>API Call Example:</h4>
        <pre style={{ background: '#fff', padding: '0.5rem', borderRadius: '4px', overflow: 'auto' }}>
          {`// Frontend: enrollmentApi.enrollCourse(courseId)
POST /api/v1/enrollments
Headers: {
  Authorization: "Bearer <access_token>",
  Content-Type: "application/json"
}
Body: {
  "courseId": "${courseId}"
}

// Backend Response:
{
  "status": "success",
  "message": "Enrolled in course successfully",
  "data": {
    "enrollment": { ... }
  }
}`}
        </pre>
      </div>
    </div>
  );
}

