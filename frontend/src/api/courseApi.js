import axiosInstance from './axiosConfig.js';

export const courseApi = {
  // Public & Student Course APIs (published only)
  getCourses: async (params = {}) => {
    const response = await axiosInstance.get('/courses', { params });
    return response.data;
  },

  getCourseById: async (courseId) => {
    const response = await axiosInstance.get(`/courses/${courseId}`);
    return response.data;
  },

  // Admin / Teacher Course APIs
  getAdminCourses: async (params = {}) => {
    const response = await axiosInstance.get('/admin/courses', { params });
    return response.data;
  },

  getAdminCourseById: async (courseId) => {
    const response = await axiosInstance.get(`/admin/courses/${courseId}`);
    return response.data;
  },

  createCourse: async (courseData) => {
    const response = await axiosInstance.post('/admin/courses', courseData);
    return response.data;
  },

  updateCourse: async (courseId, courseData) => {
    const response = await axiosInstance.put(`/admin/courses/${courseId}`, courseData);
    return response.data;
  },

  updateCourseStatus: async (courseId, isPublished) => {
    const response = await axiosInstance.patch(`/admin/courses/${courseId}/status`, { isPublished });
    return response.data;
  },

  reorderCourseLessons: async (courseId, lessonIds) => {
    const response = await axiosInstance.put(`/admin/courses/${courseId}/reorder-lessons`, { lessonIds });
    return response.data;
  },

  deleteCourse: async (courseId) => {
    const response = await axiosInstance.delete(`/admin/courses/${courseId}`);
    return response.data;
  },
};
