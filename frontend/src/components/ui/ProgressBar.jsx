export default function ProgressBar({ value = 0, className = '' }) {
  const percentage = Math.max(0, Math.min(100, Number(value) || 0));
  return <div className={['ds-progress', className].filter(Boolean).join(' ')} aria-label={`${percentage}%`} role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={percentage}><span style={{ width: `${percentage}%` }} /></div>;
}
