import axiosInstance from './axiosConfig.js';

export const roadToPart7Api = {
  getStudentReadings: async () => (await axiosInstance.get('/road-to-part-7')).data,
  getAdminReadings: async () => (await axiosInstance.get('/admin/road-to-part-7')).data,
};
