import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import './ToeicImageWithBrandOverlay.css';

// These three regions come from the OCR lines in the 2026-10-27 dry-run report.
// Coordinates are in the source image's natural pixel space.  Do not add a URL
// here without an independently reviewed OCR bounding box and replacement approval.
const VERIFIED_ZENLISH_OVERLAYS = new Map([
  ['https://zenlishtoeic.vn/wp-content/uploads/2025/12/zenlish-p1-1-1.jpg', {
    left: 255, top: 20, width: 186, height: 27, confidence: 85,
  }],
  ['https://zenlishtoeic.vn/wp-content/uploads/2025/12/zenlish-p1-5.jpg', {
    left: 437, top: 261, width: 389, height: 37, confidence: 91,
  }],
  ['https://zenlishtoeic.vn/wp-content/uploads/2025/12/zenlish-p7-196-200-2.jpg', {
    left: 527, top: 394, width: 228, height: 12, confidence: 86,
  }],
]);

const normalizeUrl = (value) => String(value || '').trim().split(/[?#]/, 1)[0];

const isZenlishReviewSource = (value) => {
  try {
    const url = new URL(normalizeUrl(value));
    return url.hostname === 'zenlishtoeic.vn' && /\/zenlish-/i.test(url.pathname);
  } catch {
    return false;
  }
};

export default function ToeicImageWithBrandOverlay({
  src,
  alt,
  className = '',
  style,
  onError,
  loading,
}) {
  const imageRef = useRef(null);
  const [dimensions, setDimensions] = useState(null);
  const normalizedSrc = normalizeUrl(src);
  const region = VERIFIED_ZENLISH_OVERLAYS.get(normalizedSrc);
  const reviewRequired = !region && isZenlishReviewSource(src);

  const updateDimensions = useCallback(() => {
    const image = imageRef.current;
    if (!image?.naturalWidth || !image?.naturalHeight) return;
    const rendered = image.getBoundingClientRect();
    setDimensions((current) => {
      const next = { width: image.naturalWidth, height: image.naturalHeight, renderedWidth: rendered.width };
      return current?.width === next.width && current?.height === next.height && current?.renderedWidth === next.renderedWidth
        ? current
        : next;
    });
  }, []);

  useLayoutEffect(() => {
    updateDimensions();
    const image = imageRef.current;
    if (!image || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(updateDimensions);
    observer.observe(image);
    return () => observer.disconnect();
  }, [src, updateDimensions]);

  const overlayStyle = region && dimensions ? {
    left: `${(region.left / dimensions.width) * 100}%`,
    top: `${(region.top / dimensions.height) * 100}%`,
    width: `${(region.width / dimensions.width) * 100}%`,
    height: `${(region.height / dimensions.height) * 100}%`,
  } : null;
  const status = region ? 'verified-overlay' : reviewRequired ? 'manual-review' : 'not-applicable';

  return (
    <span
      className="toeic-image-with-brand-overlay"
      data-brand-overlay-status={status}
      style={dimensions?.renderedWidth ? { width: `${dimensions.renderedWidth}px` } : undefined}
    >
      <img
        ref={imageRef}
        src={src}
        alt={alt}
        className={className}
        style={style}
        loading={loading}
        onLoad={updateDimensions}
        onError={onError}
      />
      {overlayStyle && (
        <span
          className="toeic-image-with-brand-overlay__label"
          style={overlayStyle}
          data-ocr-confidence={region.confidence}
          aria-label="Ms Uyên TOEIC"
        >
          Ms Uyên TOEIC
        </span>
      )}
    </span>
  );
}

export { VERIFIED_ZENLISH_OVERLAYS };
