import { Outlet, Link } from 'react-router-dom';
import useAuthStore from '../../store/authStore.js';

export default function AdminLayout() {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);

  return (
    <div>
      <nav style={{ padding: '1rem', borderBottom: '1px solid #ccc', background: '#fff3e0' }}>
        <Link to="/" style={{ marginRight: '1rem' }}>Home</Link>
        <Link to="/admin" style={{ marginRight: '1rem' }}>Dashboard</Link>
        <span style={{ marginRight: '1rem' }}>Admin: {user?.fullName}</span>
        <button onClick={logout}>Logout</button>
      </nav>
      <main style={{ padding: '2rem' }}>
        <Outlet />
      </main>
    </div>
  );
}

