import axiosInstance from './axiosConfig.js';

export const adminApi = {
  getStudents: async (params = {}) => {
    const response = await axiosInstance.get('/admin/students', { params });
    return response.data;
  },
  getStudent: async (id) => (await axiosInstance.get(`/admin/students/${id}`)).data,
  createStudent: async (data) => (await axiosInstance.post('/admin/students', data)).data,
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
};
