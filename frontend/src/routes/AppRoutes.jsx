import { Routes, Route, Navigate } from 'react-router-dom';
import useAuthStore from '../store/authStore.js';
import { canAccessRoute } from '../utils/routeGuard.js';
import { useEffect } from 'react';

// Layouts
import StudentLayout from '../components/layouts/StudentLayout.jsx';
import TeacherLayout from '../components/layouts/TeacherLayout.jsx';
import AdminLayout from '../components/layouts/AdminLayout.jsx';
import PublicLayout from '../components/layouts/PublicLayout.jsx';

// Pages
import LoginPage from '../pages/LoginPage.jsx';
import RegisterPage from '../pages/RegisterPage.jsx';
import HomePage from '../pages/HomePage.jsx';
import CourseListPage from '../pages/CourseListPage.jsx';
import CourseDetailPage from '../pages/CourseDetailPage.jsx';
import EnrollCoursePage from '../pages/EnrollCoursePage.jsx';
import MyCoursesPage from '../pages/MyCoursesPage.jsx';
import LessonPage from '../pages/LessonPage.jsx';
import TestPage from '../pages/TestPage.jsx';
import CreateLessonPage from '../pages/CreateLessonPage.jsx';

// Protected Route Component
const ProtectedRoute = ({ children, requiredRole }) => {
  const user = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const fetchUser = useAuthStore((state) => state.fetchUser);
  const token = localStorage.getItem('accessToken');

  useEffect(() => {
    if (token && !user) {
      fetchUser();
    }
  }, [token, user, fetchUser]);

  if (!token || !isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (requiredRole && user?.role !== requiredRole && user?.role !== 'admin') {
    return <Navigate to="/" replace />;
  }

  return children;
};

function AppRoutes() {
  return (
    <Routes>
      {/* Home Page - No Layout (Full Screen) */}
      <Route path="/" element={<HomePage />} />

      {/* Login Page - No Layout (Full Screen) */}
      <Route path="/login" element={<LoginPage />} />

      {/* Register Page - No Layout (Full Screen) */}
      <Route path="/register" element={<RegisterPage />} />

      {/* Public Routes */}
      <Route path="/" element={<PublicLayout />}>
        <Route path="courses" element={<CourseListPage />} />
        <Route path="courses/:id" element={<CourseDetailPage />} />
      </Route>

      {/* Student Routes */}
      <Route
        path="/student"
        element={
          <ProtectedRoute>
            <StudentLayout />
          </ProtectedRoute>
        }
      >
        <Route path="enroll/:courseId" element={<EnrollCoursePage />} />
        <Route path="my-courses" element={<MyCoursesPage />} />
        <Route path="courses/:courseId/lessons/:lessonId" element={<LessonPage />} />
        <Route path="tests/:testId" element={<TestPage />} />
      </Route>

      {/* Teacher Routes */}
      <Route
        path="/teacher"
        element={
          <ProtectedRoute requiredRole="teacher">
            <TeacherLayout />
          </ProtectedRoute>
        }
      >
        <Route path="lessons/create" element={<CreateLessonPage />} />
        <Route path="lessons/:lessonId/edit" element={<CreateLessonPage />} />
      </Route>

      {/* Admin Routes */}
      <Route
        path="/admin"
        element={
          <ProtectedRoute requiredRole="admin">
            <AdminLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<div>Admin Dashboard</div>} />
      </Route>

      {/* 404 */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default AppRoutes;

