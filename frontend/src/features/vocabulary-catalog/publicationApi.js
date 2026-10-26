const API_ROOT = String(import.meta.env?.VITE_API_URL || '/api/v1').replace(/\/$/, '');
const DEFAULT_BASE = import.meta.env?.VITE_VOCABULARY_PUBLICATION_API_BASE
  || `${API_ROOT}/admin/vocabulary-publication`;

export class VocabularyPublicationApiError extends Error {
  constructor(message, { status = null, code = 'REQUEST_FAILED', details = null } = {}) {
    super(message);
    this.name = 'VocabularyPublicationApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function defaultAuthHeaders() {
  if (typeof localStorage === 'undefined') return {};
  const token = localStorage.getItem('accessToken');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function createVocabularyPublicationApi({
  baseUrl = DEFAULT_BASE,
  fetchImpl = fetch,
  getHeaders = defaultAuthHeaders,
  timeoutMs = 20000,
} = {}) {
  const root = String(baseUrl).replace(/\/$/, '');

  async function request(path, { method = 'GET', body } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const headers = { ...getHeaders() };
    const options = { method, credentials: 'include', headers, signal: controller.signal };
    if (body !== undefined) {
      options.body = JSON.stringify(body);
      headers['Content-Type'] = 'application/json';
    }
    try {
      const response = await fetchImpl(`${root}${path}`, options);
      let payload = null;
      try { payload = await response.json(); } catch { /* A non-JSON server error is still reported below. */ }
      if (!response.ok) {
        throw new VocabularyPublicationApiError(payload?.message || 'Không thể cập nhật trạng thái xuất bản.', {
          status: response.status,
          code: payload?.code || 'REQUEST_FAILED',
          details: payload?.details || null,
        });
      }
      return payload?.data ?? payload;
    } catch (error) {
      if (error instanceof VocabularyPublicationApiError) throw error;
      throw new VocabularyPublicationApiError(
        controller.signal.aborted ? 'Yêu cầu hết thời gian chờ. Hãy tải lại trước khi thử tiếp.' : 'Không kết nối được Publication API.',
        { code: controller.signal.aborted ? 'REQUEST_TIMEOUT' : 'NETWORK_ERROR' },
      );
    } finally {
      clearTimeout(timer);
    }
  }

  const post = (path, body) => request(path, { method: 'POST', body });
  const tagPath = (tagId, action) => `/tags/${encodeURIComponent(tagId)}/${action}`;
  const chapterPath = (chapterId, action) => `/chapters/${encodeURIComponent(chapterId)}/${action}`;
  const vocabularyPath = (vocabularyId, action) => `/vocabularies/${encodeURIComponent(vocabularyId)}/${action}`;

  return {
    getTagSummary(tagId) { return request(tagPath(tagId, 'summary')); },
    getEligibility(entityType, entityId, membershipId) {
      const query = membershipId ? `?membershipId=${encodeURIComponent(membershipId)}` : '';
      return request(`/eligibility/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}${query}`);
    },
    reviewTag(tagId, body) { return post(tagPath(tagId, 'review'), body); },
    publishTag(tagId, body) { return post(tagPath(tagId, 'publish'), body); },
    archiveTag(tagId, body) { return post(tagPath(tagId, 'archive'), body); },
    reviewChapter(chapterId, body) { return post(chapterPath(chapterId, 'review'), body); },
    publishChapter(chapterId, body) { return post(chapterPath(chapterId, 'publish'), body); },
    archiveChapter(chapterId, body) { return post(chapterPath(chapterId, 'archive'), body); },
    publishVocabulary(vocabularyId, body) { return post(vocabularyPath(vocabularyId, 'publish'), body); },
    hideVocabulary(vocabularyId, body) { return post(vocabularyPath(vocabularyId, 'hide'), body); },
  };
}

export const vocabularyPublicationApi = createVocabularyPublicationApi();
