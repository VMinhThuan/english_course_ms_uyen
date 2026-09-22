import axiosInstance from './axiosConfig.js';

export const progressApi = {
  // Student track access
  accessLesson: async (lessonId) => {
    const response = await axiosInstance.post('/progress/access', { lessonId });
    return response.data;
  },

  // Student mark lesson completed
  completeLesson: async (lessonId) => {
    const response = await axiosInstance.post('/progress/complete', { lessonId });
    return response.data;
  },

  // Admin get student progress stats
  getStudentProgress: async (studentId, courseId) => {
    const params = courseId ? { courseId } : {};
    const response = await axiosInstance.get(`/admin/students/${studentId}/progress`, { params });
    return response.data;
  },

  // Student dashboard aggregated metrics
  getStudentDashboard: async () => {
    const response = await axiosInstance.get('/progress/student-dashboard');
    return response.data;
  },
};

