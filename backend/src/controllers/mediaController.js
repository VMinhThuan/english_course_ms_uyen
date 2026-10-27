import { createMediaUploadTicket, completeBlobUpload } from './blobUploadController.js';

export const uploadMediaMiddleware = createMediaUploadTicket;
export const completeMediaUpload = (req, res, next) => completeBlobUpload(req, res, next, 'media');
