import axiosInstance from './axiosConfig.js';
import { uploadFileToBlob } from './blobUploadApi.js';

const uploadPageImages = async (pageImages = []) => {
  const uploaded = [];
  for (let start = 0; start < pageImages.length; start += 4) {
    const batch = pageImages.slice(start, start + 4);
    const results = await Promise.all(batch.map(async ({ pageNumber, blob }) => {
      if (!pageNumber || !blob) return null;
      const file = await uploadFileToBlob(blob, 'toeic-page-image', {
        originalName: `page-${pageNumber}.jpg`,
      });
      return { pageNumber, pathname: file.pathname };
    }));
    uploaded.push(...results.filter(Boolean));
  }
  return uploaded;
};

export const toeicApi = {
  // ==========================================
  // Admin / Teacher APIs
  // ==========================================
  getAdminToeicTests: async (params = {}) => {
    const response = await axiosInstance.get('/admin/toeic-tests', { params });
    return response.data;
  },

  getAdminToeicTestById: async (id) => {
    const response = await axiosInstance.get(`/admin/toeic-tests/${id}`);
    return response.data;
  },

  createToeicTest: async (data) => {
    const response = await axiosInstance.post('/admin/toeic-tests', data);
    return response.data;
  },

  generateFullTests: async (data = {}) => {
    const response = await axiosInstance.post('/admin/toeic-tests/generate-full-tests', data);
    return response.data;
  },

  updateToeicTest: async (id, data) => {
    const response = await axiosInstance.put(`/admin/toeic-tests/${id}`, data);
    return response.data;
  },

  upsertQuestionGroup: async (testId, groupData) => {
    const response = await axiosInstance.post(`/admin/toeic-tests/${testId}/groups`, groupData);
    return response.data;
  },

  getEligiblePart5BankQuestions: async (testId, params = {}) => {
    const response = await axiosInstance.get(`/admin/toeic-tests/${testId}/question-bank/part5`, { params });
    return response.data;
  },

  addPart5BankQuestions: async (testId, questionIds, { groupId, idempotencyKey } = {}) => {
    const response = await axiosInstance.post(
      `/admin/toeic-tests/${testId}/question-bank/part5/selections`,
      { questionIds, ...(groupId ? { groupId } : {}) },
      { headers: { 'Idempotency-Key': idempotencyKey } },
    );
    return response.data;
  },

  duplicateToeicTest: async (id) => {
    const response = await axiosInstance.post(`/admin/toeic-tests/${id}/duplicate`);
    return response.data;
  },

  publishToeicTest: async (id) => {
    const response = await axiosInstance.post(`/admin/toeic-tests/${id}/publish`);
    return response.data;
  },

  unpublishToeicTest: async (id) => {
    const response = await axiosInstance.post(`/admin/toeic-tests/${id}/unpublish`);
    return response.data;
  },

  deleteQuestionGroup: async (testId, groupId) => {
    const response = await axiosInstance.delete(`/admin/toeic-tests/${testId}/groups/${groupId}`);
    return response.data;
  },

  deleteQuestion: async (testId, questionId) => {
    const response = await axiosInstance.delete(`/admin/toeic-tests/${testId}/questions/${questionId}`);
    return response.data;
  },

  deleteToeicTest: async (id) => {
    const response = await axiosInstance.delete(`/admin/toeic-tests/${id}`);
    return response.data;
  },

  importToeicCsv: async (testId, csvContent, previewOnly = false) => {
    const response = await axiosInstance.post(`/admin/toeic-tests/${testId}/import-csv`, { csvContent, previewOnly });
    return response.data;
  },

  importToeicPdf: async (file, options = {}) => {
    if (typeof options.ocrText === 'string' && new TextEncoder().encode(options.ocrText).length > 3_500_000) {
      throw new Error('Nội dung OCR quá lớn để gửi cho API. Hãy giảm số trang OCR rồi thử lại.');
    }
    const pdf = await uploadFileToBlob(file, 'toeic-pdf');
    const pageImages = options.previewOnly ? [] : await uploadPageImages(options.pageImages);
    const payload = {
      pdfBlobPath: pdf.pathname,
      pdfOriginalName: pdf.originalName,
      ...(options.title ? { title: options.title } : {}),
      ...(options.toeicMode ? { toeicMode: options.toeicMode } : {}),
      ...(options.durationMinutes ? { durationMinutes: options.durationMinutes } : {}),
      ...(options.previewOnly ? { previewOnly: true } : {}),
      ...(options.confirmOcrReview ? { confirmOcrReview: true } : {}),
      ...(options.ocrText ? { ocrText: options.ocrText } : {}),
      ...(options.ocrPageCount ? { ocrPageCount: options.ocrPageCount } : {}),
      ...(options.imagePageNumbers?.length ? { imagePageNumbers: options.imagePageNumbers.join(',') } : {}),
      ...(options.passageImagePageNumbers?.length
        ? { passageImagePageNumbers: options.passageImagePageNumbers.join(',') }
        : {}),
      ...(pageImages.length ? { pageImages } : {}),
    };
    const endpoint = options.targetTestId
      ? `/admin/toeic-tests/${options.targetTestId}/import-pdf`
      : '/admin/toeic-tests/import-pdf';
    if (new TextEncoder().encode(JSON.stringify(payload)).length > 3_900_000) {
      throw new Error('Dữ liệu import quá lớn sau khi mã hóa JSON. Hãy giảm nội dung OCR hoặc số trang rồi thử lại.');
    }
    const response = await axiosInstance.post(endpoint, payload);
    return response.data;
  },

  // ==========================================
  // Student APIs
  // ==========================================
  getStudentToeicTests: async (params = {}) => {
    const response = await axiosInstance.get('/toeic/tests', { params });
    return response.data;
  },

  getToeicTests: async (params = {}) => {
    const response = await axiosInstance.get('/toeic/tests', { params });
    return response.data;
  },

  getStudentToeicTestOverview: async (id) => {
    const response = await axiosInstance.get(`/toeic/tests/${id}`);
    return response.data;
  },

  getToeicTestDetail: async (id) => {
    const response = await axiosInstance.get(`/toeic/tests/${id}`);
    return response.data;
  },

  startToeicAttempt: async (id) => {
    const response = await axiosInstance.post(`/toeic/tests/${id}/start`);
    return response.data;
  },

  getToeicAttempt: async (attemptId) => {
    const response = await axiosInstance.get(`/toeic/attempts/${attemptId}`);
    return response.data;
  },

  autosaveToeicAnswers: async (attemptId, data) => {
    const response = await axiosInstance.patch(`/toeic/attempts/${attemptId}/answers`, data);
    return response.data;
  },

  submitToeicAttempt: async (attemptId, answers, revision) => {
    const payload = answers ? { answers, revision } : { revision };
    const response = await axiosInstance.post(`/toeic/attempts/${attemptId}/submit`, payload);
    return response.data;
  },

  getToeicAttemptResult: async (attemptId) => {
    const response = await axiosInstance.get(`/toeic/attempts/${attemptId}`);
    return response.data;
  },

  getStudentToeicHistory: async () => {
    const response = await axiosInstance.get('/toeic/history');
    return response.data;
  },

  getStudentPart5Bank: async (params = {}) => {
    const response = await axiosInstance.get('/toeic/part5-bank', { params });
    return response.data;
  },
};

