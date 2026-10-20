import axiosInstance from './axiosConfig.js';

export const assessmentApi = {
  // Student Assessment & Attempt APIs
  getAvailableAssessments: async () => {
    const response = await axiosInstance.get('/assessments/available');
    return response.data;
  },

  getAssessmentById: async (id) => {
    const response = await axiosInstance.get(`/assessments/${id}`);
    return response.data;
  },

  startAttempt: async (assessmentId) => {
    const response = await axiosInstance.post(`/assessments/${assessmentId}/start`);
    return response.data;
  },

  submitAttempt: async (attemptId, answers, revision) => {
    const response = await axiosInstance.post(`/attempts/${attemptId}/submit`, { answers, revision });
    return response.data;
  },

  autosaveAttemptAnswers: async (attemptId, data) => {
    const response = await axiosInstance.patch(`/attempts/${attemptId}/answers`, data);
    return response.data;
  },

  getAttemptResult: async (attemptId) => {
    const response = await axiosInstance.get(`/attempts/${attemptId}/result`);
    return response.data;
  },

  getStudentHistory: async () => {
    const response = await axiosInstance.get('/attempts/history');
    return response.data;
  },

  getActiveAttempts: async () => {
    const response = await axiosInstance.get('/attempts/active');
    return response.data;
  },

  // Admin Question Bank APIs
  getAdminQuestions: async (params = {}) => {
    const response = await axiosInstance.get('/admin/questions', { params });
    return response.data;
  },
  getAdminQuestionById: async (id) => (await axiosInstance.get(`/admin/questions/${id}`)).data,

  createQuestion: async (data) => {
    const response = await axiosInstance.post('/admin/questions', data);
    return response.data;
  },

  updateQuestion: async (id, data) => {
    const response = await axiosInstance.put(`/admin/questions/${id}`, data);
    return response.data;
  },

  deleteQuestion: async (id) => {
    const response = await axiosInstance.delete(`/admin/questions/${id}`);
    return response.data;
  },

  // Admin Assessment APIs
  getAdminAssessments: async (params = {}) => {
    const response = await axiosInstance.get('/admin/assessments', { params });
    return response.data;
  },
  getAdminAssessmentById: async (id) => (await axiosInstance.get(`/admin/assessments/${id}`)).data,

  createAssessment: async (data) => {
    const response = await axiosInstance.post('/admin/assessments', data);
    return response.data;
  },

  updateAssessment: async (id, data) => {
    const response = await axiosInstance.put(`/admin/assessments/${id}`, data);
    return response.data;
  },

  updateAssessmentStatus: async (id, status) => {
    const response = await axiosInstance.patch(`/admin/assessments/${id}/status`, { status });
    return response.data;
  },

  deleteAssessment: async (id) => {
    const response = await axiosInstance.delete(`/admin/assessments/${id}`);
    return response.data;
  },

  // Admin Results Inspector
  getAdminResults: async (params = {}) => {
    const response = await axiosInstance.get('/admin/results', { params });
    return response.data;
  },
  getAdminReportAssessments: async (params = {}) => {
    const response = await axiosInstance.get('/admin/report-assessments', { params });
    return response.data;
  },
};
