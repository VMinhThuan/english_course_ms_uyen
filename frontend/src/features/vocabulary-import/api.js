const API_ROOT = String(import.meta.env?.VITE_API_URL || '/api/v1').replace(/\/$/, '');
const DEFAULT_BASE_URL = import.meta.env?.VITE_VOCABULARY_IMPORT_API_BASE
  || `${API_ROOT}/admin/vocabulary-import-batches`;

export class VocabularyImportApiError extends Error {
  constructor(message, { status = null, code = 'REQUEST_FAILED', payload = null, cause = null } = {}) {
    super(message, { cause });
    this.name = 'VocabularyImportApiError';
    this.status = status;
    this.code = code;
    this.payload = payload;
  }
}

function defaultAuthHeaders() {
  if (typeof localStorage === 'undefined') return {};
  const token = localStorage.getItem('accessToken');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function createVocabularyImportApi({
  baseUrl = DEFAULT_BASE_URL,
  fetchImpl = fetch,
  getHeaders = defaultAuthHeaders,
  timeoutMs = 45000,
} = {}) {
  const root = String(baseUrl).replace(/\/$/, '');

  async function request(path = '', { method = 'GET', body, query, signal } = {}) {
    const search = query ? `?${new URLSearchParams(Object.entries(query).filter(([, value]) => value !== '' && value !== null && value !== undefined)).toString()}` : '';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort('request-timeout'), timeoutMs);
    const forwardAbort = () => controller.abort(signal?.reason || 'request-cancelled');
    if (signal) {
      if (signal.aborted) forwardAbort();
      else signal.addEventListener('abort', forwardAbort, { once: true });
    }

    const headers = { ...getHeaders() };
    const options = {
      method,
      credentials: 'include',
      headers,
      signal: controller.signal,
    };
    if (body !== undefined) {
      options.body = body;
      if (!(body instanceof FormData)) headers['Content-Type'] = 'application/json';
    }

    try {
      const response = await fetchImpl(`${root}${path}${search}`, options);
      let payload = null;
      try { payload = await response.json(); } catch { /* keep non-JSON failures generic */ }
      if (!response.ok) {
        throw new VocabularyImportApiError(
          payload?.message || 'Không thể hoàn tất yêu cầu. Hãy tải lại trạng thái batch.',
          { status: response.status, code: payload?.code || 'REQUEST_FAILED', payload }
        );
      }
      return payload?.data ?? payload;
    } catch (error) {
      if (error instanceof VocabularyImportApiError) throw error;
      if (controller.signal.aborted && controller.signal.reason === 'request-timeout') {
        throw new VocabularyImportApiError('Yêu cầu đã hết thời gian chờ; trạng thái lưu cần được kiểm tra lại.', {
          code: 'REQUEST_TIMEOUT', cause: error,
        });
      }
      throw new VocabularyImportApiError('Mất kết nối tới máy chủ import. Dữ liệu đang nhập vẫn được giữ trên màn hình.', {
        code: 'NETWORK_ERROR', cause: error,
      });
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', forwardAbort);
    }
  }

  return {
    uploadBatch(files, sourceFolder) {
      const form = new FormData();
      files.forEach((file) => form.append('files', file, file.name));
      form.append('sourceFolder', sourceFolder);
      return request('', { method: 'POST', body: form });
    },
    getBatch(batchId) { return request(`/${encodeURIComponent(batchId)}`); },
    getCandidates(batchId, query) {
      return request(`/${encodeURIComponent(batchId)}/candidates`, { query });
    },
    getCandidate(batchId, candidateId) {
      return request(`/${encodeURIComponent(batchId)}/candidates/${encodeURIComponent(candidateId)}`);
    },
    updateCandidate(batchId, candidateId, payload) {
      return request(`/${encodeURIComponent(batchId)}/candidates/${encodeURIComponent(candidateId)}`, {
        method: 'PATCH', body: JSON.stringify(payload),
      });
    },
    reviewCandidate(batchId, candidateId, payload) {
      return request(`/${encodeURIComponent(batchId)}/candidates/${encodeURIComponent(candidateId)}/review`, {
        method: 'POST', body: JSON.stringify(payload),
      });
    },
    confirmBatch(batchId, payload) {
      return request(`/${encodeURIComponent(batchId)}/confirm`, {
        method: 'POST', body: JSON.stringify(payload),
      });
    },
  };
}

export const vocabularyImportApi = createVocabularyImportApi();
