const MIN_PAGE_TEXT_LENGTH = 80;
const MAX_PDF_PAGES_FOR_OCR = 100;
const MAX_OCR_WORKERS = 2;
const OCR_RENDER_SCALE = 1.6;
const PART6_RETRY_RENDER_SCALE = 2.2;
const PAGE_IMAGE_MAX_WIDTH = 960;
const PAGE_IMAGE_QUALITY = 0.76;
const VISUAL_TOEIC_PARTS = new Set([1]);
const OCR_RESULTS_BY_FILE = new WeakMap();

const countReadableCharacters = (value = '') =>
  (value.match(/[\p{L}\p{N}]/gu) || []).length;

const createPageImageBlob = async (sourceCanvas) => {
  const scale = Math.min(1, PAGE_IMAGE_MAX_WIDTH / sourceCanvas.width);
  const thumbnail = document.createElement('canvas');
  thumbnail.width = Math.max(1, Math.round(sourceCanvas.width * scale));
  thumbnail.height = Math.max(1, Math.round(sourceCanvas.height * scale));

  try {
    const context = thumbnail.getContext('2d');
    if (!context) return null;
    context.drawImage(sourceCanvas, 0, 0, thumbnail.width, thumbnail.height);
    return await new Promise((resolve) => {
      thumbnail.toBlob(resolve, 'image/jpeg', PAGE_IMAGE_QUALITY);
    });
  } finally {
    thumbnail.width = 0;
    thumbnail.height = 0;
  }
};

const getVisualPageNumbers = (pageTexts) => {
  const visualPageNumbers = [];
  let activePart = null;

  for (const [pageNumber, text] of [...pageTexts.entries()].sort(([left], [right]) => left - right)) {
    if (/^\s*(?:ANSWER\s*KEYS?|ANSWERS|KEY|ĐÁP\s*ÁN)(?:\s*[:\-]?\s*\d{1,4}\+?)?\s*$/im.test(text)) break;
    const partHeaders = [...text.matchAll(/^\s*PART\s*([1-7])\b/gim)];
    if (partHeaders.length > 0) activePart = Number(partHeaders[partHeaders.length - 1][1]);
    if (VISUAL_TOEIC_PARTS.has(activePart)) visualPageNumbers.push(pageNumber);
  }

  return visualPageNumbers;
};

const getPartPageNumbers = (pageTexts, targetPart) => {
  const pageNumbers = [];
  let activePart = null;

  for (const [pageNumber, text] of [...pageTexts.entries()].sort(([left], [right]) => left - right)) {
    const partHeaders = [...text.matchAll(/^\s*PART\s*([1-7])\b/gim)];
    if (partHeaders.length > 0) activePart = Number(partHeaders[partHeaders.length - 1][1]);
    if (activePart === targetPart) pageNumbers.push(pageNumber);
  }

  return pageNumbers;
};

