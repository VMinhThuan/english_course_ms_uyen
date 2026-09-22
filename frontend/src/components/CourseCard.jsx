import { Link } from 'react-router-dom';
import './CourseCard.css';

export default function CourseCard({ course }) {
  const {
    id,
    title,
    description,
    level,
    teacherName,
    priceLabel,
    rating,
    ratingCount,
    englishType,
    skills,
  } = course;

  return (
    <div className="course-card">
      <div className="course-image-wrapper">
        <div className="course-image-placeholder">
          {title?.charAt(0) || 'C'}
        </div>
        {englishType && (
          <span className={`course-english-type-badge course-english-type-${englishType.toLowerCase()}`}>
            {englishType}
          </span>
        )}
        {level && (
          <span className={`course-level-badge course-level-${level.toLowerCase()}`}>
            {level}
          </span>
        )}
      </div>

      <div className="course-card-content">
        <div className="course-rating">
          <div className="stars">
            {[1, 2, 3, 4, 5].map((star) => (
              <span
                key={star}
                className={`star ${star <= Math.round(rating || 0) ? 'filled' : ''}`}
              >
                ★
              </span>
            ))}
          </div>
          <span className="rating-text">
            {rating?.toFixed(1) ?? '4.0'}
          </span>
          {ratingCount && (
            <span className="rating-count">
              ({ratingCount})
            </span>
          )}
        </div>

        <h3 className="course-card-title">
          {title}
        </h3>

        <p className="course-card-description">
          {description}
        </p>

        {skills && skills.length > 0 && (
          <div className="course-skills">
            <span className="skills-label">Skills:</span>
            <div className="skills-list">
              {skills.map((skill, index) => (
                <span key={index} className="skill-badge">
                  {skill}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="course-card-footer">
          <div className="course-instructor">
            <div className="instructor-avatar">
              {teacherName?.charAt(0) || 'T'}
            </div>
            <span className="instructor-name">
              {teacherName}
            </span>
          </div>

          <div className="course-price">
            <span className="price-label">
              {priceLabel}
            </span>
          </div>
        </div>

        <Link to={`/courses/${id}`} className="btn-view-course">
          View Course
        </Link>
      </div>
    </div>
  );
}


