import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import './PracticeSidebarMenu.css';

const getLinks = (variant, showPart1) => {
  const prefix = variant === 'admin' ? '/admin' : '/student';
  const showDictationPages = variant !== 'admin' || showPart1;
  return [
    ...(showPart1 ? [{ label: 'Chép chính tả Part 1', to: variant === 'admin' ? `${prefix}/part1-dictations` : `${prefix}/part-1` }] : []),
    ...(showDictationPages ? [{ label: 'Chép chính tả từ vựng', to: variant === 'admin' ? `${prefix}/vocabulary-dictations` : `${prefix}/vocabulary-dictation` }] : []),
    ...(showDictationPages ? [{ label: 'Hard Words Dictation', to: variant === 'admin' ? `${prefix}/hard-words-dictations` : `${prefix}/hard-words-dictation` }] : []),
    ...(variant === 'admin' && showPart1 ? [{ label: 'Part 2 Challange', to: `${prefix}/part2-challenge` }] : []),
    ...(variant === 'student' ? [{ label: 'Part 2 Challange', to: `${prefix}/part-2-challenge` }] : []),
    { label: 'Road to Part 7', to: `${prefix}/road-to-part-7` },
    { label: 'Bài tập ngữ pháp', to: `${prefix}/assessments` },
    ...(variant === 'student' ? [{ label: 'Ngân hàng Part 5', to: `${prefix}/part-5` }] : []),
  ];
};

export default function PracticeSidebarMenu({ variant = 'student', showPart1 = true, onNavigate }) {
  const location = useLocation();
  const links = getLinks(variant, showPart1);
  const isChildActive = links.some(({ to }) => location.pathname === to || location.pathname.startsWith(`${to}/`));
  const [isExpanded, setIsExpanded] = useState(isChildActive);

  useEffect(() => {
    if (isChildActive) setIsExpanded(true);
  }, [isChildActive]);

  const submenuId = `practice-sidebar-submenu-${variant}`;
  return (
    <section className={`practice-sidebar-menu practice-sidebar-menu--${variant} ${isChildActive ? 'is-active' : ''}`}>
      <button
        type="button"
        className="practice-sidebar-toggle"
        aria-expanded={isExpanded}
        aria-controls={submenuId}
        onClick={() => setIsExpanded((expanded) => !expanded)}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M9 11l3 3L22 4" />
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
        </svg>
        <span>Bài tập</span>
        <svg className="practice-sidebar-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      <nav id={submenuId} className="practice-sidebar-children" aria-label="Các mục bài tập" hidden={!isExpanded}>
        {links.map(({ label, to }) => (
          <NavLink
            key={to}
            to={to}
            end
            className={({ isActive }) => `practice-sidebar-child ${isActive ? 'active' : ''}`}
            onClick={onNavigate}
          >
            {label}
          </NavLink>
        ))}
      </nav>
    </section>
  );
}
