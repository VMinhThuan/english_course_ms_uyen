import axiosInstance from './axiosConfig.js';

export const gamificationApi = {
  getOverview: async () => (await axiosInstance.get('/gamification/overview', {
    headers: { 'X-Timezone': Intl.DateTimeFormat().resolvedOptions().timeZone },
  })).data,
  startDaily: async () => (await axiosInstance.post('/gamification/daily-challenge/start', {}, {
    headers: { 'X-Timezone': Intl.DateTimeFormat().resolvedOptions().timeZone },
  })).data,
  answerDaily: async (challengeId, payload) => (await axiosInstance.post(`/gamification/daily-challenge/${challengeId}/answer`, payload)).data,
  startQuest: async (level, stage = 1) => (await axiosInstance.post(`/gamification/quest/levels/${level}/start`, { stage })).data,
  submitQuest: async (attemptId, answers) => (await axiosInstance.post(`/gamification/quest/attempts/${attemptId}/submit`, { answers })).data,
  saveQuestProgress: async (attemptId, questionId, answer) => (await axiosInstance.post(`/gamification/quest/attempts/${attemptId}/progress`, { questionId, answer })).data,
};
