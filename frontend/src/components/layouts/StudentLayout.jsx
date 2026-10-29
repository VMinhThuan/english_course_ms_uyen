import { useState, useEffect, useRef } from 'react';
import { Outlet, NavLink, Link, useNavigate, useLocation } from 'react-router-dom';
import useAuthStore from '../../store/authStore.js';
import { assessmentApi } from '../../api/assessmentApi.js';
import PracticeSidebarMenu from './PracticeSidebarMenu.jsx';
import { acquireDocumentScrollLock } from '../../utils/documentScrollLock.js';
import './StudentLayout.css';

export default function StudentLayout() {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const navigate = useNavigate();
  const location = useLocation();
  const locationPathRef = useRef(location.pathname);
  locationPathRef.current = location.pathname;
  const isActiveAssessmentRoute = location.pathname.startsWith('/student/tests/');
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [activeAttemptPrompt, setActiveAttemptPrompt] = useState(null);
  const hamburgerRef = useRef(null);
  const sidebarRef = useRef(null);
  const checkedActiveAttemptsUserRef = useRef(null);
  const activeAttemptCheckKey = user ? String(user._id || user.id || user.email || '') : '';

  // Dynamic Document Title
  useEffect(() => {
    const path = location.pathname;
    let pageTitle = 'Học viên';
    if (path.includes('dashboard')) pageTitle = 'Trang chủ';
    else if (path.includes('/courses/')) pageTitle = path.includes('/lessons/') ? 'Bài học' : 'Khóa học';
    else if (path === '/student/courses') pageTitle = 'Bài học';
    else if (path.includes('hard-words-dictation')) pageTitle = 'Hard Words Dictation';
    else if (path.includes('part-2-challenge')) pageTitle = 'Part 2 Challange';
    else if (path.includes('vocabulary-dictation')) pageTitle = 'Chép chính tả từ vựng';
    else if (path.includes('road-to-part-7')) pageTitle = 'Road to Part 7';
    else if (path.includes('vocabulary') || path.includes('flashcards')) pageTitle = 'Từ vựng';
    else if (path.includes('/tests/')) pageTitle = 'Đang làm bài kiểm tra';
    else if (path.includes('assessments')) pageTitle = 'Bài tập ngữ pháp';
    else if (path === '/student/part-5') pageTitle = 'Ngân hàng Part 5';
    else if (path === '/student/part-1') pageTitle = 'Chép chính tả Part 1';
    else if (path.includes('toeic')) pageTitle = 'Thi thử TOEIC';
    else if (path.includes('history')) pageTitle = 'Lịch sử';
    else if (path.includes('profile')) pageTitle = 'Hồ sơ';

    document.title = `${pageTitle} | Ms Uyen`;
  }, [location]);

  useEffect(() => {
    if (isActiveAssessmentRoute) setIsMobileOpen(false);
  }, [isActiveAssessmentRoute]);

  // Check for an unfinished attempt as soon as the authenticated student area opens.
  useEffect(() => {
    if (!activeAttemptCheckKey || user?.role !== 'student') return undefined;
    if (checkedActiveAttemptsUserRef.current === activeAttemptCheckKey) return undefined;
    checkedActiveAttemptsUserRef.current = activeAttemptCheckKey;

    const isAlreadyOnAttempt = locationPathRef.current.startsWith('/student/tests/')
      || locationPathRef.current.startsWith('/student/toeic/attempt/');
    if (isAlreadyOnAttempt) return undefined;

    assessmentApi.getActiveAttempts()
      .then((response) => {
        const activeAttempts = response.data?.attempts || [];
        const onAttemptPage = locationPathRef.current.startsWith('/student/tests/')
          || locationPathRef.current.startsWith('/student/toeic/attempt/');
        if (!onAttemptPage && activeAttempts.length) setActiveAttemptPrompt(activeAttempts);
      })
      .catch(() => {
        // The page can still be used if the resume check is temporarily unavailable.
      });
    return undefined;
  }, [activeAttemptCheckKey, user?.role]);

  useEffect(() => {
    if (!activeAttemptPrompt) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setActiveAttemptPrompt(null);
    };
    const releaseScrollLock = acquireDocumentScrollLock();
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      releaseScrollLock();
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [activeAttemptPrompt]);

  // Lock background scroll when mobile drawer is open
  useEffect(() => {
    if (!isMobileOpen) return undefined;
    return acquireDocumentScrollLock();
  }, [isMobileOpen]);

  useEffect(() => {
    if (!isMobileOpen) return undefined;

    const sidebar = sidebarRef.current;
    const isMobileViewport = () => window.matchMedia?.('(max-width: 1023px)').matches ?? window.innerWidth <= 1023;
    const getFocusable = () => [...(sidebar?.querySelectorAll(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
    ) || [])].filter((element) => element.getClientRects().length > 0);
    getFocusable()[0]?.focus();

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setIsMobileOpen(false);
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = getFocusable();
      if (!focusable.length) {
        event.preventDefault();
        sidebar?.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || !sidebar?.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !sidebar?.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };
    const handleResize = () => {
      if (!isMobileViewport()) setIsMobileOpen(false);
    };

    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleResize);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleResize);
      if (isMobileViewport()) hamburgerRef.current?.focus();
    };
  }, [isMobileOpen]);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const getUserInitials = () => {
    if (user?.fullName) {
      const names = user.fullName.split(' ');
      if (names.length >= 2) {
        return (names[0][0] + names[names.length - 1][0]).toUpperCase();
      }
      return user.fullName.substring(0, 2).toUpperCase();
    }
    return user?.email ? user.email.substring(0, 2).toUpperCase() : 'ST';
  };

  const closeMobileMenu = () => {
    setIsMobileOpen(false);
  };

  const continueActiveAttempt = (attempt) => {
    setActiveAttemptPrompt(null);
    const path = attempt.engine === 'toeic'
      ? `/student/toeic/attempt/${attempt.attemptId}`
      : `/student/tests/${attempt.assessmentId}`;
    navigate(path, attempt.engine === 'toeic' ? undefined : { state: { skipResumePrompt: true } });
  };

  return (
    <div className={isActiveAssessmentRoute ? 'student-layout student-layout--active-test' : 'student-layout'}>
      {/* Top Navigation Bar */}
      <header className="student-header">
        <div className="header-brand">
          {!isActiveAssessmentRoute && <button
            className="mobile-hamburger-btn"
            ref={hamburgerRef}
            onClick={() => setIsMobileOpen(!isMobileOpen)}
            aria-label={isMobileOpen ? 'Đóng menu điều hướng' : 'Mở menu điều hướng'}
            aria-expanded={isMobileOpen}
            aria-controls="student-navigation"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="12" x2="21" y2="12"></line>
              <line x1="3" y1="6" x2="21" y2="6"></line>
              <line x1="3" y1="18" x2="21" y2="18"></line>
            </svg>
          </button>}
          {isActiveAssessmentRoute ? (
            <span className="brand-logo-text" aria-label="Toeic Ms Uyen">
              <span className="brand-title-text">Toeic Ms Uyen<span className="brand-dot">.</span></span>
            </span>
          ) : (
            <Link to="/" className="brand-logo-text">
              <span className="brand-title-text">Toeic Ms Uyen<span className="brand-dot">.</span></span>
            </Link>
          )}
        </div>

        <div className="header-user-section">
          <div className="user-profile-badge">
            <div className="user-avatar-circle">{getUserInitials()}</div>
            <div className="user-info-text">
              <span className="user-name">{user?.fullName || user?.email}</span>
              <span className="user-role-tag">Học viên</span>
            </div>
          </div>
          {!isActiveAssessmentRoute && <button className="btn-logout-icon" onClick={handleLogout} title="Đăng xuất">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
              <polyline points="16 17 21 12 16 7"></polyline>
              <line x1="21" y1="12" x2="9" y2="12"></line>
            </svg>
            <span>Đăng xuất</span>
          </button>}
        </div>
      </header>

      <div className="student-container">
        {/* Backdrop overlay on mobile */}
        {!isActiveAssessmentRoute && isMobileOpen && (
          <button type="button" className="sidebar-backdrop" onClick={closeMobileMenu} aria-label="Đóng menu điều hướng" />
        )}

        {/* Responsive Sidebar Drawer */}
        <aside id="student-navigation" ref={sidebarRef} className={`student-sidebar ${isMobileOpen ? 'mobile-open' : ''}`} aria-label="Điều hướng học viên">
          <NavLink
            to="/student/dashboard"
            className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
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

          <PracticeSidebarMenu variant="student" onNavigate={closeMobileMenu} />

          <NavLink
            to="/student/vocabulary-catalog"
            className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
            onClick={closeMobileMenu}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>
            <span>Danh mục từ vựng</span>
          </NavLink>

          <NavLink
            to="/student/toeic"
            className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
            onClick={closeMobileMenu}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"></circle>
              <path d="M12 8v4l3 3"></path>
            </svg>
            <span>Luyện Thi TOEIC</span>
          </NavLink>

          <NavLink
            to="/student/history"
            className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
            onClick={closeMobileMenu}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
            <span>Lịch Sử Làm Bài</span>
          </NavLink>

          <NavLink
            to="/student/profile"
            className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
            onClick={closeMobileMenu}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
              <circle cx="12" cy="7" r="4"></circle>
            </svg>
            <span>Hồ Sơ Cá Nhân</span>
          </NavLink>

          <NavLink
            to="/"
            className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
            onClick={closeMobileMenu}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
              <polyline points="9 22 9 12 15 12 15 22"></polyline>
            </svg>
            <span>Trang Chủ</span>
          </NavLink>
        </aside>

        {/* Main Outlet Area */}
        <main className="student-main-content">
          <Outlet />
        </main>
      </div>

      {activeAttemptPrompt && (
        <div className="active-attempt-resume-overlay">
          <section className="active-attempt-resume-dialog" role="alertdialog" aria-modal="true" aria-labelledby="active-attempt-resume-title">
            <span className="active-attempt-resume-icon" aria-hidden="true">↻</span>
            <h2 id="active-attempt-resume-title">Bạn đang có bài kiểm tra chưa hoàn thành</h2>
            <p>
              {activeAttemptPrompt.length === 1
                ? `Tiến độ và thời gian của “${activeAttemptPrompt[0].title}” đã được lưu.`
                : `Bạn có ${activeAttemptPrompt.length} bài kiểm tra đang làm dở. Chọn bài muốn tiếp tục.`}
            </p>
            <div className="active-attempt-resume-list">
              {activeAttemptPrompt.map((attempt, index) => (
                <button
                  key={attempt.attemptId}
                  type="button"
                  autoFocus={index === 0}
                  className={activeAttemptPrompt.length === 1 ? 'active-attempt-resume-primary' : 'active-attempt-resume-item'}
                  onClick={() => continueActiveAttempt(attempt)}
                >
                  {activeAttemptPrompt.length === 1 ? 'Tiếp tục làm bài' : attempt.title}
                  {activeAttemptPrompt.length > 1 && <span>{attempt.engine === 'toeic' ? 'Đề thi TOEIC' : 'Bài kiểm tra'}</span>}
                </button>
              ))}
            </div>
            <button type="button" className="active-attempt-resume-dismiss" onClick={() => setActiveAttemptPrompt(null)}>
              Để sau
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
