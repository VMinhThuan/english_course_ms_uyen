import { Link, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import useAuthStore from '../store/authStore.js';
import CourseFilter from '../components/CourseFilter.jsx';
import CourseCard from '../components/CourseCard.jsx';
import './CourseListPage.css';

const STATIC_COURSES = [
  {
    id: 'toeic-reading',
    title: 'TOEIC Reading Mastery',
    description:
      'Master TOEIC reading comprehension with practice tests, strategies, and detailed explanations.',
    level: 'Intermediate',
    teacherName: 'Jenny Wilson',
    priceLabel: '$79',
    price: 79,
    rating: 4.8,
    ratingCount: 120,
    category: 'reading',
    englishType: 'TOEIC',
    skills: ['Reading', 'Vocabulary', 'Grammar'],
  },
  {
    id: 'ielts-writing',
    title: 'IELTS Writing Excellence',
    description:
      'Improve your IELTS writing scores with structured lessons, sample essays, and personalized feedback.',
    level: 'Advanced',
    teacherName: 'Robert Fox',
    priceLabel: '$99',
    price: 99,
    rating: 4.9,
    ratingCount: 156,
    category: 'writing',
    englishType: 'IELTS',
    skills: ['Writing', 'Grammar', 'Vocabulary'],
  },
  {
    id: 'toefl-speaking',
    title: 'TOEFL Speaking Success',
    description:
      'Enhance your TOEFL speaking skills with practice tests, pronunciation tips, and speaking strategies.',
    level: 'Intermediate',
    teacherName: 'Cody Fisher',
    priceLabel: '$89',
    price: 89,
    rating: 4.7,
    ratingCount: 140,
    category: 'speaking',
    englishType: 'TOEFL',
    skills: ['Speaking', 'Pronunciation', 'Fluency'],
  },
  {
    id: 'ielts-listening',
    title: 'IELTS Listening Mastery',
    description:
      'Develop your IELTS listening skills with authentic audio materials and comprehensive practice tests.',
    level: 'Intermediate',
    teacherName: 'Darrell Steward',
    priceLabel: '$69',
    price: 69,
    rating: 4.6,
    ratingCount: 98,
    category: 'listening',
    englishType: 'IELTS',
    skills: ['Listening', 'Note-taking', 'Comprehension'],
  },
  {
    id: 'toeic-listening',
    title: 'TOEIC Listening Practice',
    description:
      'Improve your TOEIC listening scores with targeted exercises and test-taking strategies.',
    level: 'Beginner',
    teacherName: 'Sarah Johnson',
    priceLabel: '$59',
    price: 59,
    rating: 4.5,
    ratingCount: 87,
    category: 'listening',
    englishType: 'TOEIC',
    skills: ['Listening', 'Comprehension'],
  },
  {
    id: 'general-english',
    title: 'General English Communication',
    description:
      'Build your overall English proficiency with integrated skills practice for daily communication.',
    level: 'Beginner',
    teacherName: 'Michael Brown',
    priceLabel: 'Free',
    price: 0,
    rating: 4.7,
    ratingCount: 210,
    category: 'general',
    englishType: 'General',
    skills: ['Speaking', 'Listening', 'Reading', 'Writing'],
  },
  {
    id: 'toefl-reading',
    title: 'TOEFL Reading Comprehension',
    description:
      'Master TOEFL reading passages with advanced strategies and extensive practice materials.',
    level: 'Advanced',
    teacherName: 'Emily Davis',
    priceLabel: '$109',
    price: 109,
    rating: 4.9,
    ratingCount: 134,
    category: 'reading',
    englishType: 'TOEFL',
    skills: ['Reading', 'Critical Thinking', 'Vocabulary'],
  },
  {
    id: 'ielts-all-skills',
    title: 'IELTS Complete Preparation',
    description:
      'Comprehensive IELTS preparation covering all four skills: Reading, Writing, Listening, and Speaking.',
    level: 'Advanced',
    teacherName: 'David Wilson',
    priceLabel: '$149',
    price: 149,
    rating: 4.8,
    ratingCount: 245,
    category: 'all-skills',
    englishType: 'IELTS',
    skills: ['Reading', 'Writing', 'Listening', 'Speaking'],
  },
];

const ENROLLED_COURSES = [
  {
    id: 'eng-speak',
    title: 'Spoken English Mastery',
    teacherName: 'Lina',
    progressPercent: 70,
    progressLabel: 'Lesson 5 of 7',
  },
  {
    id: 'eng-business',
    title: 'Business English Communication',
    teacherName: 'Lina',
    progressPercent: 40,
    progressLabel: 'Lesson 3 of 8',
  },
  {
    id: 'eng-grammar',
    title: 'English Grammar Essentials',
    teacherName: 'Lina',
    progressPercent: 85,
    progressLabel: 'Lesson 10 of 12',
  },
];

const STATIC_RECOMMENDED_COURSES = [
  {
    id: 'aws-cert-1',
    title: 'AWS Certified solutions Architect',
    description: 'Bài học chất lượng cao tích hợp từ vựng và tài liệu tham khảo chi tiết từ Ms Uyen.',
    category: 'Design',
    duration: '3 Month',
    teacherName: 'Lina',
    originalPrice: '$100',
    discountedPrice: '$80',
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
  },
];

const STATIC_VIEWED_COURSES = [
  {
    id: 'viewed-1',
    title: 'AWS Certified solutions Architect',
    description: 'Bài học chất lượng cao tích hợp từ vựng và tài liệu tham khảo chi tiết từ Ms Uyen.',
    category: 'Design',
    duration: '3 Month',
    teacherName: 'Lina',
    originalPrice: '$100',
    discountedPrice: '$80',
  },
  {
    id: 'viewed-2',
    title: 'AWS Certified solutions Architect',
    description: 'Bài học chất lượng cao tích hợp từ vựng và tài liệu tham khảo chi tiết từ Ms Uyen.',
    category: 'Design',
    duration: '3 Month',
    teacherName: 'Lina',
    originalPrice: '$100',
    discountedPrice: '$80',
  },
  {
    id: 'viewed-3',
    title: 'AWS Certified solutions Architect',
    description: 'Bài học chất lượng cao tích hợp từ vựng và tài liệu tham khảo chi tiết từ Ms Uyen.',
    category: 'Design',
    duration: '3 Month',
    teacherName: 'Lina',
    originalPrice: '$100',
    discountedPrice: '$80',
  },
  {
    id: 'viewed-4',
    title: 'AWS Certified solutions Architect',
    description: 'Bài học chất lượng cao tích hợp từ vựng và tài liệu tham khảo chi tiết từ Ms Uyen.',
    category: 'Design',
    duration: '3 Month',
    teacherName: 'Lina',
    originalPrice: '$100',
    discountedPrice: '$80',
  },
];

export default function CourseListPage() {
  const [scrolled, setScrolled] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedEnglishType, setSelectedEnglishType] = useState('all');
  const [sortBy, setSortBy] = useState('default');
  const [recommendedScrollPosition, setRecommendedScrollPosition] = useState(0);
  const [viewedScrollPosition, setViewedScrollPosition] = useState(0);
  
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

  // Fetch user data if token exists but user data is not loaded
  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (token && !user) {
      fetchUser();
    }
  }, [user, fetchUser]);

  // Close dropdown when clicking outside
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

  // Get user initials for avatar
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

  // Filter and sort courses (pure front-end, no backend logic)
  let filteredCourses = STATIC_COURSES.filter((course) => {
    const matchesSearch =
      course.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      course.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      course.skills?.some(skill => skill.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesCategory =
      selectedCategory === 'all' || course.level.toLowerCase() === selectedCategory;

    const matchesEnglishType =
      selectedEnglishType === 'all' || course.englishType === selectedEnglishType;

    return matchesSearch && matchesCategory && matchesEnglishType;
  });

  // Sort courses
  if (sortBy === 'price-low') {
    filteredCourses = [...filteredCourses].sort((a, b) => (a.price || 0) - (b.price || 0));
  } else if (sortBy === 'price-high') {
    filteredCourses = [...filteredCourses].sort((a, b) => (b.price || 0) - (a.price || 0));
  } else if (sortBy === 'rating') {
    filteredCourses = [...filteredCourses].sort((a, b) => (b.rating || 0) - (a.rating || 0));
  } else if (sortBy === 'reviews') {
    filteredCourses = [...filteredCourses].sort((a, b) => (b.ratingCount || 0) - (a.ratingCount || 0));
  }

  const categories = [
    { id: 'all', label: 'All Courses' },
    { id: 'beginner', label: 'Beginner' },
    { id: 'intermediate', label: 'Intermediate' },
    { id: 'advanced', label: 'Advanced' }
  ];

  const englishTypes = [
    { id: 'all', label: 'All Types' },
    { id: 'TOEIC', label: 'TOEIC' },
    { id: 'IELTS', label: 'IELTS' },
    { id: 'TOEFL', label: 'TOEFL' },
    { id: 'General', label: 'General English' }
  ];

  return (
    <div className="courses-page-wrapper">
      {/* Header Section */}
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

      {/* Main Content Area */}
      <div className="main-content main-content-no-sidebar">
        {/* Hero Section */}
        <section className="courses-hero">
          <div className="container">
            <div className="courses-hero-content">
              <h1 className="courses-hero-title">Browse Our Courses</h1>
              <p className="courses-hero-description">
                Discover a wide range of English courses designed to help you achieve your learning goals. 
                From beginner to advanced levels, find the perfect course for you.
              </p>
            </div>
          </div>
        </section>

        {/* Enrolled Courses Section */}
        <section className="enrolled-section">
          <div className="container">
            <div className="enrolled-header">
              <h2 className="enrolled-title">
                Welcome back, ready for your next lesson?
              </h2>
              <button className="enrolled-history-btn">
                View history
              </button>
            </div>

            <div className="enrolled-cards">
              {ENROLLED_COURSES.map((course) => (
                <div key={course.id} className="enrolled-card">
                  <div className="enrolled-image" />
                  <div className="enrolled-content">
                    <h3 className="enrolled-course-title">
                      {course.title}
                    </h3>
                    <div className="enrolled-teacher">
                      <div className="enrolled-teacher-avatar">L</div>
                      <span className="enrolled-teacher-name">
                        {course.teacherName}
                      </span>
                    </div>
                    <div className="enrolled-progress-bar">
                      <div
                        className="enrolled-progress-fill"
                        style={{ width: `${course.progressPercent}%` }}
                      />
                    </div>
                    <div className="enrolled-progress-footer">
                      <span className="enrolled-progress-label">
                        {course.progressLabel}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="enrolled-nav">
              <button className="enrolled-nav-btn">&lt;</button>
              <button className="enrolled-nav-btn">&gt;</button>
            </div>
          </div>
        </section>

        {/* Search and Filter Section */}
        <CourseFilter
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          selectedCategory={selectedCategory}
          onCategoryChange={setSelectedCategory}
          categories={categories}
          selectedEnglishType={selectedEnglishType}
          onEnglishTypeChange={setSelectedEnglishType}
          englishTypes={englishTypes}
          sortBy={sortBy}
          onSortChange={setSortBy}
        />

        {/* Courses Grid Section */}
        <section className="courses-grid-section">
          <div className="container">
            {filteredCourses.length === 0 ? (
              <div className="no-courses-message">
                <p>No courses found. Try adjusting your search or filter.</p>
              </div>
            ) : (
              <div className="courses-grid">
                {filteredCourses.map((course) => (
                  <CourseCard key={course.id} course={course} />
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Recommended for you Section */}
        <section className="recommended-section">
          <div className="container">
            <div className="recommended-header">
              <h2 className="recommended-title">Recommended for you</h2>
              <Link to="/courses" className="recommended-see-all">See all</Link>
            </div>
            <div className="recommended-wrapper">
              <div 
                className="recommended-cards" 
                id="recommended-cards"
                style={{ transform: `translateX(-${recommendedScrollPosition}px)` }}
              >
                {STATIC_RECOMMENDED_COURSES.map((course) => (
                  <div key={course.id} className="recommended-card">
                    <div className="recommended-image-wrapper">
                      <div className="recommended-image-placeholder">
                        {course.title.charAt(0)}
                      </div>
                    </div>
                    <div className="recommended-card-content">
                      <div className="recommended-meta">
                        <div className="recommended-category">
                          <svg className="category-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="3" y="3" width="7" height="7"></rect>
                            <rect x="14" y="3" width="7" height="7"></rect>
                            <rect x="3" y="14" width="7" height="7"></rect>
                            <rect x="14" y="14" width="7" height="7"></rect>
                          </svg>
                          <span>{course.category}</span>
                        </div>
                        <div className="recommended-duration">
                          <svg className="clock-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="10"></circle>
                            <polyline points="12 6 12 12 16 14"></polyline>
                          </svg>
                          <span>{course.duration}</span>
                        </div>
                      </div>
                      <h3 className="recommended-card-title">{course.title}</h3>
                      <p className="recommended-card-description">{course.description}</p>
                      <div className="recommended-card-footer">
                        <div className="recommended-instructor">
                          <div className="recommended-instructor-avatar">
                            {course.teacherName.charAt(0)}
                          </div>
                          <span className="recommended-instructor-name">{course.teacherName}</span>
                        </div>
                        <div className="recommended-pricing">
                          <span className="recommended-original-price">{course.originalPrice}</span>
                          <span className="recommended-discounted-price">{course.discountedPrice}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="recommended-navigation">
                <button 
                  className="recommended-nav-btn recommended-nav-prev"
                  onClick={() => {
                    const container = document.getElementById('recommended-cards');
                    if (container) {
                      const newPosition = Math.max(0, recommendedScrollPosition - 400);
                      setRecommendedScrollPosition(newPosition);
                    }
                  }}
                  disabled={recommendedScrollPosition === 0}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="15 18 9 12 15 6"></polyline>
                  </svg>
                </button>
                <button 
                  className="recommended-nav-btn recommended-nav-next"
                  onClick={() => {
                    const container = document.getElementById('recommended-cards');
                    if (container) {
                      const newPosition = recommendedScrollPosition + 400;
                      setRecommendedScrollPosition(newPosition);
                    }
                  }}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="9 18 15 12 9 6"></polyline>
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Student are viewing Section */}
        <section className="viewed-section">
          <div className="container">
            <div className="viewed-header">
              <h2 className="viewed-title">Student are viewing</h2>
              <Link to="/courses" className="viewed-see-all">See all</Link>
            </div>
            <div className="viewed-wrapper">
              <div 
                className="viewed-cards" 
                id="viewed-cards"
                style={{ transform: `translateX(-${viewedScrollPosition}px)` }}
              >
                {STATIC_VIEWED_COURSES.map((course) => (
                  <div key={course.id} className="viewed-card">
                    <div className="viewed-image-wrapper">
                      <div className="viewed-image-placeholder">
                        {course.title.charAt(0)}
                      </div>
                    </div>
                    <div className="viewed-card-content">
                      <div className="viewed-meta">
                        <div className="viewed-category">
                          <svg className="category-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="3" y="3" width="7" height="7"></rect>
                            <rect x="14" y="3" width="7" height="7"></rect>
                            <rect x="3" y="14" width="7" height="7"></rect>
                            <rect x="14" y="14" width="7" height="7"></rect>
                          </svg>
                          <span>{course.category}</span>
                        </div>
                        <div className="viewed-duration">
                          <svg className="clock-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="10"></circle>
                            <polyline points="12 6 12 12 16 14"></polyline>
                          </svg>
                          <span>{course.duration}</span>
                        </div>
                      </div>
                      <h3 className="viewed-card-title">{course.title}</h3>
                      <p className="viewed-card-description">{course.description}</p>
                      <div className="viewed-card-footer">
                        <div className="viewed-instructor">
                          <div className="viewed-instructor-avatar">
                            {course.teacherName.charAt(0)}
                          </div>
                          <span className="viewed-instructor-name">{course.teacherName}</span>
                        </div>
                        <div className="viewed-pricing">
                          <span className="viewed-original-price">{course.originalPrice}</span>
                          <span className="viewed-discounted-price">{course.discountedPrice}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="viewed-navigation">
                <button 
                  className="viewed-nav-btn viewed-nav-prev"
                  onClick={() => {
                    const container = document.getElementById('viewed-cards');
                    if (container) {
                      const newPosition = Math.max(0, viewedScrollPosition - 400);
                      setViewedScrollPosition(newPosition);
                    }
                  }}
                  disabled={viewedScrollPosition === 0}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="15 18 9 12 15 6"></polyline>
                  </svg>
                </button>
                <button 
                  className="viewed-nav-btn viewed-nav-next"
                  onClick={() => {
                    const container = document.getElementById('viewed-cards');
                    if (container) {
                      const newPosition = viewedScrollPosition + 400;
                      setViewedScrollPosition(newPosition);
                    }
                  }}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="9 18 15 12 9 6"></polyline>
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Footer */}
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
    </div>
  );
}
