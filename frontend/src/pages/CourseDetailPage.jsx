import { Link, useNavigate, useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import useAuthStore from '../store/authStore.js';
import CourseCard from '../components/CourseCard.jsx';
import '../pages/HomePage.css';
import './CourseDetailPage.css';

// Static course data for demo
const STATIC_COURSE_DETAIL = {
  id: 'toeic-reading',
  title: 'TOEIC Reading Mastery',
  description: 'Master TOEIC reading comprehension with practice tests, strategies, and detailed explanations. This comprehensive course will help you achieve your target TOEIC score.',
  level: 'Intermediate',
  teacherName: 'Jenny Wilson',
  price: 99.99,
  discountedPrice: 49.65,
  discount: 50,
  rating: 4.0,
  ratingCount: 245,
  englishType: 'TOEIC',
  skills: ['Reading', 'Vocabulary', 'Grammar'],
  modules: 32,
  hoursLeft: 11,
  image: 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=800',
};

const STATIC_RATINGS = {
  5: 180,
  4: 45,
  3: 15,
  2: 3,
  1: 2,
};

const STATIC_REVIEWS = [
  {
    id: 1,
    userName: 'Lina',
    userAvatar: 'L',
    rating: 5,
    timeAgo: '3 Month',
    text: 'This TOEIC Reading course has been incredibly helpful for my exam preparation. The practice tests and detailed explanations helped me understand the reading strategies better. I improved my score by 150 points!',
  },
  {
    id: 2,
    userName: 'Sarah',
    userAvatar: 'S',
    rating: 5,
    timeAgo: '2 Month',
    text: 'Excellent course structure and comprehensive materials. The instructor explains complex grammar points clearly, and the vocabulary exercises are very practical. Highly recommend for anyone preparing for TOEIC.',
  },
];

const STATIC_MARKETING_COURSES = [
  {
    id: 'aws-cert-1',
    title: 'AWS Certified solutions Architect',
    description: 'Bài học chất lượng cao tích hợp từ vựng và tài liệu tham khảo chi tiết từ Ms Uyen.',
    category: 'Design',
    duration: '3 Month',
    teacherName: 'Lina',
    originalPrice: '$100',
    discountedPrice: '$80',
    level: 'Intermediate',
    rating: 4.8,
    ratingCount: 120,
    englishType: 'TOEIC',
    skills: ['Reading', 'Writing'],
  },
  {
    id: 'aws-cert-2',
    title: 'AWS Certified solutions Architect',
    description: 'Bài học chất lượng cao tích hợp từ vựng và tài liệu tham khảo chi tiết từ Ms Uyen.',
    category: 'Design',
    duration: '3 Month',
    teacherName: 'Lina',
    originalPrice: '$100',
    discountedPrice: '$80',
    level: 'Beginner',
    rating: 4.6,
    ratingCount: 98,
    englishType: 'IELTS',
    skills: ['Speaking', 'Listening'],
  },
  {
    id: 'aws-cert-3',
    title: 'AWS Certified solutions Architect',
    description: 'Bài học chất lượng cao tích hợp từ vựng và tài liệu tham khảo chi tiết từ Ms Uyen.',
    category: 'Design',
    duration: '3 Month',
    teacherName: 'Lina',
    originalPrice: '$100',
    discountedPrice: '$80',
    level: 'Advanced',
    rating: 4.9,
    ratingCount: 210,
    englishType: 'TOEFL',
    skills: ['Reading', 'Writing', 'Speaking'],
  },
  {
    id: 'aws-cert-4',
    title: 'AWS Certified solutions Architect',
    description: 'Bài học chất lượng cao tích hợp từ vựng và tài liệu tham khảo chi tiết từ Ms Uyen.',
    category: 'Design',
    duration: '3 Month',
    teacherName: 'Lina',
    originalPrice: '$100',
    discountedPrice: '$80',
    level: 'Intermediate',
    rating: 4.7,
    ratingCount: 140,
    englishType: 'General',
    skills: ['Listening', 'Reading'],
  },
];

const STATIC_INSTRUCTORS = [
  {
    id: 1,
    name: 'Jenny Wilson',
    title: 'Senior English Instructor',
    experience: '10+ years',
    specialization: 'TOEIC & IELTS',
    rating: 4.9,
    students: 5000,
    courses: 25,
    bio: 'Expert in English test preparation with proven track record of helping students achieve their target scores.',
    avatar: 'JW',
  },
  {
    id: 2,
    name: 'Robert Fox',
    title: 'Business English Specialist',
    experience: '8+ years',
    specialization: 'Business Communication',
    rating: 4.8,
    students: 3500,
    courses: 18,
    bio: 'Former corporate trainer with extensive experience in professional English communication.',
    avatar: 'RF',
  },
  {
    id: 3,
    name: 'Sarah Johnson',
    title: 'Grammar & Writing Expert',
    experience: '12+ years',
    specialization: 'Academic Writing',
    rating: 4.9,
    students: 6000,
    courses: 30,
    bio: 'Published author and experienced educator specializing in English grammar and academic writing.',
    avatar: 'SJ',
  },
];

export default function CourseDetailPage() {
  const { id } = useParams();
  const [scrolled, setScrolled] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [course] = useState(STATIC_COURSE_DETAIL);
  
  const user = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const logout = useAuthStore((state) => state.logout);
  const fetchUser = useAuthStore((state) => state.fetchUser);
  const navigate = useNavigate();

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

  const totalRatings = Object.values(STATIC_RATINGS).reduce((a, b) => a + b, 0);
  const ratingPercentages = {};
  Object.keys(STATIC_RATINGS).forEach((star) => {
    ratingPercentages[star] = (STATIC_RATINGS[star] / totalRatings) * 100;
  });

  return (
    <div className="course-detail-wrapper">
      {/* Header Section - Same as HomePage */}
      <header className={`header ${scrolled ? 'scrolled' : ''}`}>
        <div className="header-content">
          <div className="logo">
            <span className="logo-text">Ms Uyen<span className="brand-dot">.</span></span>
          </div>
          <nav className="nav-menu">
            <Link to="/">Home</Link>
            <Link to="/courses" className="active">Courses</Link>
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
      <div className="course-detail-content">
        {/* Banner Image Section */}
        <section className="course-banner-section">
          <div className="course-banner-image">
            <img src={course.image} alt={course.title} />
          </div>
          <div className="course-banner-inset">
            <img src={course.image} alt={course.title} />
          </div>
        </section>

        {/* Main Content with Two Columns */}
        <section className="course-main-section">
          <div className="container">
            <div className="course-main-wrapper">
              {/* Left Column: Tabs, Rating, Reviews */}
              <div className="course-left-column">
                {/* Course Tabs Section */}
                <div className="course-tabs-section">
                  <div className="course-tabs">
                    <button 
                      className={`course-tab ${activeTab === 'overview' ? 'active' : ''}`}
                      onClick={() => setActiveTab('overview')}
                    >
                      Overview
                    </button>
                    <button 
                      className={`course-tab ${activeTab === 'curriculum' ? 'active' : ''}`}
                      onClick={() => setActiveTab('curriculum')}
                    >
                      Curriculum
                    </button>
                    <button 
                      className={`course-tab ${activeTab === 'instructor' ? 'active' : ''}`}
                      onClick={() => setActiveTab('instructor')}
                    >
                      Instructor
                    </button>
                    <button 
                      className={`course-tab ${activeTab === 'reviews' ? 'active' : ''}`}
                      onClick={() => setActiveTab('reviews')}
                    >
                      Reviews
                    </button>
                  </div>
                </div>

                {/* Rating and Reviews Section */}
                <div className="course-rating-section">
                  <div className="rating-wrapper">
                    <div className="rating-overview">
                      <div className="rating-score">
                        <span className="score-number">{course.rating}</span>
                        <span className="score-out-of">out of 5</span>
                      </div>
                      <div className="rating-stars">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <span key={star} className={`star ${star <= Math.round(course.rating) ? 'filled' : ''}`}>
                            ★
                          </span>
                        ))}
                      </div>
                      <div className="rating-label">Top Rating</div>
                    </div>
                    <div className="rating-distribution">
                      {[5, 4, 3, 2, 1].map((star) => (
                        <div key={star} className="rating-bar-item">
                          <span className="bar-label">{star} Stars</span>
                          <div className="rating-bar">
                            <div 
                              className="rating-bar-fill" 
                              style={{ width: `${ratingPercentages[star]}%` }}
                            ></div>
                          </div>
                          <span className="bar-count">{STATIC_RATINGS[star]}</span>
                        </div>
                      ))}
                      <div className="user-reviews">
                        {STATIC_REVIEWS.map((review) => (
                          <div key={review.id} className="review-item">
                            <div className="review-avatar">{review.userAvatar}</div>
                            <div className="review-content">
                              <div className="review-header">
                                <span className="review-name">{review.userName}</span>
                                <div className="review-stars">
                                  {[1, 2, 3, 4, 5].map((star) => (
                                    <span key={star} className={`star ${star <= review.rating ? 'filled' : ''}`}>
                                      ★
                                    </span>
                                  ))}
                                </div>
                                <span className="review-time">{review.timeAgo}</span>
                              </div>
                              <p className="review-text">{review.text}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column: Purchase Card */}
              <div className="course-right-column">
                <div className="course-purchase-card">
                  <div className="purchase-price">
                    <span className="price-discounted">${course.discountedPrice}</span>
                    <span className="price-original">${course.price}</span>
                    <span className="price-discount-badge">{course.discount}% Off</span>
                  </div>
                  <div className="purchase-timer">
                    <svg className="timer-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10"></circle>
                      <polyline points="12 6 12 12 16 14"></polyline>
                    </svg>
                    <span>{course.hoursLeft} hour left at this price</span>
                  </div>
                  <Link 
                    to="/checkout" 
                    state={{ course: course }}
                    className="btn-buy-now"
                  >
                    Buy Now
                  </Link>
                  <div className="purchase-inclusions">
                    <h4 className="inclusions-title">This Course included</h4>
                    <div className="inclusion-item">
                      <svg className="check-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="20 6 9 17 4 12"></polyline>
                      </svg>
                      <span>Money Back Guarantee</span>
                    </div>
                    <div className="inclusion-item">
                      <svg className="check-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="20 6 9 17 4 12"></polyline>
                      </svg>
                      <span>Access on all devices</span>
                    </div>
                    <div className="inclusion-item">
                      <svg className="check-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="20 6 9 17 4 12"></polyline>
                      </svg>
                      <span>Certification of completion</span>
                    </div>
                    <div className="inclusion-item">
                      <svg className="check-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="20 6 9 17 4 12"></polyline>
                      </svg>
                      <span>{course.modules} Modules</span>
                    </div>
                  </div>
                  <div className="purchase-group-training">
                    <h4>Training 5 or more people?</h4>
                    <p>Get your team access to comprehensive English courses designed for professional development and corporate training programs.</p>
                  </div>
                  <div className="purchase-share">
                    <h4>Share this course</h4>
                    <div className="share-icons">
                      <a href="#" className="share-icon twitter" title="Twitter">t</a>
                      <a href="#" className="share-icon facebook" title="Facebook">f</a>
                      <a href="#" className="share-icon youtube" title="YouTube">y</a>
                      <a href="#" className="share-icon instagram" title="Instagram">i</a>
                      <a href="#" className="share-icon telegram" title="Telegram">tg</a>
                      <a href="#" className="share-icon whatsapp" title="WhatsApp">wa</a>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>


        {/* Marketing Articles Section */}
        <section className="marketing-articles-section">
          <div className="container">
            <div className="marketing-header">
              <h2 className="marketing-title">Marketing Articles</h2>
              <Link to="/courses" className="marketing-see-all">See all</Link>
            </div>
            <div className="marketing-courses-grid">
              {STATIC_MARKETING_COURSES.map((course) => (
                <div key={course.id} className="marketing-course-card">
                  <div className="marketing-card-image">
                    <div className="marketing-image-placeholder">
                      {course.title.charAt(0)}
                    </div>
                  </div>
                  <div className="marketing-card-content">
                    <div className="marketing-card-meta">
                      <div className="marketing-category">
                        <svg className="category-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="3" y="3" width="7" height="7"></rect>
                          <rect x="14" y="3" width="7" height="7"></rect>
                          <rect x="3" y="14" width="7" height="7"></rect>
                          <rect x="14" y="14" width="7" height="7"></rect>
                        </svg>
                        <span>{course.category}</span>
                      </div>
                      <div className="marketing-duration">
                        <svg className="clock-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="12" r="10"></circle>
                          <polyline points="12 6 12 12 16 14"></polyline>
                        </svg>
                        <span>{course.duration}</span>
                      </div>
                    </div>
                    <h3 className="marketing-card-title">{course.title}</h3>
                    <p className="marketing-card-description">{course.description}</p>
                    <div className="marketing-card-footer">
                      <div className="marketing-instructor">
                        <div className="marketing-instructor-avatar">{course.teacherName.charAt(0)}</div>
                        <span className="marketing-instructor-name">{course.teacherName}</span>
                      </div>
                      <div className="marketing-pricing">
                        <span className="marketing-original-price">{course.originalPrice}</span>
                        <span className="marketing-discounted-price">{course.discountedPrice}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* TOTC Promotional Section */}
        <section className="totc-promotional-section">
          <div className="container">
            <div className="totc-content-wrapper">
              <div className="totc-text-content">
                <h2 className="totc-headline">
                  Học bài, ôn từ vựng và luyện đề cùng <span className="totc-highlight">Ms Uyen</span>
                </h2>
                <p className="totc-description">
                  Hệ thống học tập trực tuyến quản lý bài học, tài liệu, bài tập và mô phỏng thi thử TOEIC chuẩn hóa.
                </p>
                <Link to="/register" className="totc-learn-more">Đăng ký học ngay</Link>
                <div className="totc-decorative-shape"></div>
              </div>
              <div className="totc-image-content">
                <div className="totc-image-frame">
                  <div className="totc-image-placeholder">
                    <div className="totc-play-button"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Instructors Section */}
        <section className="instructors-section">
          <div className="container">
            <div className="instructors-header">
              <h2 className="instructors-title">Giảng Viên</h2>
            </div>
            <div className="instructors-cards-grid">
              {STATIC_INSTRUCTORS.map((instructor) => (
                <div key={instructor.id} className="instructor-card">
                  <div className="instructor-card-image">
                    <div className="instructor-avatar-large">
                      {instructor.avatar}
                    </div>
                  </div>
                  <div className="instructor-card-content">
                    <h3 className="instructor-card-name">{instructor.name}</h3>
                    <p className="instructor-card-title">{instructor.title}</p>
                    <div className="instructor-stats">
                      <div className="instructor-stat-item">
                        <svg className="stat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                          <circle cx="9" cy="7" r="4"></circle>
                          <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                          <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                        </svg>
                        <span>{instructor.students.toLocaleString()}+ Học viên</span>
                      </div>
                      <div className="instructor-stat-item">
                        <svg className="stat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path>
                          <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path>
                        </svg>
                        <span>{instructor.courses} Bài học</span>
                      </div>
                      <div className="instructor-stat-item">
                        <svg className="stat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                        </svg>
                        <span>{instructor.rating} Đánh giá</span>
                      </div>
                    </div>
                    <div className="instructor-specialization">
                      <span className="specialization-label">Chuyên môn:</span>
                      <span className="specialization-value">{instructor.specialization}</span>
                    </div>
                    <p className="instructor-bio">{instructor.bio}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      {/* Footer - Same as HomePage */}
      <footer className="footer">
        <div className="container">
          <div className="footer-content">
            <div className="footer-logo">
              <span className="logo-text-footer">Ms Uyen</span>
              <span className="logo-tagline">Học tiếng Anh & Luyện thi TOEIC</span>
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
