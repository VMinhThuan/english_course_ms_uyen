import axiosInstance from './axiosConfig.js';
import { uploadFileToBlob } from './blobUploadApi.js';

const prepareLessonPayload = async (lessonData) => {
  const attachments = Array.isArray(lessonData.attachments) ? lessonData.attachments : [];
  if (attachments.length > 10) throw new Error('Mỗi bài học chỉ hỗ trợ tối đa 10 tệp đính kèm.');
  const uploadedAttachments = await Promise.all(attachments.map(async (file) => {
    const uploaded = await uploadFileToBlob(file, 'lesson-attachment');
    return {
      filename: uploaded.pathname.split('/').pop(),
      originalName: uploaded.originalName,
      url: uploaded.storageUrl,
      type: uploaded.mimeType,
    };
  }));
  return { ...lessonData, attachments: uploadedAttachments };
};

export const lessonApi = {
  getLessonsByCourse: async (courseId) => {
    const response = await axiosInstance.get(`/lessons/course/${courseId}`);
    return response.data;
  },

  getLessonById: async (lessonId) => {
    const response = await axiosInstance.get(`/lessons/${lessonId}`);
    return response.data;
  },

  createLesson: async (lessonData) => {
    const payload = await prepareLessonPayload(lessonData);
    const response = await axiosInstance.post('/admin/lessons', payload);
    return response.data;
  },

  updateLesson: async (lessonId, lessonData) => {
    const payload = await prepareLessonPayload(lessonData);
    const response = await axiosInstance.put(`/admin/lessons/${lessonId}`, payload);
    return response.data;
  },

  updateLessonStatus: async (lessonId, status) => {
    const response = await axiosInstance.patch(`/admin/lessons/${lessonId}/status`, { status });
    return response.data;
  },

  deleteLesson: async (lessonId) => {
    const response = await axiosInstance.delete(`/admin/lessons/${lessonId}`);
    return response.data;
  },
};
