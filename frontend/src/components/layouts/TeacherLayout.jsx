import { Outlet, Link, useNavigate } from 'react-router-dom';
import useAuthStore from '../../store/authStore.js';
import './StudentLayout.css';

export default function TeacherLayout() {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="student-layout">
      <header className="student-header">
        <div className="header-brand">
          <Link to="/" className="brand-logo-text">
            <span className="brand-title-text">Ms Uyen<span className="brand-dot">.</span></span>
            <span style={{ fontSize: '11px', background: '#DCFCE7', color: '#166534', padding: '2px 8px', borderRadius: '12px', fontWeight: 700 }}>GIÁO VIÊN</span>
          </Link>
        </div>

        <nav style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <Link to="/teacher/lessons/create" style={{ color: '#4F46E5', textDecoration: 'none', fontWeight: 600 }}>
            Tạo Bài Học Mới
          </Link>
          <span style={{ color: '#475569', fontSize: '14px', fontWeight: 500 }}>{user?.fullName || user?.email}</span>
          <button className="btn-logout-icon" onClick={handleLogout}>
            Đăng xuất
          </button>
        </nav>
      </header>

      <main className="student-main-content">
        <Outlet />
      </main>
    </div>
  );
}
