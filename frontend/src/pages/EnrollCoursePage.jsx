import { Navigate, useParams } from 'react-router-dom';

// Preserve old links, but reopen the confirmation inside the course detail context.
export default function EnrollCoursePage() {
  const { courseId } = useParams();
  return <Navigate to={`/student/courses/${courseId}?enroll=1`} replace />;
}
