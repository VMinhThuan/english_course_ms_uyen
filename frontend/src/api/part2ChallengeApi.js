import axiosInstance from './axiosConfig.js';

export const part2ChallengeApi = {
  getQuestions: async () => (await axiosInstance.get('/part2-challenge')).data,
  getAnswer: async (number) => (await axiosInstance.get(`/part2-challenge/${number}/answer`)).data,
  submit: async (answers, { mode, submissionId } = {}) => (
    await axiosInstance.post('/part2-challenge/submit', { answers, mode, submissionId })
  ).data,
};
