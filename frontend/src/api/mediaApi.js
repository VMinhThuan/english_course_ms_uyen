import { uploadFileToBlob } from './blobUploadApi.js';

export const mediaApi = {
  uploadMedia: async (file, storageFolder = 'import-files') => {
    const uploaded = await uploadFileToBlob(file, 'media', {
      storageFolder,
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
