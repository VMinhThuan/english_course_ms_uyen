import { Outlet, Link } from 'react-router-dom';
import useAuthStore from '../../store/authStore.js';

export default function TeacherLayout() {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);

  return (
    <div>
      <nav style={{ padding: '1rem', borderBottom: '1px solid #ccc', background: '#e8f5e9' }}>
        <Link to="/" style={{ marginRight: '1rem' }}>Home</Link>
        <Link to="/teacher/lessons/create" style={{ marginRight: '1rem' }}>Create Lesson</Link>
        <span style={{ marginRight: '1rem' }}>Teacher: {user?.fullName}</span>
        <button onClick={logout}>Logout</button>
      </nav>
      <main style={{ padding: '2rem' }}>
        <Outlet />
      </main>
    </div>
  );
}

