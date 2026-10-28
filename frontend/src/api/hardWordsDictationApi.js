import axiosInstance from './axiosConfig.js';

export const hardWordsDictationApi = {
  getAdminItems: async () => (await axiosInstance.get('/admin/hard-words-dictations')).data,
  importSeed: async (items) => (await axiosInstance.post('/admin/hard-words-dictations/import-seed', { items })).data,
  create: async (payload) => (await axiosInstance.post('/admin/hard-words-dictations', payload)).data,
  update: async (id, payload) => (await axiosInstance.put(`/admin/hard-words-dictations/${id}`, payload)).data,
  setVisibility: async (id, isVisible) => (await axiosInstance.patch(`/admin/hard-words-dictations/${id}/visibility`, { isVisible })).data,
  delete: async (id) => (await axiosInstance.delete(`/admin/hard-words-dictations/${id}`)).data,
  getStudentItems: async () => (await axiosInstance.get('/hard-words-dictations')).data,
  getStudentItem: async (id) => (await axiosInstance.get(`/hard-words-dictations/${id}`)).data,
  submit: async (id, answers) => (await axiosInstance.post(`/hard-words-dictations/${id}/submit`, { answers })).data,
};
