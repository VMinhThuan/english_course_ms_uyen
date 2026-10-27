import axiosInstance from './axiosConfig.js';

export const vocabularyDictationApi = {
  getAdminItems: async () => (await axiosInstance.get('/admin/vocabulary-dictations')).data,
  create: async (payload) => (await axiosInstance.post('/admin/vocabulary-dictations', payload)).data,
  update: async (id, payload) => (await axiosInstance.put(`/admin/vocabulary-dictations/${id}`, payload)).data,
  setVisibility: async (id, isVisible) => (await axiosInstance.patch(`/admin/vocabulary-dictations/${id}/visibility`, { isVisible })).data,
  delete: async (id) => (await axiosInstance.delete(`/admin/vocabulary-dictations/${id}`)).data,
  getStudentItems: async () => (await axiosInstance.get('/vocabulary-dictations')).data,
  getStudentItem: async (id) => (await axiosInstance.get(`/vocabulary-dictations/${id}`)).data,
  submit: async (id, answers) => (await axiosInstance.post(`/vocabulary-dictations/${id}/submit`, { answers })).data,
};
