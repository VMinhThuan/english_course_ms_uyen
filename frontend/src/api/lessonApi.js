import axiosInstance from './axiosConfig.js';

export const lessonApi = {
  getLessonsByCourse: async (courseId) => {
    const response = await axiosInstance.get(`/lessons/course/${courseId}`);
    return response.data;
  },

  createLesson: async (lessonData) => {
    const formData = new FormData();
    Object.keys(lessonData).forEach((key) => {
      if (key === 'attachments' && Array.isArray(lessonData[key])) {
        lessonData[key].forEach((file) => {
          formData.append('attachments', file);
        });
      } else {
        formData.append(key, lessonData[key]);
      }
    });

    const response = await axiosInstance.post('/lessons', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  updateLesson: async (lessonId, lessonData) => {
    const formData = new FormData();
    Object.keys(lessonData).forEach((key) => {
      if (key === 'attachments' && Array.isArray(lessonData[key])) {
        lessonData[key].forEach((file) => {
          formData.append('attachments', file);
        });
      } else {
        formData.append(key, lessonData[key]);
      }
    });

    const response = await axiosInstance.put(`/lessons/${lessonId}`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },
};

