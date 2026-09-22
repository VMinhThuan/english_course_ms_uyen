import { Link, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import useAuthStore from '../store/authStore.js';
import './HomePage.css';

export default function HomePage() {
  const [scrolled, setScrolled] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const user = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const logout = useAuthStore((state) => state.logout);
  const fetchUser = useAuthStore((state) => state.fetchUser);
  const navigate = useNavigate();

  useEffect(() => {
    document.title = 'Ms Uyen | Học tiếng Anh & Luyện thi TOEIC';
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (token && !user) {
      fetchUser();
    }
  }, [user, fetchUser]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showUserMenu && !event.target.closest('.user-menu-container')) {
        setShowUserMenu(false);
      }
    };

    if (showUserMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showUserMenu]);

  const handleLogout = async () => {
    await logout();
    setShowUserMenu(false);
    navigate('/');
  };

  const getUserInitials = () => {
    if (user?.fullName) {
      const names = user.fullName.split(' ');
      if (names.length >= 2) {
        return (names[0][0] + names[names.length - 1][0]).toUpperCase();
      }
      return user.fullName.substring(0, 2).toUpperCase();
    }
    if (user?.email) {
      return user.email.substring(0, 2).toUpperCase();
    }
    return 'U';
  };

  const getDashboardPath = () => {
    if (!user) return '/login';
    if (user.role === 'admin') return '/admin';
    return '/student/dashboard';
  };

  return (
    <div className="home-page-wrapper">
      {/* 1. Header Navigation */}
      <header className={`parroto-header ${scrolled ? 'scrolled' : ''}`}>
        <div className="header-container">
          <Link to="/" className="brand-logo">
            <span className="brand-title-text">Toeic Ms Uyen<span className="brand-dot">.</span></span>
          </Link>

          <nav className={`nav-links ${mobileMenuOpen ? 'mobile-show' : ''}`}>
            <Link to="/" className="active" onClick={() => setMobileMenuOpen(false)}>Trang Chủ</Link>
            <Link to={isAuthenticated ? "/student/my-courses" : "/login"} onClick={() => setMobileMenuOpen(false)}>Tài Liệu</Link>
            <Link to={isAuthenticated ? "/student/my-courses" : "/login"} onClick={() => setMobileMenuOpen(false)}>Từ Vựng</Link>
            <Link to={isAuthenticated ? "/student/assessments" : "/login"} onClick={() => setMobileMenuOpen(false)}>Luyện Tập</Link>
            <Link to={isAuthenticated ? "/student/toeic" : "/login"} onClick={() => setMobileMenuOpen(false)}>Thi Thử TOEIC</Link>
          </nav>

          <div className="header-actions">
            <button className="search-icon-btn" aria-label="Search">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
            </button>

            {isAuthenticated && user ? (
              <div className="user-menu-container">
                <button
                  className="user-avatar-btn"
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  aria-label="User menu"
                >
                  <div className="user-avatar">{getUserInitials()}</div>
                  <span className="user-name-label">{user.fullName?.split(' ')[0] || 'Tài khoản'}</span>
                </button>
                {showUserMenu && (
                  <div className="user-dropdown">
                    <div className="user-dropdown-header">
                      <div className="user-dropdown-name">{user.fullName || user.email}</div>
                      <div className="user-dropdown-email">{user.email}</div>
                      <span className="user-role-badge">
                        {user.role === 'admin' ? 'Giáo viên / Admin' : 'Học viên'}
                      </span>
                    </div>
                    <div className="user-dropdown-divider"></div>
                    <Link
                      to={getDashboardPath()}
                      className="user-dropdown-item"
                      onClick={() => setShowUserMenu(false)}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="3" width="7" height="7"></rect>
                        <rect x="14" y="3" width="7" height="7"></rect>
                        <rect x="14" y="14" width="7" height="7"></rect>
                        <rect x="3" y="14" width="7" height="7"></rect>
                      </svg>
                      <span>Trang Quản Lý</span>
                    </Link>
                    <Link
                      to="/student/profile"
                      className="user-dropdown-item"
                      onClick={() => setShowUserMenu(false)}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                        <circle cx="12" cy="7" r="4"></circle>
                      </svg>
                      <span>Hồ Sơ Cá Nhân</span>
                    </Link>
                    <div className="user-dropdown-divider"></div>
                    <button className="user-dropdown-item logout-item" onClick={handleLogout}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                        <polyline points="16 17 21 12 16 7"></polyline>
                        <line x1="21" y1="12" x2="9" y2="12"></line>
                      </svg>
                      <span>Đăng Xuất</span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="auth-btns">
                <Link to="/login" className="btn-secondary-pill">Đăng Nhập</Link>
                <Link to="/register" className="btn-primary-pill">Đăng Ký Học Viên</Link>
              </div>
            )}

            <button
              className="mobile-hamburger"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle menu"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                {mobileMenuOpen ? (
                  <path d="M18 6L6 18M6 6l12 12" />
                ) : (
                  <path d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* 2. Hero Section */}
      <section id="hero" className="hero-section">
        <div className="hero-bg-blobs">
          <div className="blob blob-1"></div>
          <div className="blob blob-2"></div>
        </div>
        <div className="hero-container">
          <div className="hero-text-content">
            <div className="badge-pill">
              Luyện tập • Từ vựng • TOEIC
            </div>
            <h1 className="hero-heading">
              Cùng cô học tập,<br />
              <span className="gradient-text">cùng em tiến bộ mỗi ngày</span>
            </h1>
            <p className="hero-subtext">
              Một nơi để bạn học theo cách của mình, tiến bộ theo nhịp của mình và không bỏ quên mục tiêu mình đã chọn.
            </p>
            <div className="hero-cta-group">
              {isAuthenticated ? (
                <Link to={getDashboardPath()} className="btn-primary-gradient">
                  Bắt Đầu Học Ngay
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                    <polyline points="12 5 19 12 12 19"></polyline>
                  </svg>
                </Link>
              ) : (
                <>
                  <Link to="/register" className="btn-primary-gradient">
                    Bắt Đầu Học Ngay
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <line x1="5" y1="12" x2="19" y2="12"></line>
                      <polyline points="12 5 19 12 12 19"></polyline>
                    </svg>
                  </Link>
                  <Link to="/login" className="btn-secondary-outline">
                    Thi Thử TOEIC
                  </Link>
                </>
              )}
            </div>

            <p className="hero-microcopy">
              Đăng ký tài khoản và chờ giáo viên duyệt để bắt đầu.
            </p>
          </div>

          {/* Hero Visual Layered Composition (Exact Layout matching Mockup) */}
          <div className="hero-visual">
            <div className="visual-card-stack">

              {/* Top Left Floating Card: Tiến độ hôm nay */}
              <div className="floating-card float-top-left">
                <div className="fc-row-top">
                  <span className="fc-title">Tiến độ hôm nay</span>
                </div>
                <div className="fc-val">72%</div>
                <div className="fc-progress-bar">
                  <div className="fc-progress-fill" style={{ width: '72%' }}></div>
                </div>
              </div>

              {/* Middle Left Floating Card: Luyện nghe */}
              <div className="floating-card float-mid-left">
                <div className="fc-icon-bg icon-bg-purple">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" strokeWidth="2">
                    <path d="M3 18v-6a9 9 0 0 1 18 0v6"></path>
                    <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"></path>
                  </svg>
                </div>
                <div>
                  <div className="fc-bold">Luyện nghe</div>
                  <div className="fc-sub">Part 1 - 4</div>
                  <div className="soundwave-bar">
                    <span></span><span></span><span></span><span></span>
                  </div>
                </div>
              </div>

              {/* Bottom Left Floating Card: Tài liệu mới */}
              <div className="floating-card float-bot-left">
                <div className="pdf-badge-icon">PDF</div>
                <div>
                  <div className="fc-bold">Tài liệu mới</div>
                  <div className="fc-sub">Bài giảng Unit 3</div>
                  <div className="fc-meta">PDF • 2.4 MB</div>
                </div>
              </div>

              {/* Top Right Floating Card: Từ vựng */}
              <div className="floating-card float-top-right">
                <div className="fc-header-split">
                  <span className="fc-muted">Từ vựng</span>
                  <span className="speaker-icon">🔊</span>
                </div>
                <div className="vocab-head">opportunity</div>
                <div className="vocab-ipa">/ˌɒpəˈtjuːnəti/</div>
                <div className="vocab-meaning">(n) cơ hội</div>
              </div>

              {/* Middle Right Floating Card: Mục tiêu TOEIC */}
              <div className="floating-card float-mid-right">
                <div className="fc-muted mb-4">Mục tiêu TOEIC</div>
                <div className="chart-and-score">
                  <div className="mini-bars">
                    <span style={{ height: '40%' }}></span>
                    <span style={{ height: '65%' }}></span>
                    <span style={{ height: '90%' }}></span>
                  </div>
                  <div className="target-score">650+</div>
                </div>
              </div>

              {/* Main TOEIC Practice Card Center */}
              <div className="hero-main-card">
                <div className="main-card-header">
                  <div>
                    <div className="card-main-title">TOEIC Practice</div>
                    <div className="card-sub-title">Part 5 - Incomplete Sentences</div>
                  </div>
                  <div className="timer-badge-red">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <circle cx="12" cy="12" r="10"></circle>
                      <polyline points="12 6 12 12 16 14"></polyline>
                    </svg>
                    <span>00:45:12</span>
                  </div>
                </div>

                <div className="main-card-question">
                  The company is considering ________ its office to a larger space next year.
                </div>

                <div className="main-card-options">
                  <div className="mc-opt active">
                    <span className="opt-letter">A.</span> expanding
                  </div>
                  <div className="mc-opt">
                    <span className="opt-letter">B.</span> expand
                  </div>
                  <div className="mc-opt">
                    <span className="opt-letter">C.</span> expansion
                  </div>
                  <div className="mc-opt">
                    <span className="opt-letter">D.</span> expansive
                  </div>
                </div>

                <div className="main-card-footer">
                  <button className="mc-arrow-btn">‹</button>
                  <span className="mc-counter">4 / 20</span>
                  <button className="mc-arrow-btn active">›</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3. Feature Strip (Continuous Capability Bar) */}
      <section className="feature-strip-section">
        <div className="section-container">
          <div className="capability-bar-wrapper">
            <div className="capability-item">
              <div className="cap-number">01</div>
              <div className="cap-icon-box icon-blue">
                <span style={{ fontWeight: '800', color: '#854D0E', fontSize: '15px' }}>A</span>
              </div>
              <div className="cap-content">
                <h4 className="cap-title">Từ vựng</h4>
                <span className="cap-sub">Tra cứu IPA</span>
              </div>
            </div>

            <div className="cap-divider"></div>

            <div className="capability-item">
              <div className="cap-number">02</div>
              <div className="cap-icon-box icon-indigo">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4F46E5" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                  <polyline points="14 2 14 8 20 8"></polyline>
                </svg>
              </div>
              <div className="cap-content">
                <h4 className="cap-title">Tài liệu</h4>
                <span className="cap-sub">Tập trung</span>
              </div>
            </div>

            <div className="cap-divider"></div>

            <div className="capability-item">
              <div className="cap-number">03</div>
              <div className="cap-icon-box icon-emerald">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 11 12 14 22 4"></polyline>
                  <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
                </svg>
              </div>
              <div className="cap-content">
                <h4 className="cap-title">Luyện tập</h4>
                <span className="cap-sub">Tự chấm</span>
              </div>
            </div>

            <div className="cap-divider"></div>

            <div className="capability-item">
              <div className="cap-number">04</div>
              <div className="cap-icon-box icon-amber">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"></circle>
                  <polyline points="12 6 12 12 16 14"></polyline>
                </svg>
              </div>
              <div className="cap-content">
                <h4 className="cap-title">TOEIC</h4>
                <span className="cap-sub">Mô phỏng thi</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4. Ecosystem Section (Bento Grid with Mini Product Visuals) */}
      <section id="ecosystem" className="ecosystem-section">
        <div className="section-container">
          <div className="section-header center">
            <span className="section-badge-top">TẤT CẢ TRONG MỘT NỀN TẢNG</span>
            <h2 className="section-title">
              Mọi thứ bạn cần <span className="blue-bold">để học tiếng Anh</span>
            </h2>
            <p className="section-desc">
              Hệ thống được thiết kế trực quan, hiển thị sản phẩm thật giúp bạn dễ dàng trải nghiệm và theo dõi tiến độ.
            </p>
          </div>

          <div className="bento-learning-grid bento-4card-grid">
            {/* 1. Card: Từ vựng */}
            <div className="bento-card card-tint-mint">
              <div className="bento-card-header-row">
                <div className="bento-badge-icon icon-bg-mint">
                  <span className="mint-letter">A</span>
                </div>
                <Link to={isAuthenticated ? "/student/my-courses" : "/login"} className="bento-arrow-link" aria-label="Từ vựng">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                    <polyline points="12 5 19 12 12 19"></polyline>
                  </svg>
                </Link>
              </div>
              <h3 className="bento-title">Sổ tay từ vựng</h3>
              <p className="bento-desc">Tra cứu từ vựng IPA chuẩn kèm audio phát âm và ví dụ thực tế.</p>
              {/* Mini Product Visual: Word Card */}
              <div className="mini-visual-vocab-card">
                <div className="mv-vocab-header">
                  <span className="mv-vocab-word">opportunity</span>
                  <span className="mv-speaker-btn">🔊</span>
                </div>
                <div className="mv-vocab-row-sub">
                  <span className="mv-vocab-ipa">/ˌɒpəˈtjuːnəti/</span>
                  <span className="mv-vocab-type">noun</span>
                </div>
                <div className="mv-vocab-meaning">(n) cơ hội phát triển sự nghiệp</div>
              </div>
            </div>

            {/* 2. Card: Tài liệu */}
            <div className="bento-card card-tint-purple">
              <div className="bento-card-header-row">
                <div className="bento-badge-icon icon-bg-purple">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" strokeWidth="2.2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                  </svg>
                </div>
                <Link to={isAuthenticated ? "/student/my-courses" : "/login"} className="bento-arrow-link" aria-label="Tài liệu">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                    <polyline points="12 5 19 12 12 19"></polyline>
                  </svg>
                </Link>
              </div>
              <h3 className="bento-title">Tài liệu học tập</h3>
              <p className="bento-desc">Tài liệu PDF & Docx đính kèm theo từng bài học.</p>
              {/* Mini Product Visual: Document Rows */}
              <div className="mini-visual-docs">
                <div className="mv-doc-row">
                  <span className="pdf-tag">PDF</span>
                  <div className="doc-meta-col">
                    <span className="doc-name">Grammar_Summary.pdf</span>
                    <span className="doc-size">1.4 MB</span>
                  </div>
                  <span className="doc-download-icon">⬇</span>
                </div>
                <div className="mv-doc-row">
                  <span className="docx-tag">DOC</span>
                  <div className="doc-meta-col">
                    <span className="doc-name">Part5_Vocab_List.docx</span>
                    <span className="doc-size">850 KB</span>
                  </div>
                  <span className="doc-download-icon">⬇</span>
                </div>
              </div>
            </div>

            {/* 3. Card: Luyện tập */}
            <div className="bento-card card-tint-orange">
              <div className="bento-card-header-row">
                <div className="bento-badge-icon icon-bg-orange">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2.2">
                    <path d="M9 11l3 3L22 4"></path>
                    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
                  </svg>
                </div>
                <Link to={isAuthenticated ? "/student/assessments" : "/login"} className="bento-arrow-link" aria-label="Luyện tập">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                    <polyline points="12 5 19 12 12 19"></polyline>
                  </svg>
                </Link>
              </div>
              <h3 className="bento-title">Luyện tập tự chấm</h3>
              <p className="bento-desc">Bài tập trắc nghiệm tự động chấm điểm và giải thích tức thì.</p>
              {/* Mini Product Visual: Quiz Option */}
              <div className="mini-visual-quiz">
                <div className="mv-quiz-opt active">
                  <span className="mv-opt-tag">A</span>
                  <span className="mv-opt-text">expanding</span>
                  <span className="mv-correct-icon">✓</span>
                </div>
                <div className="mv-quiz-opt">
                  <span className="mv-opt-tag">B</span>
                  <span className="mv-opt-text">expansion</span>
                </div>
              </div>
            </div>

            {/* 4. Card: Thi thử TOEIC */}
            <div className="bento-card card-tint-rose">
              <div className="bento-card-header-row">
                <div className="bento-badge-icon icon-bg-rose">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#E11D48" strokeWidth="2.2">
                    <path d="M3 18v-6a9 9 0 0 1 18 0v6"></path>
                    <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 1 2 2h1a2 2 0 0 0 2-2V8z"></path>
                  </svg>
                </div>
                <Link to={isAuthenticated ? "/student/toeic" : "/login"} className="bento-arrow-link" aria-label="Thi thử TOEIC">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                    <polyline points="12 5 19 12 12 19"></polyline>
                  </svg>
                </Link>
              </div>
              <h3 className="bento-title">Thi thử TOEIC</h3>
              <p className="bento-desc">Đồng hồ đếm ngược 120 phút & ma trận đề thi chuẩn ETS.</p>
              {/* Mini Product Visual: TOEIC Timer + Progress */}
              <div className="mini-visual-toeic">
                <div className="mv-toeic-header">
                  <div className="mv-toeic-timer">⏱️ 01:45:12</div>
                  <span className="mv-toeic-live-tag">LIVE</span>
                </div>
                <div className="mv-toeic-bar">
                  <div className="mv-toeic-fill" style={{ width: '85%' }}></div>
                </div>
                <div className="mv-toeic-meta">Part 5 • Đã hoàn thành 30/30 câu</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 5. TOEIC Showcase Section */}
      <section id="toeic-showcase" className="toeic-showcase-section">
        <div className="section-container">
          <div className="toeic-showcase-grid">
            {/* Left Description Side */}
            <div className="toeic-left-content">
              <span className="blue-badge-pill">TRẢI NGHIỆM NHƯ KỲ THI THẬT</span>
              <h2 className="showcase-heading">Luyện thi TOEIC hiệu quả hơn</h2>
              <p className="showcase-desc">
                Hệ thống đề thi được thiết kế theo cấu trúc thực tế, giúp bạn làm quen với áp lực thời gian và cải thiện điểm số.
              </p>

              <div className="toeic-check-list">
                <div className="check-item">
                  <span className="check-icon">✓</span>
                  <span>Đủ 7 Parts - 200 câu - 120 phút</span>
                </div>
                <div className="check-item">
                  <span className="check-icon">✓</span>
                  <span>Giao diện thi giống đề thật</span>
                </div>
                <div className="check-item">
                  <span className="check-icon">✓</span>
                  <span>Lưu đáp án, tiếp tục khi quay lại</span>
                </div>
                <div className="check-item">
                  <span className="check-icon">✓</span>
                  <span>Kết quả chi tiết theo từng Part</span>
                </div>
              </div>

              <Link to={isAuthenticated ? "/student/toeic" : "/login"} className="btn-primary-gradient">
                Khám Phá Đề Thi TOEIC
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                  <polyline points="12 5 19 12 12 19"></polyline>
                </svg>
              </Link>
            </div>

            {/* Right Interactive Window Mockup Side */}
            <div className="toeic-right-mockup">
              <div className="browser-window">
                <div className="bw-header">
                  <div className="bw-brand">
                    <span className="bw-title">Ms Uyen</span>
                    <span className="bw-sub">Thi thử TOEIC &gt; Test 1 - 2026</span>
                  </div>
                  <div className="bw-right">
                    <div className="bw-timer">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2">
                        <circle cx="12" cy="12" r="10"></circle>
                        <polyline points="12 6 12 12 16 14"></polyline>
                      </svg>
                      <span>00:45:12</span>
                    </div>
                    <button className="bw-submit-btn">Nộp bài</button>
                  </div>
                </div>

                <div className="bw-body">
                  {/* Question Matrix Sidebar */}
                  <div className="bw-sidebar">
                    <div className="bw-part-header">
                      <span>Part 5</span>
                      <span className="bw-q-count">Câu 4 / 30</span>
                    </div>
                    <div className="matrix-grid">
                      <span className="m-cell done">1</span>
                      <span className="m-cell done">2</span>
                      <span className="m-cell done">3</span>
                      <span className="m-cell active">4</span>
                      <span className="m-cell">5</span>
                      <span className="m-cell">6</span>
                      <span className="m-cell">7</span>
                      <span className="m-cell">8</span>
                      <span className="m-cell">9</span>
                      <span className="m-cell">10</span>
                      <span className="m-cell">11</span>
                      <span className="m-cell">12</span>
                      <span className="m-cell">13</span>
                      <span className="m-cell">14</span>
                      <span className="m-cell">15</span>
                      <span className="m-cell">16</span>
                      <span className="m-cell">17</span>
                      <span className="m-cell">18</span>
                      <span className="m-cell">19</span>
                      <span className="m-cell">20</span>
                      <span className="m-cell">21</span>
                      <span className="m-cell">22</span>
                      <span className="m-cell">23</span>
                      <span className="m-cell">24</span>
                      <span className="m-cell">25</span>
                      <span className="m-cell">26</span>
                      <span className="m-cell">27</span>
                      <span className="m-cell">28</span>
                      <span className="m-cell">29</span>
                      <span className="m-cell">30</span>
                    </div>
                    <div className="matrix-legend">
                      <span><i className="lg-dot done"></i> Đã làm</span>
                      <span><i className="lg-dot"></i> Chưa làm</span>
                      <span><i className="lg-dot active"></i> Đang làm</span>
                      <span><i className="lg-dot flag"></i> Đánh dấu</span>
                    </div>
                  </div>

                  {/* Question Panel */}
                  <div className="bw-content">
                    <div className="bw-question-text">
                      The manager requested that all employees ________ their monthly sales reports before Friday afternoon.
                    </div>

                    <div className="bw-options">
                      <div className="bw-opt">
                        <span className="bw-opt-letter">A.</span> submit
                      </div>
                      <div className="bw-opt">
                        <span className="bw-opt-letter">B.</span> submitted
                      </div>
                      <div className="bw-opt">
                        <span className="bw-opt-letter">C.</span> submitting
                      </div>
                      <div className="bw-opt">
                        <span className="bw-opt-letter">D.</span> submission
                      </div>
                    </div>

                    <div className="bw-footer-nav">
                      <button className="bw-btn-nav">← Câu trước</button>
                      <button className="bw-btn-nav primary">Câu tiếp theo →</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 6. Onboarding Journey Section (3 Steps Horizontal Journey) */}
      <section id="workflow" className="onboarding-journey-section">
        <div className="section-container">
          <div className="section-header center">
            <span className="section-badge-top">BẮT ĐẦU DỄ DÀNG</span>
            <h2 className="section-title">Chỉ 3 bước để bắt đầu</h2>
            <p className="section-desc">
              Hành trình đơn giản giúp bạn kích hoạt tài khoản và tiếp cận kho bài học chuẩn hóa ngay hôm nay.
            </p>
          </div>

          <div className="journey-main-container">
            <div className="journey-connecting-line"></div>

            <div className="journey-steps-grid">
              {/* Step 1 */}
              <div className="journey-step-item">
                <div className="journey-node-box">
                  <div className="node-number step-blue">01</div>
                  <div className="node-icon icon-bg-blue">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                      <circle cx="8.5" cy="7" r="4"></circle>
                      <line x1="20" y1="8" x2="20" y2="14"></line>
                      <line x1="23" y1="11" x2="17" y2="11"></line>
                    </svg>
                  </div>
                </div>
                <h3 className="journey-step-title">Đăng ký tài khoản</h3>
                <p className="journey-step-desc">
                  Chỉ mất vài phút để tạo tài khoản học viên trên hệ thống.
                </p>
              </div>

              {/* Step 2 */}
              <div className="journey-step-item">
                <div className="journey-node-box">
                  <div className="node-number step-green">02</div>
                  <div className="node-icon icon-bg-mint">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                      <path d="m9 12 2 2 4-4"></path>
                    </svg>
                  </div>
                </div>
                <h3 className="journey-step-title">Giáo viên xác nhận</h3>
                <p className="journey-step-desc">
                  Tài khoản được duyệt trước khi truy cập nội dung học.
                </p>
              </div>

              {/* Step 3 */}
              <div className="journey-step-item">
                <div className="journey-node-box">
                  <div className="node-number step-purple">03</div>
                  <div className="node-icon icon-bg-purple">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 10v6M2 10l10-5 10 5-10 5z"></path>
                      <path d="M6 12v5c3 3 9 3 12 0v-5"></path>
                    </svg>
                  </div>
                </div>
                <h3 className="journey-step-title">Bắt đầu học</h3>
                <p className="journey-step-desc">
                  Truy cập bài học, tài liệu, luyện tập và thi thử TOEIC.
                </p>
              </div>

              {/* Step 4: Ready Success Visual State */}
              <div className="journey-step-item journey-endpoint">
                <div className="journey-success-card">
                  <div className="success-badge-row">
                    <span className="success-check-icon">✓</span>
                    <span className="success-text">Tài khoản đã sẵn sàng</span>
                  </div>
                  <p className="success-welcome">Chào mừng bạn đến với Ms Uyen</p>
                  <div className="success-check-grid">
                    <span>Bài học ✓</span>
                    <span>Tài liệu ✓</span>
                    <span>Luyện tập ✓</span>
                    <span>TOEIC ✓</span>
                  </div>
                  <Link to={isAuthenticated ? getDashboardPath() : "/register"} className="btn-journey-start">
                    Bắt đầu học ➔
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 7. Final CTA Section (Premium Composition) */}
      <section className="final-cta-section">
        <div className="section-container">
          <div className="final-cta-banner">
            <div className="cta-bg-glow"></div>

            <div className="cta-content-left">
              <span className="cta-eyebrow">✦ BẮT ĐẦU HÀNH TRÌNH</span>
              <h2 className="cta-title">
                Sẵn sàng học tiếng Anh<br />cùng Ms Uyen?
              </h2>
              <p className="cta-subtitle">
                Bài học • Tài liệu • Luyện tập • Thi thử TOEIC được sắp xếp khoa học giúp bạn học hiệu quả mỗi ngày.
              </p>
              <div className="cta-buttons-group">
                {isAuthenticated ? (
                  <Link to={getDashboardPath()} className="btn-cta-white">
                    Đến Trang Học Tập ➔
                  </Link>
                ) : (
                  <>
                    <Link to="/register" className="btn-cta-white">
                      Đăng Ký Học Viên ➔
                    </Link>
                    <Link to="/login" className="btn-cta-outline">
                      Đăng Nhập
                    </Link>
                  </>
                )}
              </div>
            </div>

            <div className="cta-visual-right">
              <div className="cta-decorative-card">
                <div className="cta-card-row">
                  <span className="cta-mini-tag">TOEIC Practice</span>
                  <span className="cta-mini-score">Score 850+</span>
                </div>
                <div className="cta-options-pills">
                  <span className="cta-pill active">A. expanding</span>
                  <span className="cta-pill">B. expansion</span>
                </div>
                <div className="cta-card-footer-note">
                  <span>🎧 Listening & Reading</span>
                  <span className="cta-check">✓ Completed</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 8. Dark Navy Footer */}
      <footer className="parroto-footer dark-navy-footer">
        <div className="footer-container">
          <div className="footer-5col-grid">
            {/* Col 1: Brand */}
            <div className="footer-col brand-col">
              <Link to="/" className="brand-logo footer-logo">
                <span className="brand-title-text footer-brand-title text-white">Ms Uyen<span className="brand-dot">.</span></span>
              </Link>
              <div className="footer-tagline text-indigo-light">Học tập • Luyện tập • TOEIC</div>
              <p className="footer-brand-desc text-slate-light">
                Không gian học tiếng Anh trực tuyến giúp bạn học tập, luyện tập và theo dõi tiến bộ mỗi ngày.
              </p>
            </div>

            {/* Col 2: Học tập */}
            <div className="footer-col">
              <h4 className="footer-col-title text-white">Học tập</h4>
              <ul className="footer-nav-list dark-nav-list">
                <li><Link to={isAuthenticated ? "/student/my-courses" : "/login"}>Bài học</Link></li>
                <li><Link to={isAuthenticated ? "/student/my-courses" : "/login"}>Tài liệu</Link></li>
                <li><Link to={isAuthenticated ? "/student/my-courses" : "/login"}>Từ vựng</Link></li>
                <li><Link to={isAuthenticated ? "/student/assessments" : "/login"}>Luyện tập</Link></li>
              </ul>
            </div>

            {/* Col 3: Kiểm tra */}
            <div className="footer-col">
              <h4 className="footer-col-title text-white">Kiểm tra</h4>
              <ul className="footer-nav-list dark-nav-list">
                <li><Link to={isAuthenticated ? "/student/assessments" : "/login"}>Bài tập</Link></li>
                <li><Link to={isAuthenticated ? "/student/toeic" : "/login"}>Thi thử TOEIC</Link></li>
                <li><Link to={isAuthenticated ? "/student/history" : "/login"}>Lịch sử kết quả</Link></li>
              </ul>
            </div>

            {/* Col 4: Tài khoản */}
            <div className="footer-col">
              <h4 className="footer-col-title text-white">Tài khoản</h4>
              <ul className="footer-nav-list dark-nav-list">
                <li><Link to="/login">Đăng nhập</Link></li>
                <li><Link to="/register">Đăng ký học viên</Link></li>
              </ul>
            </div>

            {/* Col 5: Hỗ trợ */}
            <div className="footer-col">
              <h4 className="footer-col-title text-white">Hỗ trợ</h4>
              <ul className="footer-nav-list dark-nav-list">
                <li><Link to={isAuthenticated ? "/student/my-courses" : "/login"}>Hướng dẫn học tập</Link></li>
                <li><Link to={isAuthenticated ? "/student/profile" : "/login"}>Hồ sơ học viên</Link></li>
              </ul>
            </div>
          </div>

          <div className="footer-bottom-line dark-bottom-line">
            <div>© {new Date().getFullYear()} Ms Uyen. All rights reserved.</div>
            <Link to={isAuthenticated ? getDashboardPath() : "/login"} className="footer-link-action">
              Học hôm nay ➔
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

