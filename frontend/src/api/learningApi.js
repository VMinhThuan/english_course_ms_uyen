import axiosInstance from './axiosConfig.js';

export const learningApi = {
  // ================= STUDENT TRACKING =================
  startSession: async (lessonId, courseId, options = {}) => {
    const response = await axiosInstance.post('/learning/sessions/start', {
      lessonId,
      courseId,
      ...options,
    });
    return response.data;
  },

  sendHeartbeat: async (sessionId, activeSeconds, heartbeatId) => {
    const response = await axiosInstance.post('/learning/sessions/heartbeat', {
      sessionId,
      activeSeconds,
      heartbeatId,
    }, heartbeatId ? { headers: { 'Idempotency-Key': heartbeatId } } : undefined);
    return response.data;
  },

  endSession: async (sessionId, activeSeconds) => {
    const response = await axiosInstance.post('/learning/sessions/end', {
      sessionId,
      activeSeconds,
    });
    return response.data;
  },

  pauseSession: async (sessionId) => {
    const response = await axiosInstance.post('/learning/sessions/pause', { sessionId });
    return response.data;
  },

  startActivitySession: async (activityType, activityId = '') => {
    const response = await axiosInstance.post('/learning/sessions/start', { activityType, activityId });
    return response.data;
  },

  getStreakOverview: async () => {
    const response = await axiosInstance.get('/learning/streak/overview');
    return response.data;
  },

  getStreakCalendar: async () => {
    const response = await axiosInstance.get('/learning/streak/calendar');
    return response.data;
  },

  getStreakMilestones: async () => {
    const response = await axiosInstance.get('/learning/streak/milestones');
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

  getStudentStreak: async (studentId) => {
    const response = await axiosInstance.get(`/admin/learning/students/${studentId}/streak`);
    return response.data;
  },

  getStudentStreakCalendar: async (studentId, params = {}) => {
    const response = await axiosInstance.get(`/admin/learning/students/${studentId}/streak/calendar`, { params });
    return response.data;
  },

  getStudentStreakActivity: async (studentId, days = 30) => {
    const response = await axiosInstance.get(`/admin/learning/students/${studentId}/streak/activity`, { params: { days } });
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
