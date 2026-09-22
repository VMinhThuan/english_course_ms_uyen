import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import useAuthStore from '../store/authStore.js';
import backgroundImage1 from '../images/background.jpg';
import backgroundImage2 from '../images/background_1.jpg';
import backgroundImage3 from '../images/bg_2.jpg';
import backgroundImage4 from '../images/bg_3.jpg';
import './RegisterPage.css';

const backgroundImages = [
  backgroundImage1,
  backgroundImage2,
  backgroundImage3,
  backgroundImage4,
];

const slideContents = [
  {
    title: 'Ms Uyen',
    subtitle: 'Nền tảng học tiếng Anh & Luyện thi TOEIC hiện đại và hiệu quả',
  },
  {
    title: 'Kho Bài Học & Từ Vựng',
    subtitle: 'Bài giảng chất lượng, tài liệu chuyên sâu chuẩn hóa cho học viên',
  },
  {
    title: 'Mô Phỏng Thi TOEIC',
    subtitle: 'Luyện đề Full 7 Parts chuẩn cấu trúc ETS với đồng hồ đếm ngược',
  },
  {
    title: 'Học Mọi Lúc Mọi Nơi',
    subtitle: 'Theo dõi tiến độ học tập và kết quả bài làm dễ dàng',
  },
];

