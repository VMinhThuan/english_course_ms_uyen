import axiosInstance from './axiosConfig.js';

export const adminApi = {
  getStudents: async (params = {}) => {
    const response = await axiosInstance.get('/admin/students', { params });
    return response.data;
  },
  getStudent: async (id) => (await axiosInstance.get(`/admin/students/${id}`)).data,
  createStudent: async (data) => (await axiosInstance.post('/admin/students', data)).data,
  updateStudentGroup: async (id, groupName) => (await axiosInstance.patch(`/admin/students/${id}/group`, { groupName })).data,
  getStudentAttempts: async (id, params = {}) => (await axiosInstance.get(`/admin/students/${id}/attempts`, { params })).data,

  approveStudent: async (id) => {
    const response = await axiosInstance.patch(`/admin/students/${id}/approve`);
    return response.data;
  },

  rejectStudent: async (id, reason = '') => {
    const response = await axiosInstance.patch(`/admin/students/${id}/reject`, { reason });
    return response.data;
  },

  suspendStudent: async (id) => {
    const response = await axiosInstance.patch(`/admin/students/${id}/suspend`);
    return response.data;
  },

  activateStudent: async (id) => {
    const response = await axiosInstance.patch(`/admin/students/${id}/activate`);
    return response.data;
  },

  getStats: async () => {
    const response = await axiosInstance.get('/admin/stats');
    return response.data;
  },
  getGamificationConfigs: async () => (await axiosInstance.get('/admin/gamification/config')).data,
  updateGamificationConfig: async (game, data) => (await axiosInstance.patch(`/admin/gamification/config/${game}`, data)).data,
  getGamificationVocabulary: async (params = {}) => (await axiosInstance.get('/admin/gamification/vocabulary', { params })).data,
  updateGamificationVocabulary: async (id, data) => (await axiosInstance.patch(`/admin/gamification/vocabulary/${id}`, data)).data,
  getGamificationAnalytics: async () => (await axiosInstance.get('/admin/gamification/analytics')).data,
  getGamificationHistory: async () => (await axiosInstance.get('/admin/gamification/history')).data,
  previewGamificationQuest: async (level, stage) => (await axiosInstance.get('/admin/gamification/quest-preview', { params: { level, stage } })).data,
};
