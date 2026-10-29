import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import useAuthStore from '../store/authStore.js';
import AuthLayout from '../components/layouts/AuthLayout.jsx';

export default function RegisterPage() {
  const [formData, setFormData] = useState({
    fullName: '',
    groupName: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [fieldErrors, setFieldErrors] = useState({
    fullName: '',
    groupName: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const register = useAuthStore((state) => state.register);
  const isLoading = useAuthStore((state) => state.isLoading);
  const navigate = useNavigate();

  useEffect(() => {
    document.title = 'Đăng ký | Toeic Ms Uyen';
  }, []);

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const passwordRegex = /^.{6,}$/;

  const validateField = (name, value, currentPassword = null) => {
    let err = '';

    switch (name) {
      case 'fullName':
        if (!value.trim()) {
          err = 'Vui lòng nhập Họ và tên';
        }
        break;
      case 'groupName':
        if (!value.trim()) {
          err = 'Vui lòng nhập tên nhóm';
        } else if (value.trim().length > 100) {
          err = 'Tên nhóm không được vượt quá 100 ký tự';
        } else if (/[\u0000-\u001f\u007f]/.test(value)) {
          err = 'Tên nhóm chứa ký tự không hợp lệ';
        }
        break;
      case 'email':
        if (!value) {
          err = 'Vui lòng nhập Địa chỉ Email';
        } else if (!emailRegex.test(value)) {
          err = 'Địa chỉ Email không hợp lệ';
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
    const isGroupNameValid = validateField('groupName', formData.groupName);
    const isEmailValid = validateField('email', formData.email);
    const isPasswordValid = validateField('password', formData.password);
    const isConfirmPasswordValid = validateField('confirmPassword', formData.confirmPassword);

    if (!isNameValid || !isGroupNameValid || !isEmailValid || !isPasswordValid || !isConfirmPasswordValid) {
      return;
    }

    const result = await register({
      fullName: formData.fullName,
      groupName: formData.groupName,
      email: formData.email,
      password: formData.password,
    });

    if (result.success) {
      navigate('/account-status', { state: { status: 'pending', registered: true } });
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
      <form onSubmit={handleSubmit} noValidate>
        {error && <div className="auth-global-error">{error}</div>}

        {/* Full Name */}
        <div className="auth-form-group">
          <label className="auth-input-label" htmlFor="register-full-name">Họ và tên</label>
          <input
            id="register-full-name"
            type="text"
            name="fullName"
            value={formData.fullName}
            onChange={handleInputChange}
            onBlur={handleBlur}
            autoComplete="name"
            className={`auth-input-field ${fieldErrors.fullName ? 'input-error' : ''}`}
            placeholder="Nhập Họ và tên đầy đủ"
          />
          {fieldErrors.fullName && (
            <div className="auth-field-error">{fieldErrors.fullName}</div>
          )}
        </div>

        <div className="auth-form-group">
          <label className="auth-input-label" htmlFor="register-group-name">Tên nhóm</label>
          <input
            id="register-group-name"
            type="text"
            name="groupName"
            value={formData.groupName}
            onChange={handleInputChange}
            onBlur={handleBlur}
            maxLength={100}
            required
            className={`auth-input-field ${fieldErrors.groupName ? 'input-error' : ''}`}
            placeholder="Nhập tên nhóm học"
          />
          {fieldErrors.groupName && (
            <div className="auth-field-error">{fieldErrors.groupName}</div>
          )}
        </div>

        {/* Email */}
        <div className="auth-form-group">
          <label className="auth-input-label" htmlFor="register-email">Địa chỉ email</label>
          <input
            id="register-email"
            type="email"
            name="email"
            value={formData.email}
            onChange={handleInputChange}
            onBlur={handleBlur}
            autoComplete="email"
            className={`auth-input-field ${fieldErrors.email ? 'input-error' : ''}`}
            placeholder="Nhập Địa chỉ Email"
          />
          {fieldErrors.email && (
            <div className="auth-field-error">{fieldErrors.email}</div>
          )}
        </div>

        {/* Password */}
        <div className="auth-form-group">
          <label className="auth-input-label" htmlFor="register-password">Mật khẩu</label>
          <div className="auth-password-wrapper">
            <input
              id="register-password"
              type={showPassword ? 'text' : 'password'}
              name="password"
              value={formData.password}
              onChange={handleInputChange}
              onBlur={handleBlur}
              autoComplete="new-password"
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
          <label className="auth-input-label" htmlFor="register-confirm-password">Xác nhận mật khẩu</label>
          <div className="auth-password-wrapper">
            <input
              id="register-confirm-password"
              type={showConfirmPassword ? 'text' : 'password'}
              name="confirmPassword"
              value={formData.confirmPassword}
              onChange={handleInputChange}
              onBlur={handleBlur}
              autoComplete="new-password"
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
          {isLoading ? <><span className="auth-button-spinner" />Đang đăng ký...</> : 'Đăng ký tài khoản →'}
        </button>

        <div className="auth-switch-text">
          Đã có tài khoản?
          <Link to="/login">Đăng nhập</Link>
        </div>
      </form>

    </AuthLayout>
  );
}
