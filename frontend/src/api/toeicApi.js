import axiosInstance from './axiosConfig.js';

export const toeicApi = {
  // Admin APIs
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

  deleteToeicTest: async (id) => {
    const response = await axiosInstance.delete(`/admin/toeic-tests/${id}`);
    return response.data;
  },

  importToeicCsv: async (testId, csvContent, previewOnly = false) => {
    const response = await axiosInstance.post(`/admin/toeic-tests/${testId}/import-csv`, { csvContent, previewOnly });
    return response.data;
  },

  // Student APIs
  getStudentToeicTests: async (params = {}) => {
    const response = await axiosInstance.get('/toeic/tests', { params });
    return response.data;
  },

  getStudentToeicTestOverview: async (id) => {
    const response = await axiosInstance.get(`/toeic/tests/${id}`);
    return response.data;
  },

  startToeicAttempt: async (id) => {
    const response = await axiosInstance.post(`/toeic/tests/${id}/start`);
    return response.data;
  },

  autosaveAttemptAnswers: async (attemptId, answers, flaggedQuestionIds, revision) => {
    const response = await axiosInstance.patch(`/attempts/${attemptId}/answers`, { answers, flaggedQuestionIds, revision });
    return response.data;
  },

  submitToeicAttempt: async (attemptId, answers) => {
    const response = await axiosInstance.post(`/toeic/attempts/${attemptId}/submit`, { answers });
    return response.data;
  },
};
