import { Outlet, Link } from 'react-router-dom';
import useAuthStore from '../../store/authStore.js';

export default function PublicLayout() {
  const user = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const logout = useAuthStore((state) => state.logout);

  return (
    <div>
      <nav style={{ padding: '1rem', borderBottom: '1px solid #ccc' }}>
        <Link to="/" style={{ marginRight: '1rem' }}>
          Home
        </Link>
        <Link to="/courses" style={{ marginRight: '1rem' }}>
          Courses
        </Link>
        {isAuthenticated ? (
          <>
            <span style={{ marginRight: '1rem' }}>Hello, {user?.fullName}</span>
            {user?.role === 'student' && (
              <Link to="/student/my-courses" style={{ marginRight: '1rem' }}>
                My Courses
              </Link>
            )}
            {user?.role === 'teacher' && (
              <Link to="/teacher/lessons/create" style={{ marginRight: '1rem' }}>
                Create Lesson
              </Link>
            )}
            <button onClick={logout}>Logout</button>
          </>
        ) : (
          <>
            <Link to="/login" style={{ marginRight: '1rem' }}>
              Login
            </Link>
            <Link to="/register">Register</Link>
          </>
        )}
      </nav>
      <main style={{ padding: '2rem' }}>
        <Outlet />
      </main>
    </div>
  );
}

