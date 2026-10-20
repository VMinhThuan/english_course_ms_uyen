import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import useAuthStore from '../store/authStore.js';
import AuthLayout from '../components/layouts/AuthLayout.jsx';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({ email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);

  const login = useAuthStore((state) => state.login);
  const isLoading = useAuthStore((state) => state.isLoading);
  const navigate = useNavigate();

  useEffect(() => {
    document.title = 'Đăng nhập | Toeic Ms Uyen';
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const errors = {
      email: email.trim() ? '' : 'Vui lòng nhập email hoặc tên đăng nhập.',
      password: password ? '' : 'Vui lòng nhập mật khẩu.',
    };
    setFieldErrors(errors);
    if (errors.email || errors.password) return;

    const result = await login({ email, password });
    if (result.success) {
      navigate(result.user.role === 'student' ? '/student/dashboard' : '/admin');
    } else if (['ACCOUNT_PENDING', 'ACCOUNT_NOT_ACTIVE'].includes(result.code)) {
      navigate('/account-status', { state: { status: 'pending' } });
    } else if (['ACCOUNT_SUSPENDED', 'ACCOUNT_REJECTED'].includes(result.code)) {
      navigate('/account-status', {
        state: { status: result.code === 'ACCOUNT_SUSPENDED' ? 'suspended' : 'rejected' },
      });
    } else {
      setError(result.message === 'Account is deactivated'
        ? 'Tài khoản của bạn hiện không thể sử dụng. Vui lòng liên hệ giáo viên để được hỗ trợ.'
        : 'Email/tên đăng nhập hoặc mật khẩu không chính xác.');
    }
  };

  return (
    <AuthLayout
      activeTab="login"
      title="Chào mừng bạn quay trở lại."
      subtitle="Đăng nhập để tiếp tục hành trình học TOEIC của bạn."
    >
      <form onSubmit={handleSubmit} noValidate>
        {error && <div className="auth-global-error">{error}</div>}

        <div className="auth-form-group">
          <label className="auth-input-label" htmlFor="login-identifier">Email hoặc tên đăng nhập</label>
          <input
            id="login-identifier"
            type="text"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setFieldErrors((current) => ({ ...current, email: '' })); }}
            autoComplete="username"
            aria-invalid={Boolean(fieldErrors.email)}
            className={`auth-input-field ${fieldErrors.email ? 'input-error' : ''}`}
            placeholder="Email, tên đăng nhập hoặc số điện thoại"
          />
          {fieldErrors.email && <div className="auth-field-error">{fieldErrors.email}</div>}
        </div>

        <div className="auth-form-group">
          <label className="auth-input-label" htmlFor="login-password">Mật khẩu</label>
          <div className="auth-password-wrapper">
            <input
              id="login-password"
              type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => { setPassword(e.target.value); setFieldErrors((current) => ({ ...current, password: '' })); }}
              autoComplete="current-password"
              aria-invalid={Boolean(fieldErrors.password)}
              className={`auth-input-field ${fieldErrors.password ? 'input-error' : ''}`}
              placeholder="Nhập Mật khẩu"
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
          {fieldErrors.password && <div className="auth-field-error">{fieldErrors.password}</div>}
        </div>

        <button type="submit" disabled={isLoading} className="btn-auth-submit">
          {isLoading ? <><span className="auth-button-spinner" />Đang đăng nhập...</> : 'Đăng nhập →'}
        </button>

        <div className="auth-switch-text">
          Chưa có tài khoản?
          <Link to="/register">Đăng ký học viên</Link>
        </div>
      </form>
    </AuthLayout>
  );
}
