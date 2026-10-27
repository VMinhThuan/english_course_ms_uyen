import { uploadFileToBlob } from './blobUploadApi.js';

export const mediaApi = {
  uploadMedia: async (file) => {
    const uploaded = await uploadFileToBlob(file, 'media', {
      ticketPath: '/admin/media/upload',
      completePath: '/admin/media/complete',
    });
    return {
      status: 'success',
      data: {
        fileUrl: uploaded.previewUrl,
        storageUrl: uploaded.storageUrl,
        pathname: uploaded.pathname,
        filename: uploaded.pathname.split('/').pop(),
        originalName: uploaded.originalName,
        fileType: uploaded.fileType,
        mimeType: uploaded.mimeType,
        size: uploaded.size,
      },
    };
  },
};
