import axiosInstance from './axiosConfig.js';

export const courseApi = {
  getCourses: async (params = {}) => {
    const response = await axiosInstance.get('/courses', { params });
    return response.data;
  },

  getCourseById: async (courseId) => {
    const response = await axiosInstance.get(`/courses/${courseId}`);
    return response.data;
  },

  createCourse: async (courseData) => {
    const response = await axiosInstance.post('/courses', courseData);
    return response.data;
  },

  updateCourse: async (courseId, courseData) => {
    const response = await axiosInstance.put(`/courses/${courseId}`, courseData);
    return response.data;
  },

  deleteCourse: async (courseId) => {
    const response = await axiosInstance.delete(`/courses/${courseId}`);
    return response.data;
  },
};

