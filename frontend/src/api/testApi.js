import axiosInstance from './axiosConfig.js';

export const testApi = {
  getTestByLesson: async (lessonId) => {
    const response = await axiosInstance.get(`/tests/lesson/${lessonId}`);
    return response.data;
  },

  submitTest: async (testId, { answers, readingText }) => {
    const response = await axiosInstance.post(`/tests/${testId}/submit`, {
      answers,
      readingText,
    });
    return response.data;
  },

  getTestResult: async (testId) => {
    const response = await axiosInstance.get(`/tests/${testId}/result`);
    return response.data;
  },
};

