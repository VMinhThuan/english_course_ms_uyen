import axiosInstance from './axiosConfig.js';

export const toeicApi = {
  // ==========================================
  // Admin / Teacher APIs
  // ==========================================
  getAdminToeicTests: async (params = {}) => {
    const response = await axiosInstance.get('/admin/toeic-tests', { params });
    return response.data;
  },

  getAdminToeicTestById: async (id) => {
    const response = await axiosInstance.get(`/admin/toeic-tests/${id}`);
    return response.data;
  },

  createToeicTest: async (data) => {
    const response = await axiosInstance.post('/admin/toeic-tests', data);
    return response.data;
  },

  updateToeicTest: async (id, data) => {
    const response = await axiosInstance.put(`/admin/toeic-tests/${id}`, data);
    return response.data;
  },

  upsertQuestionGroup: async (testId, groupData) => {
    const response = await axiosInstance.post(`/admin/toeic-tests/${testId}/groups`, groupData);
    return response.data;
  },

  duplicateToeicTest: async (id) => {
    const response = await axiosInstance.post(`/admin/toeic-tests/${id}/duplicate`);
    return response.data;
  },

  publishToeicTest: async (id) => {
    const response = await axiosInstance.post(`/admin/toeic-tests/${id}/publish`);
    return response.data;
  },

  unpublishToeicTest: async (id) => {
    const response = await axiosInstance.post(`/admin/toeic-tests/${id}/unpublish`);
    return response.data;
  },

  deleteQuestionGroup: async (testId, groupId) => {
    const response = await axiosInstance.delete(`/admin/toeic-tests/${testId}/groups/${groupId}`);
    return response.data;
  },

  deleteQuestion: async (testId, questionId) => {
    const response = await axiosInstance.delete(`/admin/toeic-tests/${testId}/questions/${questionId}`);
    return response.data;
  },

  deleteToeicTest: async (id) => {
    const response = await axiosInstance.delete(`/admin/toeic-tests/${id}`);
    return response.data;
  },

  importToeicCsv: async (testId, csvContent, previewOnly = false) => {
    const response = await axiosInstance.post(`/admin/toeic-tests/${testId}/import-csv`, { csvContent, previewOnly });
    return response.data;
  },

  importToeicPdf: async (file, options = {}) => {
    const formData = new FormData();
    formData.append('file', file);
    if (options.title) formData.append('title', options.title);
    if (options.toeicMode) formData.append('toeicMode', options.toeicMode);
    if (options.durationMinutes) formData.append('durationMinutes', options.durationMinutes);
    if (options.previewOnly) formData.append('previewOnly', 'true');
    if (options.ocrText) formData.append('ocrText', options.ocrText);
    if (options.ocrPageCount) formData.append('ocrPageCount', String(options.ocrPageCount));
    if (options.imagePageNumbers?.length) formData.append('imagePageNumbers', options.imagePageNumbers.join(','));
    if (!options.previewOnly) {
      (options.pageImages || []).forEach(({ pageNumber, blob }) => {
        if (pageNumber && blob) formData.append('pageImages', blob, `page-${pageNumber}.jpg`);
      });
    }
    const endpoint = options.targetTestId
      ? `/admin/toeic-tests/${options.targetTestId}/import-pdf`
      : '/admin/toeic-tests/import-pdf';
    const response = await axiosInstance.post(endpoint, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  // ==========================================
  // Student APIs
  // ==========================================
  getStudentToeicTests: async (params = {}) => {
    const response = await axiosInstance.get('/toeic/tests', { params });
    return response.data;
  },

  getToeicTests: async (params = {}) => {
    const response = await axiosInstance.get('/toeic/tests', { params });
    return response.data;
  },

  getStudentToeicTestOverview: async (id) => {
    const response = await axiosInstance.get(`/toeic/tests/${id}`);
    return response.data;
  },

  getToeicTestDetail: async (id) => {
    const response = await axiosInstance.get(`/toeic/tests/${id}`);
    return response.data;
  },

  startToeicAttempt: async (id) => {
    const response = await axiosInstance.post(`/toeic/tests/${id}/start`);
    return response.data;
  },

  getToeicAttempt: async (attemptId) => {
    const response = await axiosInstance.get(`/toeic/attempts/${attemptId}`);
    return response.data;
  },

  autosaveToeicAnswers: async (attemptId, data) => {
    const response = await axiosInstance.patch(`/toeic/attempts/${attemptId}/answers`, data);
    return response.data;
  },

  submitToeicAttempt: async (attemptId, answers) => {
    const payload = answers ? { answers } : {};
    const response = await axiosInstance.post(`/toeic/attempts/${attemptId}/submit`, payload);
    return response.data;
  },

  getToeicAttemptResult: async (attemptId) => {
    const response = await axiosInstance.get(`/toeic/attempts/${attemptId}`);
    return response.data;
  },

  getStudentToeicHistory: async () => {
    const response = await axiosInstance.get('/toeic/history');
    return response.data;
  },
};

// Named exports for individual imports
export const getAdminToeicTests = toeicApi.getAdminToeicTests;
export const getAdminToeicTestById = toeicApi.getAdminToeicTestById;
export const createToeicTest = toeicApi.createToeicTest;
export const updateToeicTest = toeicApi.updateToeicTest;
export const upsertQuestionGroup = toeicApi.upsertQuestionGroup;
export const duplicateToeicTest = toeicApi.duplicateToeicTest;
export const publishToeicTest = toeicApi.publishToeicTest;
export const unpublishToeicTest = toeicApi.unpublishToeicTest;
export const deleteQuestionGroup = toeicApi.deleteQuestionGroup;
export const deleteQuestion = toeicApi.deleteQuestion;
export const deleteToeicTest = toeicApi.deleteToeicTest;
export const importToeicCsv = toeicApi.importToeicCsv;
export const importToeicPdf = toeicApi.importToeicPdf;

export const getStudentToeicTests = toeicApi.getStudentToeicTests;
export const getToeicTests = toeicApi.getToeicTests;
export const getStudentToeicTestOverview = toeicApi.getStudentToeicTestOverview;
export const getToeicTestDetail = toeicApi.getToeicTestDetail;
export const startToeicAttempt = toeicApi.startToeicAttempt;
export const getToeicAttempt = toeicApi.getToeicAttempt;
export const autosaveToeicAnswers = toeicApi.autosaveToeicAnswers;
export const submitToeicAttempt = toeicApi.submitToeicAttempt;
export const getToeicAttemptResult = toeicApi.getToeicAttemptResult;
export const getStudentToeicHistory = toeicApi.getStudentToeicHistory;

export default toeicApi;
