import { useState, useEffect } from 'react';
import { Outlet, NavLink, Link, useNavigate, useLocation } from 'react-router-dom';
import useAuthStore from '../../store/authStore.js';
import './AdminLayout.css';

export default function AdminLayout() {
  const user = useAuthStore((state) => state.user);
  const isAdmin = user?.role === 'admin';
  const logout = useAuthStore((state) => state.logout);
  const navigate = useNavigate();
  const location = useLocation();
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  // Dynamic Document Title for Admin Portal
  useEffect(() => {
    const path = location.pathname;
    let pageTitle = 'Quản trị';
    if (path.includes('students')) pageTitle = 'Quản lý Học viên';
    else if (path.includes('courses')) pageTitle = 'Quản lý Khóa học';
    else if (path.includes('lessons')) pageTitle = 'Quản lý Bài học';
    else if (path.includes('materials')) pageTitle = 'Quản lý Tài liệu';
    else if (path.includes('vocabulary')) pageTitle = 'Quản lý Từ vựng';
    else if (path.includes('questions')) pageTitle = isAdmin ? 'Ngân hàng Part 5' : 'Ngân hàng Câu hỏi';
    else if (path.includes('assessments')) pageTitle = 'Quản lý Bài tập';
    else if (path.includes('toeic')) pageTitle = 'Quản lý Đề thi TOEIC';
    else if (path.includes('results')) pageTitle = 'Kết quả Làm bài';
    else if (path.includes('statistics')) pageTitle = 'Thống kê Hệ thống';

    document.title = `${pageTitle} | Ms Uyen`;
  }, [isAdmin, location]);

  useEffect(() => {
    if (isMobileOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isMobileOpen]);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const closeMobileMenu = () => {
    setIsMobileOpen(false);
  };

  return (
    <div className="admin-layout">
      <header className="admin-header">
        <div className="admin-brand">
          <button
            className="mobile-hamburger-btn"
            onClick={() => setIsMobileOpen(!isMobileOpen)}
            style={{ color: '#E2E8F0' }}
            aria-label="Toggle admin menu"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="12" x2="21" y2="12"></line>
              <line x1="3" y1="6" x2="21" y2="6"></line>
              <line x1="3" y1="18" x2="21" y2="18"></line>
            </svg>
          </button>
          <Link to="/admin" className="admin-logo-text">
            <span className="brand-title-text">Toeic Ms Uyen<span className="brand-dot">.</span></span>
            <span className="admin-badge">QUẢN TRỊ</span>
          </Link>
        </div>

        <div className="admin-user-section">
          <span className="admin-user-info">{user?.fullName || user?.email}</span>
          <button className="btn-admin-logout" onClick={handleLogout} title="Đăng xuất">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
              <polyline points="16 17 21 12 16 7"></polyline>
              <line x1="21" y1="12" x2="9" y2="12"></line>
            </svg>
            <span>Đăng xuất</span>
          </button>
        </div>
      </header>

      <div className="admin-container">
        {isMobileOpen && (
          <div className="admin-sidebar-backdrop" onClick={closeMobileMenu} />
        )}

        <aside className={`admin-sidebar ${isMobileOpen ? 'mobile-open' : ''}`}>
          <NavLink
            to="/admin"
            end
            className={({ isActive }) => `admin-sidebar-link ${isActive ? 'active' : ''}`}
            onClick={closeMobileMenu}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="7" height="7"></rect>
              <rect x="14" y="3" width="7" height="7"></rect>
              <rect x="14" y="14" width="7" height="7"></rect>
              <rect x="3" y="14" width="7" height="7"></rect>
            </svg>
            <span>Tổng Quan</span>
          </NavLink>

          <NavLink
            to="/admin/students"
            className={({ isActive }) => `admin-sidebar-link ${isActive ? 'active' : ''}`}
            onClick={closeMobileMenu}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
              <circle cx="9" cy="7" r="4"></circle>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
            </svg>
            <span>Quản Lý Học Viên</span>
          </NavLink>

          <NavLink
            to="/admin/courses"
            className={({ isActive }) => `admin-sidebar-link ${isActive ? 'active' : ''}`}
            onClick={closeMobileMenu}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
              <path d="M2 17l10 5 10-5"></path>
              <path d="M2 12l10 5 10-5"></path>
            </svg>
            <span>Quản Lý Khóa Học</span>
          </NavLink>

          <NavLink
            to="/admin/lessons"
            className={({ isActive }) => `admin-sidebar-link ${isActive ? 'active' : ''}`}
            onClick={closeMobileMenu}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
            </svg>
            <span>Quản Lý Bài Học</span>
          </NavLink>

          <NavLink
            to="/admin/materials"
            className={({ isActive }) => `admin-sidebar-link ${isActive ? 'active' : ''}`}
            onClick={closeMobileMenu}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
            </svg>
            <span>Quản Lý Tài Liệu</span>
          </NavLink>

          <NavLink
            to={isAdmin ? "/admin/vocabulary/catalog" : "/admin/vocabulary"}
            className={({ isActive }) => `admin-sidebar-link ${isActive ? 'active' : ''}`}
            onClick={closeMobileMenu}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
            </svg>
            <span>Quản Lý Từ Vựng</span>
          </NavLink>

          {isAdmin && <>
            <NavLink
              to="/admin/part1-dictations"
              className={({ isActive }) => `admin-sidebar-link ${isActive ? 'active' : ''}`}
              onClick={closeMobileMenu}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>
              <span>TOEIC Part 1 · Chép chính tả</span>
            </NavLink>
          </>}

          <NavLink
            to="/admin/questions"
            className={({ isActive }) => `admin-sidebar-link ${isActive ? 'active' : ''}`}
            onClick={closeMobileMenu}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"></circle>
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
              <line x1="12" y1="17" x2="12.01" y2="17"></line>
            </svg>
            <span>{isAdmin ? 'Ngân hàng Part 5' : 'Ngân hàng câu hỏi'}</span>
          </NavLink>

          <NavLink
            to="/admin/assessments"
            className={({ isActive }) => `admin-sidebar-link ${isActive ? 'active' : ''}`}
            onClick={closeMobileMenu}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 11l3 3L22 4"></path>
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
            </svg>
            <span>Bài Tập & Đề Thi</span>
          </NavLink>

          <NavLink
            to="/admin/toeic-tests"
            className={({ isActive }) => `admin-sidebar-link ${isActive ? 'active' : ''}`}
            onClick={closeMobileMenu}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
            </svg>
            <span>Đề Thi TOEIC</span>
          </NavLink>

          <NavLink
            to="/admin/results"
            className={({ isActive }) => `admin-sidebar-link ${isActive ? 'active' : ''}`}
            onClick={closeMobileMenu}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
            </svg>
            <span>Kết Quả Làm Bài</span>
          </NavLink>

          <NavLink
            to="/admin/statistics"
            className={({ isActive }) => `admin-sidebar-link ${isActive ? 'active' : ''}`}
            onClick={closeMobileMenu}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="20" x2="18" y2="10"></line>
              <line x1="12" y1="20" x2="12" y2="4"></line>
              <line x1="6" y1="20" x2="6" y2="14"></line>
            </svg>
            <span>Thống Kê Hệ Thống</span>
          </NavLink>

          <NavLink
            to="/"
            className={({ isActive }) => `admin-sidebar-link ${isActive ? 'active' : ''}`}
            onClick={closeMobileMenu}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
            </svg>
            <span>Trang Chủ Website</span>
          </NavLink>
        </aside>

        <main className="admin-main-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
