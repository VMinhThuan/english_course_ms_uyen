import axiosInstance from './axiosConfig.js';

export const learningApi = {
  // ================= STUDENT TRACKING =================
  startSession: async (lessonId, courseId) => {
    const response = await axiosInstance.post('/learning/sessions/start', {
      lessonId,
      courseId,
    });
    return response.data;
  },

  sendHeartbeat: async (sessionId, activeSeconds) => {
    const response = await axiosInstance.post('/learning/sessions/heartbeat', {
      sessionId,
      activeSeconds,
    });
    return response.data;
  },

  endSession: async (sessionId, activeSeconds) => {
    const response = await axiosInstance.post('/learning/sessions/end', {
      sessionId,
      activeSeconds,
    });
    return response.data;
  },

  sendActivityHeartbeat: async ({ activeSeconds = 0, isActive = false, route = '' } = {}) => {
    const response = await axiosInstance.post('/learning/sessions/activity-heartbeat', {
      activeSeconds,
      isActive,
      route,
    });
    return response.data;
  },

  getMyExerciseSubmissions: async (params = {}) => {
    const response = await axiosInstance.get('/exercise-submissions/mine', { params });
    return response.data;
  },

  // ================= ADMIN MONITORING =================
  getOverview: async () => {
    const response = await axiosInstance.get('/admin/learning/overview');
    return response.data;
  },

  getStudents: async (params = {}) => {
    const response = await axiosInstance.get('/admin/learning/students', { params });
    return response.data;
  },

  getStudentDetail: async (studentId) => {
    const response = await axiosInstance.get(`/admin/learning/students/${studentId}`);
    return response.data;
  },

  getStudentProgress: async (studentId, params = {}) => {
    const response = await axiosInstance.get(`/admin/learning/students/${studentId}/progress`, { params });
    return response.data;
  },

  getStudentHistory: async (studentId, params = {}) => {
    const response = await axiosInstance.get(`/admin/learning/students/${studentId}/history`, { params });
    return response.data;
  },

  getStudentDailyStudy: async (studentId) => {
    const response = await axiosInstance.get(`/admin/learning/students/${studentId}/daily-study`);
    return response.data;
  },

  getStudentExerciseSubmissions: async (studentId, params = {}) => {
    const response = await axiosInstance.get(`/admin/learning/students/${studentId}/exercise-submissions`, { params });
    return response.data;
  },

  getCourseStats: async (courseId) => {
    const response = await axiosInstance.get(`/admin/learning/courses/${courseId}/stats`);
    return response.data;
  },

  getStudentAttempts: async (studentId, params = {}) => {
    const response = await axiosInstance.get(`/admin/students/${studentId}/attempts`, { params });
    return response.data;
  },
};

export default learningApi;
