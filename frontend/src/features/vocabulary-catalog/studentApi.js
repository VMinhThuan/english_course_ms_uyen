const DEFAULT_API_BASE = '/api/v1/student/vocabulary-catalog';

function resolveBaseUrl() {
  if (typeof window !== 'undefined' && window.__VOCAB_STUDENT_CATALOG_API_BASE__) {
    return String(window.__VOCAB_STUDENT_CATALOG_API_BASE__).replace(/\/$/, '');
  }
  return DEFAULT_API_BASE;
}

function responseError(response, payload) {
  const error = new Error(payload?.message || 'Không thể tải dữ liệu từ vựng.');
  error.response = { status: response.status, data: payload };
  return error;
}

async function get(path, params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value) !== '') query.set(key, String(value));
  });
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('accessToken') : null;
  const testHeaders = typeof window !== 'undefined' ? window.__VOCAB_STUDENT_CATALOG_HEADERS__ || {} : {};
  const url = `${resolveBaseUrl()}${path}${query.size ? `?${query}` : ''}`;
  const response = await fetch(url, {
    method: 'GET',
    credentials: 'include',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...testHeaders,
    },
  });
  let payload;
  try { payload = await response.json(); }
  catch { payload = null; }
  if (!response.ok) throw responseError(response, payload);
  return payload?.data || payload;
}

export function createStudentVocabularyCatalogApi() {
  return {
    listTags: ({ page = 1, limit = 100, search = '' } = {}) => get('/tags', { page, limit, search }),
    listChapters: (tagId, { page = 1, limit = 12, search = '' } = {}) => get(`/tags/${encodeURIComponent(tagId)}/chapters`, { page, limit, search }),
    getChapter: (chapterId) => get(`/chapters/${encodeURIComponent(chapterId)}`),
    listChapterVocabulary: (chapterId, { page = 1, limit = 100, search = '' } = {}) => get(`/chapters/${encodeURIComponent(chapterId)}/vocabularies`, { page, limit, search }),
  };
}

export const studentVocabularyCatalogApi = createStudentVocabularyCatalogApi();
