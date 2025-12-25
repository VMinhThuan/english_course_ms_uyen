import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { courseApi } from '../api/courseApi.js';

export default function CourseListPage() {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCourses = async () => {
      try {
        const response = await courseApi.getCourses();
        setCourses(response.data.courses);
      } catch (error) {
        console.error('Error fetching courses:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchCourses();
  }, []);

  if (loading) return <div>Loading courses...</div>;

  return (
    <div>
      <h2>All Courses</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
        {courses.map((course) => (
          <div key={course._id} style={{ border: '1px solid #ccc', padding: '1rem', borderRadius: '8px' }}>
            <h3>{course.title}</h3>
            <p>{course.description}</p>
            <p>Level: {course.level}</p>
            <p>Teacher: {course.teacher?.fullName}</p>
            <Link to={`/courses/${course._id}`}>
              <button>View Details</button>
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}

