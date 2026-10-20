import { useEffect, useRef, useState } from 'react';

export default function PdfDocumentPreview({ file, title }) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const renderTaskRef = useRef(null);
  const [documentProxy, setDocumentProxy] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [containerWidth, setContainerWidth] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [renderedPage, setRenderedPage] = useState(0);

  useEffect(() => {
    let active = true;
    let loadingTask;
    setDocumentProxy(null);
    setPageNumber(1);
    setRenderedPage(0);
    setLoading(true);
    setError('');

    async function loadDocument() {
      try {
        const [pdfjs, workerAsset] = await Promise.all([
          import('pdfjs-dist'),
          import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
        ]);
        if (!active) return;
        pdfjs.GlobalWorkerOptions.workerSrc = workerAsset.default;
        const data = new Uint8Array(await file.arrayBuffer());
        if (!active) return;
        loadingTask = pdfjs.getDocument({ data });
        const pdf = await loadingTask.promise;
        if (!active) {
          await pdf.destroy();
          return;
        }
        setDocumentProxy(pdf);
        setLoading(false);
      } catch {
        if (active) {
          setError('Không thể hiển thị tệp PDF này. Bạn vẫn có thể tải tài liệu xuống.');
          setLoading(false);
        }
      }
    }

    loadDocument();
    return () => {
      active = false;
      renderTaskRef.current?.cancel();
      if (loadingTask) loadingTask.destroy();
    };
  }, [file]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    const updateWidth = () => setContainerWidth(container.clientWidth);
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!documentProxy || !canvasRef.current || !containerWidth) return undefined;
    let active = true;
    renderTaskRef.current?.cancel();

    async function renderPage() {
      try {
        const page = await documentProxy.getPage(pageNumber);
        if (!active) return;
        const unscaledViewport = page.getViewport({ scale: 1 });
        const fitScale = Math.min(1.25, Math.max(0.25, (containerWidth - 32) / unscaledViewport.width));
        const outputScale = Math.min(window.devicePixelRatio || 1, 2);
        const viewport = page.getViewport({ scale: fitScale * outputScale });
        const canvas = canvasRef.current;
        const context = canvas?.getContext('2d', { alpha: false });
        if (!canvas || !context) throw new Error('Canvas is unavailable');

        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        canvas.style.width = `${Math.ceil(viewport.width / outputScale)}px`;
        canvas.style.height = `${Math.ceil(viewport.height / outputScale)}px`;
        const renderTask = page.render({ canvas, canvasContext: context, viewport });
        renderTaskRef.current = renderTask;
        await renderTask.promise;
        if (active) setRenderedPage(pageNumber);
      } catch (renderError) {
        if (active && renderError?.name !== 'RenderingCancelledException') {
          setError('Không thể vẽ trang PDF này. Hãy tải tài liệu xuống để xem.');
        }
      }
    }

    setRenderedPage(0);
    renderPage();
    return () => {
      active = false;
      renderTaskRef.current?.cancel();
    };
  }, [documentProxy, pageNumber, containerWidth]);

  return (
    <section className="pdf-document-preview" aria-label={`Bản xem trước ${title}`}>
      <div className="pdf-document-preview__toolbar">
        {documentProxy && (
          <>
            <button type="button" onClick={() => setPageNumber((page) => Math.max(1, page - 1))} disabled={pageNumber <= 1} aria-label="Trang trước">
              Trang trước
            </button>
            <span role="status" aria-live="polite">Trang {pageNumber} / {documentProxy.numPages}</span>
            <button type="button" onClick={() => setPageNumber((page) => Math.min(documentProxy.numPages, page + 1))} disabled={pageNumber >= documentProxy.numPages} aria-label="Trang tiếp theo">
              Trang tiếp theo
            </button>
          </>
        )}
      </div>
      <div ref={containerRef} className="pdf-document-preview__canvas-wrap">
        {loading && <p role="status">Đang tải bản xem trước PDF...</p>}
        {error && <p role="alert">{error}</p>}
        {!error && !loading && (
          <canvas
            ref={canvasRef}
            data-testid="pdf-preview-canvas"
            data-rendered-page={renderedPage || undefined}
            role="img"
            aria-label={`Trang ${pageNumber} của ${title}`}
          />
        )}
      </div>
    </section>
  );
}
