import axiosInstance from './axiosConfig.js';
import { uploadFileToBlob } from './blobUploadApi.js';

const readResponse = async (request) => {
  const response = await request;
  return { httpStatus: response.status, ...response.data };
};

export const questionImportApi = {
  upload: async (file) => {
    const uploaded = await uploadFileToBlob(file, 'question-import-xlsx');
    return readResponse(axiosInstance.post('/admin/question-import-batches', {
      blobPath: uploaded.pathname,
      originalFileName: uploaded.originalName || file.name,
    }));
  },
  getBatch: (batchId) => readResponse(axiosInstance.get(`/admin/question-import-batches/${encodeURIComponent(batchId)}`)),
  updateRow: (batchId, rowNumber, values) => readResponse(axiosInstance.patch(
    `/admin/question-import-batches/${encodeURIComponent(batchId)}/rows/${encodeURIComponent(rowNumber)}`,
    { values },
  )),
  confirm: (batchId, rowNumbers) => readResponse(axiosInstance.post(
    `/admin/question-import-batches/${encodeURIComponent(batchId)}/confirm`,
    { rowNumbers },
    { validateStatus: (status) => (status >= 200 && status < 300) || status === 207 },
  )),
};
