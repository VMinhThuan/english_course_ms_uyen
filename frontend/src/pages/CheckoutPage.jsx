import { Link, useNavigate, useParams, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import useAuthStore from '../store/authStore.js';
import axiosInstance from '../api/axiosConfig.js';
import { API_BASE_URL } from '../api/apiBaseUrl.js';
import '../pages/HomePage.css';
import './CheckoutPage.css';

const API_URL = API_BASE_URL;
const getApiUrl = (path) => {
  return `${API_URL}${path}`;
};

// Payment method logos - using text placeholders for now
const ZALOPAY_LOGO = 'ZP';
const MOMO_LOGO = 'MM';

export default function CheckoutPage() {
  const { courseId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  
  const [scrolled, setScrolled] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [loading, setLoading] = useState(true);
  const [course, setCourse] = useState(null);
  const [cartItems, setCartItems] = useState([]);
  const [instructors, setInstructors] = useState([]);
  
  // Form states
  const [studentInfo, setStudentInfo] = useState({
    fullName: '',
    email: '',
    phone: '',
    learningGoal: '',
    currentLevel: '',
    preferredSchedule: '',
  });
  
  const [selectedInstructor, setSelectedInstructor] = useState('');
  const [saveInfo, setSaveInfo] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [validation, setValidation] = useState({
    fullName: false,
    email: false,
    phone: false,
    learningGoal: false,
    currentLevel: false,
    selectedInstructor: false,
  });

  const user = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const logout = useAuthStore((state) => state.logout);
  const fetchUser = useAuthStore((state) => state.fetchUser);

  useEffect(() => {
    const handleScroll = () => {
      const isScrolled = window.scrollY > 50;
      setScrolled(isScrolled);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (token && !user) {
      fetchUser();
    }
  }, [user, fetchUser]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showUserMenu && !event.target.closest('.user-menu-container')) {
        setShowUserMenu(false);
      }
    };

    if (showUserMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showUserMenu]);

  // Load course data and instructors from location state or fetch from API
  useEffect(() => {
    const loadCourseData = async () => {
      try {
        setLoading(true);
        
        // Mock instructors data - in real app, fetch from API based on course
        const mockInstructors = [
          {
            id: 'instructor-1',
            name: 'Jenny Wilson',
            title: 'Senior English Instructor',
            specialization: 'TOEIC & IELTS',
            rating: 4.9,
            students: 5000,
          },
          {
            id: 'instructor-2',
            name: 'Robert Fox',
            title: 'Business English Specialist',
            specialization: 'Business Communication',
            rating: 4.8,
            students: 3500,
          },
          {
            id: 'instructor-3',
            name: 'Sarah Johnson',
            title: 'Grammar & Writing Expert',
            specialization: 'Academic Writing',
            rating: 4.9,
            students: 6000,
          },
        ];
        setInstructors(mockInstructors);
        
        // Try to get course from location state (from CourseDetailPage)
        if (location.state?.course) {
          setCourse(location.state.course);
          setCartItems([location.state.course]);
        } else if (courseId) {
          // Fetch course from API
          try {
            const response = await axiosInstance.get(`/courses/${courseId}`);
            if (response.data.success) {
              const courseData = response.data.course;
              setCourse(courseData);
              setCartItems([courseData]);
            }
          } catch (error) {
            console.error('Error fetching course:', error);
          }
        } else {
          // Mock data for demo
          setCourse({
            id: 'toeic-reading',
            title: 'TOEIC Reading Mastery',
            price: 99.99,
            discountedPrice: 49.65,
            image: 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=800',
          });
          setCartItems([{
            id: 'toeic-reading',
            title: 'TOEIC Reading Mastery',
            description: 'Lorem ipsum dolor sit amet, consectetur adipising elit, sed do eiusmod tempor',
            price: 99.99,
            discountedPrice: 49.65,
            image: 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=800',
          }]);
        }
        
        // Auto-fill user info if logged in
        if (isAuthenticated && user) {
          setStudentInfo({
            fullName: user.fullName || '',
            email: user.email || '',
            phone: user.phone || user.phoneNumber || '',
            learningGoal: '',
            currentLevel: '',
            preferredSchedule: '',
          });
          setValidation({
            fullName: !!user.fullName,
            email: !!user.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user.email),
            phone: !!(user.phone || user.phoneNumber),
            learningGoal: false,
            currentLevel: false,
            selectedInstructor: false,
          });
        }
      } catch (error) {
        console.error('Error loading course:', error);
      } finally {
        setLoading(false);
      }
    };

    loadCourseData();
  }, [courseId, location.state, isAuthenticated, user]);

  const handleLogout = async () => {
    await logout();
    setShowUserMenu(false);
    navigate('/');
  };

  const getUserInitials = () => {
    if (user?.fullName) {
      const names = user.fullName.split(' ');
      if (names.length >= 2) {
        return (names[0][0] + names[names.length - 1][0]).toUpperCase();
      }
      return user.fullName.substring(0, 2).toUpperCase();
    }
    if (user?.email) {
      return user.email.substring(0, 2).toUpperCase();
    }
    return 'U';
  };

  // Calculate totals
  const subtotal = cartItems.reduce((sum, item) => sum + (item.discountedPrice || item.price || 0), 0);
  const tax = subtotal * 0.05; // 5% tax
  const total = subtotal + tax;


  const handlePaymentMethod = (method) => {
    setPaymentMethod(method);
  };

  // Validate form fields
  const validateField = (field, value) => {
    let isValid = false;
    switch (field) {
      case 'fullName':
        isValid = value.trim().length >= 2;
        break;
      case 'email':
        isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
        break;
      case 'phone':
        isValid = /^[0-9]{10,11}$/.test(value.replace(/\D/g, ''));
        break;
      case 'learningGoal':
        isValid = value.trim().length >= 5;
        break;
      case 'currentLevel':
        isValid = value.trim().length > 0;
        break;
      case 'selectedInstructor':
        isValid = value.trim().length > 0;
        break;
      default:
        isValid = false;
    }

    setValidation(prev => ({ ...prev, [field]: isValid }));
    return isValid;
  };

  const handleStudentInfoChange = (field, value) => {
    setStudentInfo(prev => ({ ...prev, [field]: value }));
    validateField(field, value);
  };

  const handlePayment = async () => {
    // Validate all required fields
    const isFormValid = validation.fullName && validation.email && 
      validation.phone && validation.learningGoal && 
      validation.currentLevel && validation.selectedInstructor && paymentMethod;

    if (!isFormValid) {
      alert('Vui lòng điền đầy đủ thông tin học viên và chọn giảng viên');
      return;
    }

    // Validate payment method
    if (!paymentMethod) {
      alert('Vui lòng chọn phương thức thanh toán');
      return;
    }

    if (!isAuthenticated) {
      alert('Vui lòng đăng nhập để thanh toán');
      navigate('/login');
      return;
    }

    setIsProcessing(true);
    try {
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      const userId = user._id || user.id;

      if (!userId) {
        alert('Vui lòng đăng nhập để thanh toán');
        setIsProcessing(false);
        navigate('/login');
        return;
      }

      // Prepare payment data
      const paymentRequest = {
        courseId: course?.id || courseId,
        userId: userId,
        amount: total,
        items: cartItems.map(item => ({
          id: item.id,
          title: item.title,
          price: item.discountedPrice || item.price,
        })),
        studentInfo: studentInfo,
        instructorId: selectedInstructor,
        paymentData: {
          saveInfo: saveInfo,
        }
      };

      console.log('Creating payment:', paymentRequest);

      let response;
      if (paymentMethod === 'momo') {
        response = await fetch(getApiUrl('/payment/momo/create'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
          },
          body: JSON.stringify(paymentRequest)
        });
        response = await response.json();
      } else if (paymentMethod === 'zalopay') {
        response = await fetch(getApiUrl('/payment/zalo/create'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
          },
          body: JSON.stringify(paymentRequest)
        });
        response = await response.json();
      }

      if (response.success) {
        // Redirect to payment gateway
        const paymentUrl = response.data.paymentUrl;
        console.log('Redirecting to payment URL:', paymentUrl);
        alert('Đang chuyển hướng đến trang thanh toán...');
        window.location.href = paymentUrl;
      } else {
        alert('Tạo thanh toán thất bại: ' + (response.message || 'Có lỗi xảy ra'));
      }
    } catch (err) {
      console.error('Payment error:', err);
      alert('Có lỗi xảy ra khi tạo thanh toán: ' + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const formatPrice = (price) => {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(price);
  };

  if (loading) {
    return (
      <div className="checkout-loading">
        <div className="spinner-large"></div>
        <p>Đang tải...</p>
      </div>
    );
  }

  return (
    <div className="checkout-page-wrapper">
      {/* Header Section - Same as HomePage */}
      <header className={`header ${scrolled ? 'scrolled' : ''}`}>
        <div className="header-content">
          <Link to="/" className="navbar-logo">
            <span className="logo-text">Ms Uyen<span className="brand-dot">.</span></span>
          </Link>
          <nav className="nav-menu">
            <Link to="/">Home</Link>
            <Link to="/courses">Courses</Link>
            <Link to="/about">About Us</Link>
            <Link to="/blog">Blog</Link>
          </nav>
          <div className="header-actions">
            {isAuthenticated && user ? (
              <div className="user-menu-container">
                <button 
                  className="user-avatar-btn"
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  aria-label="User menu"
                >
                  <div className="user-avatar">
                    {getUserInitials()}
                  </div>
                </button>
                {showUserMenu && (
                  <div className="user-dropdown">
                    <div className="user-dropdown-header">
                      <div className="user-dropdown-name">{user.fullName || user.email}</div>
                      <div className="user-dropdown-email">{user.email}</div>
                    </div>
                    <div className="user-dropdown-divider"></div>
                    <Link 
                      to="/profile" 
                      className="user-dropdown-item"
                      onClick={() => setShowUserMenu(false)}
                    >
                      <svg className="dropdown-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                        <circle cx="12" cy="7" r="4"></circle>
                      </svg>
                      <span>Xem hồ sơ</span>
                    </Link>
                    <div className="user-dropdown-divider"></div>
                    <button 
                      className="user-dropdown-item"
                      onClick={handleLogout}
                    >
                      <svg className="dropdown-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                        <polyline points="16 17 21 12 16 7"></polyline>
                        <line x1="21" y1="12" x2="9" y2="12"></line>
                      </svg>
                      <span>Logout</span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <>
                <Link to="/login" className="btn-login">Login</Link>
                <Link to="/register" className="btn-signup">Sign Up</Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="checkout-content">
        <div className="checkout-container">
          <div className="checkout-header">
            <h1 className="checkout-title">Checkout</h1>
          </div>

          <div className="checkout-grid">
            {/* Left Column - Checkout Form */}
            <div className="checkout-form-section">
              {/* Student Information */}
              <div className="form-section">
                <h3 className="section-title">Student Information</h3>
                <div className="form-group">
                  <label>Full Name *</label>
                  <input
                    type="text"
                    value={studentInfo.fullName}
                    onChange={(e) => handleStudentInfoChange('fullName', e.target.value)}
                    className={`modern-input ${validation.fullName ? 'valid' : ''} ${!validation.fullName && studentInfo.fullName ? 'error' : ''}`}
                    placeholder="Enter your full name"
                  />
                </div>
                <div className="form-grid">
                  <div className="form-group">
                    <label>Email *</label>
                    <input
                      type="email"
                      value={studentInfo.email}
                      onChange={(e) => handleStudentInfoChange('email', e.target.value)}
                      className={`modern-input ${validation.email ? 'valid' : ''} ${!validation.email && studentInfo.email ? 'error' : ''}`}
                      placeholder="Enter your email"
                    />
                  </div>
                  <div className="form-group">
                    <label>Phone Number *</label>
                    <input
                      type="tel"
                      value={studentInfo.phone}
                      onChange={(e) => handleStudentInfoChange('phone', e.target.value)}
                      className={`modern-input ${validation.phone ? 'valid' : ''} ${!validation.phone && studentInfo.phone ? 'error' : ''}`}
                      placeholder="Enter your phone number"
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label>Current English Level *</label>
                  <select
                    value={studentInfo.currentLevel}
                    onChange={(e) => handleStudentInfoChange('currentLevel', e.target.value)}
                    className={`modern-input ${validation.currentLevel ? 'valid' : ''} ${!validation.currentLevel && studentInfo.currentLevel ? 'error' : ''}`}
                  >
                    <option value="">Select your level</option>
                    <option value="beginner">Beginner</option>
                    <option value="intermediate">Intermediate</option>
                    <option value="advanced">Advanced</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Learning Goal *</label>
                  <textarea
                    value={studentInfo.learningGoal}
                    onChange={(e) => handleStudentInfoChange('learningGoal', e.target.value)}
                    className={`modern-input modern-textarea ${validation.learningGoal ? 'valid' : ''} ${!validation.learningGoal && studentInfo.learningGoal ? 'error' : ''}`}
                    placeholder="Tell us about your learning goals (e.g., TOEIC 800+, IELTS 7.0, Business English...)"
                    rows="4"
                  />
                </div>
                <div className="form-group">
                  <label>Preferred Schedule</label>
                  <select
                    value={studentInfo.preferredSchedule}
                    onChange={(e) => handleStudentInfoChange('preferredSchedule', e.target.value)}
                    className="modern-input"
                  >
                    <option value="">Select preferred schedule</option>
                    <option value="morning">Morning (8:00 - 12:00)</option>
                    <option value="afternoon">Afternoon (13:00 - 17:00)</option>
                    <option value="evening">Evening (18:00 - 22:00)</option>
                    <option value="flexible">Flexible</option>
                  </select>
                </div>
              </div>

              {/* Instructor Selection */}
              <div className="form-section">
                <h3 className="section-title">Select Instructor *</h3>
                <div className="instructor-selection">
                  {instructors.map((instructor) => (
                    <div
                      key={instructor.id}
                      className={`instructor-option ${selectedInstructor === instructor.id ? 'selected' : ''}`}
                      onClick={() => {
                        setSelectedInstructor(instructor.id);
                        validateField('selectedInstructor', instructor.id);
                      }}
                    >
                      <div className="instructor-option-avatar">
                        {instructor.name.charAt(0)}
                      </div>
                      <div className="instructor-option-info">
                        <div className="instructor-option-name">{instructor.name}</div>
                        <div className="instructor-option-title">{instructor.title}</div>
                        <div className="instructor-option-specialization">{instructor.specialization}</div>
                        <div className="instructor-option-stats">
                          <span>⭐ {instructor.rating}</span>
                          <span>👥 {instructor.students.toLocaleString()}+ students</span>
                        </div>
                      </div>
                      {selectedInstructor === instructor.id && (
                        <div className="instructor-option-check">
                          ✓
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                {!validation.selectedInstructor && selectedInstructor && (
                  <p className="error-message">Please select an instructor</p>
                )}
              </div>

              {/* Payment Methods */}
              <div className="form-section">
                <h3 className="section-title">Cart Type</h3>
                <div className="payment-methods">
                  <button
                    className={`payment-method ${paymentMethod === 'zalopay' ? 'active zalopay' : ''}`}
                    onClick={() => handlePaymentMethod('zalopay')}
                  >
                    <div className="payment-logo zalopay">
                      <span>{ZALOPAY_LOGO}</span>
                    </div>
                    <span>ZaloPay</span>
                  </button>
                  <button
                    className={`payment-method ${paymentMethod === 'momo' ? 'active momo' : ''}`}
                    onClick={() => handlePaymentMethod('momo')}
                  >
                    <div className="payment-logo momo">
                      <span>{MOMO_LOGO}</span>
                    </div>
                    <span>MoMo</span>
                  </button>
                </div>
              </div>

              {/* Save Info Checkbox */}
              <div className="form-section">
                <div className="form-group checkbox-group">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={saveInfo}
                      onChange={(e) => setSaveInfo(e.target.checked)}
                    />
                    <span>Save my information for faster checkout</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Right Column - Order Summary */}
            <div className="order-summary-section">
              <div className="order-summary-card">
                <h3>Summary</h3>

                <div className="order-items">
                  {cartItems.map((item) => (
                    <div key={item.id} className="order-item">
                      <div className="item-image">
                        <img src={item.image || 'https://via.placeholder.com/80'} alt={item.title} />
                      </div>
                      <div className="item-info">
                        <h4>{item.title}</h4>
                        <p className="item-description">
                          {item.description || 'Lorem ipsum dollar...'}
                        </p>
                        <p className="item-price">{formatPrice(item.discountedPrice || item.price)}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="order-breakdown">
                  <div className="breakdown-item">
                    <span>Subtotal</span>
                    <span>{formatPrice(subtotal)}</span>
                  </div>
                  <div className="breakdown-item">
                    <span>Coupon Discount</span>
                    <span>0%</span>
                  </div>
                  <div className="breakdown-item">
                    <span>TAX</span>
                    <span>5%</span>
                  </div>
                </div>

                <div className="order-total">
                  <span>Total</span>
                  <span className="total-amount">{formatPrice(total)}</span>
                </div>

                <button
                  className={`premium-checkout-button ${paymentMethod ? 'active' : ''}`}
                  onClick={handlePayment}
                  disabled={isProcessing || !paymentMethod}
                >
                  {isProcessing ? (
                    <div className="processing" aria-label="Đang xử lý">
                      <div className="spinner-small"></div>
                    </div>
                  ) : (
                    <>
                      <span>Confirm Payment</span>
                      <span>→</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer - Same as HomePage */}
      <footer className="footer">
        <div className="container">
          <div className="footer-content">
            <div className="footer-logo">
              <div className="logo-icon-footer"></div>
              <span className="logo-text-footer">Ms Uyen</span>
              <span className="logo-tagline">Học tiếng Anh & Luyện thi TOEIC</span>
            </div>
            <div className="footer-newsletter">
              <h3 className="newsletter-title">Đăng ký nhận thông báo</h3>
              <div className="newsletter-form">
                <input 
                  type="email" 
                  placeholder="Email của bạn" 
                  className="newsletter-input"
                />
                <button className="btn-subscribe">Đăng ký</button>
              </div>
            </div>
          </div>
          <div className="footer-links">
            <Link to="/privacy">Chính sách bảo mật</Link>
            <span className="separator">|</span>
            <Link to="/terms">Điều khoản sử dụng</Link>
          </div>
          <div className="footer-copyright">
            © {new Date().getFullYear()} Ms Uyen. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}

