import axiosInstance from '../../api/axiosConfig.js';

const DEFAULT_API_BASE = `${String(import.meta.env?.VITE_API_URL || '/api/v1').replace(/\/$/, '')}/student/vocabulary-catalog`;

function resolveBaseUrl() {
  if (typeof window !== 'undefined' && window.__VOCAB_STUDENT_CATALOG_API_BASE__) {
    return String(window.__VOCAB_STUDENT_CATALOG_API_BASE__).replace(/\/$/, '');
  }
  return DEFAULT_API_BASE;
}

async function get(path, params = {}) {
  const query = Object.fromEntries(Object.entries(params).filter(([, value]) => (
    value !== undefined && value !== null && String(value) !== ''
  )));
  const testHeaders = typeof window !== 'undefined' ? window.__VOCAB_STUDENT_CATALOG_HEADERS__ || {} : {};
  try {
    const response = await axiosInstance.get(path, {
      baseURL: resolveBaseUrl(),
      params: query,
      withCredentials: true,
      headers: testHeaders,
    });
    return response.data?.data || response.data;
  } catch (error) {
    if (error.response?.data?.message) error.message = error.response.data.message;
    throw error;
  }
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
