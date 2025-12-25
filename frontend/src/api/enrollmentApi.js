import axiosInstance from './axiosConfig.js';

export const enrollmentApi = {
  enrollCourse: async (courseId) => {
    const response = await axiosInstance.post('/enrollments', { courseId });
    return response.data;
  },

  getMyCourses: async () => {
    const response = await axiosInstance.get('/enrollments/my-courses');
    return response.data;
  },
};

