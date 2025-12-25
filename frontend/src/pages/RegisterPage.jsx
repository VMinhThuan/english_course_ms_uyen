import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import useAuthStore from '../store/authStore.js';
import './RegisterPage.css';

export default function RegisterPage() {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    fullName: '',
    gender: '',
    dateOfBirth: '',
    role: 'student', // Mặc định là student
  });
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [activeTab, setActiveTab] = useState('register');
  const register = useAuthStore((state) => state.register);
  const isLoading = useAuthStore((state) => state.isLoading);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Validate password match
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    // Validate required fields
    if (!formData.gender) {
      setError('Please select your gender');
      return;
    }

    if (!formData.dateOfBirth) {
      setError('Please enter your date of birth');
      return;
    }

    // Đảm bảo role luôn là student
    const result = await register({ 
      ...formData, 
      role: 'student',
      // Remove confirmPassword before sending to API
      confirmPassword: undefined
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
        {/* Left Section - Image */}
        <div className="register-image-section">
          <div className="register-image-wrapper">
            <div className="register-image" style={{
              background: 'linear-gradient(135deg, #49BBBD 0%, #23BDEE 100%)',
              width: '100%',
              height: '100%'
            }}></div>
            <div className="register-image-overlay">
              <div className="overlay-title">English Course Online</div>
              <div className="overlay-subtitle">English Course Online is a platform for learning English online.</div>
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

            <div className="form-description">
              English Course Online is a platform for learning English online.
            </div>

            <div className="form-group">
              <label className="form-label">Email Address</label>
              <div className="form-input-wrapper">
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                  className="form-input"
                  placeholder="Enter your Email Address"
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">User name</label>
              <div className="form-input-wrapper">
                <input
                  type="text"
                  value={formData.fullName}
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
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
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  required
                  minLength={6}
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

            <button type="submit" disabled={isLoading} className="btn-register-submit">
              {isLoading ? 'Registering...' : 'Register'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
