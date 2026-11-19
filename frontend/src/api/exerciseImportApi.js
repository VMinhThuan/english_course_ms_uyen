import axiosInstance from './axiosConfig.js';

const readResponse = async (request) => {
  const response = await request;
  return { httpStatus: response.status, ...response.data };
};

export const exerciseImportApi = {
  upload: async (exerciseType, file) => {
    const formData = new FormData();
    formData.append('file', file, file.name);
    return readResponse(axiosInstance.post(
      `/admin/exercise-import-batches/${encodeURIComponent(exerciseType)}/preview`,
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    ));
  },
  getBatch: (batchId) => readResponse(axiosInstance.get(`/admin/exercise-import-batches/${encodeURIComponent(batchId)}`)),
  confirm: (batchId) => readResponse(axiosInstance.post(`/admin/exercise-import-batches/${encodeURIComponent(batchId)}/confirm`)),
};
