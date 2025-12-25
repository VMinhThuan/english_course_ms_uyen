import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { courseApi } from '../api/courseApi.js';
import './CourseListPage.css';

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

  if (loading) return <div className="loading-message">Loading courses...</div>;

  return (
    <div className="course-list-page">
      <h2 className="page-title">All Courses</h2>
      <div className="courses-grid">
        {courses.map((course) => (
          <div key={course._id} className="course-card">
            <h3 className="course-title">{course.title}</h3>
            <p className="course-description">{course.description}</p>
            <p className="course-info">Level: {course.level}</p>
            <p className="course-teacher">Teacher: {course.teacher?.fullName}</p>
            <Link to={`/courses/${course._id}`}>
              <button className="btn-view-details">View Details</button>
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}

