import { useState } from 'react';
import { Outlet, Link, useNavigate } from 'react-router-dom';
import useAuthStore from '../../store/authStore.js';
import './StudentLayout.css';

export default function PublicLayout() {
  const user = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const logout = useAuthStore((state) => state.logout);
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  return (
    <div className="student-layout">
      <header className="student-header">
        <div className="header-brand">
          <Link to="/" className="brand-logo-text">
            <span className="brand-title-text">Ms Uyen<span className="brand-dot">.</span></span>
          </Link>
        </div>

        <nav style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {isAuthenticated ? (
            <>
              {user?.role === 'student' && (
                <Link to="/student/my-courses" style={{ color: '#4F46E5', textDecoration: 'none', fontWeight: 600 }}>
                  Bài Học Của Tôi
                </Link>
              )}
              {user?.role === 'admin' && (
                <Link to="/admin" style={{ color: '#4F46E5', textDecoration: 'none', fontWeight: 600 }}>
                  Trang Quản Trị
                </Link>
              )}
              <button className="btn-logout-icon" onClick={handleLogout}>
                Đăng xuất
              </button>
            </>
          ) : (
            <div style={{ display: 'flex', gap: '8px' }}>
              <Link to="/login" style={{ textDecoration: 'none', padding: '8px 18px', background: '#F1F5F9', color: '#334155', borderRadius: '9999px', fontWeight: 600, fontSize: '14px' }}>
                Đăng Nhập
              </Link>
              <Link to="/register" style={{ textDecoration: 'none', padding: '8px 18px', background: '#4F46E5', color: '#FFFFFF', borderRadius: '9999px', fontWeight: 600, fontSize: '14px' }}>
                Đăng Ký
              </Link>
            </div>
          )}
        </nav>
      </header>

      <main className="student-main-content">
        <Outlet />
      </main>
    </div>
  );
}