export default function RegisterPage() {
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    password: '',
    confirmPassword: '',
    phoneNumber: '',
  });
  const [fieldErrors, setFieldErrors] = useState({
    fullName: '',
    email: '',
    phoneNumber: '',
    password: '',
    confirmPassword: '',
  });
  const [error, setError] = useState('');
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [activeTab, setActiveTab] = useState('register');
  const [currentSlide, setCurrentSlide] = useState(0);
  const register = useAuthStore((state) => state.register);
  const isLoading = useAuthStore((state) => state.isLoading);
  const navigate = useNavigate();

  useEffect(() => {
    document.title = 'Đăng ký | Ms Uyen';
  }, []);

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const phoneRegex = /^(0|\+84)[1-9][0-9]{8,9}$/;
  const passwordRegex = /^.{6,}$/;

  const validateField = (name, value, currentPassword = null) => {
    let error = '';

    switch (name) {
      case 'fullName':
        if (!value.trim()) {
          error = 'Vui lòng nhập Họ và tên';
        }
        break;
      case 'email':
        if (!value) {
          error = 'Vui lòng nhập Địa chỉ Email';
        } else if (!emailRegex.test(value)) {
          error = 'Địa chỉ Email không hợp lệ';
        }
        break;
      case 'phoneNumber':
        if (!value) {
          error = 'Vui lòng nhập Số điện thoại';
        } else if (!phoneRegex.test(value)) {
          error = 'Số điện thoại không hợp lệ (VD: 0912345678)';
        }
        break;
      case 'password':
        if (!value) {
          error = 'Vui lòng nhập Mật khẩu';
        } else if (!passwordRegex.test(value)) {
          error = 'Mật khẩu phải có tối thiểu 6 ký tự';
        }
        break;
      case 'confirmPassword':
        if (!value) {
          error = 'Vui lòng xác nhận Mật khẩu';
        } else {
          const passwordToCompare = currentPassword !== null ? currentPassword : formData.password;
          if (value !== passwordToCompare) {
            error = 'Mật khẩu xác nhận không khớp';
          }
        }
        break;
      default:
        break;
    }

    setFieldErrors((prev) => ({
      ...prev,
      [name]: error,
    }));

    return error === '';
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    const newFormData = {
      ...formData,
      [name]: value,
    };
    
    setFormData(newFormData);

    if (fieldErrors[name]) {
      setFieldErrors((prev) => ({
        ...prev,
        [name]: '',
      }));
    }

    if (name === 'password' && newFormData.confirmPassword) {
      validateField('confirmPassword', newFormData.confirmPassword, value);
    }

    if (value) {
      validateField(name, value);
    }
  };

  const handleBlur = (e) => {
    const { name, value } = e.target;
    validateField(name, value);
  };

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % backgroundImages.length);
    }, 3500);

    return () => clearInterval(interval);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const isNameValid = validateField('fullName', formData.fullName);
    const isEmailValid = validateField('email', formData.email);
    const isPhoneValid = validateField('phoneNumber', formData.phoneNumber);
    const isPasswordValid = validateField('password', formData.password);
    const isConfirmPasswordValid = validateField('confirmPassword', formData.confirmPassword);

    if (!isNameValid || !isEmailValid || !isPhoneValid || !isPasswordValid || !isConfirmPasswordValid) {
      return;
    }

    const result = await register({ 
      fullName: formData.fullName,
      email: formData.email,
      phoneNumber: formData.phoneNumber,
      password: formData.password,
    });
    if (result.success) {
      setShowSuccessModal(true);
    } else {
      setError(result.message);
    }
  };

  return (
    <div className="register-page">
      <div className="register-container">
        {/* Left Section - Image Slideshow */}
        <div className="register-image-section">
          <div className="register-image-wrapper">
            <div className="register-image-slideshow">
              {backgroundImages.map((image, index) => (
                <div
                  key={index}
                  className={`register-image-slide ${index === currentSlide ? 'active' : ''}`}
                  style={{
                    backgroundImage: `url(${image})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    backgroundRepeat: 'no-repeat',
                  }}
                ></div>
              ))}
            </div>
            <div className="register-image-overlay">
              <div className="overlay-title">{slideContents[currentSlide].title}</div>
              <div className="overlay-subtitle">{slideContents[currentSlide].subtitle}</div>
            </div>
            <div className="slide-indicators">
              {backgroundImages.map((_, index) => (
                <div
                  key={index}
                  className={`indicator ${index === currentSlide ? 'active' : ''}`}
                  onClick={() => setCurrentSlide(index)}
                ></div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Section - Form */}
        <div className="register-form-section">
          <form onSubmit={handleSubmit} className="register-form-content">
            <div className="welcome-section">
              <div className="auth-brand-logo">
                <span className="brand-title-text">Toeic Ms Uyen<span className="brand-dot">.</span></span>
              </div>
              <div className="welcome-text">Tạo Tài Khoản Học Viên Ms Uyen</div>
              <div className="tab-switcher">
                <Link
                  to="/login"
                  className={`tab-button ${activeTab === 'login' ? 'active' : ''}`}
                  onClick={() => setActiveTab('login')}
                >
                  Đăng Nhập
                </Link>
                <button
                  type="button"
                  className={`tab-button ${activeTab === 'register' ? 'active' : ''}`}
                  onClick={() => setActiveTab('register')}
                >
                  Đăng Ký
                </button>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Họ và Tên</label>
              <div className="form-input-wrapper">
                <input
                  type="text"
                  name="fullName"
                  value={formData.fullName}
                  onChange={handleInputChange}
                  onBlur={handleBlur}
                  required
                  className={`form-input ${fieldErrors.fullName ? 'input-error' : ''}`}
                  placeholder="Nhập Họ và tên đầy đủ"
                />
              </div>
              {fieldErrors.fullName && (
                <div className="field-error">{fieldErrors.fullName}</div>
              )}
            </div>

            <div className="form-group">
              <label className="form-label">Địa chỉ Email</label>
              <div className="form-input-wrapper">
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  onBlur={handleBlur}
                  required
                  className={`form-input ${fieldErrors.email ? 'input-error' : ''}`}
                  placeholder="Nhập Địa chỉ Email"
                />
              </div>
              {fieldErrors.email && (
                <div className="field-error">{fieldErrors.email}</div>
              )}
            </div>

            <div className="form-group">
              <label className="form-label">Số điện thoại</label>
              <div className="form-input-wrapper">
                <input
                  type="tel"
                  name="phoneNumber"
                  value={formData.phoneNumber}
                  onChange={handleInputChange}
                  onBlur={handleBlur}
                  required
                  className={`form-input ${fieldErrors.phoneNumber ? 'input-error' : ''}`}
                  placeholder="Nhập Số điện thoại liên hệ"
                />
              </div>
              {fieldErrors.phoneNumber && (
                <div className="field-error">{fieldErrors.phoneNumber}</div>
              )}
            </div>

            <div className="form-group">
              <label className="form-label">Mật khẩu</label>
              <div className="form-input-wrapper password-input-wrapper">
                <input
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  value={formData.password}
                  onChange={handleInputChange}
                  onBlur={handleBlur}
                  required
                  className={`form-input ${fieldErrors.password ? 'input-error' : ''}`}
                  placeholder="Nhập Mật khẩu (tối thiểu 6 ký tự)"
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                      <line x1="1" y1="1" x2="23" y2="23"></line>
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                      <circle cx="12" cy="12" r="3"></circle>
                    </svg>
                  )}
                </button>
              </div>
              {fieldErrors.password && (
                <div className="field-error">{fieldErrors.password}</div>
              )}
            </div>

            <div className="form-group">
              <label className="form-label">Nhập lại Mật khẩu</label>
              <div className="form-input-wrapper password-input-wrapper">
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  name="confirmPassword"
                  value={formData.confirmPassword}
                  onChange={handleInputChange}
                  onBlur={handleBlur}
                  required
                  className={`form-input ${fieldErrors.confirmPassword ? 'input-error' : ''}`}
                  placeholder="Nhập lại Mật khẩu"
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                >
                  {showConfirmPassword ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                      <line x1="1" y1="1" x2="23" y2="23"></line>
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                      <circle cx="12" cy="12" r="3"></circle>
                    </svg>
                  )}
                </button>
              </div>
              {fieldErrors.confirmPassword && (
                <div className="field-error">{fieldErrors.confirmPassword}</div>
              )}
            </div>

            {error && <div className="error-message">{error}</div>}

            <button type="submit" disabled={isLoading} className="btn-register-submit">
              {isLoading ? 'Đang đăng ký...' : 'Tạo Tài Khoản'}
            </button>
          </form>
        </div>
      </div>

      {/* Success Pending Approval Modal */}
      {showSuccessModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ textAlign: 'center', padding: '2rem' }}>
            <div style={{ width: '64px', height: '64px', background: '#EEF2FF', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem auto' }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#4F46E5" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            </div>
            <h3 style={{ fontSize: '1.5rem', color: '#0F172A', marginBottom: '0.75rem', fontWeight: '800' }}>Đăng Ký Thành Công!</h3>
            <p style={{ color: '#475569', fontSize: '1rem', lineHeight: '1.6', marginBottom: '1.5rem' }}>
              Tài khoản Học viên của bạn đã được khởi tạo và đang <strong>chờ Ms Uyen phê duyệt</strong>. Vui lòng quay lại đăng nhập sau khi tài khoản được kích hoạt.
            </p>
            <button
              onClick={() => navigate('/login')}
              className="btn-register-submit"
              style={{ width: '100%', margin: '0' }}
            >
              Chuyển Đến Đăng Nhập
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
