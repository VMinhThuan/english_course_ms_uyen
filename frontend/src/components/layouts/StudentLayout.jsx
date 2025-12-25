import { Outlet, Link } from 'react-router-dom';
import useAuthStore from '../../store/authStore.js';

export default function StudentLayout() {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);

  return (
    <div>
      <nav style={{ padding: '1rem', borderBottom: '1px solid #ccc', background: '#f0f0f0' }}>
        <Link to="/" style={{ marginRight: '1rem' }}>Home</Link>
        <Link to="/courses" style={{ marginRight: '1rem' }}>Courses</Link>
        <Link to="/student/my-courses" style={{ marginRight: '1rem' }}>My Courses</Link>
        <span style={{ marginRight: '1rem' }}>Student: {user?.fullName}</span>
        <button onClick={logout}>Logout</button>
      </nav>
      <main style={{ padding: '2rem' }}>
        <Outlet />
      </main>
    </div>
  );
}

