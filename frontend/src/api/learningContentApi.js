import axiosInstance from './axiosConfig.js';

export const learningContentApi = {
  importExcelSeed: async (payload) => (await axiosInstance.post('/admin/learning-content/import-excel-seed', payload)).data,
};
