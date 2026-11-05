import axiosInstance from './axiosConfig.js';

export const grammarExerciseApi = {
  getStudentExercise: async (exerciseType) => (
    await axiosInstance.get(`/grammar-exercises/${encodeURIComponent(exerciseType)}`)
  ).data,
  checkStudentExercise: async (exerciseType, answers) => (
    await axiosInstance.post(`/grammar-exercises/${encodeURIComponent(exerciseType)}/check`, { answers })
  ).data,
  getAdminQuestions: async (exerciseType) => (
    await axiosInstance.get('/admin/grammar-exercises', { params: { exerciseType } })
  ).data,
  createQuestion: async (payload) => (
    await axiosInstance.post('/admin/grammar-exercises', payload)
  ).data,
  updateQuestion: async (id, payload) => (
    await axiosInstance.put(`/admin/grammar-exercises/${encodeURIComponent(id)}`, payload)
  ).data,
  setVisibility: async (id, isVisible) => (
    await axiosInstance.patch(`/admin/grammar-exercises/${encodeURIComponent(id)}/visibility`, { isVisible })
  ).data,
  deleteQuestion: async (id) => (
    await axiosInstance.delete(`/admin/grammar-exercises/${encodeURIComponent(id)}`)
  ).data,
};
