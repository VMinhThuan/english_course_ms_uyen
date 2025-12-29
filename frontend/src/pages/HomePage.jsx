import { Link, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import useAuthStore from '../store/authStore.js';
import Sidebar from '../components/Sidebar';
import studentImage from '../images/homepage/2f32d3a9082c2e2832481561feec93a5e5c5e8d6.png';
import './HomePage.css';

export default function HomePage() {
  const [scrolled, setScrolled] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
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

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Listen to sidebar toggle events
  useEffect(() => {
    const handleSidebarToggle = (event) => {
      const { collapsed } = event.detail;
      setSidebarCollapsed(collapsed);
      if (collapsed) {
        document.body.setAttribute('data-sidebar-collapsed', 'true');
      } else {
        document.body.removeAttribute('data-sidebar-collapsed');
      }
    };
    window.addEventListener('sidebar:toggle', handleSidebarToggle);
    return () => window.removeEventListener('sidebar:toggle', handleSidebarToggle);
  }, []);

  return (
    <div className="home-page-wrapper">
      {/* Header Section */}
      <header className={`header ${scrolled ? 'scrolled' : ''}`}>
        <div className="header-content">
          <div className="logo">
            <div className="logo-icon"></div>
            <span className="logo-text">English Course</span>
          </div>
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

      {/* Sidebar - Below Header - TEMPORARILY HIDDEN */}
      {/* <Sidebar /> */}

      {/* Main Content Area */}
      <div className="main-content main-content-no-sidebar">
        {/* Hero Section - Redesigned based on Figma */}
      <section className="hero">
        <div className="hero-content">
          <div className="hero-text">
            <h1 className="hero-title">
              <span className="highlight-orange">Studying</span> Online is now much easier
            </h1>
            <p className="hero-description">
              TOTC is an interesting platform that will teach you in more an interactive way
            </p>
            <div className="hero-actions">
              <Link to="/register" className="btn-primary">Join for free</Link>
              <div className="watch-video">
                <div className="play-button"></div>
                <span>Watch how it works</span>
              </div>
            </div>
          </div>
          <div className="hero-image-wrapper">
            <img 
              src={studentImage}
              alt="Student studying" 
              className="hero-student-image"
            />
            {/* Floating Cards - Redesigned based on image */}
            <div className="floating-card card-top-left">
              <div className="card-icon calendar-icon-card"></div>
              <div className="card-text">
                <div className="card-number">250k</div>
                <div className="card-label">Assisted Student</div>
              </div>
            </div>
            <div className="floating-card card-top-right">
              <div className="card-icon chart-icon-card"></div>
            </div>
            <div className="floating-card card-middle-right">
              <div className="card-icon envelope-icon-card"></div>
              <div className="card-content">
                <div className="card-title">Congratulations</div>
                <div className="card-subtitle">Your admission completed</div>
              </div>
            </div>
            <div className="floating-card card-bottom-left">
              <div className="class-avatar-card">
                <div className="avatar-image"></div>
                <div className="avatar-status"></div>
              </div>
              <div className="class-info-card">
                <div className="class-title-card">User Experience Class</div>
                <div className="class-time-card">Today at 12.00 PM</div>
                <button className="btn-join-card">Join Now</button>
              </div>
            </div>
          </div>
        </div>
        {/* Decorative Ellipse */}
        <div className="hero-ellipse"></div>
      </section>

      {/* Our Success Section */}
      <section className="success-section">
        <div className="container">
          <h2 className="section-title">Our Success</h2>
          <p className="section-description">
            We have helped thousands of students improve their English skills through our comprehensive online courses.
          </p>
          <div className="stats-grid">
            <div className="stat-item">
              <div className="stat-number-gradient">15K+</div>
              <div className="stat-label">Students</div>
            </div>
            <div className="stat-item">
              <div className="stat-number-gradient">75%</div>
              <div className="stat-label">Total success</div>
            </div>
            <div className="stat-item">
              <div className="stat-number-gradient">35</div>
              <div className="stat-label">More questions</div>
            </div>
            <div className="stat-item">
              <div className="stat-number-gradient">26</div>
              <div className="stat-label">Expert teachers</div>
            </div>
            <div className="stat-item">
              <div className="stat-number-gradient">16</div>
              <div className="stat-label">Years of experience</div>
            </div>
          </div>
        </div>
      </section>

      {/* All-In-One Features Section */}
      <section className="features-section">
        <div className="container">
          <h2 className="section-title">All-In-One Learning Platform</h2>
          <p className="section-description">
            English Course is a powerful online learning platform that combines all the tools needed for effective English learning.
          </p>
          <div className="features-grid">
            <div className="feature-card">
              <div className="feature-icon icon-billing"></div>
              <h3 className="feature-title">Online Learning & Progress Tracking</h3>
              <p className="feature-description">
                Track your learning progress, manage assignments, and monitor your improvement with detailed analytics.
              </p>
            </div>
            <div className="feature-card">
              <div className="feature-icon icon-schedule"></div>
              <h3 className="feature-title">Easy Scheduling & Attendance</h3>
              <p className="feature-description">
                Schedule your classes, track attendance, and never miss a lesson with our smart notification system.
              </p>
            </div>
            <div className="feature-card">
              <div className="feature-icon icon-tracking"></div>
              <h3 className="feature-title">Student Progress Tracking</h3>
              <p className="feature-description">
                Monitor your learning journey with detailed reports and personalized feedback from expert teachers.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* What is English Course Section */}
      <section className="what-is-section">
        <div className="container">
          <h2 className="section-title">What is English Course?</h2>
          <p className="section-description">
            English Course is a platform that allows students to learn English online. You can access course materials, 
            complete assignments and quizzes, take exams, receive feedback, and track your progress all in one place.
          </p>
          <div className="user-cards">
            <div className="user-card instructor-card">
              <div className="card-overlay"></div>
              <h3 className="card-title">FOR INSTRUCTORS</h3>
              <Link to="/register?role=teacher" className="card-button">Start teaching today</Link>
            </div>
            <div className="user-card student-card">
              <div className="card-overlay"></div>
              <h3 className="card-title">FOR STUDENTS</h3>
              <Link to="/register?role=student" className="card-button">Join now</Link>
            </div>
          </div>
        </div>
      </section>

      {/* Physical Classroom Equivalence Section */}
      <section className="classroom-section">
        <div className="container">
          <div className="classroom-content">
            <div className="classroom-text">
              <h2 className="section-title-left">
                Everything you can do in a physical classroom, you can do with English Course
              </h2>
              <p className="section-description-left">
                Our platform provides all the tools you need for effective English learning. Manage your classes, 
                schedule lessons, access virtual classrooms, complete assignments, and interact with teachers and 
                fellow students - all from the comfort of your home.
              </p>
              <Link to="/courses" className="link-read-more">Learn more</Link>
            </div>
            <div className="classroom-image">
              <div className="image-placeholder"></div>
              <div className="play-button-large"></div>
            </div>
          </div>
        </div>
      </section>

      {/* Our Features Section */}
      <section className="our-features-section">
        <div className="container">
          <h2 className="section-title">Our Features</h2>
          <p className="section-description">
            This very extraordinary feature, can make learning activities more efficient
          </p>
          
          {/* Feature 1: User Interface */}
          <div className="feature-detail">
            <div className="feature-image-left">
              <div className="video-interface">
                <div className="video-header">
                  <div className="video-dot red"></div>
                  <div className="video-dot yellow"></div>
                  <div className="video-dot green"></div>
                </div>
                <div className="video-participants">
                  <div className="participant"></div>
                  <div className="participant"></div>
                  <div className="participant"></div>
                  <div className="participant"></div>
                  <div className="participant"></div>
                </div>
                <div className="video-controls">
                  <button className="btn-present">Present</button>
                  <button className="btn-call">Call</button>
                </div>
              </div>
            </div>
            <div className="feature-text-right">
              <h3 className="feature-heading">A user interface designed for the classroom</h3>
              <ul className="feature-list">
                <li>Teachers get better control over the classroom & students respond to questions</li>
                <li>Easy to create & share quizzes, assignments, & tests</li>
                <li>Students can learn at their own pace & track their progress</li>
              </ul>
            </div>
          </div>

          {/* Feature 2: Tools for Teachers */}
          <div className="feature-detail reverse">
            <div className="feature-text-left">
              <h3 className="feature-heading">Tools For Teachers And Learners</h3>
              <p className="feature-description-text">
                Class has a dynamic set of teaching tools built to be deployed and used during class. 
                Teachers can handout assignments in real-time for students to complete and submit.
              </p>
            </div>
            <div className="feature-image-right">
              <div className="tools-image"></div>
            </div>
          </div>

          {/* Feature 3: Assessments */}
          <div className="feature-detail">
            <div className="feature-image-left">
              <div className="quiz-interface">
                <div className="quiz-header">
                  <div className="quiz-badge">Question 1</div>
                </div>
                <div className="quiz-question">
                  <h4>True or false? This sentence is grammatically correct.</h4>
                  <div className="quiz-image-placeholder"></div>
                </div>
                <div className="quiz-answers">
                  <button className="btn-answer">True</button>
                  <button className="btn-answer">False</button>
                </div>
                <div className="quiz-feedback">
                  <div className="feedback-icon"></div>
                  <p>You answered well, good!</p>
                </div>
              </div>
            </div>
            <div className="feature-text-right">
              <h3 className="feature-heading">Assessments, Quizzes, Tests</h3>
              <p className="feature-description-text">
                Easily launch live assignments, quizzes, and tests. Student results are automatically 
                entered in the online gradebook.
              </p>
            </div>
          </div>

          {/* Feature 4: Class Management */}
          <div className="feature-detail reverse">
            <div className="feature-text-left">
              <h3 className="feature-heading">Class Management Tools for Educators</h3>
              <p className="feature-description-text">
                Class provides tools to help run and manage the class such as Class Roster, Attendance, and more. 
                With the Gradebook, teachers can review and grade tests and quizzes in real-time.
              </p>
            </div>
            <div className="feature-image-right">
              <div className="gradebook-interface">
                <div className="gradebook-header">GradeBook</div>
                <div className="gradebook-content">
                  <div className="student-row">
                    <div className="student-avatar"></div>
                    <div className="student-name">Student Name</div>
                    <div className="student-score">100</div>
                  </div>
                  <div className="student-row">
                    <div className="student-avatar"></div>
                    <div className="student-name">Student Name</div>
                    <div className="student-score">85</div>
                  </div>
                  <div className="student-row">
                    <div className="student-avatar"></div>
                    <div className="student-name">Student Name</div>
                    <div className="student-score">98</div>
                  </div>
                  <div className="student-row">
                    <div className="student-avatar"></div>
                    <div className="student-name">Student Name</div>
                    <div className="student-score">75</div>
                  </div>
                </div>
                <button className="btn-export">Export</button>
              </div>
            </div>
          </div>

          {/* Feature 5: One-on-One Discussions */}
          <div className="feature-detail">
            <div className="feature-image-left">
              <div className="discussion-interface">
                <div className="discussion-header">
                  <div className="discussion-dot red"></div>
                  <div className="discussion-dot yellow"></div>
                  <div className="discussion-dot green"></div>
                </div>
                <div className="discussion-participants">
                  <div className="participant-large"></div>
                  <div className="participant-large"></div>
                </div>
                <div className="discussion-info">
                  <h4>Private Discussion</h4>
                  <p>Your video can't be seen by others</p>
                </div>
                <button className="btn-end-discussion">End Discussion</button>
              </div>
            </div>
            <div className="feature-text-right">
              <h3 className="feature-heading">One-on-One Discussions</h3>
              <p className="feature-description-text">
                Teachers and teacher assistants can talk with students privately without leaving the platform environment.
              </p>
            </div>
          </div>

          <div className="see-more-features">
            <button className="btn-see-more">See more features</button>
          </div>
        </div>
      </section>

      {/* Testimonials Section */}
      <section className="testimonials-section">
        <div className="container">
          <div className="testimonials-content">
            <div className="testimonials-text">
              <div className="testimonial-label">TESTIMONIAL</div>
              <h2 className="section-title-left">What They Say?</h2>
              <p className="testimonial-description">
                English Course has got more than 100k positive ratings from our users around the world.
              </p>
              <p className="testimonial-description">
                Some of the students and teachers were greatly helped by the English Course platform.
              </p>
              <p className="testimonial-description">
                Are you too? Please give your assessment
              </p>
              <div className="testimonial-form">
                <input 
                  type="text" 
                  placeholder="Write your assessment" 
                  className="testimonial-input"
                />
                <button className="btn-submit-testimonial">
                  <span className="arrow-icon"></span>
                </button>
              </div>
            </div>
            <div className="testimonials-visual">
              <div className="testimonial-image"></div>
              <div className="testimonial-card">
                <div className="testimonial-bar"></div>
                <div className="testimonial-quote">
                  "Thank you so much for your help. It's exactly what I've been looking for. 
                  You won't regret it. It really saves me time and effort. English Course is 
                  exactly what our business has been lacking."
                </div>
                <div className="testimonial-author">
                  <div className="author-info">
                    <div className="author-name">Gloria Rose</div>
                    <div className="author-rating">
                      <div className="stars">
                        <span className="star">★</span>
                        <span className="star">★</span>
                        <span className="star">★</span>
                        <span className="star">★</span>
                        <span className="star">★</span>
                      </div>
                      <span className="rating-text">12 reviews at Yelp</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Latest News Section */}
      <section className="news-section">
        <div className="container">
          <h2 className="section-title">Latest News and Resources</h2>
          <p className="section-description">
            See the developments that have occurred to English Course in the world
          </p>
          <div className="news-grid">
            <div className="news-card featured">
              <div className="news-badge">NEWS</div>
              <div className="news-image"></div>
              <h3 className="news-title">
                English Course adds $30 million to its balance sheet for a Zoom-friendly edtech solution
              </h3>
              <p className="news-excerpt">
                English Course, launched less than a year ago by experienced educators, integrates exclusively 
                with Zoom to provide a comprehensive online learning experience...
              </p>
              <Link to="/blog" className="news-link">Read more</Link>
            </div>
            <div className="news-card">
              <div className="news-badge">PRESS RELEASE</div>
              <div className="news-image-small"></div>
              <h3 className="news-title">
                English Course Inc. Closes $30 Million Series A Financing to Meet High Demand
              </h3>
              <p className="news-excerpt">
                English Course Inc., the company that created English Course...
              </p>
            </div>
            <div className="news-card">
              <div className="news-badge">NEWS</div>
              <div className="news-image-small"></div>
              <h3 className="news-title">
                Zoom's earliest investors are betting millions on a better Zoom for schools
              </h3>
              <p className="news-excerpt">
                Zoom was never created to be a consumer product. Nonetheless, the...
              </p>
            </div>
            <div className="news-card">
              <div className="news-badge">NEWS</div>
              <div className="news-image-small"></div>
              <h3 className="news-title">
                Former Blackboard CEO Raises $16M to Bring LMS Features to Zoom Classrooms
              </h3>
              <p className="news-excerpt">
                This year, investors have reaped big financial returns from betting on Zoom...
              </p>
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
              <span className="logo-text-footer">English Course</span>
              <span className="logo-tagline">Virtual Class for Learning</span>
            </div>
            <div className="footer-newsletter">
              <h3 className="newsletter-title">Subscribe to get our Newsletter</h3>
              <div className="newsletter-form">
                <input 
                  type="email" 
                  placeholder="Your Email" 
                  className="newsletter-input"
                />
                <button className="btn-subscribe">Subscribe</button>
              </div>
            </div>
          </div>
          <div className="footer-links">
            <Link to="/careers">Careers</Link>
            <span className="separator">|</span>
            <Link to="/privacy">Privacy Policy</Link>
            <span className="separator">|</span>
            <Link to="/terms">Terms & Conditions</Link>
          </div>
          <div className="footer-copyright">
            © 2026 English Course Online. All rights reserved.
          </div>
        </div>
      </footer>
      </div>
      {/* End Main Content Area */}
    </div>
  );
}