// Named exports for individual imports
export const getAdminToeicTests = toeicApi.getAdminToeicTests;
export const getAdminToeicTestById = toeicApi.getAdminToeicTestById;
export const createToeicTest = toeicApi.createToeicTest;
export const generateFullTests = toeicApi.generateFullTests;
export const updateToeicTest = toeicApi.updateToeicTest;
export const upsertQuestionGroup = toeicApi.upsertQuestionGroup;
export const duplicateToeicTest = toeicApi.duplicateToeicTest;
export const publishToeicTest = toeicApi.publishToeicTest;
export const unpublishToeicTest = toeicApi.unpublishToeicTest;
export const deleteQuestionGroup = toeicApi.deleteQuestionGroup;
export const deleteQuestion = toeicApi.deleteQuestion;
export const deleteToeicTest = toeicApi.deleteToeicTest;
export const importToeicCsv = toeicApi.importToeicCsv;
export const importToeicPdf = toeicApi.importToeicPdf;

export const getStudentToeicTests = toeicApi.getStudentToeicTests;
export const getToeicTests = toeicApi.getToeicTests;
export const getStudentToeicTestOverview = toeicApi.getStudentToeicTestOverview;
export const getToeicTestDetail = toeicApi.getToeicTestDetail;
export const startToeicAttempt = toeicApi.startToeicAttempt;
export const getToeicAttempt = toeicApi.getToeicAttempt;
export const autosaveToeicAnswers = toeicApi.autosaveToeicAnswers;
export const submitToeicAttempt = toeicApi.submitToeicAttempt;
export const getToeicAttemptResult = toeicApi.getToeicAttemptResult;
export const getStudentToeicHistory = toeicApi.getStudentToeicHistory;
export const getStudentPart5Bank = toeicApi.getStudentPart5Bank;

export default toeicApi;
