import axiosInstance from './axiosConfig.js';

export const vocabularyApi = {
  // Student APIs
  getVocabularyByLesson: async (lessonId) => {
    const response = await axiosInstance.get(`/vocabulary/lesson/${lessonId}`);
    return response.data;
  },

  // Admin APIs
  getAdminVocabulary: async (params = {}) => {
    const response = await axiosInstance.get('/admin/vocabulary', { params });
    return response.data;
  },

  getAdminVocabularyById: async (id) => {
    const response = await axiosInstance.get(`/admin/vocabulary/${id}`);
    return response.data;
  },

  createVocabulary: async (data) => {
    const response = await axiosInstance.post('/admin/vocabulary', data);
    return response.data;
  },

  updateVocabulary: async (id, data) => {
    const response = await axiosInstance.put(`/admin/vocabulary/${id}`, data);
    return response.data;
  },

  deleteVocabulary: async (id) => {
    const response = await axiosInstance.delete(`/admin/vocabulary/${id}`);
    return response.data;
  },
};
