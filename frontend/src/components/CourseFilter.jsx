import './CourseFilter.css';

export default function CourseFilter({
  searchQuery,
  onSearchChange,
  selectedCategory,
  onCategoryChange,
  categories,
  selectedEnglishType,
  onEnglishTypeChange,
  englishTypes,
  sortBy,
  onSortChange,
}) {
  return (
    <section className="courses-filter-section">
      <div className="container">
        <div className="courses-search-filter">
          <div className="search-bar">
            <svg
              className="search-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="11" cy="11" r="8"></circle>
              <path d="m21 21-4.35-4.35"></path>
            </svg>
            <input
              type="text"
              placeholder="Search courses..."
              className="search-input"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
            />
          </div>

          <div className="filter-controls">
            <div className="category-tabs">
              {categories.map((category) => (
                <button
                  key={category.id}
                  className={`category-tab ${
                    selectedCategory === category.id ? 'active' : ''
                  }`}
                  onClick={() => onCategoryChange(category.id)}
                >
                  {category.label}
                </button>
              ))}
            </div>

            <div className="english-type-tabs">
              {englishTypes.map((type) => (
                <button
                  key={type.id}
                  className={`english-type-tab ${
                    selectedEnglishType === type.id ? 'active' : ''
                  }`}
                  onClick={() => onEnglishTypeChange(type.id)}
                >
                  {type.label}
                </button>
              ))}
            </div>

            <div className="sort-controls">
              <label htmlFor="sort-select" className="sort-label">Sort by:</label>
              <select
                id="sort-select"
                className="sort-select"
                value={sortBy}
                onChange={(e) => onSortChange(e.target.value)}
              >
                <option value="default">Default</option>
                <option value="price-low">Price: Low to High</option>
                <option value="price-high">Price: High to Low</option>
                <option value="rating">Highest Rating</option>
                <option value="reviews">Most Reviews</option>
              </select>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}


