export default function UiButton({ children, variant = 'primary', size, className = '', type = 'button', ...props }) {
  return <button type={type} className={['ds-button', 'ds-button--' + variant, size ? 'ds-button--' + size : '', className].filter(Boolean).join(' ')} {...props}>{children}</button>;
}
