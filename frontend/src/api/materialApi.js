import axiosInstance from './axiosConfig.js';

export const materialApi = {
  // Student APIs
  getMaterialsByLesson: async (lessonId) => {
    const response = await axiosInstance.get(`/materials/lesson/${lessonId}`);
    return response.data;
  },

  downloadMaterial: async (materialId) => {
    const response = await axiosInstance.get(`/materials/${materialId}/download`, {
      responseType: 'blob',
    });
    return response;
  },

  // Admin APIs
  getAdminMaterials: async (params = {}) => {
    const response = await axiosInstance.get('/admin/materials', { params });
    return response.data;
  },

  getAdminMaterialById: async (id) => {
    const response = await axiosInstance.get(`/admin/materials/${id}`);
    return response.data;
  },

  createMaterial: async (formData) => {
    const response = await axiosInstance.post('/admin/materials', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  updateMaterial: async (id, formData) => {
    const response = await axiosInstance.put(`/admin/materials/${id}`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  deleteMaterial: async (id) => {
    const response = await axiosInstance.delete(`/admin/materials/${id}`);
    return response.data;
  },
};
