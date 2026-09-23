import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import useAuthStore from '../store/authStore.js';
import AuthLayout from '../components/layouts/AuthLayout.jsx';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  const login = useAuthStore((state) => state.login);
  const isLoading = useAuthStore((state) => state.isLoading);
  const navigate = useNavigate();

  useEffect(() => {
    document.title = 'Đăng nhập | Toeic Ms Uyen';
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const result = await login({ email, password });
    if (result.success) {
      navigate('/');
    } else {
      setError(result.message);
    }
  };

  return (
    <AuthLayout
      activeTab="login"
      title="Chào mừng bạn quay trở lại."
      subtitle="Đăng nhập để tiếp tục hành trình học TOEIC của bạn."
    >
      <form onSubmit={handleSubmit}>
        {error && <div className="auth-global-error">{error}</div>}

        <div className="auth-form-group">
          <label className="auth-input-label">Email hoặc Số điện thoại</label>
          <input
            type="text"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="auth-input-field"
            placeholder="Nhập Email hoặc Số điện thoại"
          />
        </div>

        <div className="auth-form-group">
          <label className="auth-input-label">Mật khẩu</label>
          <div className="auth-password-wrapper">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="auth-input-field"
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
        </div>

        <div className="auth-form-options">
          <label className="auth-checkbox-label">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="auth-checkbox-input"
            />
            <span>Ghi nhớ đăng nhập</span>
          </label>
          <Link to="/forgot-password" className="auth-forgot-link">
            Quên mật khẩu?
          </Link>
        </div>

        <button type="submit" disabled={isLoading} className="btn-auth-submit">
          {isLoading ? 'Đang xử lý...' : 'Đăng Nhập →'}
        </button>

        <div className="auth-switch-text">
          Chưa có tài khoản?
          <Link to="/register">Đăng ký học viên</Link>
        </div>
      </form>
    </AuthLayout>
  );
}
