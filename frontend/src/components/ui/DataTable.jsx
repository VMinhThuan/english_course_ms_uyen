export default function DataTable({ children, className = '', tableClassName = '' }) {
  return <div className={['ds-table-shell', className].filter(Boolean).join(' ')}><div className="ds-table-scroll"><table className={['ds-data-table', tableClassName].filter(Boolean).join(' ')}>{children}</table></div></div>;
}
