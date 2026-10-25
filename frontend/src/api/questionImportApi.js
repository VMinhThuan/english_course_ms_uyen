import axiosInstance from './axiosConfig.js';

const readResponse = async (request) => {
  const response = await request;
  return { httpStatus: response.status, ...response.data };
};

export const questionImportApi = {
  upload: (file) => {
    const body = new FormData();
    body.append('file', file);
    return readResponse(axiosInstance.post('/admin/question-import-batches', body, {
      headers: { 'Content-Type': 'multipart/form-data' },
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
