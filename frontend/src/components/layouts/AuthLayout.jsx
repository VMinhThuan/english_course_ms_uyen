import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import backgroundImage1 from '../../images/background.jpg';
import backgroundImage2 from '../../images/background_1.jpg';
import backgroundImage3 from '../../images/bg_2.jpg';
import backgroundImage4 from '../../images/bg_3.jpg';
import './AuthLayout.css';

const backgroundImages = [
  backgroundImage1,
  backgroundImage2,
  backgroundImage3,
  backgroundImage4,
];

export default function AuthLayout({ activeTab, title, subtitle, children, showTabs = true }) {
  const [currentSlide, setCurrentSlide] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % backgroundImages.length);
    }, 4000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="auth-page-wrapper ds-auth-screen">
      <div className="auth-split-container">
        {/* Left Visual Section (52%) */}
        <div className="auth-visual-section">
          <div className="auth-visual-inner">
            <div className="auth-slideshow">
              {backgroundImages.map((image, index) => (
                <div
                  key={index}
                  className={`auth-slide ${index === currentSlide ? 'active' : ''}`}
                  style={{ '--auth-slide-background': `url(${image})` }}
                />
              ))}
            </div>

            {/* Warm Coffee Gradient Overlay */}
            <div className="auth-visual-overlay" />

            {/* Editorial Content Overlay */}
            <div className="auth-visual-content">
              <span className="auth-eyebrow">ONLINE TOEIC CLASS</span>
              <h1 className="auth-visual-title">
                A better you starts with<br />a better way of learning.
              </h1>
              <p className="auth-visual-desc">
                Không gian học tập, luyện thi và theo dõi tiến bộ TOEIC mỗi ngày.
              </p>

              <div className="auth-mini-info-row">
                <span>850+ Practice</span>
                <span className="bullet">•</span>
                <span>Listening & Reading</span>
                <span className="bullet">•</span>
                <span>TOEIC Learning</span>
              </div>

              <div className="auth-visual-bottom">
                <div className="auth-quote">"Discipline today, a brighter tomorrow."</div>
                <div className="auth-slide-dots">
                  {backgroundImages.map((_, index) => (
                    <button
                      key={index}
                      type="button"
                      aria-label={`Slide ${index + 1}`}
                      className={`dot ${index === currentSlide ? 'active' : ''}`}
                      onClick={() => setCurrentSlide(index)}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Form Section (48%) */}
        <div className="auth-form-section">
          <div className="auth-form-wrapper">
            {/* Top Brand Logo */}
            <div className="auth-logo-row">
              <Link to="/" className="auth-brand-logo">
                Toeic Ms Uyen<span className="brand-dot">.</span>
              </Link>
              <Link to="/" className="auth-home-pill-link">
                ← Trang chủ
              </Link>
            </div>

            {/* Headings */}
            <div className="auth-header-text">
              <h2 className="auth-title">{title}</h2>
              <p className="auth-subtitle">{subtitle}</p>
            </div>

            {/* Tab Switcher */}
            {showTabs && <div className="auth-tab-switcher">
              <Link
                to="/login"
                className={`auth-tab-btn ${activeTab === 'login' ? 'active' : ''}`}
              >
                Đăng nhập
              </Link>
              <Link
                to="/register"
                className={`auth-tab-btn ${activeTab === 'register' ? 'active' : ''}`}
              >
                Đăng ký
              </Link>
            </div>}

            {/* Form & Children */}
            <div className="auth-form-body">
              {children}
            </div>

            {/* Terms Footer */}
            <div className="auth-terms-note">
              Bằng việc tiếp tục, bạn đồng ý với{' '}
              <Link to="/">Điều khoản sử dụng</Link> và{' '}
              <Link to="/">Chính sách bảo mật</Link>.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
