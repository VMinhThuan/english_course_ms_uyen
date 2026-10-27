import axiosInstance from './axiosConfig.js';

export const uploadFileToBlob = async (file, purpose, { originalName = file?.name } = {}) => {
  if (!(file instanceof Blob)) throw new Error('Vui lòng chọn tệp hợp lệ.');

  const ticketResponse = await axiosInstance.post('/storage/uploads', {
    purpose,
    originalName,
    mimeType: file.type,
    size: file.size,
  });
  const ticket = ticketResponse.data?.data;
  if (!ticket?.uploadUrl || !ticket.pathname || !ticket.contentType) {
    throw new Error('Không nhận được quyền tải tệp lên Blob.');
  }

  const uploadResponse = await fetch(ticket.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': ticket.contentType },
    body: file,
  });
  if (!uploadResponse.ok) {
    throw new Error('Không thể tải tệp lên Vercel Blob. Hãy thử lại.');
  }

  const completeResponse = await axiosInstance.post('/storage/uploads/complete', {
    purpose,
    pathname: ticket.pathname,
    originalName,
  });
  const uploaded = completeResponse.data?.data;
  if (!uploaded?.storageUrl || !uploaded?.previewUrl) {
    throw new Error('Không thể xác nhận tệp đã tải lên Blob.');
  }
  return { ...uploaded, fileUrl: uploaded.previewUrl };
};
