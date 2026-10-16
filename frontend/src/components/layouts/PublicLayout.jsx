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

        <nav className="public-header-nav">
          {isAuthenticated ? (
            <>
              {user?.role === 'student' && (
                <Link to="/student/my-courses" className="public-header-link">
                  Bài Học Của Tôi
                </Link>
              )}
              {user?.role === 'admin' && (
                <Link to="/admin" className="public-header-link">
                  Trang Quản Trị
                </Link>
              )}
              <button className="btn-logout-icon" onClick={handleLogout}>
                Đăng xuất
              </button>
            </>
          ) : (
            <div className="public-auth-actions">
              <Link to="/login" className="public-auth-link public-auth-link--quiet">
                Đăng Nhập
              </Link>
              <Link to="/register" className="public-auth-link public-auth-link--primary">
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
