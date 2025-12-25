import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import useAuthStore from '../store/authStore.js';
import './LoginPage.css';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [activeTab, setActiveTab] = useState('login');
  const login = useAuthStore((state) => state.login);
  const isLoading = useAuthStore((state) => state.isLoading);
  const navigate = useNavigate();

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
    <div className="login-page">
      <div className="login-container">
        {/* Left Section - Image */}
        <div className="login-image-section">
          <div className="login-image-wrapper">
            <div className="login-image" style={{
              background: 'linear-gradient(135deg, #49BBBD 0%, #23BDEE 100%)',
              width: '100%',
              height: '100%'
            }}></div>
            <div className="login-image-overlay">
              <div className="overlay-title">English Course Online</div>
              <div className="overlay-subtitle">English Course Online is a platform for learning English online.</div>
            </div>
          </div>
        </div>

        {/* Right Section - Form */}
        <div className="login-form-section">
          <form onSubmit={handleSubmit} className="login-form-content">
            <div className="welcome-section">
              <div className="welcome-text">Welcome to English Course Online!</div>
              <div className="tab-switcher">
                <button
                  type="button"
                  className={`tab-button ${activeTab === 'login' ? 'active' : ''}`}
                  onClick={() => setActiveTab('login')}
                >
                  Login
                </button>
                <Link
                  to="/register"
                  className={`tab-button ${activeTab === 'register' ? 'active' : ''}`}
                  onClick={() => setActiveTab('register')}
                >
                  Register
                </Link>
              </div>
            </div>

            <div className="form-description">
              English Course Online is a platform for learning English online.
            </div>

            <div className="form-group">
              <label className="form-label">User name</label>
              <div className="form-input-wrapper">
                <input
                  type="text"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="form-input"
                  placeholder="Enter your User name"
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Password</label>
              <div className="form-input-wrapper password-input-wrapper">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="form-input"
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
            </div>

            {error && <div className="error-message">{error}</div>}

            <div className="form-options">
              <div className="remember-me">
                <input
                  type="checkbox"
                  id="remember"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="remember-checkbox"
                />
                <label htmlFor="remember" className="remember-label">Rememebr me</label>
              </div>
              <Link to="/forgot-password" className="forgot-password">
                Forgot Password ?
              </Link>
            </div>

            <button type="submit" disabled={isLoading} className="btn-login-submit">
              {isLoading ? 'Logging in...' : 'Login'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

