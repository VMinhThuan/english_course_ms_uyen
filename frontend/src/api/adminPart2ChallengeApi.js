import axiosInstance from './axiosConfig.js';

export const adminPart2ChallengeApi = {
  getQuestions: async () => (await axiosInstance.get('/admin/part2-challenge')).data,
  create: async (payload) => (await axiosInstance.post('/admin/part2-challenge', payload)).data,
  update: async (number, payload) => (await axiosInstance.put(`/admin/part2-challenge/${number}`, payload)).data,
  setVisibility: async (number, isVisible) => (
    await axiosInstance.patch(`/admin/part2-challenge/${number}/visibility`, { isVisible })
  ).data,
  delete: async (number) => (await axiosInstance.delete(`/admin/part2-challenge/${number}`)).data,
};
