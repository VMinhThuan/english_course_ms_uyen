import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import useAuthStore from '../store/authStore.js';
import AuthLayout from '../components/layouts/AuthLayout.jsx';

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

  const register = useAuthStore((state) => state.register);
  const isLoading = useAuthStore((state) => state.isLoading);
  const navigate = useNavigate();

  useEffect(() => {
    document.title = 'Đăng ký | Toeic Ms Uyen';
  }, []);

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const phoneRegex = /^(0|\+84)[1-9][0-9]{8,9}$/;
  const passwordRegex = /^.{6,}$/;

  const validateField = (name, value, currentPassword = null) => {
    let err = '';

    switch (name) {
      case 'fullName':
        if (!value.trim()) {
          err = 'Vui lòng nhập Họ và tên';
        }
        break;
      case 'email':
        if (!value) {
          err = 'Vui lòng nhập Địa chỉ Email';
        } else if (!emailRegex.test(value)) {
          err = 'Địa chỉ Email không hợp lệ';
        }
        break;
      case 'phoneNumber':
        if (!value) {
          err = 'Vui lòng nhập Số điện thoại';
        } else if (!phoneRegex.test(value)) {
          err = 'Số điện thoại không hợp lệ (VD: 0912345678)';
        }
        break;
      case 'password':
        if (!value) {
          err = 'Vui lòng nhập Mật khẩu';
        } else if (!passwordRegex.test(value)) {
          err = 'Mật khẩu phải có tối thiểu 6 ký tự';
        }
        break;
      case 'confirmPassword':
        if (!value) {
          err = 'Vui lòng xác nhận Mật khẩu';
        } else {
          const passwordToCompare = currentPassword !== null ? currentPassword : formData.password;
          if (value !== passwordToCompare) {
            err = 'Mật khẩu xác nhận không khớp';
          }
        }
        break;
      default:
        break;
    }

    setFieldErrors((prev) => ({
      ...prev,
      [name]: err,
    }));

    return err === '';
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
    <AuthLayout
      activeTab="register"
      title="Bắt đầu hành trình cùng Ms Uyen."
      subtitle="Tạo tài khoản học viên để truy cập tài liệu, bài luyện tập và thi thử TOEIC."
    >
      <form onSubmit={handleSubmit}>
        {error && <div className="auth-global-error">{error}</div>}

        {/* Full Name */}
        <div className="auth-form-group">
          <label className="auth-input-label">Họ và Tên</label>
          <input
            type="text"
            name="fullName"
            value={formData.fullName}
            onChange={handleInputChange}
            onBlur={handleBlur}
            required
            className={`auth-input-field ${fieldErrors.fullName ? 'input-error' : ''}`}
            placeholder="Nhập Họ và tên đầy đủ"
          />
          {fieldErrors.fullName && (
            <div className="auth-field-error">{fieldErrors.fullName}</div>
          )}
        </div>

        {/* Email */}
        <div className="auth-form-group">
          <label className="auth-input-label">Địa chỉ Email</label>
          <input
            type="email"
            name="email"
            value={formData.email}
            onChange={handleInputChange}
            onBlur={handleBlur}
            required
            className={`auth-input-field ${fieldErrors.email ? 'input-error' : ''}`}
            placeholder="Nhập Địa chỉ Email"
          />
          {fieldErrors.email && (
            <div className="auth-field-error">{fieldErrors.email}</div>
          )}
        </div>

        {/* Phone Number */}
        <div className="auth-form-group">
          <label className="auth-input-label">Số điện thoại</label>
          <input
            type="tel"
            name="phoneNumber"
            value={formData.phoneNumber}
            onChange={handleInputChange}
            onBlur={handleBlur}
            required
            className={`auth-input-field ${fieldErrors.phoneNumber ? 'input-error' : ''}`}
            placeholder="Nhập Số điện thoại liên hệ"
          />
          {fieldErrors.phoneNumber && (
            <div className="auth-field-error">{fieldErrors.phoneNumber}</div>
          )}
        </div>

        {/* Password */}
        <div className="auth-form-group">
          <label className="auth-input-label">Mật khẩu</label>
          <div className="auth-password-wrapper">
            <input
              type={showPassword ? 'text' : 'password'}
              name="password"
              value={formData.password}
              onChange={handleInputChange}
              onBlur={handleBlur}
              required
              className={`auth-input-field ${fieldErrors.password ? 'input-error' : ''}`}
              placeholder="Nhập Mật khẩu (tối thiểu 6 ký tự)"
            />
            <button
              type="button"
              className="auth-password-toggle"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
            >
              {showPassword ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                  <line x1="1" y1="1" x2="23" y2="23"></line>
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                  <circle cx="12" cy="12" r="3"></circle>
                </svg>
              )}
            </button>
          </div>
          {fieldErrors.password && (
            <div className="auth-field-error">{fieldErrors.password}</div>
          )}
        </div>

        {/* Confirm Password */}
        <div className="auth-form-group">
          <label className="auth-input-label">Nhập lại Mật khẩu</label>
          <div className="auth-password-wrapper">
            <input
              type={showConfirmPassword ? 'text' : 'password'}
              name="confirmPassword"
              value={formData.confirmPassword}
              onChange={handleInputChange}
              onBlur={handleBlur}
              required
              className={`auth-input-field ${fieldErrors.confirmPassword ? 'input-error' : ''}`}
              placeholder="Nhập lại Mật khẩu"
            />
            <button
              type="button"
              className="auth-password-toggle"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              aria-label={showConfirmPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
            >
              {showConfirmPassword ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                  <line x1="1" y1="1" x2="23" y2="23"></line>
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                  <circle cx="12" cy="12" r="3"></circle>
                </svg>
              )}
            </button>
          </div>
          {fieldErrors.confirmPassword && (
            <div className="auth-field-error">{fieldErrors.confirmPassword}</div>
          )}
        </div>

        <button type="submit" disabled={isLoading} className="btn-auth-submit">
          {isLoading ? 'Đang đăng ký...' : 'Đăng Ký Học Viên →'}
        </button>

        <div className="auth-switch-text">
          Đã có tài khoản?
          <Link to="/login">Đăng nhập</Link>
        </div>
      </form>

      {/* Success Modal */}
      {showSuccessModal && (
        <div className="auth-modal-overlay">
          <div className="auth-modal-card">
            <div className="auth-modal-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            </div>
            <h3 className="auth-modal-title">Đăng Ký Thành Công!</h3>
            <p className="auth-modal-desc">
              Tài khoản Học viên của bạn đã được khởi tạo và đang <strong>chờ Ms Uyen phê duyệt</strong>. Vui lòng quay lại đăng nhập sau khi tài khoản được kích hoạt.
            </p>
            <button
              onClick={() => navigate('/login')}
              className="btn-auth-submit"
              style={{ marginBottom: 0 }}
            >
              Chuyển Đến Đăng Nhập →
            </button>
          </div>
        </div>
      )}
    </AuthLayout>
  );
}
