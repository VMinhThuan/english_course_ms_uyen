import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { enrollmentApi } from '../api/enrollmentApi.js';

export default function MyCoursesPage() {
  const [enrollments, setEnrollments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMyCourses = async () => {
      try {
        const response = await enrollmentApi.getMyCourses();
        setEnrollments(response.data.enrollments);
      } catch (error) {
        console.error('Error fetching my courses:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchMyCourses();
  }, []);

  if (loading) return <div>Loading...</div>;

  return (
    <div>
      <h2>My Courses</h2>
      {enrollments.length === 0 ? (
        <p>You haven't enrolled in any courses yet.</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
          {enrollments.map((enrollment) => (
            <div key={enrollment._id} style={{ border: '1px solid #ccc', padding: '1rem', borderRadius: '8px' }}>
              <h3>{enrollment.course.title}</h3>
              <p>{enrollment.course.description}</p>
              <p>Progress: {enrollment.progress.overallProgress}%</p>
              <Link to={`/student/courses/${enrollment.course._id}/lessons`}>
                <button>Continue Learning</button>
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

