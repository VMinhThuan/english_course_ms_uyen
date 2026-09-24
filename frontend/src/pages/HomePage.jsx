import { Link, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import useAuthStore from '../store/authStore.js';
import bannerImg from '../images/assets/banner.png';
import img1 from '../images/assets/img-1.jpg';
import img2 from '../images/assets/img-2.png';
import img3 from '../images/assets/img-3.jpg';
import img4 from '../images/assets/img-4.jpg';
import img5 from '../images/assets/img-5.jpg';
import img6 from '../images/assets/img-6.jpg';
import './HomePage.css';

export default function HomePage() {
  const [scrolled, setScrolled] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [openFaqIndex, setOpenFaqIndex] = useState(null);

  const user = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const logout = useAuthStore((state) => state.logout);
  const fetchUser = useAuthStore((state) => state.fetchUser);
  const navigate = useNavigate();

  useEffect(() => {
    document.title = 'Toeic Ms Uyen | Học tiếng Anh & Luyện thi TOEIC';
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

  const faqData = [
    {
      q: '01. Làm thế nào để luyện nghe hiệu quả?',
      a: 'Không có một cách luyện nghe nào hiệu quả ngay lập tức, chỉ có việc luyện nghe đủ lâu mới thật sự có hiệu quả. Hãy cho bản thân thời gian để tiếp cận, làm quen và tạo thành thói quen. Bắt đầu từ 1–2 phút mỗi ngày với những bài nghe đơn giản, sau đó tăng dần thời gian và độ khó. Khi đã quen hơn, hãy chuyển sang nghe TOEIC, nghe đi nghe lại, ngẫm theo và đọc theo liên tục. Nghe thường xuyên, rồi em sẽ nghe tốt hơn.',
    },
    {
      q: '02. Làm thế nào để ghi nhớ từ vựng lâu hơn?',
      a: 'Em cứ học thôi và đừng quá quan tâm bao lâu thì mình sẽ nhớ. Bản chất của bộ não là ghi nhớ những thứ được gặp lại thường xuyên và nhiều lần, nên việc ép bản thân phải nhớ hàng loạt từ vựng chỉ sau 1–2 buổi là không thực tế.\n\nVậy nên, em cứ để bản thân quên. Điều quan trọng là thông cảm và kiên nhẫn với sự quên đó, rồi tiếp tục học và ôn lại. Sự lặp lại và việc tạo ra thật nhiều cơ hội để gặp lại từ vựng chính là cách tốt nhất để ghi nhớ lâu hơn.',
    },
    {
      q: '03. Cần chuẩn bị gì để chinh phục kỳ thi TOEIC?',
      a: 'Trước hết cần nắm chắc nền tảng ngữ pháp, từ vựng và cách làm từng Part. Sau đó luyện đề đều đặn, chữa kỹ lỗi sai và biết mình đang yếu ở đâu để cải thiện đúng chỗ. Quan trọng nhất là có một lộ trình phù hợp với trình độ hiện tại.',
    },
    {
      q: '04. Làm thế nào để xây dựng lộ trình 700+?',
      a: 'Đừng vội lao vào luyện đề khi nền tảng chưa vững. Hãy xác định trình độ hiện tại, củng cố những phần còn yếu rồi tăng dần độ khó qua từng giai đoạn. Với mục tiêu 700+, sự đều đặn và một lộ trình rõ ràng sẽ quan trọng hơn việc học thật nhiều trong thời gian ngắn.',
    },
  ];

  const toggleFaq = (index) => {
    setOpenFaqIndex(openFaqIndex === index ? null : index);
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
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
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
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                        <circle cx="12" cy="7" r="4"></circle>
                      </svg>
                      <span>Hồ Sơ Cá Nhân</span>
                    </Link>
                    <div className="user-dropdown-divider"></div>
                    <button className="user-dropdown-item logout-item" onClick={handleLogout}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
                <Link to="/login" className="btn-login-pill">Đăng Nhập</Link>
                <Link to="/register" className="btn-cta-yellow-sm">Đăng Ký Học Viên</Link>
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

      {/* 2. Hero Section (Keeping bannerImg as requested) */}
      <section id="hero" className="warm-hero-section">
        <div
          className="warm-hero-bg"
          style={{ backgroundImage: `url(${bannerImg})` }}
        />
        <div className="warm-hero-overlay" />

        <div className="warm-hero-container">
          <div className="warm-hero-grid">
            {/* Left Hero Content */}
            <div className="warm-hero-content">
              <span className="hero-tag-light">ONLINE TOEIC CLASS</span>
              <h1 className="warm-hero-title">
                More than a score.
              </h1>
              <p className="warm-hero-subheading">
                A better you starts with a better way of learning.
              </p>
              <p className="warm-hero-description">
                Không gian học tiếng Anh trực tuyến giúp bạn học tập, luyện tập và theo dõi tiến bộ mỗi ngày.
              </p>
              <div className="warm-hero-actions">
                {isAuthenticated ? (
                  <Link to={getDashboardPath()} className="btn-cta-yellow">
                    VÀO TRANG HỌC TẬP →
                  </Link>
                ) : (
                  <>
                    <Link to="/register" className="btn-cta-yellow">
                      Đăng Ký Học Viên →
                    </Link>
                    <Link to="/student/toeic" className="btn-glass-hero">
                      Thi Thử TOEIC
                    </Link>
                  </>
                )}
              </div>

              {/* Bottom quote & slider nav */}
              <div className="hero-bottom-bar">
                <div className="hero-quote">
                  "Discipline today, a brighter tomorrow."
                </div>
                <div className="hero-slider-nav">
                  <span>01 / 04</span>
                  <button aria-label="Previous">&lt;</button>
                  <button aria-label="Next">&gt;</button>
                </div>
              </div>
            </div>

            {/* Right Hero Mini Glass Card Stack */}
            <div className="warm-hero-right-visual">
              <div className="hero-glass-card">
                <div className="glass-card-item">
                  <div className="glass-card-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                      <polyline points="22 4 12 14.01 9 11.01"></polyline>
                    </svg>
                  </div>
                  <div className="glass-card-text">
                    <div className="glass-card-value">650+ 750+ 850+</div>
                    <div className="glass-card-label">Practice score trung bình</div>
                  </div>
                </div>

                <div className="glass-card-divider"></div>

                <div className="glass-card-item">
                  <div className="glass-card-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 18v-6a9 9 0 0 1 18 0v6"></path>
                      <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2V8z"></path>
                    </svg>
                  </div>
                  <div className="glass-card-text">
                    <div className="glass-card-title">Listening & Reading</div>
                    <div className="glass-card-label">Học theo format TOEIC chuẩn</div>
                  </div>
                </div>

                <div className="glass-card-divider"></div>

                <div className="glass-card-item">
                  <div className="glass-card-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="20" x2="18" y2="10"></line>
                      <line x1="12" y1="20" x2="12" y2="4"></line>
                      <line x1="6" y1="20" x2="6" y2="14"></line>
                    </svg>
                  </div>
                  <div className="glass-card-text">
                    <div className="glass-card-title">Lộ trình rõ ràng</div>
                    <div className="glass-card-label">Bám sát mục tiêu điểm số</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3. Benefits / Trust Bar */}
      <section className="warm-benefits-bar">
        <div className="section-container">
          <div className="benefits-grid">
            <div className="benefit-item">
              <div className="benefit-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                  <path d="m9 12 2 2 4-4"></path>
                </svg>
              </div>
              <div className="benefit-content">
                <h4 className="benefit-title">SOLID FOUNDATION</h4>
                <p className="benefit-sub">Xây nền tảng vững chắc</p>
              </div>
            </div>

            <div className="benefit-item">
              <div className="benefit-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="12" y1="16" x2="12" y2="12"></line>
                  <line x1="12" y1="8" x2="12.01" y2="8"></line>
                </svg>
              </div>
              <div className="benefit-content">
                <h4 className="benefit-title">CLEAR EXPLANATION</h4>
                <p className="benefit-sub">Giải thích dễ hiểu</p>
              </div>
            </div>

            <div className="benefit-item">
              <div className="benefit-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <line x1="22" y1="2" x2="11" y2="13"></line>
                  <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                </svg>
              </div>
              <div className="benefit-content">
                <h4 className="benefit-title">PRACTICE SMARTER</h4>
                <p className="benefit-sub">Luyện tập có chiến lược</p>
              </div>
            </div>

            <div className="benefit-item">
              <div className="benefit-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                  <polyline points="22 4 12 14.01 9 11.01"></polyline>
                </svg>
              </div>
              <div className="benefit-content">
                <h4 className="benefit-title">REAL PROGRESS</h4>
                <p className="benefit-sub">Nhìn thấy sự tiến bộ qua từng giai đoạn</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4. How It Works Section (Replaces Meet Your Teacher as requested) */}
      <section id="workflow" className="how-it-works-section">
        <div className="section-container">
          <div className="how-it-works-header">
            <div className="header-left">
              <span className="section-eyebrow-badge">BẮT ĐẦU DỄ DÀNG</span>
              <h2 className="section-title-serif">Chỉ 3 bước để bắt đầu</h2>
              <p className="section-desc-text">
                Hành trình đơn giản giúp bạn kích hoạt tài khoản và tiếp cận kho bài học chuẩn hóa ngay hôm nay.
              </p>
            </div>
            <div className="header-right">
              <Link to="/register" className="btn-register-link">
                Đăng Ký Học Viên →
              </Link>
            </div>
          </div>

          <div className="three-steps-grid">
            {/* Step 01 */}
            <div className="step-card">
              <div className="step-card-header">
                <div className="step-icon-bg">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#4B4035" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                    <circle cx="8.5" cy="7" r="4"></circle>
                    <line x1="20" y1="8" x2="20" y2="14"></line>
                    <line x1="23" y1="11" x2="17" y2="11"></line>
                  </svg>
                </div>
                <span className="step-number">01</span>
              </div>
              <h3 className="step-title">Đăng ký tài khoản</h3>
              <p className="step-desc">
                Chỉ mất vài phút để tạo tài khoản học viên trên hệ thống.
              </p>
            </div>

            <div className="step-arrow">→</div>

            {/* Step 02 */}
            <div className="step-card">
              <div className="step-card-header">
                <div className="step-icon-bg">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#4B4035" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                    <path d="m9 12 2 2 4-4"></path>
                  </svg>
                </div>
                <span className="step-number">02</span>
              </div>
              <h3 className="step-title">Giáo viên xác nhận</h3>
              <p className="step-desc">
                Tài khoản được duyệt trước khi truy cập nội dung học.
              </p>
            </div>

            <div className="step-arrow">→</div>

            {/* Step 03 */}
            <div className="step-card">
              <div className="step-card-header">
                <div className="step-icon-bg">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#4B4035" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 10v6M2 10l10-5 10 5-10 5z"></path>
                    <path d="M6 12v5c3 3 9 3 12 0v-5"></path>
                  </svg>
                </div>
                <span className="step-number">03</span>
              </div>
              <h3 className="step-title">Bắt đầu học</h3>
              <p className="step-desc">
                Truy cập bài học, tài liệu, luyện tập và thi thử TOEIC.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 5. Course Visual Section (Using img-6.jpg - Preserving layout as requested) */}
      <section className="about-course-section">
        <div className="section-container">
          <div className="about-course-grid">
            <div className="about-course-visual">
              <div className="editorial-img-box">
                <img src={img6} alt="Toeic Ms Uyen" />
              </div>
            </div>
            <div className="about-course-text">
              {/* Layout structure preserved for future text */}
            </div>
          </div>
        </div>
      </section>

      {/* 6. Classroom Gallery Section (Renamed to CÙNG CÔ HỌC TẬP, CÙNG EM TIẾN BỘ MỖI NGÀY) */}
      <section className="classroom-gallery-section">
        <div className="section-container">
          <div className="classroom-grid">
            <div className="classroom-text">
              <span className="section-eyebrow-badge">ONLINE & INTERACTIVE</span>
              <h2 className="section-title-serif uppercase">
                CÙNG CÔ HỌC TẬP, CÙNG EM TIẾN BỘ MỖI NGÀY
              </h2>
              <p className="meet-teacher-sub">
                Not just lessons, but a place to keep showing up.
              </p>
              <Link to="/register" className="btn-read-more-link">
                XEM TRẢI NGHIỆM LỚP HỌC →
              </Link>
            </div>

            <div className="classroom-gallery-grid">
              <div className="gallery-top-wide">
                <img src={img2} alt="Classroom view" />
              </div>
              <div className="gallery-bottom-row">
                <div className="gallery-item-small">
                  <img src={img3} alt="Notebook study desk" />
                </div>
                <div className="gallery-item-small">
                  <img src={img4} alt="Desk setup and books" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 8. TOEIC Mock Test Feature */}
      <section id="toeic-showcase" className="toeic-showcase-section">
        <div className="section-container">
          <div className="dark-coffee-container">
            <div className="toeic-showcase-grid">
              {/* Left Content (40%) */}
              <div className="toeic-left-content">
                <span className="dark-section-badge">TRẢI NGHIỆM NHƯ KỲ THI THẬT</span>
                <h2 className="dark-section-title">Luyện thi TOEIC<br />hiệu quả hơn</h2>
                <p className="dark-section-desc">
                  Hệ thống đề thi được thiết kế theo cấu trúc thực tế, giúp bạn làm quen với áp lực thời gian và cải thiện điểm số.
                </p>

                <div className="toeic-checklist">
                  <div className="check-item">
                    <span className="check-mark">✓</span>
                    <span>Đủ 7 Parts – 200 câu – 120 phút</span>
                  </div>
                  <div className="check-item">
                    <span className="check-mark">✓</span>
                    <span>Giao diện thi giống đề thật</span>
                  </div>
                  <div className="check-item">
                    <span className="check-mark">✓</span>
                    <span>Lưu đáp án, tiếp tục khi quay lại</span>
                  </div>
                  <div className="check-item">
                    <span className="check-mark">✓</span>
                    <span>Kết quả chi tiết theo từng Part</span>
                  </div>
                </div>

                <Link to={isAuthenticated ? "/student/toeic" : "/login"} className="btn-cta-yellow btn-toeic-cta">
                  Khám Phá Đề Thi TOEIC →
                </Link>
              </div>

              {/* Right Interactive Mockup (60%) */}
              <div className="toeic-right-mockup">
                <div className="browser-mockup-panel">
                  <div className="bmp-header">
                    <div className="bmp-brand">
                      <span className="bmp-title">Ms Uyen</span>
                      <span className="bmp-sub">Thi thử TOEIC / Test 1 – 2026</span>
                    </div>
                    <div className="bmp-right">
                      <div className="bmp-timer">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="12" r="10"></circle>
                          <polyline points="12 6 12 12 16 14"></polyline>
                        </svg>
                        <span>00:45:12</span>
                      </div>
                      <button className="bmp-submit-btn">Nộp bài</button>
                    </div>
                  </div>

                  <div className="bmp-body">
                    <div className="bmp-sidebar">
                      <div className="bmp-part-info">
                        <span className="bmp-part-name">Part 5</span>
                        <span className="bmp-q-count">Câu 4 / 30</span>
                      </div>
                      <div className="bmp-grid">
                        <span className="bmp-cell done">1</span>
                        <span className="bmp-cell done">2</span>
                        <span className="bmp-cell done">3</span>
                        <span className="bmp-cell active">4</span>
                        <span className="bmp-cell">5</span>
                        <span className="bmp-cell">6</span>
                        <span className="bmp-cell">7</span>
                        <span className="bmp-cell">8</span>
                        <span className="bmp-cell">9</span>
                        <span className="bmp-cell">10</span>
                        <span className="bmp-cell">11</span>
                        <span className="bmp-cell">12</span>
                        <span className="bmp-cell">13</span>
                        <span className="bmp-cell">14</span>
                        <span className="bmp-cell">15</span>
                        <span className="bmp-cell">16</span>
                        <span className="bmp-cell">17</span>
                        <span className="bmp-cell">18</span>
                        <span className="bmp-cell">19</span>
                        <span className="bmp-cell">20</span>
                        <span className="bmp-cell">21</span>
                        <span className="bmp-cell">22</span>
                        <span className="bmp-cell">23</span>
                        <span className="bmp-cell">24</span>
                        <span className="bmp-cell">25</span>
                        <span className="bmp-cell">26</span>
                        <span className="bmp-cell">27</span>
                        <span className="bmp-cell">28</span>
                        <span className="bmp-cell">29</span>
                        <span className="bmp-cell">30</span>
                      </div>
                      <div className="bmp-legend">
                        <span><i className="dot done"></i> Đã làm</span>
                        <span><i className="dot"></i> Chưa làm</span>
                        <span><i className="dot active"></i> Đang làm</span>
                      </div>
                    </div>

                    <div className="bmp-content">
                      <div className="bmp-question-text">
                        The manager requested that all employees ________ their monthly sales reports before Friday afternoon.
                      </div>

                      <div className="bmp-options">
                        <div className="bmp-opt">
                          <span className="bmp-opt-letter">A.</span> submit
                        </div>
                        <div className="bmp-opt">
                          <span className="bmp-opt-letter">B.</span> submitted
                        </div>
                        <div className="bmp-opt">
                          <span className="bmp-opt-letter">C.</span> submitting
                        </div>
                        <div className="bmp-opt">
                          <span className="bmp-opt-letter">D.</span> submission
                        </div>
                      </div>

                      <div className="bmp-footer-nav">
                        <button className="bmp-btn-prev">← Câu trước</button>
                        <button className="bmp-btn-next">Câu tiếp theo →</button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 9. Learning Ecosystem Section */}
      <section id="ecosystem" className="ecosystem-section">
        <div className="section-container">
          <div className="ecosystem-header">
            <h2 className="section-title-serif uppercase">
              CÙNG CÔ HỌC TẬP, CÙNG EM TIẾN BỘ MỖI NGÀY
            </h2>
            <p className="section-desc-text center">
              Hệ thống được thiết kế trực quan, hiển thị sản phẩm thật giúp bạn dễ dàng trải nghiệm và theo dõi tiến độ.
            </p>
          </div>

          <div className="ecosystem-grid">
            <div className="eco-card">
              <div className="eco-card-header">
                <div className="eco-icon-badge">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4B4035" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                  </svg>
                </div>
                <Link to={isAuthenticated ? "/student/my-courses" : "/login"} className="eco-arrow-link" aria-label="Xem tài liệu">
                  →
                </Link>
              </div>
              <h3 className="eco-card-title">Tài liệu học tập</h3>
              <p className="eco-card-desc">Tài liệu PDF & Docx đính kèm theo từng bài học.</p>
              
              <div className="eco-mini-visual docs-visual">
                <div className="doc-item">
                  <span className="doc-badge pdf">PDF</span>
                  <div className="doc-info">
                    <span className="doc-title">Grammar_Summary.pdf</span>
                    <span className="doc-meta">1.4 MB</span>
                  </div>
                  <span className="doc-dl-icon">📥</span>
                </div>
                <div className="doc-item">
                  <span className="doc-badge docx">DOC</span>
                  <div className="doc-info">
                    <span className="doc-title">Part5_Vocab_List.docx</span>
                    <span className="doc-meta">850 KB</span>
                  </div>
                  <span className="doc-dl-icon">📥</span>
                </div>
              </div>
            </div>

            <div className="eco-card">
              <div className="eco-card-header">
                <div className="eco-icon-badge">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4B4035" strokeWidth="2">
                    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
                  </svg>
                </div>
                <Link to={isAuthenticated ? "/student/my-courses" : "/login"} className="eco-arrow-link" aria-label="Xem từ vựng">
                  →
                </Link>
              </div>
              <h3 className="eco-card-title">Sổ tay từ vựng</h3>
              <p className="eco-card-desc">Tra cứu từ vựng IPA chuẩn kèm audio phát âm và ví dụ thực tế.</p>
              
              <div className="eco-mini-visual vocab-visual">
                <div className="vocab-search-box">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#82796F" strokeWidth="2">
                    <circle cx="11" cy="11" r="8"></circle>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                  </svg>
                  <span>Tìm từ vựng...</span>
                </div>
                <div className="vocab-card-preview">
                  <div className="vocab-head">
                    <span className="vocab-word">opportunity</span>
                    <span className="vocab-audio-btn">🔊</span>
                  </div>
                  <div className="vocab-phonetic">/ˌɒpəˈtjuːnəti/ • noun</div>
                  <div className="vocab-meaning">cơ hội phát triển sự nghiệp</div>
                </div>
              </div>
            </div>

            <div className="eco-card">
              <div className="eco-card-header">
                <div className="eco-icon-badge">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4B4035" strokeWidth="2">
                    <path d="M9 11l3 3L22 4"></path>
                    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
                  </svg>
                </div>
                <Link to={isAuthenticated ? "/student/assessments" : "/login"} className="eco-arrow-link" aria-label="Luyện tập">
                  →
                </Link>
              </div>
              <h3 className="eco-card-title">Luyện tập tự chấm</h3>
              <p className="eco-card-desc">Bài tập trắc nghiệm tự động chấm điểm và giải thích chi tiết.</p>

              <div className="eco-mini-visual quiz-visual">
                <div className="quiz-row-header">
                  <span className="q-label">Câu 12</span>
                  <span className="q-badge-correct">Đúng</span>
                </div>
                <div className="quiz-option-selected">
                  <span>A. expanding</span>
                  <span className="check-icon-green">✓</span>
                </div>
                <div className="quiz-explanation">
                  <strong>Giải thích:</strong> Đáp án A...
                </div>
              </div>
            </div>

            <div className="eco-card">
              <div className="eco-card-header">
                <div className="eco-icon-badge">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4B4035" strokeWidth="2">
                    <line x1="18" y1="20" x2="18" y2="10"></line>
                    <line x1="12" y1="20" x2="12" y2="4"></line>
                    <line x1="6" y1="20" x2="6" y2="14"></line>
                  </svg>
                </div>
                <Link to={isAuthenticated ? "/student/dashboard" : "/login"} className="eco-arrow-link" aria-label="Xem tiến độ">
                  →
                </Link>
              </div>
              <h3 className="eco-card-title">Theo dõi tiến độ</h3>
              <p className="eco-card-desc">Xem thống kê kết quả và theo dõi điểm số theo thời gian.</p>

              <div className="eco-mini-visual progress-visual">
                <div className="progress-badge-float">
                  <span className="lbl">Điểm trung bình</span>
                  <span className="val">750</span>
                </div>
                <svg className="progress-chart-svg" viewBox="0 0 280 80" fill="none">
                  <path d="M10 60 Q 60 40, 110 50 T 210 25 T 270 15" stroke="#4B4035" strokeWidth="2.5" fill="none" />
                  <circle cx="210" cy="25" r="4" fill="#F3C74F" stroke="#4B4035" strokeWidth="2" />
                </svg>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 10. Testimonials ("REAL STUDENTS. REAL PROGRESS." - Image 3 reference) */}
      <section className="testimonials-section">
        <div className="section-container">
          <div className="dark-coffee-container testimonials-dark-box">
            <div className="testimonials-dark-header">
              <div className="t-dark-left">
                <h2 className="dark-section-title">REAL STUDENTS.<br />REAL PROGRESS.</h2>
                <p className="dark-section-desc">
                  Số điểm chỉ là một phần, điều quan trọng hơn là sự thay đổi của bạn trong hành trình này.
                </p>
                <Link to="/register" className="btn-read-more-link light">
                  XEM THÊM CÂU CHUYỆN →
                </Link>
              </div>
              <div className="t-dark-right-cards">
                <div className="score-card-editorial">
                  <div className="score-val">945</div>
                  <div className="score-lbl">TOEIC L&R</div>
                  <div className="score-quote">"Từ mất gốc đến 945."</div>
                </div>
                <div className="score-card-editorial">
                  <div className="score-val">895</div>
                  <div className="score-lbl">TOEIC L&R</div>
                  <div className="score-quote">"Kiên trì thật sự có kết quả."</div>
                </div>
                <div className="score-card-editorial">
                  <div className="score-val">800</div>
                  <div className="score-lbl">TOEIC L&R</div>
                  <div className="score-quote">"Cảm ơn cô vì đã luôn đồng hành."</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 11. Full-Width Feature Banner (Using img-5.jpg - Image 2 & 4 reference) */}
      <section className="fullwidth-feature-banner">
        <div className="fw-banner-bg" style={{ backgroundImage: `url(${img5})` }} />
        <div className="fw-banner-overlay" />
        <div className="section-container fw-banner-content">
          <div className="fw-banner-text">
            <span className="hero-tag-light">TOEIC CLASS</span>
            <h2 className="fw-banner-title">Maybe your goal starts here.</h2>
            <p className="fw-banner-sub">
              Một năm nữa, bạn có thể vẫn đang nghĩ "Ước gì lúc đó mình bắt đầu."
            </p>
          </div>
          <div className="fw-banner-cta">
            <Link to="/register" className="btn-cta-yellow btn-large">
              ĐĂNG KÝ NGAY →
            </Link>
          </div>
        </div>
      </section>

      {/* 12. FAQ Section ("SOME COMMON QUESTIONS" - Image 2 reference) */}
      <section className="faq-section">
        <div className="section-container">
          <div className="faq-header">
            <div className="faq-header-left">
              <span className="section-eyebrow-badge">FAQ</span>
              <h2 className="section-title-serif uppercase">SOME COMMON QUESTIONS</h2>
            </div>
            <div className="faq-header-right">
              <button className="btn-see-all">SEE ALL →</button>
            </div>
          </div>

          <div className="faq-accordion-list">
            {faqData.map((item, idx) => (
              <div key={idx} className={`faq-accordion-item ${openFaqIndex === idx ? 'open' : ''}`}>
                <button className="faq-question-btn" onClick={() => toggleFaq(idx)}>
                  <span className="faq-num">0{idx + 1}</span>
                  <span className="faq-question-text">{item.q}</span>
                  <span className="faq-plus-icon">{openFaqIndex === idx ? '−' : '+'}</span>
                </button>
                {openFaqIndex === idx && (
                  <div className="faq-answer-content">
                    <p>{item.a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 13. Warm Aesthetic Footer */}
      <footer className="warm-aesthetic-footer">
        <div className="footer-container">
          <div className="footer-main-grid">
            {/* Column 1: Brand & Bio */}
            <div className="footer-col brand-col">
              <Link to="/" className="footer-brand-logo">
                Toeic Ms Uyen<span className="brand-dot">.</span>
              </Link>
              <p className="footer-tagline-serif">A brighter you, everyday.</p>
              <div className="footer-social-links">
                <a href="#facebook" aria-label="Facebook">Facebook</a>
                <a href="#instagram" aria-label="Instagram">Instagram</a>
                <a href="#youtube" aria-label="YouTube">YouTube</a>
              </div>
            </div>

            {/* Column 2: Học Tập */}
            <div className="footer-col">
              <h4 className="footer-col-title">Học Tập</h4>
              <ul className="footer-link-list">
                <li><Link to={isAuthenticated ? "/student/my-courses" : "/login"}>Tài Liệu Học Tập</Link></li>
                <li><Link to={isAuthenticated ? "/student/my-courses" : "/login"}>Sổ Tay Từ Vựng</Link></li>
                <li><Link to={isAuthenticated ? "/student/assessments" : "/login"}>Luyện Tập Tự Chấm</Link></li>
              </ul>
            </div>

            {/* Column 3: Luyện Thi */}
            <div className="footer-col">
              <h4 className="footer-col-title">Luyện Thi</h4>
              <ul className="footer-link-list">
                <li><Link to={isAuthenticated ? "/student/toeic" : "/login"}>Thi Thử TOEIC</Link></li>
                <li><Link to={isAuthenticated ? "/student/assessments" : "/login"}>Ngân Hàng Đề Thi</Link></li>
                <li><Link to={isAuthenticated ? "/student/history" : "/login"}>Lịch Sử Kết Quả</Link></li>
              </ul>
            </div>

            {/* Column 4: Tài Khoản */}
            <div className="footer-col">
              <h4 className="footer-col-title">Tài Khoản</h4>
              <ul className="footer-link-list">
                <li><Link to="/login">Đăng Nhập Học Viên</Link></li>
                <li><Link to="/register">Đăng Ký Tài Khoản</Link></li>
                <li><Link to={isAuthenticated ? "/student/profile" : "/login"}>Hồ Sơ Cá Nhân</Link></li>
              </ul>
            </div>
          </div>

          <div className="footer-bottom-bar">
            <div className="footer-copyright">
              © 2026 Toeic Ms Uyen. All rights reserved.
            </div>
            <div className="footer-bottom-quote">
              A better you starts with a better way of learning.
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
