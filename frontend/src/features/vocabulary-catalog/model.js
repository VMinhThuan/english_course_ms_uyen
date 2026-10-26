export const CATALOG_PAGE_SIZE = 20;
export const MEMBERSHIP_PAGE_SIZE = 50;

export const STATUS_LABELS = Object.freeze({
  draft: 'Bản nháp',
  published: 'Đã xuất bản',
  archived: 'Đã lưu trữ',
  PARSED: 'Đã phân tích',
  NEEDS_REVIEW: 'Cần kiểm duyệt',
  REVIEW_COMPLETE: 'Đã kiểm duyệt',
  PARTIALLY_CONFIRMED_DRAFT: 'Tạo Draft một phần',
  CONFIRMED_DRAFT: 'Đã tạo Draft',
  FAILED: 'Thất bại',
  NOT_CONFIRMED: 'Chưa Confirm',
  PARTIAL: 'Một phần',
  CONFIRMED: 'Đã Confirm',
  NOT_MAPPED: 'Chưa ánh xạ',
  MAPPED: 'Đã ánh xạ',
  LOCKED: 'Đã khóa sau Confirm',
});

export function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export function safeSlug(value) {
  return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd')
    .trim().toLocaleLowerCase('en').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export function moveId(items, currentId, direction) {
  const list = [...items];
  const index = list.findIndex((item) => String(item._id) === String(currentId));
  const target = index + direction;
  if (index < 0 || target < 0 || target >= list.length) return list;
  [list[index], list[target]] = [list[target], list[index]];
  return list;
}

export function mapCounts(batch) {
  return [
    ['Candidate', batch?.candidateCount ?? 0],
    ['Hợp lệ', batch?.counts?.valid ?? 0],
    ['Cần review', batch?.counts?.needsReview ?? 0],
    ['Đã duyệt', batch?.counts?.approved ?? 0],
    ['Bị từ chối', batch?.counts?.rejected ?? 0],
    ['Đã tạo Draft', batch?.counts?.importedAsDraft ?? 0],
  ];
}
