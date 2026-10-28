import axiosInstance from './axiosConfig.js';

export const adminPart2ChallengeApi = {
  getQuestions: async () => (await axiosInstance.get('/admin/part2-challenge')).data,
  setVisibility: async (number, isVisible) => (
    await axiosInstance.patch(`/admin/part2-challenge/${number}/visibility`, { isVisible })
  ).data,
};
