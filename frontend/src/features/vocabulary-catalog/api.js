import { API_BASE_URL, IS_PRODUCTION_BUILD } from '../../api/apiBaseUrl.js';

const API_ROOT = String(API_BASE_URL).replace(/\/$/, '');
const DEFAULT_CATALOG_BASE = (!IS_PRODUCTION_BUILD && import.meta.env?.VITE_VOCABULARY_CATALOG_API_BASE)
  || `${API_ROOT}/admin/vocabulary-catalog`;
const DEFAULT_IMPORT_BASE = (!IS_PRODUCTION_BUILD && import.meta.env?.VITE_VOCABULARY_IMPORT_API_BASE)
  || `${API_ROOT}/admin/vocabulary-import-batches`;

export class VocabularyCatalogApiError extends Error {
  constructor(message, { status = null, code = 'REQUEST_FAILED', details = null, cause = null } = {}) {
    super(message, { cause });
    this.name = 'VocabularyCatalogApiError';
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

export function createVocabularyCatalogApi({
  catalogBaseUrl = DEFAULT_CATALOG_BASE,
  importBaseUrl = DEFAULT_IMPORT_BASE,
  fetchImpl = fetch,
  getHeaders = defaultAuthHeaders,
  timeoutMs = 30000,
} = {}) {
  const catalogRoot = String(catalogBaseUrl).replace(/\/$/, '');
  const importRoot = String(importBaseUrl).replace(/\/$/, '');

  async function request(root, path, { method = 'GET', body, formData, query } = {}) {
    const search = query ? `?${new URLSearchParams(Object.entries(query).filter(([, value]) => value !== '' && value !== null && value !== undefined)).toString()}` : '';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort('request-timeout'), timeoutMs);
    const headers = { ...getHeaders() };
    const options = { method, credentials: 'include', headers, signal: controller.signal };
    if (formData !== undefined) {
      options.body = formData;
    } else if (body !== undefined) {
      options.body = JSON.stringify(body);
      headers['Content-Type'] = 'application/json';
    }
    try {
      const response = await fetchImpl(`${root}${path}${search}`, options);
      let payload = null;
      try { payload = await response.json(); } catch { /* non-JSON error */ }
      if (!response.ok) {
        throw new VocabularyCatalogApiError(payload?.message || 'Không thể hoàn tất yêu cầu. Hãy tải lại dữ liệu rồi thử lại.', {
          status: response.status,
          code: payload?.code || 'REQUEST_FAILED',
          details: payload?.details || null,
        });
      }
      return payload?.data ?? payload;
    } catch (error) {
      if (error instanceof VocabularyCatalogApiError) throw error;
      throw new VocabularyCatalogApiError(
        controller.signal.aborted ? 'Yêu cầu đã hết thời gian chờ. Hãy tải lại dữ liệu trước khi thử tiếp.' : 'Mất kết nối tới máy chủ Catalog. Dữ liệu đang nhập vẫn được giữ trên màn hình.',
        { code: controller.signal.aborted ? 'REQUEST_TIMEOUT' : 'NETWORK_ERROR', cause: error },
      );
    } finally {
      clearTimeout(timer);
    }
  }

  const catalog = (path, options) => request(catalogRoot, path, options);
  const imports = (path, options) => request(importRoot, path, options);

  return {
    listTags(query) { return catalog('/tags', { query }); },
    getTag(tagId) { return catalog(`/tags/${encodeURIComponent(tagId)}`); },
    createTag(body) { return catalog('/tags', { method: 'POST', body }); },
    updateTag(tagId, body) { return catalog(`/tags/${encodeURIComponent(tagId)}`, { method: 'PATCH', body }); },
    setTagVisibility(tagId, isVisible) { return catalog(`/tags/${encodeURIComponent(tagId)}/visibility`, { method: 'PATCH', body: { isVisible } }); },
    archiveTag(tagId, body) { return catalog(`/tags/${encodeURIComponent(tagId)}/archive`, { method: 'POST', body }); },
    listChapters(tagId, query) { return catalog(`/tags/${encodeURIComponent(tagId)}/chapters`, { query }); },
    listTagVocabulary(tagId, query) { return catalog(`/tags/${encodeURIComponent(tagId)}/vocabulary`, { query }); },
    createChapter(tagId, body) { return catalog(`/tags/${encodeURIComponent(tagId)}/chapters`, { method: 'POST', body }); },
    setChapterVisibility(chapterId, isVisible) { return catalog(`/chapters/${encodeURIComponent(chapterId)}/visibility`, { method: 'PATCH', body: { isVisible } }); },
    getChapter(chapterId) { return catalog(`/chapters/${encodeURIComponent(chapterId)}`); },
    updateChapter(chapterId, body) { return catalog(`/chapters/${encodeURIComponent(chapterId)}`, { method: 'PATCH', body }); },
    archiveChapter(chapterId, body) { return catalog(`/chapters/${encodeURIComponent(chapterId)}/archive`, { method: 'POST', body }); },
    listMemberships(chapterId, query) { return catalog(`/chapters/${encodeURIComponent(chapterId)}/memberships`, { query }); },
    addMembership(chapterId, body) { return catalog(`/chapters/${encodeURIComponent(chapterId)}/memberships`, { method: 'POST', body }); },
    reorderMemberships(chapterId, body) { return catalog(`/chapters/${encodeURIComponent(chapterId)}/memberships/reorder`, { method: 'POST', body }); },
    listVocabularyOptions(query) { return catalog('/vocabulary-options', { query }); },
    previewDocx(file) {
      const formData = new FormData();
      formData.append('file', file);
      return catalog('/import-docx/preview', { method: 'POST', formData });
    },
    publishDocx(body) { return catalog('/import-docx/publish', { method: 'POST', body }); },
    listBatches(query) { return imports('', { query }); },
    getBatch(batchId) { return imports(`/${encodeURIComponent(batchId)}`); },
    getBatchMapping(batchId) { return imports(`/${encodeURIComponent(batchId)}/catalog-mapping`); },
    saveBatchMapping(batchId, body) { return imports(`/${encodeURIComponent(batchId)}/catalog-mapping`, { method: 'PUT', body }); },
  };
}

export const vocabularyCatalogApi = createVocabularyCatalogApi();
