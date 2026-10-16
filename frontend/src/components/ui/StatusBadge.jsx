const labels = { active: 'Hoạt động', pending: 'Chờ duyệt', suspended: 'Tạm khóa', rejected: 'Từ chối', published: 'Đã xuất bản', draft: 'Bản nháp', hidden: 'Đang ẩn', exam: 'Bài kiểm tra', exercise: 'Bài tập', completed: 'Hoàn thành', in_progress: 'Đang học', passed: 'Đạt', failed: 'Chưa đạt' };
const variants = { active: 'success', published: 'success', completed: 'success', passed: 'success', pending: 'warning', draft: 'warning', in_progress: 'warning', suspended: 'danger', rejected: 'danger', failed: 'danger', hidden: 'neutral', exam: 'danger', exercise: 'success' };

export default function StatusBadge({ status, label, variant, className = '' }) {
  const normalized = String(status || '').toLowerCase();
  const tone = variant || variants[normalized] || 'neutral';
  return <span className={['ds-status-badge', 'ds-status-badge--' + tone, className].filter(Boolean).join(' ')}>{label || labels[normalized] || status || '—'}</span>;
}
