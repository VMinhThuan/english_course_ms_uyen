import axiosInstance from './axiosConfig.js';

export const part1DictationApi = {
  getAdminItems: async () => (await axiosInstance.get('/admin/part1-dictations')).data,
  create: async (payload) => (await axiosInstance.post('/admin/part1-dictations', payload)).data,
  update: async (id, payload) => (await axiosInstance.put(`/admin/part1-dictations/${id}`, payload)).data,
  setVisibility: async (id, isVisible) => (await axiosInstance.patch(`/admin/part1-dictations/${id}/visibility`, { isVisible })).data,
  getStudentItems: async () => (await axiosInstance.get('/part1-dictations')).data,
  getStudentItem: async (id) => (await axiosInstance.get(`/part1-dictations/${id}`)).data,
  submit: async (id, answers) => (await axiosInstance.post(`/part1-dictations/${id}/submit`, { answers })).data,
};
