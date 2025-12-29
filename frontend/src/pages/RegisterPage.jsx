import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import useAuthStore from '../store/authStore.js';
import backgroundImage1 from '../images/background.jpg';
import backgroundImage2 from '../images/background_1.jpg';
import backgroundImage3 from '../images/bg_2.jpg';
import backgroundImage4 from '../images/bg_3.jpg';
import './RegisterPage.css';

// Array of background images for slideshow
const backgroundImages = [
  backgroundImage1,
  backgroundImage2,
  backgroundImage3,
  backgroundImage4,
];

// Array of slide content for each slide
const slideContents = [
  {
    title: 'English Course Online',
    subtitle: 'Hệ thống học tiếng Anh trực tuyến hiện đại và hiệu quả nhất',
  },
  {
    title: 'Khóa Học Đa Dạng',
    subtitle: 'Từ cơ bản đến nâng cao, phù hợp với mọi trình độ và nhu cầu học tập',
  },
  {
    title: 'Giảng Viên Chuyên Nghiệp',
    subtitle: 'Đội ngũ giáo viên giàu kinh nghiệm, tận tâm và nhiệt huyết',
  },
  {
    title: 'Học Mọi Lúc Mọi Nơi',
    subtitle: 'Truy cập dễ dàng trên mọi thiết bị, học tập linh hoạt theo thời gian của bạn',
  },
];

export default function RegisterPage() {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    phoneNumber: '',
    role: 'student', // Mặc định là student
  });
  const [fieldErrors, setFieldErrors] = useState({
    email: '',
    phoneNumber: '',
    password: '',
    confirmPassword: '',
  });
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [activeTab, setActiveTab] = useState('register');
  const [currentSlide, setCurrentSlide] = useState(0);
  const register = useAuthStore((state) => state.register);
  const isLoading = useAuthStore((state) => state.isLoading);
  const navigate = useNavigate();

  // Validation regex patterns
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const phoneRegex = /^(0|\+84)[1-9][0-9]{8,9}$/;
  const passwordRegex = /^.{6,}$/; // At least 6 characters

  // Validate individual field
  const validateField = (name, value, currentPassword = null) => {
    let error = '';

    switch (name) {
      case 'email':
        if (!value) {
          error = 'Email is required';
        } else if (!emailRegex.test(value)) {
          error = 'Please enter a valid email address';
        }
        break;
      case 'phoneNumber':
        if (!value) {
          error = 'Phone number is required';
        } else if (!phoneRegex.test(value)) {
          error = 'Please enter a valid phone number (e.g., 0123456789 or +84123456789)';
        }
        break;
      case 'password':
        if (!value) {
          error = 'Password is required';
        } else if (!passwordRegex.test(value)) {
          error = 'Password must be at least 6 characters';
        }
        break;
      case 'confirmPassword':
        if (!value) {
          error = 'Please confirm your password';
        } else {
          const passwordToCompare = currentPassword !== null ? currentPassword : formData.password;
          if (value !== passwordToCompare) {
            error = 'Passwords do not match';
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

  // Handle input change with validation
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    const newFormData = {
      ...formData,
      [name]: value,
    };
    
    setFormData(newFormData);

    // Clear error when user starts typing
    if (fieldErrors[name]) {
      setFieldErrors((prev) => ({
        ...prev,
        [name]: '',
      }));
    }

    // If password changes, also re-validate confirmPassword with new password
    if (name === 'password' && newFormData.confirmPassword) {
      validateField('confirmPassword', newFormData.confirmPassword, value);
    }

    // Validate on blur or after typing
    if (value) {
      validateField(name, value);
    }
  };

  // Handle blur event for validation
  const handleBlur = (e) => {
    const { name, value } = e.target;
    validateField(name, value);
  };

  // Auto-slide every 3 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % backgroundImages.length);
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Validate all fields
    const isEmailValid = validateField('email', formData.email);
    const isPhoneValid = validateField('phoneNumber', formData.phoneNumber);
    const isPasswordValid = validateField('password', formData.password);
    const isConfirmPasswordValid = validateField('confirmPassword', formData.confirmPassword);

    if (!isEmailValid || !isPhoneValid || !isPasswordValid || !isConfirmPasswordValid) {
      return;
    }

    // Đảm bảo role luôn là student và loại bỏ confirmPassword trước khi gửi API
    const { confirmPassword, ...registerData } = formData;
    const result = await register({ 
      ...registerData, 
      role: 'student'
    });
    if (result.success) {
      navigate('/');
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
            {/* Slide indicators */}
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
              <div className="welcome-text">Welcome to English Course Online!</div>
              <div className="tab-switcher">
                <Link
                  to="/login"
                  className={`tab-button ${activeTab === 'login' ? 'active' : ''}`}
                  onClick={() => setActiveTab('login')}
                >
                  Login
                </Link>
                <button
                  type="button"
                  className={`tab-button ${activeTab === 'register' ? 'active' : ''}`}
                  onClick={() => setActiveTab('register')}
                >
                  Register
                </button>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Email Address</label>
              <div className="form-input-wrapper">
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  onBlur={handleBlur}
                  required
                  className={`form-input ${fieldErrors.email ? 'input-error' : ''}`}
                  placeholder="Enter your Email Address"
                />
              </div>
              {fieldErrors.email && (
                <div className="field-error">{fieldErrors.email}</div>
              )}
            </div>

            <div className="form-group">
              <label className="form-label">Phone Number</label>
              <div className="form-input-wrapper">
                <input
                  type="tel"
                  name="phoneNumber"
                  value={formData.phoneNumber}
                  onChange={handleInputChange}
                  onBlur={handleBlur}
                  required
                  className={`form-input ${fieldErrors.phoneNumber ? 'input-error' : ''}`}
                  placeholder="Enter your Phone Number"
                />
              </div>
              {fieldErrors.phoneNumber && (
                <div className="field-error">{fieldErrors.phoneNumber}</div>
              )}
            </div>

            <div className="form-group">
              <label className="form-label">Password</label>
              <div className="form-input-wrapper password-input-wrapper">
                <input
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  value={formData.password}
                  onChange={handleInputChange}
                  onBlur={handleBlur}
                  required
                  className={`form-input ${fieldErrors.password ? 'input-error' : ''}`}
                  placeholder="Enter your Password"
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
              <label className="form-label">Re-enter Password</label>
              <div className="form-input-wrapper password-input-wrapper">
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  name="confirmPassword"
                  value={formData.confirmPassword}
                  onChange={handleInputChange}
                  onBlur={handleBlur}
                  required
                  className={`form-input ${fieldErrors.confirmPassword ? 'input-error' : ''}`}
                  placeholder="Re-enter your Password"
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
              {isLoading ? 'Registering...' : 'Register'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
