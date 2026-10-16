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
            <span className="teacher-role-badge">GIÁO VIÊN</span>
          </Link>
        </div>

        <nav className="teacher-header-nav">
          <Link to="/admin/courses" className="teacher-header-link">
            Quản Lý Khóa Học
          </Link>
          <Link to="/admin/lessons" className="teacher-header-link">
            Quản Lý Bài Học
          </Link>
          <Link to="/admin/materials" className="teacher-header-link">
            Quản Lý Tài Liệu
          </Link>
          <Link to="/admin/toeic-tests" className="teacher-header-link">
            Quản Lý Đề TOEIC
          </Link>
          <span className="teacher-user-name">{user?.fullName || user?.email}</span>
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
