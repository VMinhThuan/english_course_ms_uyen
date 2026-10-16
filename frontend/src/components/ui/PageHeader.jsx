import { Link } from 'react-router-dom';

export default function PageHeader({ eyebrow, title, description, actions, backTo, backLabel = 'Quay lại', className = '' }) {
  return (
    <header className={['ds-page-header', className].filter(Boolean).join(' ')}>
      <div className="ds-page-header__content">
        {backTo && <Link to={backTo} className="ds-back-link">← {backLabel}</Link>}
        {eyebrow && <p className="ds-eyebrow">{eyebrow}</p>}
        <h1 className="ds-page-title">{title}</h1>
        {description && <p className="ds-page-description">{description}</p>}
      </div>
      {actions && <div className="ds-page-header__actions">{actions}</div>}
    </header>
  );
}
