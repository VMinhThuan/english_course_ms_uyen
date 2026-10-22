import { useEffect, useState } from 'react';
import { materialApi } from '../api/materialApi.js';
import PdfDocumentPreview from './PdfDocumentPreview.jsx';
import { getSafeLessonMediaUrl, sanitizeLessonHtml } from '../utils/sanitizeLessonHtml.js';

const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif', 'image/bmp']);
const AUDIO_TYPES = new Set(['audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/webm', 'audio/aac', 'audio/flac']);

const materialType = (material) => {
  const mime = String(material?.fileType || '').split(';', 1)[0].trim().toLowerCase();
  const filename = material?.originalName || material?.filename || material?.title || '';
  const extension = filename.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase() || '';
  if (mime === 'application/pdf' || extension === 'pdf') return 'pdf';
  if (mime === DOCX_TYPE || extension === 'docx') return 'docx';
  if (IMAGE_TYPES.has(mime) || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'bmp'].includes(extension)) return 'image';
  if (mime.startsWith('audio/') || ['mp3', 'm4a', 'wav', 'ogg', 'oga', 'webm', 'aac', 'flac'].includes(extension)) return 'audio';
  return '';
};

export default function LessonMaterialPreview({ material }) {
  const kind = materialType(material);
  const [source, setSource] = useState('');
  const [file, setFile] = useState(null);
  const [html, setHtml] = useState('');
  const [loading, setLoading] = useState(Boolean(kind));
  const [error, setError] = useState('');

  useEffect(() => {
    if (!kind) return undefined;
    let active = true;
    let objectUrl = '';
    setSource('');
    setFile(null);
    setHtml('');
    setError('');
    setLoading(true);

    async function loadPreview() {
      try {
        const externalUrl = getSafeLessonMediaUrl(material?.fileUrl);
        if (externalUrl.startsWith('https://') && kind !== 'docx') {
          if (active) setSource(externalUrl);
          return;
        }

        if (kind === 'docx') {
          const response = await materialApi.renderMaterial(material._id);
          if (active) setHtml(response.data?.html || '');
          return;
        }

        const response = await materialApi.previewMaterial(material._id);
        if (kind === 'pdf') {
          const contentType = String(response.headers?.['content-type'] || response.data?.type || '')
            .split(';', 1)[0]
            .trim()
            .toLowerCase();
          if (contentType !== 'application/pdf') throw new Error('Máy chủ không trả về PDF hợp lệ.');
        }
        objectUrl = URL.createObjectURL(response.data);
        if (active) {
          setSource(objectUrl);
          setFile(response.data);
        }
      } catch (previewError) {
        if (active) setError(previewError.response?.data?.message || previewError.message || 'Không thể hiển thị tài liệu này.');
      } finally {
        if (active) setLoading(false);
      }
    }

    loadPreview();
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [kind, material?._id, material?.fileUrl]);

  if (!kind) return null;

  return (
    <div className={`lesson-material-preview lesson-material-preview--${kind}`} aria-label={`Bản xem trước ${material.title}`}>
      {loading && <p className="lesson-material-preview__status" role="status">Đang tải bản xem trước...</p>}
      {!loading && error && <p className="lesson-material-preview__error" role="status">{error} Có thể tải tệp ở phía trên.</p>}
      {!loading && !error && kind === 'pdf' && source && (
        source.startsWith('https://')
          ? <iframe className="lesson-material-preview__pdf-frame" src={source} title={`PDF: ${material.title}`} />
          : <PdfDocumentPreview file={file} title={material.title} />
      )}
      {!loading && !error && kind === 'docx' && html && (
        <div className="lesson-material-preview__docx" dangerouslySetInnerHTML={{ __html: sanitizeLessonHtml(html) }} />
      )}
      {!loading && !error && kind === 'docx' && !html && (
        <p className="lesson-material-preview__error" role="status">Tài liệu DOCX không có nội dung để hiển thị.</p>
      )}
      {!loading && !error && kind === 'image' && source && (
        <img className="lesson-material-preview__image" src={source} alt={`Tài liệu: ${material.title}`} loading="lazy" />
      )}
      {!loading && !error && kind === 'audio' && source && (
        <audio className="lesson-material-preview__audio" src={source} controls preload="metadata">
          Trình duyệt không hỗ trợ phát tệp âm thanh này.
        </audio>
      )}
    </div>
  );
}