const hasPart6OcrArtifacts = (text = '') =>
  /(?:[-=;:~|]{2,}|\b(?:zz|yz|zee|eeth|etre|ett|een|evie|jae)\b|[“"']\s*\d{1,3}[°º]?|(?:^|\s)\d{2}\s+(?=[A-Z]))/im.test(text)
  || /\b[a-z][A-Z]{1,2}\b/.test(text);

const scorePart6OcrText = (text = '') => {
  const readableCharacters = countReadableCharacters(text);
  const artifactCount = (text.match(/(?:[-=;:~|]{2,}|\b(?:zz|yz|zee|eeth|etre|ett|een|evie|jae)\b|[“"']\s*\d{1,3}[°º]?|(?:^|\s)\d{2}\s+(?=[A-Z]))/gim) || []).length
    + (text.match(/\b[a-z][A-Z]{1,2}\b/g) || []).length;
  return readableCharacters - artifactCount * 24;
};

const improveOcrContrast = (canvas) => {
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return;

  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = image.data;
  for (let offset = 0; offset < pixels.length; offset += 4) {
    const gray = pixels[offset] * 0.299 + pixels[offset + 1] * 0.587 + pixels[offset + 2] * 0.114;
    const contrasted = Math.max(0, Math.min(255, (gray - 128) * 1.22 + 128));
    pixels[offset] = contrasted;
    pixels[offset + 1] = contrasted;
    pixels[offset + 2] = contrasted;
  }
  context.putImageData(image, 0, 0);
};

const buildLinesFromPdfTextItems = (items = []) => {
  const positionedItems = items
    .filter((item) => item.str?.trim())
    .map((item) => ({
      text: item.str.trim(),
      x: Number(item.transform?.[4]) || 0,
      y: Number(item.transform?.[5]) || 0,
    }))
    .sort((left, right) => right.y - left.y || left.x - right.x);

  const lines = [];
  for (const item of positionedItems) {
    const currentLine = lines[lines.length - 1];
    if (currentLine && Math.abs(currentLine.y - item.y) <= 2) {
      currentLine.items.push(item);
      continue;
    }
    lines.push({ y: item.y, items: [item] });
  }

  return lines
    .map((line) => line.items.sort((left, right) => left.x - right.x).map((item) => item.text).join(' '))
    .filter(Boolean)
    .join('\n');
};

const countDarkPixels = (pixels, width, height, left, top, right, bottom) => {
  let count = 0;
  const xStart = Math.max(0, Math.floor(left));
  const xEnd = Math.min(width, Math.ceil(right));
  const yStart = Math.max(0, Math.floor(top));
  const yEnd = Math.min(height, Math.ceil(bottom));

  for (let y = yStart; y < yEnd; y += 1) {
    for (let x = xStart; x < xEnd; x += 1) {
      const offset = (y * width + x) * 4;
      if (pixels[offset + 3] > 0 && (pixels[offset] + pixels[offset + 1] + pixels[offset + 2]) / 3 < 190) {
        count += 1;
      }
    }
  }
  return count;
};

const fillShortColumnGaps = (states, maxGap = 2) => {
  const result = [...states];
  let index = 0;

  while (index < result.length) {
    if (result[index] !== 'columns') {
      index += 1;
      continue;
    }

    let gapEnd = index + 1;
    while (gapEnd < result.length && result[gapEnd] === 'empty') gapEnd += 1;
    const gapLength = gapEnd - index - 1;
    if (gapLength > 0 && gapLength <= maxGap && result[gapEnd] === 'columns') {
      for (let fill = index + 1; fill < gapEnd; fill += 1) result[fill] = 'columns';
    }
    index = gapEnd;
  }

  return result;
};

/**
 * Finds a long two-column question area while leaving full-width directions or
 * passages intact. The reduced canvas keeps layout analysis inexpensive.
 */
const detectTwoColumnBody = (sourceCanvas) => {
  const analysisWidth = Math.min(256, sourceCanvas.width);
  const analysisHeight = Math.max(1, Math.round(sourceCanvas.height * (analysisWidth / sourceCanvas.width)));
  if (analysisWidth < 160 || analysisHeight < 180) return null;

  const analysisCanvas = document.createElement('canvas');
  analysisCanvas.width = analysisWidth;
  analysisCanvas.height = analysisHeight;
  const analysisContext = analysisCanvas.getContext('2d', { willReadFrequently: true });
  if (!analysisContext) return null;

  analysisContext.drawImage(sourceCanvas, 0, 0, analysisWidth, analysisHeight);
  const pixels = analysisContext.getImageData(0, 0, analysisWidth, analysisHeight).data;
  analysisCanvas.width = 0;
  analysisCanvas.height = 0;

  const contentTop = Math.floor(analysisHeight * 0.035);
  const contentBottom = Math.floor(analysisHeight * 0.94);
  const projection = new Uint32Array(analysisWidth);
  for (let y = contentTop; y < contentBottom; y += 2) {
    for (let x = Math.floor(analysisWidth * 0.32); x < Math.ceil(analysisWidth * 0.68); x += 1) {
      const offset = (y * analysisWidth + x) * 4;
      if (pixels[offset + 3] > 0 && (pixels[offset] + pixels[offset + 1] + pixels[offset + 2]) / 3 < 190) {
        projection[x] += 1;
      }
    }
  }

  let gutterX = Math.floor(analysisWidth / 2);
  let minimumInk = Number.POSITIVE_INFINITY;
  const searchStart = Math.floor(analysisWidth * 0.38);
  const searchEnd = Math.ceil(analysisWidth * 0.58);
  for (let x = searchStart; x <= searchEnd; x += 1) {
    const localInk = projection[Math.max(0, x - 2)]
      + projection[Math.max(0, x - 1)]
      + projection[x]
      + projection[Math.min(analysisWidth - 1, x + 1)]
      + projection[Math.min(analysisWidth - 1, x + 2)];
    if (localInk < minimumInk) {
      minimumInk = localInk;
      gutterX = x;
    }
  }

  const leftStart = Math.floor(analysisWidth * 0.07);
  const gapHalfWidth = Math.max(3, Math.round(analysisWidth * 0.012));
  // Split at the quiet center gutter. Leaving an artificial gap here clips
  // question numbers that sit close to the left edge of the right column.
  const leftEnd = Math.max(leftStart + 1, gutterX);
  const rightStart = Math.min(analysisWidth - 1, gutterX);
  const rightEnd = Math.floor(analysisWidth * 0.93);
  const bandHeight = 4;
  const states = [];

  for (let y = contentTop; y < contentBottom; y += bandHeight) {
    const bandBottom = Math.min(contentBottom, y + bandHeight);
    const centerInk = countDarkPixels(
      pixels,
      analysisWidth,
      analysisHeight,
      gutterX - gapHalfWidth,
      y,
      gutterX + gapHalfWidth + 1,
      bandBottom,
    );
    const leftInk = countDarkPixels(pixels, analysisWidth, analysisHeight, leftStart, y, leftEnd, bandBottom);
    const rightInk = countDarkPixels(pixels, analysisWidth, analysisHeight, rightStart, y, rightEnd, bandBottom);

    if (centerInk >= 4) states.push('full');
    else if (leftInk >= 3 && rightInk >= 3) states.push('columns');
    else states.push('empty');
  }

  const smoothedStates = fillShortColumnGaps(states);
  let longestRun = null;
  let runStart = -1;
  for (let index = 0; index <= smoothedStates.length; index += 1) {
    if (smoothedStates[index] === 'columns') {
      if (runStart < 0) runStart = index;
      continue;
    }
    if (runStart >= 0) {
      const runLength = index - runStart;
      if (!longestRun || runLength > longestRun.length) longestRun = { start: runStart, length: runLength };
      runStart = -1;
    }
  }

  if (!longestRun || longestRun.length < 5) return null;

  const activeStates = smoothedStates.slice(longestRun.start).filter((state) => state === 'columns' || state === 'full');
  const columnRatio = activeStates.filter((state) => state === 'columns').length / Math.max(1, activeStates.length);
  if (columnRatio < 0.68) return null;

  const analysisStartY = contentTop + longestRun.start * bandHeight;
  const startY = Math.floor(analysisStartY * (sourceCanvas.height / analysisHeight));
  const splitX = Math.round(gutterX * (sourceCanvas.width / analysisWidth));
  if (splitX < sourceCanvas.width * 0.32 || splitX > sourceCanvas.width * 0.68) return null;
  if (sourceCanvas.height - startY < sourceCanvas.height * 0.18) return null;

  return { splitX, startY };
};

/** Finds the bottom border of the full-width Part 6 passage box. */
const detectPart6PassageBoundary = (sourceCanvas) => {
  const analysisWidth = Math.min(512, sourceCanvas.width);
  const analysisHeight = Math.max(1, Math.round(sourceCanvas.height * (analysisWidth / sourceCanvas.width)));
  const analysisCanvas = document.createElement('canvas');
  analysisCanvas.width = analysisWidth;
  analysisCanvas.height = analysisHeight;
  const context = analysisCanvas.getContext('2d', { willReadFrequently: true });
  if (!context) return null;

  context.drawImage(sourceCanvas, 0, 0, analysisWidth, analysisHeight);
  const pixels = context.getImageData(0, 0, analysisWidth, analysisHeight).data;
  analysisCanvas.width = 0;
  analysisCanvas.height = 0;

  const xStart = Math.floor(analysisWidth * 0.04);
  const xEnd = Math.ceil(analysisWidth * 0.96);
  const yStart = Math.floor(analysisHeight * 0.25);
  const yEnd = Math.floor(analysisHeight * 0.7);
  const lineRows = [];
  for (let y = yStart; y < yEnd; y += 1) {
    let darkPixels = 0;
    for (let x = xStart; x < xEnd; x += 1) {
      const offset = (y * analysisWidth + x) * 4;
      if (pixels[offset + 3] > 0 && (pixels[offset] + pixels[offset + 1] + pixels[offset + 2]) / 3 < 220) {
        darkPixels += 1;
      }
    }
    if (darkPixels / (xEnd - xStart) >= 0.4) lineRows.push(y);
  }

  let lastBoundary = null;
  for (let index = 0; index < lineRows.length; index += 1) {
    const start = lineRows[index];
    let end = start;
    while (index + 1 < lineRows.length && lineRows[index + 1] - end <= 2) {
      index += 1;
      end = lineRows[index];
    }
    lastBoundary = end;
  }

  if (lastBoundary === null) return null;
  return Math.min(
    sourceCanvas.height - 1,
    Math.round((lastBoundary + 1) * (sourceCanvas.height / analysisHeight) + sourceCanvas.height * 0.006),
  );
};

const recognizeRegion = async (worker, sourceCanvas, left, top, width, height) => {
  if (width <= 0 || height <= 0) return '';
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Trình duyệt không hỗ trợ canvas để OCR file PDF.');

  try {
    context.drawImage(sourceCanvas, left, top, width, height, 0, 0, width, height);
    const result = await worker.recognize(canvas);
    return result.data.text || '';
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
};

const recognizePage = async (worker, canvas) => {
  const columns = detectTwoColumnBody(canvas);
  let text;
  if (!columns) {
    const result = await worker.recognize(canvas);
    text = result.data.text || '';
  } else {
    const textParts = [];
    if (columns.startY > canvas.height * 0.04) {
      textParts.push(await recognizeRegion(worker, canvas, 0, 0, canvas.width, columns.startY));
    }
    textParts.push(await recognizeRegion(worker, canvas, 0, columns.startY, columns.splitX, canvas.height - columns.startY));
    textParts.push(await recognizeRegion(worker, canvas, columns.splitX, columns.startY, canvas.width - columns.splitX, canvas.height - columns.startY));
    text = textParts.filter((part) => part.trim()).join('\n');
  }

  // Answer keys use a dense multi-column grid. OCR each half at full height so
  // small number-letter pairs stay legible and don't get lost in column order.
  if (/^\s*(?:ANSWER\s*KEYS?|ANSWERS|KEY|ĐÁP\s*ÁN)(?:\s*[:\-]?\s*\d{1,4}\+?)?\s*$/im.test(text)) {
    const middleX = Math.floor(canvas.width / 2);
    const [leftText, rightText] = await Promise.all([
      recognizeRegion(worker, canvas, 0, 0, middleX, canvas.height),
      recognizeRegion(worker, canvas, middleX, 0, canvas.width - middleX, canvas.height),
    ]);
    return [leftText, rightText].filter((part) => part.trim()).join('\n');
  }

  return text;
};

const recognizePart6Page = async (worker, canvas) => {
  const passageBottom = detectPart6PassageBoundary(canvas);
  if (!passageBottom) return { text: await recognizePage(worker, canvas), usedPassageBoundary: false };

  const splitX = Math.round(canvas.width * 0.44);
  const [passageText, leftColumnText, rightColumnText] = await Promise.all([
    recognizeRegion(worker, canvas, 0, 0, canvas.width, passageBottom),
    recognizeRegion(worker, canvas, 0, passageBottom, splitX, canvas.height - passageBottom),
    recognizeRegion(worker, canvas, splitX, passageBottom, canvas.width - splitX, canvas.height - passageBottom),
  ]);
  return {
    text: [passageText, leftColumnText, rightColumnText].filter((part) => part.trim()).join('\n'),
    usedPassageBoundary: true,
  };
};

const extractToeicPdfTextUncached = async (file, onProgress) => {
  let workers = [];
  let pdf = null;

  try {
    onProgress({ phase: 'loading', currentPage: 0, totalPages: 0, progress: 0 });

    const [pdfjs, pdfWorkerAsset] = await Promise.all([
      import('pdfjs-dist'),
      import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
    ]);

    pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerAsset.default;
    const fileBytes = new Uint8Array(await file.arrayBuffer());
    pdf = await pdfjs.getDocument({ data: fileBytes }).promise;

    const pageTexts = new Map();
    const pageImagesByNumber = new Map();
    const pagesToOcr = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      onProgress({
        phase: 'reading',
        currentPage: pageNumber,
        totalPages: pdf.numPages,
        progress: (pageNumber / pdf.numPages) * 20,
      });

      const page = await pdf.getPage(pageNumber);
      try {
        const textContent = await page.getTextContent();
        const textLayer = buildLinesFromPdfTextItems(textContent.items || []);
        if (countReadableCharacters(textLayer) >= MIN_PAGE_TEXT_LENGTH) pageTexts.set(pageNumber, textLayer);
        else pagesToOcr.push(pageNumber);
      } finally {
        page.cleanup();
      }
    }

    if (pagesToOcr.length > MAX_PDF_PAGES_FOR_OCR) {
      throw new Error('PDF có ' + pagesToOcr.length + ' trang scan cần OCR. Hãy chia file thành các phần tối đa ' + MAX_PDF_PAGES_FOR_OCR + ' trang scan để OCR ổn định hơn.');
    }

    if (pagesToOcr.length > 0) {
      const [tesseract, tesseractWorkerAsset] = await Promise.all([
        import('tesseract.js'),
        import('tesseract.js/dist/worker.min.js?url'),
      ]);
      onProgress({ phase: 'loading_ocr', currentPage: pagesToOcr[0], totalPages: pdf.numPages, progress: 20 });

      const availableCores = Number(globalThis.navigator?.hardwareConcurrency) || 4;
      const workerCount = Math.min(MAX_OCR_WORKERS, pagesToOcr.length, availableCores >= 4 ? 2 : 1);
      const currentPageByWorker = new Map();
      const progressByWorker = new Map();
      let completedOcrPages = 0;
      let lastReportedProgress = 20;

      const reportOcrProgress = (workerIndex, pageProgress = 0) => {
        progressByWorker.set(workerIndex, Math.max(0, Math.min(1, Number(pageProgress) || 0)));
        const activeProgress = Array.from(progressByWorker.values()).reduce((sum, value) => sum + value, 0);
        const completedPages = pdf.numPages - pagesToOcr.length + completedOcrPages;
        const progress = Math.min(99, ((completedPages + activeProgress) / pdf.numPages) * 100);
        lastReportedProgress = Math.max(lastReportedProgress, progress);
        onProgress({
          phase: 'ocr',
          currentPage: currentPageByWorker.get(workerIndex) || pagesToOcr[0],
          totalPages: pdf.numPages,
          progress: lastReportedProgress,
        });
      };

      workers = [];
      await Promise.all(Array.from({ length: workerCount }, async (_, workerIndex) => {
        const worker = await tesseract.createWorker('eng', 1, {
          workerPath: tesseractWorkerAsset.default,
          logger: (message) => {
            if (message.status === 'recognizing text') reportOcrProgress(workerIndex, message.progress);
          },
        });
        workers[workerIndex] = worker;
      }));

      let nextPageIndex = 0;
      const processWorkerQueue = async (worker, workerIndex) => {
        while (nextPageIndex < pagesToOcr.length) {
          const pageNumber = pagesToOcr[nextPageIndex];
          nextPageIndex += 1;
          currentPageByWorker.set(workerIndex, pageNumber);
          progressByWorker.set(workerIndex, 0);
          onProgress({
            phase: 'ocr',
            currentPage: pageNumber,
            totalPages: pdf.numPages,
            progress: lastReportedProgress,
          });

          const page = await pdf.getPage(pageNumber);
          let canvas = null;
          try {
            const viewport = page.getViewport({ scale: OCR_RENDER_SCALE });
            canvas = document.createElement('canvas');
            const context = canvas.getContext('2d', { willReadFrequently: true });
            if (!context) throw new Error('Trình duyệt không hỗ trợ canvas để OCR file PDF.');

            canvas.width = Math.ceil(viewport.width);
            canvas.height = Math.ceil(viewport.height);
            await page.render({ canvas, canvasContext: context, viewport }).promise;
            const text = await recognizePage(worker, canvas);
            pageTexts.set(pageNumber, text);
          } finally {
            if (canvas) {
              canvas.width = 0;
              canvas.height = 0;
            }
            page.cleanup();
          }

          completedOcrPages += 1;
          progressByWorker.set(workerIndex, 0);
          reportOcrProgress(workerIndex, 0);
        }
      };

      await Promise.all(workers.map((worker, index) => processWorkerQueue(worker, index)));
    }

    // Part 6 passages contain dense prose and short blank markers. Retry only
    // scanned Part 6 pages with likely blank-marker artifacts at higher scale.
    const scannedPageSet = new Set(pagesToOcr);
    const partSixRetryPages = getPartPageNumbers(pageTexts, 6)
      .filter((pageNumber) => scannedPageSet.has(pageNumber) && hasPart6OcrArtifacts(pageTexts.get(pageNumber)));
    for (const pageNumber of partSixRetryPages) {
      onProgress({
        phase: 'ocr',
        currentPage: pageNumber,
        totalPages: pdf.numPages,
        progress: 99,
      });

      const page = await pdf.getPage(pageNumber);
      let canvas = null;
      try {
        const viewport = page.getViewport({ scale: PART6_RETRY_RENDER_SCALE });
        canvas = document.createElement('canvas');
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) continue;
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        await page.render({ canvas, canvasContext: context, viewport }).promise;
        improveOcrContrast(canvas);

        const { text: refinedText, usedPassageBoundary } = await recognizePart6Page(workers[0], canvas);
        if (refinedText.trim() && (usedPassageBoundary || scorePart6OcrText(refinedText) > scorePart6OcrText(pageTexts.get(pageNumber)))) {
          pageTexts.set(pageNumber, refinedText);
        }
      } finally {
        if (canvas) {
          canvas.width = 0;
          canvas.height = 0;
        }
        page.cleanup();
      }
    }

    const visualPageNumbers = getVisualPageNumbers(pageTexts);
    const textLayerVisualPages = visualPageNumbers.filter((pageNumber) => !pageImagesByNumber.has(pageNumber));
    for (let index = 0; index < textLayerVisualPages.length; index += 1) {
      const pageNumber = textLayerVisualPages[index];
      onProgress({
        phase: 'images',
        currentPage: pageNumber,
        totalPages: pdf.numPages,
        progress: 99,
      });

      const page = await pdf.getPage(pageNumber);
      let canvas = null;
      try {
        const viewport = page.getViewport({ scale: OCR_RENDER_SCALE });
        canvas = document.createElement('canvas');
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) continue;
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        await page.render({ canvas, canvasContext: context, viewport }).promise;
        const pageImage = await createPageImageBlob(canvas);
        if (pageImage) pageImagesByNumber.set(pageNumber, pageImage);
      } catch {
        // Image rendering is supplemental; the extracted text remains usable.
      } finally {
        if (canvas) {
          canvas.width = 0;
          canvas.height = 0;
        }
        page.cleanup();
      }
    }

    onProgress({ phase: 'complete', currentPage: pdf.numPages, totalPages: pdf.numPages, progress: 100 });
    return {
      text: [...pageTexts.entries()]
        .sort(([left], [right]) => left - right)
        .map(([pageNumber, text]) => '-- ' + pageNumber + ' of ' + pdf.numPages + ' --\n' + text)
        .join('\n'),
      ocrPageCount: pagesToOcr.length,
      totalPages: pdf.numPages,
      pageImages: visualPageNumbers
        .filter((pageNumber) => pageImagesByNumber.has(pageNumber))
        .map((pageNumber) => ({ pageNumber, blob: pageImagesByNumber.get(pageNumber) })),
    };
  } catch (error) {
    if (error.message?.startsWith('PDF có ')) throw error;
    throw new Error('Không thể đọc/OCR PDF trên trình duyệt: ' + (error.message || 'Lỗi không xác định'));
  } finally {
    await Promise.allSettled(workers.filter(Boolean).map((worker) => worker.terminate()));
    if (pdf) await pdf.destroy().catch(() => {});
  }
};

/**
 * Extracts selectable PDF text and OCRs pages that have no useful text layer.
 * OCR is cached for the selected File object so repeated previews do not rescan it.
 */
export const extractToeicPdfText = async (file, { onProgress = () => {} } = {}) => {
  if (!(file instanceof Blob)) {
    throw new Error('Vui lòng chọn một file PDF hợp lệ.');
  }

  const cached = OCR_RESULTS_BY_FILE.get(file);
  if (cached) {
    const result = await cached;
    onProgress({ phase: 'complete', currentPage: result.totalPages, totalPages: result.totalPages, progress: 100, cached: true });
    return result;
  }

  const extraction = extractToeicPdfTextUncached(file, onProgress);
  OCR_RESULTS_BY_FILE.set(file, extraction);
  try {
    return await extraction;
  } catch (error) {
    OCR_RESULTS_BY_FILE.delete(file);
    throw error;
  }
};
