import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import backgroundImage1 from '../../images/auth-carousel/img_3300.jpg';
import backgroundImage2 from '../../images/auth-carousel/img_3301.jpg';
import backgroundImage3 from '../../images/auth-carousel/img_3302.jpg';
import backgroundImage4 from '../../images/auth-carousel/img_3304.jpg';
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
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) return undefined;

    const interval = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % backgroundImages.length);
    }, 4000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="auth-page-wrapper ds-auth-screen">
      <div className="auth-split-container">
        {/* Left photo carousel */}
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

            {/* Light overlay keeps the image's printed text readable. */}
            <div className="auth-visual-overlay" />

            <div className="auth-visual-content">
              <div className="auth-slide-controls" aria-label="Chọn ảnh nền">
                <span className="auth-slide-count" aria-live="polite">
                  {String(currentSlide + 1).padStart(2, '0')}
                  <i aria-hidden="true" />
                  {String(backgroundImages.length).padStart(2, '0')}
                </span>
                <div className="auth-slide-dots" role="tablist" aria-label="Ảnh nền">
                  {backgroundImages.map((_, index) => (
                    <button
                      key={index}
                      type="button"
                      role="tab"
                      aria-label={`Chuyển đến ảnh ${index + 1}`}
                      aria-selected={index === currentSlide}
                      className={`auth-slide-dot ${index === currentSlide ? 'active' : ''}`}
                      onClick={() => setCurrentSlide(index)}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right form section */}
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
